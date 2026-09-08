// @vitest-environment node
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { app, handleQueue, handleScheduled } from "../src/index";
import { rebuildCommunityDeckSegment } from "../src/domain/recommendations";
import { createApplicationSession } from "../src/security";
import type { Env } from "../src/types";
import { testDatabase } from "./sqlite";

let database:ReturnType<typeof testDatabase>,env:Env;
let owner:{cookie:string;csrf:string},other:{cookie:string;csrf:string};
const deck=["fire","wind","ice","electric","poison"];
const build={title:"Test build",description:"",visibility:"private",mode:"coop",deck,tree:{ownedRanks:{},simulatedRanks:{}},totalGold:100,totalCore:2};
async function user(id:string){
  const time=new Date().toISOString();
  await env.DB.prepare("INSERT INTO users(id,provider,provider_subject,display_name,created_at,updated_at) VALUES(?,'google',?,'Private Google Name',?,?)").bind(id,id,time,time).run();
  await env.DB.prepare("INSERT INTO profiles(user_id,nickname,mode,preferred_role,spend_profile,data_consent,created_at,updated_at) VALUES(?,?,'coop','dealer','free',1,?,?)").bind(id,`Nick-${id}`,time,time).run();
  const session=await createApplicationSession(env,id);
  return {cookie:`dt_session=${session.token}; dt_csrf=${session.csrf}`,csrf:session.csrf};
}
function request(path:string,method="GET",body?:unknown,session?:typeof owner,headers:Record<string,string>={}){
  return app.request(`https://test.example${path}`,{method,headers:{...(session?{Cookie:session.cookie,"X-DiceTree-CSRF":session.csrf}:{}),...(body?{"Content-Type":"application/json"}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})},env);
}
beforeEach(async()=>{
  database=testDatabase();
  env={DB:database.db,APP_ENV:"test",APP_ORIGIN:"https://test.example",GAME_DATA_VERSION:"1.0.1",ALGORITHM_VERSION:"2",AI_DAILY_BUDGET:"0",JOBS:{send:vi.fn()},ASSETS:{fetch:()=>new Response("asset")},ROOMS:{idFromName:vi.fn(),get:vi.fn()}} as unknown as Env;
  owner=await user("owner");other=await user("other");
});
afterEach(()=>database.close());

describe("Worker + migrated SQLite integrity",()=>{
  it("serves events without missing-column errors and protects private APIs",async()=>{
    expect((await request("/api/v1/events/active")).status).toBe(200);
    expect((await request("/api/v1/sync")).status).toBe(401);
    expect((await request("/api/v1/admin/overview","GET",undefined,other)).status).toBe(403);
    expect((await request("/api/v1/me")).headers.get("Cache-Control")??"").not.toContain("public");
  });
  it("rejects unknown dice, duplicate dice, and forged CSRF",async()=>{
    expect((await request("/api/v1/builds","POST",{...build,deck:["bogus",...deck.slice(1)]},owner)).status).toBe(400);
    expect((await request("/api/v1/builds","POST",{...build,deck:Array(5).fill("fire")},owner)).status).toBe(400);
    expect((await request("/api/v1/builds","POST",build,owner,{"X-DiceTree-CSRF":"forged"})).status).toBe(403);
  });
  it("keeps private builds owner-only, forks to private, and preserves revisions",async()=>{
    const response=await request("/api/v1/builds","POST",build,owner);
    expect(response.status,await response.clone().text()).toBe(201);
    const {slug}=await response.json() as {slug:string};
    expect((await request(`/api/v1/builds/${slug}`)).status).toBe(404);
    expect((await request(`/api/v1/builds/${slug}`,"GET",undefined,other)).status).toBe(404);
    expect((await request(`/api/v1/builds/${slug}`,"PUT",{...build,visibility:"public",expectedVersion:1},owner)).status).toBe(200);
    expect((await request(`/api/v1/builds/${slug}`)).status).toBe(200);
    expect((await request(`/api/v1/builds/${slug}/versions`,"GET",undefined,other)).status).toBe(404);
    const fork=await request(`/api/v1/builds/${slug}/fork`,"POST",{},other);
    expect(fork.status,await fork.clone().text()).toBe(201);
    const result=await fork.json() as {slug:string};
    expect((await request(`/api/v1/builds/${result.slug}`)).status).toBe(404);
    expect((await request(`/api/v1/builds/${slug}`,"PUT",{...build,expectedVersion:1},owner)).status).toBe(409);
  });
  it("preserves previous snapshots and rejects stale sync versions",async()=>{
    const payload={state:{inventory:{gold:100}},schemaVersion:3,expectedVersion:0,requestId:"request-first"};
    expect((await request("/api/v1/sync","PUT",payload,owner)).status).toBe(200);
    expect((await request("/api/v1/sync","PUT",payload,owner)).status).toBe(200);
    expect((await request("/api/v1/sync","PUT",{...payload,requestId:"request-stale"},owner)).status).toBe(409);
    expect((await request("/api/v1/sync","PUT",{...payload,expectedVersion:1,requestId:"request-second"},owner)).status).toBe(200);
    expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM planner_snapshots").get()?.n).toBe(2);
  });
  it("awards an event only once, atomically, and enforces redemption balance",async()=>{
    database.sqlite.exec("INSERT INTO events(id,slug,title,status,starts_at,ends_at,reward_points,created_at,updated_at) VALUES('event','event','Test','active','2020','2099',100,'2020','2020')");
    const payload={deck,mode:"coop",purpose:"test strategy",dataConsent:true};
    expect((await request("/api/v1/events/event/submissions","POST",payload,owner)).status).toBe(201);
    expect((await request("/api/v1/events/event/submissions","POST",payload,owner)).status).toBe(409);
    expect(database.sqlite.prepare("SELECT SUM(amount) AS n FROM point_ledger").get()?.n).toBe(100);
    database.sqlite.exec("INSERT INTO point_catalog(id,name,category,cost,created_at,updated_at) VALUES('item','test','theme',70,'2020','2020')");
    expect((await request("/api/v1/points/redeem/item","POST",{},owner,{"Idempotency-Key":"first"})).status).toBe(201);
    expect((await request("/api/v1/points/redeem/item","POST",{},owner,{"Idempotency-Key":"first"})).status).toBe(201);
    expect((await request("/api/v1/points/redeem/item","POST",{},owner,{"Idempotency-Key":"second"})).status).toBe(409);
    expect(database.sqlite.prepare("SELECT SUM(amount) AS n FROM point_ledger").get()?.n).toBe(30);
  });
  it("enforces party capacity, membership, and ready checks",async()=>{
    const created=await request("/api/v1/matchmaking","POST",{kind:"coop",target:"100 waves",role:"dealer",lookingFor:"support",deck,beginnerOk:true,capacity:2,expiresInMinutes:60},owner);
    expect(created.status,await created.clone().text()).toBe(201);
    const {id,roomId}=await created.json() as {id:string;roomId:string};
    expect((await request(`/ws/rooms/${roomId}`,"GET",undefined,other,{Origin:env.APP_ORIGIN})).status).toBe(404);
    expect((await request(`/ws/rooms/${roomId}`,"GET",undefined,owner,{Origin:"https://evil.example"})).status).toBe(403);
    expect((await request(`/api/v1/matchmaking/${id}/join`,"POST",{role:"support"},other)).status).toBe(200);
    const third=await user("third");
    expect((await request(`/api/v1/matchmaking/${id}/join`,"POST",{role:"support"},third)).status).toBe(409);
    expect((await request(`/api/v1/matchmaking/${id}/ready`,"PUT",{ready:true},other)).status).toBe(200);
    expect((await request(`/api/v1/matchmaking/${id}`,"GET",undefined,third)).status).toBe(403);
    expect((await request(`/api/v1/matchmaking/${id}/leave`,"POST",{},other)).status).toBe(200);
    expect((await request(`/api/v1/matchmaking/${id}/join`,"POST",{role:"support"},third)).status).toBe(200);
  });
  it("allows multiple account deletions without unique nickname collisions",async()=>{
    expect((await request("/api/v1/me","DELETE",undefined,owner)).status).toBe(200);
    expect((await request("/api/v1/me","DELETE",undefined,other)).status).toBe(200);
    expect((await request("/api/v1/me","GET",undefined,owner)).status).toBe(401);
    expect(env.JOBS.send).toHaveBeenCalledWith({kind:"rebuild-community-all"});
  });
  it("queues privacy-safe aggregate rebuilding when recommendation consent changes",async()=>{
    const response=await request("/api/v1/profile","PUT",{nickname:"Owner",mode:"coop",preferredRole:"dealer",spendProfile:"free",dataConsent:false,recommendationOptOut:true},owner);
    expect(response.status,await response.clone().text()).toBe(200);
    expect(env.JOBS.send).toHaveBeenCalledWith({kind:"rebuild-community-all"});
  });
  it("runs conservative daily retention and recommendation recovery",async()=>{
    const old="2025-01-01T00:00:00.000Z",expired="2026-09-01T00:00:00.000Z",future="2027-09-01T00:00:00.000Z";
    database.sqlite.exec(`
      INSERT INTO sessions(id_hash,user_id,csrf_hash,created_at,last_seen_at,expires_at) VALUES('expired-session','owner','csrf','${old}','${old}','${expired}');
      INSERT INTO rate_windows(key,count,expires_at) VALUES('expired',1,1),('future',1,1999999999);
      INSERT INTO events(id,slug,title,status,starts_at,ends_at,reward_points,created_at,updated_at) VALUES('expired-event','expired-event','Expired','active','2020','${expired}',0,'2020','2020');
      INSERT INTO notifications(id,user_id,kind,payload_json,read_at,created_at) VALUES('old-read','owner','test','{}','${old}','${old}'),('new-unread','owner','test','{}',NULL,'${future}');
      INSERT INTO user_sanctions(id,user_id,level,reason,starts_at,ends_at,active,created_at,updated_at) VALUES('expired-sanction','owner',1,'test','2020','${expired}',1,'2020','2020');
      INSERT INTO community_deck_aggregates(segment_key,deck_fingerprint,sample_count,weighted_count,positive_count,negative_count,window_start,window_end,game_data_version,algorithm_version,updated_at) VALUES('coop','stale',25,25,25,0,'${old}','${expired}','1.0.1','2','${expired}');
    `);
    const timestamp="2026-09-08T03:15:00.000Z";
    database.sqlite.prepare("INSERT INTO chat_rooms(id,owner_id,title,category,max_members,visibility,created_at,updated_at) VALUES('maintenance-room','owner','Room','coop',2,'public',?,?)").run(timestamp,timestamp);
    database.sqlite.prepare("INSERT INTO matchmaking_posts(id,room_id,owner_id,kind,target,role,looking_for,deck_json,capacity,expires_at,created_at,updated_at) VALUES('expired-post','maintenance-room','owner','coop','test','dealer','support',?,2,?,?,?)").run(JSON.stringify(deck),expired,timestamp,timestamp);
    await handleScheduled({scheduledTime:new Date(timestamp).getTime(),cron:"15 3 * * *",noRetry:vi.fn()} as unknown as ScheduledController,env,{waitUntil:vi.fn(),passThroughOnException:vi.fn()} as unknown as ExecutionContext);
    expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM sessions WHERE id_hash='expired-session'").get()?.n).toBe(0);
    expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM rate_windows").get()?.n).toBe(1);
    expect(database.sqlite.prepare("SELECT status FROM events WHERE id='expired-event'").get()?.status).toBe("closed");
    expect(database.sqlite.prepare("SELECT state FROM matchmaking_posts WHERE id='expired-post'").get()?.state).toBe("expired");
    expect(database.sqlite.prepare("SELECT active FROM user_sanctions WHERE id='expired-sanction'").get()?.active).toBe(0);
    expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM notifications").get()?.n).toBe(1);
    expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM community_deck_aggregates WHERE deck_fingerprint='stale'").get()?.n).toBe(0);
  });
  it("allows one audited admin action per open report and prevents duplicate sanctions",async()=>{
    database.sqlite.prepare("UPDATE users SET role='owner' WHERE id='owner'").run();
    const timestamp=new Date().toISOString();
    database.sqlite.prepare("INSERT INTO user_reports(id,reporter_id,subject_user_id,reason,detail,created_at,updated_at) VALUES('report','owner','other','abuse','evidence',?,?)").run(timestamp,timestamp);
    const input={state:"resolved",resolution:"verified abuse",sanctionLevel:2,sanctionHours:24};
    expect((await request("/api/v1/admin/reports/report/action","POST",input,owner)).status).toBe(200);
    expect((await request("/api/v1/admin/reports/report/action","POST",input,owner)).status).toBe(404);
    expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM user_sanctions WHERE user_id='other'").get()?.n).toBe(1);
    expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM admin_audit_logs WHERE target_id='report'").get()?.n).toBe(1);
    expect((await request("/api/v1/admin/audit","GET",undefined,owner)).status).toBe(200);
    expect((await request("/api/v1/admin/audit","GET",undefined,other)).status).toBe(403);
  });
  it("publishes only consented community aggregates that meet the 25-account cohort",async()=>{
    const timestamp=new Date().toISOString();
    database.sqlite.prepare("INSERT INTO events(id,slug,title,status,starts_at,ends_at,reward_points,created_at,updated_at) VALUES('aggregate-event','aggregate-event','Aggregate','active','2020','2099',0,'2020','2020')").run();
    for(let index=0;index<25;index+=1){
      const userId=`aggregate-${index}`;
      database.sqlite.prepare("INSERT INTO users(id,provider,provider_subject,display_name,created_at,updated_at) VALUES(?,'google',?,?,?,?)").run(userId,userId,"Private",timestamp,timestamp);
      database.sqlite.prepare("INSERT INTO profiles(user_id,nickname,mode,preferred_role,spend_profile,data_consent,created_at,updated_at) VALUES(?,?,'coop','dealer','free',1,?,?)").run(userId,`Aggregate-${index}`,timestamp,timestamp);
      database.sqlite.prepare("INSERT INTO event_submissions(id,event_id,user_id,deck_fingerprint,mode,purpose,description,deck_json,game_data_version,created_at) VALUES(?,'aggregate-event',?,'fingerprint','coop','favorite','',?,'1.0.1',?)").run(`submission-${index}`,userId,JSON.stringify(deck),timestamp);
    }
    expect(await rebuildCommunityDeckSegment(env.DB,{submissionId:"submission-0",gameDataVersion:"1.0.1",algorithmVersion:"2"})).toMatchObject({rebuilt:true,segment:"coop",decks:1});
    const eligible=await request("/api/v1/recommendations/community/coop");
    expect(eligible.status).toBe(200);
    expect((await eligible.json() as {decks:unknown[]}).decks).toHaveLength(1);
    database.sqlite.prepare("UPDATE profiles SET recommendation_opt_out=1 WHERE user_id='aggregate-0'").run();
    const immediatelySuppressed=await request("/api/v1/recommendations/community/coop");
    expect((await immediatelySuppressed.json() as {decks:unknown[]}).decks).toHaveLength(0);
    const ack=vi.fn(),retry=vi.fn();
    await handleQueue({messages:[{body:{kind:"rebuild-community-all"},ack,retry}]} as unknown as MessageBatch<unknown>,env);
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    const suppressed=await request("/api/v1/recommendations/community/coop");
    expect((await suppressed.json() as {decks:unknown[]}).decks).toHaveLength(0);
  });
  it("releases pending chat safely when AI is unavailable or returns malformed JSON",async()=>{
    const timestamp=new Date().toISOString();
    database.sqlite.prepare("INSERT INTO chat_rooms(id,owner_id,title,category,max_members,visibility,created_at,updated_at) VALUES('room','owner','Room','general',20,'public',?,?)").run(timestamp,timestamp);
    const notify=vi.fn(async()=>new Response(null,{status:200}));
    env.ROOMS={idFromName:vi.fn(()=>"object-id"),get:vi.fn(()=>({fetch:notify}))} as unknown as DurableObjectNamespace;
    const dispatch=async(messageId:string)=>{
      const ack=vi.fn(),retry=vi.fn();
      await handleQueue({messages:[{body:{kind:"moderate-message",messageId},ack,retry}]} as unknown as MessageBatch<unknown>,env);
      expect(ack).toHaveBeenCalledOnce();
      expect(retry).not.toHaveBeenCalled();
      expect(database.sqlite.prepare("SELECT moderation_state FROM chat_messages WHERE id=?").get(messageId)?.moderation_state).toBe("visible");
    };
    for(const messageId of ["pending-no-ai","pending-bad-ai"]){
      database.sqlite.prepare("INSERT INTO chat_messages(id,room_id,user_id,client_nonce,body,moderation_state,created_at) VALUES(?,'room','owner',?,'review me','pending',?)").run(messageId,messageId,timestamp);
      database.sqlite.prepare("INSERT INTO moderation_events(id,user_id,message_id,rule_score,categories_json,decision,evidence_json,created_at) VALUES(?,'owner',?,0.6,'[]','review','{}',?)").run(`moderation-${messageId}`,messageId,timestamp);
    }
    await dispatch("pending-no-ai");
    env.AI={run:vi.fn(async()=>({response:"not-json"}))} as unknown as Ai;
    env.AI_DAILY_BUDGET="10";
    await dispatch("pending-bad-ai");
    expect(database.sqlite.prepare("SELECT decision FROM moderation_events WHERE message_id='pending-bad-ai'").get()?.decision).toBe("visible_parse_failed");
    expect(notify).toHaveBeenCalledTimes(2);
  });
});

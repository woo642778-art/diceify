import { Hono } from "hono";
import { z } from "zod";
import type { Env,SessionUser } from "../types";
import { parseJson } from "../http";
import { buildSchema } from "../schemas";
import { randomToken } from "../security";
import { joinParty } from "../domain/parties";

type Context={Bindings:Env;Variables:{user:SessionUser}};
export const phase2Routes=new Hono<Context>();
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();

phase2Routes.put("/builds/:slug",async(c)=>{
  const user=c.get("user");
  const input=await parseJson(c.req.raw,buildSchema.extend({expectedVersion:z.number().int().min(1)}));
  const build=await c.env.DB.prepare("SELECT id,version FROM saved_builds WHERE slug=? AND owner_id=?").bind(c.req.param("slug"),user.id).first<{id:string;version:number}>();
  if(!build)return c.json({error:"build_not_found"},404);
  if(build.version!==input.expectedVersion)return c.json({error:"version_conflict"},409);
  const timestamp=now(),version=build.version+1,revisionId=id();
  const results=await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO build_versions(id,build_id,version,payload_json,created_at)
      SELECT ?,id,?,?,? FROM saved_builds WHERE id=? AND version=? ON CONFLICT(build_id,version) DO NOTHING`)
      .bind(revisionId,version,JSON.stringify(input),timestamp,build.id,input.expectedVersion),
    c.env.DB.prepare(`UPDATE saved_builds SET title=?,description=?,visibility=?,mode=?,deck_json=?,tree_json=?,total_gold=?,total_core=?,version=?,game_data_version=?,updated_at=?
      WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM build_versions WHERE id=?)`)
      .bind(input.title,input.description,input.visibility,input.mode,JSON.stringify(input.deck),JSON.stringify(input.tree),input.totalGold,input.totalCore,version,c.env.GAME_DATA_VERSION,timestamp,build.id,input.expectedVersion,revisionId),
    c.env.DB.prepare("DELETE FROM build_versions WHERE build_id=? AND version<(SELECT MAX(version)-19 FROM build_versions WHERE build_id=?)").bind(build.id,build.id),
  ]);
  return results[1].meta.changes===1?c.json({ok:true,version}):c.json({error:"version_conflict"},409);
});

phase2Routes.get("/builds/:slug/versions",async(c)=>{
  const user=c.get("user");
  // Historical revisions can contain formerly private content. Only the owner reads them.
  const build=await c.env.DB.prepare("SELECT id FROM saved_builds WHERE slug=? AND owner_id=?").bind(c.req.param("slug"),user.id).first<{id:string}>();
  if(!build)return c.json({error:"build_not_found"},404);
  const versions=await c.env.DB.prepare("SELECT version,payload_json,created_at FROM build_versions WHERE build_id=? ORDER BY version DESC LIMIT 20").bind(build.id).all();
  return c.json({versions:versions.results});
});

phase2Routes.post("/builds/:slug/fork",async(c)=>{
  const user=c.get("user");
  const parent=await c.env.DB.prepare("SELECT * FROM saved_builds WHERE slug=? AND (visibility!='private' OR owner_id=?)").bind(c.req.param("slug"),user.id).first<Record<string,string|number>>();
  if(!parent)return c.json({error:"build_not_found"},404);
  const buildId=id(),slug=randomToken(6),timestamp=now();
  const payload={title:parent.title,description:parent.description,deck:JSON.parse(String(parent.deck_json)),tree:JSON.parse(String(parent.tree_json)),mode:parent.mode,totalGold:parent.total_gold,totalCore:parent.total_core,gameDataVersion:parent.game_data_version};
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO saved_builds(id,owner_id,slug,visibility,title,description,mode,deck_json,tree_json,total_gold,total_core,game_data_version,created_at,updated_at,parent_build_id) VALUES (?,?,?,'private',?,?,?,?,?,?,?,?,?,?,?)")
      .bind(buildId,user.id,slug,parent.title,parent.description,parent.mode,parent.deck_json,parent.tree_json,parent.total_gold,parent.total_core,parent.game_data_version,timestamp,timestamp,parent.id),
    c.env.DB.prepare("INSERT INTO build_versions(id,build_id,version,payload_json,created_at) VALUES(?,?,1,?,?)").bind(id(),buildId,JSON.stringify(payload),timestamp),
    c.env.DB.prepare("INSERT INTO build_copy_events(id,build_id,user_id,created_at) VALUES(?,?,?,?)").bind(id(),parent.id,user.id,timestamp),
  ]);
  return c.json({slug,version:1,parentSlug:c.req.param("slug")},201);
});

phase2Routes.delete("/builds/:slug",async(c)=>{
  const result=await c.env.DB.prepare("DELETE FROM saved_builds WHERE slug=? AND owner_id=?").bind(c.req.param("slug"),c.get("user").id).run();
  return result.meta.changes===1?c.json({ok:true}):c.json({error:"build_not_found"},404);
});

phase2Routes.post("/matchmaking/:postId/join",async(c)=>{
  const input=await parseJson(c.req.raw,z.object({role:z.enum(["dealer","support","balanced"])}).strict());
  const result=await joinParty(c.env.DB,c.req.param("postId"),c.get("user").id,input.role);
  return result.joined?c.json(result):c.json({error:"party_unavailable"},409);
});

phase2Routes.get("/matchmaking/:postId",async(c)=>{
  const user=c.get("user"),postId=c.req.param("postId");
  const member=await c.env.DB.prepare("SELECT 1 FROM party_members WHERE post_id=? AND user_id=?").bind(postId,user.id).first();
  if(!member)return c.json({error:"membership_required"},403);
  const post=await c.env.DB.prepare("SELECT id,owner_id,room_id,target,state,capacity,expires_at FROM matchmaking_posts WHERE id=?").bind(postId).first();
  const members=await c.env.DB.prepare("SELECT m.user_id,m.role,m.ready,p.nickname FROM party_members m JOIN profiles p ON p.user_id=m.user_id WHERE m.post_id=? ORDER BY m.joined_at LIMIT 8").bind(postId).all();
  return c.json({post,members:members.results});
});

phase2Routes.put("/matchmaking/:postId/ready",async(c)=>{
  const input=await parseJson(c.req.raw,z.object({ready:z.boolean()}).strict());
  const result=await c.env.DB.prepare("UPDATE party_members SET ready=? WHERE post_id=? AND user_id=? AND EXISTS(SELECT 1 FROM matchmaking_posts WHERE id=? AND state IN ('open','full') AND expires_at>?)")
    .bind(Number(input.ready),c.req.param("postId"),c.get("user").id,c.req.param("postId"),now()).run();
  return result.meta.changes===1?c.json({ok:true}):c.json({error:"party_unavailable"},409);
});

phase2Routes.post("/matchmaking/:postId/leave",async(c)=>{
  const user=c.get("user"),postId=c.req.param("postId"),timestamp=now();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE chat_members SET left_at=? WHERE user_id=? AND room_id=(SELECT room_id FROM matchmaking_posts WHERE id=?)").bind(timestamp,user.id,postId),
    c.env.DB.prepare("DELETE FROM party_members WHERE post_id=? AND user_id=?").bind(postId,user.id),
    c.env.DB.prepare("UPDATE matchmaking_posts SET current_members=(SELECT COUNT(*) FROM party_members WHERE post_id=?),state=CASE WHEN owner_id=? THEN 'closed' WHEN expires_at<=? THEN 'expired' ELSE 'open' END,updated_at=? WHERE id=? AND state IN ('open','full')").bind(postId,user.id,timestamp,timestamp,postId),
  ]);
  return c.json({ok:true});
});

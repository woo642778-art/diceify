export async function joinParty(db:D1Database, postId:string, userId:string, role:"dealer"|"support"|"balanced", timestamp=new Date().toISOString()) {
  const existing = await db.prepare("SELECT p.room_id FROM party_members m JOIN matchmaking_posts p ON p.id=m.post_id WHERE m.post_id=? AND m.user_id=? AND p.expires_at>? AND p.state IN ('open','full')").bind(postId,userId,timestamp).first<{room_id:string}>();
  if (existing) return { joined:true,roomId:existing.room_id,replayed:true };
  const results = await db.batch([
    db.prepare(`INSERT INTO party_members(post_id,user_id,role,joined_at)
      SELECT id,?,?,? FROM matchmaking_posts p WHERE id=? AND state='open' AND expires_at>?
      AND (SELECT COUNT(*) FROM party_members WHERE post_id=p.id)<p.capacity
      AND NOT EXISTS(SELECT 1 FROM user_blocks WHERE (blocker_id=p.owner_id AND blocked_id=?) OR (blocker_id=? AND blocked_id=p.owner_id))
      ON CONFLICT DO NOTHING`).bind(userId,role,timestamp,postId,timestamp,userId,userId),
    db.prepare(`INSERT INTO chat_members(room_id,user_id,room_role,joined_at)
      SELECT p.room_id,m.user_id,'member',? FROM matchmaking_posts p JOIN party_members m ON m.post_id=p.id
      WHERE p.id=? AND m.user_id=? AND p.room_id IS NOT NULL
      ON CONFLICT(room_id,user_id) DO UPDATE SET left_at=NULL`).bind(timestamp,postId,userId),
    db.prepare("UPDATE matchmaking_posts SET current_members=(SELECT COUNT(*) FROM party_members WHERE post_id=?),state=CASE WHEN (SELECT COUNT(*) FROM party_members WHERE post_id=?)>=capacity THEN 'full' ELSE state END,updated_at=? WHERE id=?").bind(postId,postId,timestamp,postId),
  ]);
  if (results[0].meta.changes!==1) return {joined:false,roomId:null,replayed:false};
  const post = await db.prepare("SELECT room_id FROM matchmaking_posts WHERE id=?").bind(postId).first<{room_id:string}>();
  return {joined:true,roomId:post?.room_id??null,replayed:false};
}

export function matchCompatibility(viewer:{role:string;kind:string;beginner:boolean},post:{role:string;kind:string;looking_for:string;beginner_ok:number}) {
  const reasons:string[]=[];
  if(viewer.kind!==post.kind) return {score:0,reasons:["different_mode"],eligible:false};
  if(viewer.beginner&&!post.beginner_ok) return {score:0,reasons:["experience_required"],eligible:false};
  let score=50;
  if(post.looking_for==="any"||post.looking_for===viewer.role){score+=25;reasons.push("requested_role");}
  if((viewer.role==="dealer"&&post.role==="support")||(viewer.role==="support"&&post.role==="dealer")){score+=25;reasons.push("complementary_roles");}
  else if(viewer.role===post.role&&viewer.role!=="balanced") reasons.push("duplicate_roles");
  return {score,reasons,eligible:true};
}

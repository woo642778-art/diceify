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

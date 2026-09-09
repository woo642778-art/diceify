import { useCallback,useEffect,useState } from "react";
import { isPlatformConfigured,platformGet,platformMutate,platformUrl,type PlatformHealth,type PlatformMe } from "../../../platform/api";

type Sort="popular"|"new"|"recruiting";
type Guild={id:string;name:string;guild_code:string;recruiting:number;active_hours:string;description:string;contact:string;saves:number;inquiries:number;updated_at:string};
const emptyForm={name:"",guildCode:"",recruiting:true,activeHours:"",description:"",contact:""};

export function GuildDirectoryV60({locale}:{locale:"ko"|"en"}){
  const ko=locale==="ko";
  const configured=isPlatformConfigured();
  const [sort,setSort]=useState<Sort>("popular");
  const [query,setQuery]=useState("");
  const [guilds,setGuilds]=useState<Guild[]>([]);
  const [status,setStatus]=useState<"loading"|"ready"|"unavailable">(configured?"loading":"unavailable");
  const [me,setMe]=useState<PlatformMe|null>(null);
  const [health,setHealth]=useState<PlatformHealth|null>(null);
  const [formOpen,setFormOpen]=useState(false);
  const [form,setForm]=useState(emptyForm);
  const [notice,setNotice]=useState("");
  const load=useCallback(async()=>{
    if(!configured){setStatus("unavailable");return;}
    setStatus("loading");
    try{
      const [healthResult,list]=await Promise.all([platformGet<PlatformHealth>("/api/v1/health"),platformGet<{guilds:Guild[]}>(`/api/v1/guilds?sort=${sort}&query=${encodeURIComponent(query)}`)]);
      setHealth(healthResult);setGuilds(list.guilds);setStatus("ready");
      setMe(await platformGet<PlatformMe>("/api/v1/me").catch(()=>null));
    }catch{setStatus("unavailable");setGuilds([]);}
  },[configured,query,sort]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),200);return()=>window.clearTimeout(timer);},[load]);
  const register=async()=>{
    if(!me)return;
    try{await platformMutate("/api/v1/guilds",form,me.csrf);setFormOpen(false);setForm(emptyForm);setNotice(ko?"길드를 등록했습니다.":"Guild registered.");await load();}catch(error){setNotice(error instanceof Error?error.message:"guild_failed");}
  };
  const signal=async(guild:Guild,kind:"save"|"inquiry")=>{
    if(!me){setNotice(ko?"저장과 문의 기록은 사이트 로그인 후 사용할 수 있습니다.":"Sign in to save or record an inquiry.");return;}
    try{
      await platformMutate(`/api/v1/guilds/${guild.id}/signals`,{kind},me.csrf);
      if(kind==="inquiry"){
        try{
          const contactUrl=new URL(guild.contact);
          if(contactUrl.protocol==="https:"||contactUrl.protocol==="http:")window.open(contactUrl.href,"_blank","noopener,noreferrer");
          else throw new Error("unsupported_contact_scheme");
        }catch{
          if(navigator.clipboard?.writeText){
            await navigator.clipboard.writeText(guild.contact);
            setNotice(ko?`연락 방법을 복사했습니다: ${guild.contact}`:`Contact copied: ${guild.contact}`);
          }else{
            setNotice(ko?`연락 방법: ${guild.contact}`:`Contact: ${guild.contact}`);
          }
        }
      }
      await load();
    }catch(error){setNotice(error instanceof Error?error.message:"signal_failed");}
  };
  const valid=form.name.trim().length>=2&&form.guildCode.trim().length>=2&&form.description.trim().length>=10&&form.contact.trim().length>=2;
  return <main className="d60-guild" data-testid="diceify-guild-directory">
    <header><div><h1>{ko?"길드":"Guilds"}</h1><p>{ko?"직접 만든 길드를 등록하고, 함께할 사람에게 소개하세요.":"Register your guild and introduce it to other players."}</p></div><form onSubmit={(e)=>{e.preventDefault();void load();}}><input aria-label={ko?"길드 이름 검색":"Search guilds"} value={query} onChange={(e)=>setQuery(e.target.value)} placeholder={ko?"길드 이름 검색":"Search guild name"}/><button>{ko?"검색":"Search"}</button></form><button type="button" className="is-primary" onClick={()=>setFormOpen(true)}>{ko?"내 길드 등록":"Register my guild"}</button></header>
    <nav aria-label={ko?"길드 정렬":"Guild sorting"}>{(["popular","new","recruiting"] as const).map((item)=><button type="button" key={item} onClick={()=>setSort(item)} className={sort===item?"is-active":""}>{item==="popular"?(ko?"추천":"Recommended"):item==="new"?(ko?"신규":"New"):(ko?"모집 중":"Recruiting")}</button>)}</nav>
    <p className="d60-guild-basis">{ko?"추천 순서: 로그인 사용자의 저장 2점 + 문의 3점. 게임 서버의 길드 규모나 전적은 사용하지 않습니다.":"Ranking: authenticated saves x2 plus inquiries x3. No game-server membership or performance data is used."}</p>
    {notice&&<p role="status" className="d60-guild-notice">{notice}</p>}
    {status==="loading"&&<p className="d60-empty">{ko?"길드 목록을 불러오는 중입니다.":"Loading guilds."}</p>}
    {status==="unavailable"&&<section className="d60-empty"><h2>{ko?"길드 서버가 아직 연결되지 않았습니다":"Guild service is not connected"}</h2><p>{ko?"현재 GitHub Pages 배포에는 공유 데이터베이스가 없어 등록 내용을 다른 사용자에게 공개할 수 없습니다. 화면에 가짜 길드를 채우지 않습니다.":"The current GitHub Pages deployment has no shared database, so registrations cannot yet be published to other users. No fake guilds are shown."}</p><button type="button" onClick={()=>void load()}>{ko?"다시 확인":"Retry"}</button></section>}
    {status==="ready"&&<section className="d60-guild-list"><header><span>{ko?"길드":"Guild"}</span><span>{ko?"소개":"Description"}</span><span>{ko?"사이트 관심":"Site interest"}</span><span>{ko?"최근 갱신":"Updated"}</span></header>{guilds.length?guilds.map((guild,index)=><article key={guild.id}><b>{String(index+1).padStart(2,"0")}</b><div><h2>{guild.name}</h2><small>#{guild.guild_code} · {guild.recruiting?(ko?"모집 중":"Recruiting"):(ko?"모집 마감":"Closed")}</small></div><p>{guild.description}<small>{guild.active_hours|| (ko?"활동 시간 미입력":"No active hours")}</small></p><dl><div><dt>{ko?"저장":"Saves"}</dt><dd>{guild.saves}</dd></div><div><dt>{ko?"문의":"Inquiries"}</dt><dd>{guild.inquiries}</dd></div></dl><time>{new Date(guild.updated_at).toLocaleDateString(locale)}</time><div><button type="button" onClick={()=>void signal(guild,"save")}>{ko?"저장":"Save"}</button><button type="button" onClick={()=>void signal(guild,"inquiry")}>{ko?"문의":"Contact"}</button></div></article>):<p className="d60-empty">{ko?"조건에 맞는 등록 길드가 없습니다.":"No registered guild matches this view."}</p>}</section>}
    {formOpen&&<div className="d60-drawer-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)setFormOpen(false);}}><section className="d60-guild-drawer" role="dialog" aria-modal="true" aria-label={ko?"내 길드 등록":"Register my guild"}><header><h2>{ko?"내 길드 등록":"Register my guild"}</h2><button type="button" onClick={()=>setFormOpen(false)}>×</button></header>{!configured||!health?.authConfigured?<p>{ko?"공유 등록은 Diceify 온라인 서버와 로그인이 설정된 뒤 사용할 수 있습니다.":"Shared registration requires the Diceify online service and sign-in."}</p>:!me?<p>{ko?"길드 등록은 사이트 로그인 후 사용할 수 있습니다.":"Sign in to register a guild."} <a href={platformUrl("/auth/google/start")}>{ko?"Google로 로그인":"Sign in with Google"}</a></p>:<form onSubmit={(e)=>{e.preventDefault();void register();}}><label>{ko?"길드 이름":"Guild name"}<input value={form.name} maxLength={30} onChange={(e)=>setForm({...form,name:e.target.value})}/></label><label>{ko?"길드 코드":"Guild code"}<input value={form.guildCode} maxLength={40} onChange={(e)=>setForm({...form,guildCode:e.target.value})}/></label><label>{ko?"모집 상태":"Recruiting"}<select value={String(form.recruiting)} onChange={(e)=>setForm({...form,recruiting:e.target.value==="true"})}><option value="true">{ko?"모집 중":"Recruiting"}</option><option value="false">{ko?"모집 마감":"Closed"}</option></select></label><label>{ko?"주 활동 시간":"Active hours"}<input value={form.activeHours} maxLength={80} onChange={(e)=>setForm({...form,activeHours:e.target.value})}/></label><label>{ko?"소개":"Description"}<textarea value={form.description} maxLength={500} onChange={(e)=>setForm({...form,description:e.target.value})}/><small>{form.description.length}/500</small></label><label>{ko?"연락 방법":"Contact"}<input value={form.contact} maxLength={160} onChange={(e)=>setForm({...form,contact:e.target.value})}/></label><button disabled={!valid}>{ko?"등록":"Register"}</button></form>}</section></div>}
  </main>;
}

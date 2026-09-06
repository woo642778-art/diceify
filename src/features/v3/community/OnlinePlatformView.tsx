import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlannerStateV3 } from "../../../planner-v3/types";
import { gameDataV3 } from "../../../game-data/load";
import { simulatedInvestmentCost } from "../../../planner-v3/costs";
import { isPlatformConfigured, PlatformApiError, platformGet, platformMutate, platformUrl, platformWebSocketUrl, type PlatformHealth, type PlatformMe } from "../../../platform/api";
import {PersonalLab} from "./PersonalLab";
import {CloudSyncPanel} from "./CloudSyncPanel";
import {PartyBoard} from "./PartyBoard";

type Locale = "ko" | "en";
type Section = "builds" | "rooms" | "matchmaking" | "rewards" | "privacy" | "lab";
type PublicBuild = { slug:string; title:string; description:string; mode:string; deck_json:string; total_gold:number; total_core:number; nickname:string; likes:number; copies:number; updated_at:string };
type Room = { id:string; title:string; category:string; description:string; max_members:number; tags_json:string; slow_mode_seconds:number };
type MatchPost = { id:string; kind:string; target:string; role:string; looking_for:string; deck_json:string; beginner_ok:number; capacity:number; current_members:number; expires_at:string };
type ChatMessage = { id:string; userId?:string; user_id?:string; displayName?:string; display_name?:string; body:string; createdAt?:string; created_at?:string; type?:string };

function parseDeck(value: string) {
  try { const result = JSON.parse(value); return Array.isArray(result) ? result.map(String) : []; } catch { return []; }
}

function diceName(id: string, locale: Locale) {
  const dice = gameDataV3.dice.find((entry) => entry.id === id);
  return dice?.nameKey ? gameDataV3.localization[locale][dice.nameKey] ?? id : id;
}

function DiceRow({ deck, locale }: { deck:readonly string[]; locale:Locale }) {
  return <div className="v58-online-dice">{deck.map((diceId,index) => <span key={`${diceId}:${index}`}><img src={`${import.meta.env.BASE_URL}dice-icons/${diceId}.webp`} alt="" onError={(event) => { event.currentTarget.hidden = true; }} /><b>{diceName(diceId,locale)}</b></span>)}</div>;
}

export function OnlinePlatformView({ locale, state, deckIds,onRestore }: { locale:Locale; state:PlannerStateV3; deckIds:readonly string[];onRestore:(state:PlannerStateV3)=>void }) {
  const platformConfigured = isPlatformConfigured();
  const [section,setSection] = useState<Section>("builds");
  const [health,setHealth] = useState<PlatformHealth | null>(null);
  const [me,setMe] = useState<PlatformMe | null>(null);
  const [status,setStatus] = useState<"loading"|"online"|"guest"|"unavailable">(platformConfigured ? "loading" : "unavailable");
  const [notice,setNotice] = useState("");
  const [builds,setBuilds] = useState<PublicBuild[]>([]);
  const [rooms,setRooms] = useState<Room[]>([]);
  const [matchKind,setMatchKind] = useState<"coop"|"crit">("coop");
  const [posts,setPosts] = useState<MatchPost[]>([]);
  const [buildTitle,setBuildTitle] = useState("");
  const [buildVisibility,setBuildVisibility] = useState<"private"|"unlisted"|"public">("unlisted");
  const [roomTitle,setRoomTitle] = useState("");
  const [profileNickname,setProfileNickname] = useState("");
  const [profileRole,setProfileRole] = useState<"dealer"|"support"|"balanced">("balanced");
  const [profileConsent,setProfileConsent] = useState(false);
  const [selectedRoom,setSelectedRoom] = useState<Room | null>(null);
  const [messages,setMessages] = useState<ChatMessage[]>([]);
  const [chatBody,setChatBody] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const cost = useMemo(() => simulatedInvestmentCost(gameDataV3.tree,state),[state]);

  const refresh = useCallback(async () => {
    if (!platformConfigured) {
      setStatus("unavailable");
      setHealth(null);
      return;
    }
    const controller = new AbortController();
    try {
      const currentHealth = await platformGet<PlatformHealth>("/api/v1/health",controller.signal);
      setHealth(currentHealth);
      const [publicBuilds,publicRooms] = await Promise.all([
        platformGet<{ builds:PublicBuild[] }>("/api/v1/builds/public",controller.signal),
        platformGet<{ rooms:Room[] }>("/api/v1/community/rooms",controller.signal),
      ]);
      setBuilds(publicBuilds.builds);
      setRooms(publicRooms.rooms);
      try {
        const currentMe = await platformGet<PlatformMe>("/api/v1/me",controller.signal);
        setMe(currentMe);
        setStatus("online");
      } catch (error) {
        if (error instanceof PlatformApiError && error.status === 401) setStatus("guest");
        else throw error;
      }
    } catch {
      setStatus("unavailable");
      setHealth(null);
    }
  },[platformConfigured]);

  useEffect(() => { void refresh(); },[refresh]);
  useEffect(() => {
    if (status === "unavailable") return;
    void platformGet<{ posts:MatchPost[] }>(`/api/v1/matchmaking/open?kind=${matchKind}`).then((data) => setPosts(data.posts)).catch(() => setPosts([]));
  },[matchKind,status]);

  useEffect(() => () => socketRef.current?.close(),[]);

  const mutate = async <T,>(path:string,input:unknown,method:"POST"|"PUT"|"DELETE"="POST",headers:Record<string,string>={}) => {
    if (!me) throw new PlatformApiError(401,"unauthorized");
    return platformMutate<T>(path,input,me.csrf,method,headers);
  };

  const saveCloud = async () => {
    if (!me) return;
    try {
      const current = await platformGet<{ snapshot:{ state_version?:number; stateVersion?:number }|null }>("/api/v1/sync");
      const expectedVersion = Number(current.snapshot?.state_version ?? current.snapshot?.stateVersion ?? 0);
      await mutate("/api/v1/sync",{ state,expectedVersion,schemaVersion:state.schemaVersion },"PUT");
      setNotice(locale === "ko" ? "현재 플래너 상태를 새 클라우드 버전으로 저장했습니다." : "Saved the current planner as a new cloud version.");
    } catch (error) {
      setNotice(error instanceof PlatformApiError && error.status === 409 ? (locale === "ko" ? "다른 기기의 최신 버전이 있습니다. 덮어쓰지 않았습니다." : "A newer device version exists. Nothing was overwritten.") : (locale === "ko" ? "클라우드 저장을 완료하지 못했습니다." : "Cloud save failed."));
    }
  };

  const publishBuild = async () => {
    if (!me || !buildTitle.trim()) return;
    try {
      const result = await mutate<{ slug:string }>("/api/v1/builds",{ title:buildTitle.trim(),description:"",visibility:buildVisibility,mode:"mixed",deck:[...deckIds].slice(0,5),tree:{ ownedRanks:state.ownedRanks,simulatedRanks:state.simulatedRanks },totalGold:cost.gold,totalCore:cost.stone });
      setBuildTitle("");
      setNotice(locale === "ko" ? `빌드를 저장했습니다. 공유 ID: ${result.slug}` : `Build saved. Share ID: ${result.slug}`);
      if (buildVisibility === "public") setBuilds((await platformGet<{ builds:PublicBuild[] }>("/api/v1/builds/public")).builds);
    } catch (error) { setNotice(error instanceof Error ? error.message : "build_failed"); }
  };

  const createRoom = async () => {
    if (!me || roomTitle.trim().length < 2) return;
    try {
      await mutate("/api/v1/community/rooms",{ title:roomTitle.trim(),category:"general",description:"",maxMembers:20,visibility:"public",joinRequirement:"",tags:[],slowModeSeconds:2 });
      setRoomTitle("");
      setRooms((await platformGet<{ rooms:Room[] }>("/api/v1/community/rooms")).rooms);
    } catch (error) { setNotice(error instanceof Error ? error.message : "room_failed"); }
  };

  const joinRoom = async (room:Room) => {
    if (!me) return;
    socketRef.current?.close();
    try {
      await mutate(`/api/v1/community/rooms/${room.id}/join`,{});
      const history = await platformGet<{ messages:ChatMessage[] }>(`/api/v1/community/rooms/${room.id}/messages`);
      setMessages(history.messages);
      setSelectedRoom(room);
      const socket = new WebSocket(platformWebSocketUrl(`/ws/rooms/${room.id}`));
      socketRef.current = socket;
      socket.onmessage = (event) => {
        try {
          const packet = JSON.parse(String(event.data)) as ChatMessage;
          if (packet.type === "message" || packet.type === "message-pending") setMessages((current) => [...current.filter((entry) => entry.id !== packet.id),packet].slice(-150));
          if (packet.type === "message-hidden") setMessages((current) => current.filter((entry) => entry.id !== packet.id));
        } catch { /* Invalid server packet is ignored. */ }
      };
      socket.onerror = () => setNotice(locale === "ko" ? "실시간 연결을 다시 확인해 주세요." : "Check the realtime connection.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "join_failed"); }
  };

  const sendMessage = () => {
    const body = chatBody.trim();
    if (!body || socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ type:"message",body,nonce:crypto.randomUUID() }));
    setChatBody("");
  };

  const createMatchPost = async () => {
    if (!me) return;
    try {
      await mutate("/api/v1/matchmaking",{ kind:matchKind,target:matchKind === "coop" ? "협동 파티" : "크리티컬 대미지",role:"balanced",lookingFor:"any",deck:[...deckIds].slice(0,5),beginnerOk:true,capacity:2,expiresInMinutes:60 });
      setPosts((await platformGet<{ posts:MatchPost[] }>(`/api/v1/matchmaking/open?kind=${matchKind}`)).posts);
    } catch (error) { setNotice(error instanceof Error ? error.message : "matchmaking_failed"); }
  };

  const logout = async () => {
    if (!me) return;
    await mutate("/api/v1/me/logout",{}).catch(() => undefined);
    setMe(null);
    setStatus("guest");
  };

  const saveProfile = async () => {
    if (!me || profileNickname.trim().length < 2 || !profileConsent) return;
    try {
      await mutate("/api/v1/profile",{ nickname:profileNickname.trim(),mode:"mixed",preferredRole:profileRole,spendProfile:"free",dataConsent:true,recommendationOptOut:false },"PUT");
      setMe(await platformGet<PlatformMe>("/api/v1/me"));
      setNotice(locale === "ko" ? "온라인 프로필을 만들었습니다." : "Online profile created.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "profile_failed"); }
  };

  return <main className="v58-online" data-testid="v58-online-platform">
    <header className="v58-online-hero">
      <div><small>ONLINE PLATFORM · {health ? `${health.environment.toUpperCase()} · DATA ${health.gameDataVersion}` : "OFFLINE COMPATIBILITY"}</small><h1>{locale === "ko" ? "DiceTree 온라인" : "DiceTree Online"}</h1><p>{locale === "ko" ? "로컬 계산은 그대로 유지하면서 빌드 공유, 실시간 연구방, 파티 모집과 클라우드 저장을 연결합니다." : "Keep local calculation while adding build sharing, realtime research rooms, matchmaking, and cloud saves."}</p></div>
      <section className={`v58-session-card is-${status}`}>
        {status === "loading" && <p>{locale === "ko" ? "플랫폼 상태 확인 중" : "Checking platform"}</p>}
        {status === "unavailable" && <><strong>{locale === "ko" ? "로컬 모드" : "Local mode"}</strong><p>{locale === "ko" ? "이 배포 주소에는 온라인 Worker가 연결되지 않았습니다. 계산기와 저장 프로필은 정상 작동합니다." : "This origin has no online Worker. The calculator and local profiles remain available."}</p><button type="button" onClick={() => void refresh()}>{locale === "ko" ? "다시 확인" : "Retry"}</button></>}
        {status === "guest" && <><strong>{locale === "ko" ? "게스트" : "Guest"}</strong><p>{health?.authConfigured
          ? (locale === "ko" ? "공개 자료는 볼 수 있습니다. 저장과 채팅은 로그인 후 사용할 수 있습니다." : "Public data is visible. Sign in to save and chat.")
          : (locale === "ko" ? "이 환경에는 Google 로그인 설정이 없습니다. 공개 자료만 열람할 수 있습니다." : "Google sign-in is not configured in this environment. Only public data is available.")}</p>{health?.authConfigured && <a href={platformUrl("/auth/google/start")}>{locale === "ko" ? "Google로 로그인" : "Sign in with Google"}</a>}</>}
        {status === "online" && me && <><div>{me.user.avatarUrl ? <img src={me.user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span>{me.user.displayName.slice(0,1)}</span>}<p><strong>{me.user.displayName}</strong><small>{me.user.role} · {me.points.toLocaleString()} P</small></p></div>{me.profile ? <div><button type="button" onClick={() => void saveCloud()}>{locale === "ko" ? "지금 클라우드 저장" : "Save to cloud"}</button><button type="button" onClick={() => void logout()}>{locale === "ko" ? "로그아웃" : "Sign out"}</button></div> : <div className="v58-onboarding"><label>{locale === "ko" ? "커뮤니티 닉네임" : "Community nickname"}<input value={profileNickname} minLength={2} maxLength={24} onChange={(event) => setProfileNickname(event.target.value)} /></label><label>{locale === "ko" ? "선호 역할" : "Preferred role"}<select value={profileRole} onChange={(event) => setProfileRole(event.target.value as typeof profileRole)}><option value="dealer">Dealer</option><option value="support">Support</option><option value="balanced">Balanced</option></select></label><label className="v58-consent"><input type="checkbox" checked={profileConsent} onChange={(event) => setProfileConsent(event.target.checked)} />{locale === "ko" ? "프로필 저장과 커뮤니티 이용을 위한 최소 데이터 처리에 동의합니다." : "I agree to the minimum data processing needed for profiles and community use."}</label><button type="button" disabled={!profileConsent || profileNickname.trim().length < 2} onClick={() => void saveProfile()}>{locale === "ko" ? "프로필 시작" : "Start profile"}</button></div>}</>}
      </section>
    </header>
    {notice && <div className="v58-online-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>×</button></div>}
    <div className="v58-online-nav"><button className={section==="lab"?"is-active":""} onClick={()=>setSection("lab")}>{locale==="ko"?"내 연구 · What-if":"Personal lab · What-if"}</button></div>
    {section==="lab"&&<PersonalLab locale={locale} state={state} deck={deckIds} onApply={onRestore}/>}
    {me&&section==="privacy"&&<CloudSyncPanel locale={locale} me={me} state={state} onRestore={onRestore}/>}
    <nav className="v58-online-nav">{(["builds","rooms","matchmaking","rewards","privacy"] as Section[]).map((item) => <button type="button" key={item} className={section===item?"is-active":""} onClick={() => setSection(item)}>{item === "builds" ? (locale === "ko" ? "빌드 허브" : "Builds") : item === "rooms" ? (locale === "ko" ? "연구방" : "Rooms") : item === "matchmaking" ? (locale === "ko" ? "파티 모집" : "Matchmaking") : item === "rewards" ? (locale === "ko" ? "이벤트·포인트" : "Events") : (locale === "ko" ? "개인정보" : "Privacy")}</button>)}</nav>

    {section === "builds" && <div className="v58-online-layout"><section className="v58-compose"><small>MY BUILD</small><h2>{locale === "ko" ? "현재 계산 결과 저장" : "Save current calculation"}</h2><DiceRow deck={deckIds} locale={locale}/><label>{locale === "ko" ? "빌드 이름" : "Build name"}<input value={buildTitle} maxLength={80} onChange={(event) => setBuildTitle(event.target.value)} /></label><label>{locale === "ko" ? "공개 범위" : "Visibility"}<select value={buildVisibility} onChange={(event) => setBuildVisibility(event.target.value as typeof buildVisibility)}><option value="private">{locale === "ko" ? "비공개" : "Private"}</option><option value="unlisted">{locale === "ko" ? "링크 공개" : "Unlisted"}</option><option value="public">{locale === "ko" ? "전체 공개" : "Public"}</option></select></label><dl><div><dt>Gold</dt><dd>{cost.gold.toLocaleString()}</dd></div><div><dt>Core</dt><dd>{cost.stone.toLocaleString()}</dd></div></dl><button type="button" disabled={!me || buildTitle.trim().length < 1 || deckIds.length !== 5} onClick={() => void publishBuild()}>{locale === "ko" ? "버전 1로 저장" : "Save version 1"}</button></section><section className="v58-public-grid"><header><small>COMMUNITY BUILDS</small><h2>{locale === "ko" ? "공개 빌드" : "Public builds"}</h2></header>{builds.length ? builds.map((build) => <article key={build.slug}><header><span>{build.mode}</span><small>{new Date(build.updated_at).toLocaleDateString()}</small></header><h3>{build.title}</h3><p>{build.description || (locale === "ko" ? `${build.nickname}의 공개 빌드` : `Public build by ${build.nickname}`)}</p><DiceRow deck={parseDeck(build.deck_json)} locale={locale}/><footer><span>+{Number(build.likes)} · Copy {Number(build.copies)}</span><b>{Number(build.total_gold).toLocaleString()} G · {Number(build.total_core).toLocaleString()} C</b></footer></article>) : <p className="v58-empty">{locale === "ko" ? "아직 공개 빌드가 없습니다. 가짜 예시는 표시하지 않습니다." : "No public builds yet. No fabricated examples are shown."}</p>}</section></div>}

    {section === "rooms" && <div className="v58-online-layout"><section className="v58-compose"><small>LIVE ROOM</small><h2>{locale === "ko" ? "연구방 만들기" : "Create research room"}</h2><label>{locale === "ko" ? "방 이름" : "Room title"}<input value={roomTitle} maxLength={60} onChange={(event) => setRoomTitle(event.target.value)} /></label><button type="button" disabled={!me || roomTitle.trim().length < 2} onClick={() => void createRoom()}>{locale === "ko" ? "공개 연구방 생성" : "Create public room"}</button><div className="v58-room-list">{rooms.map((room) => <button type="button" key={room.id} className={selectedRoom?.id===room.id?"is-active":""} disabled={!me} onClick={() => void joinRoom(room)}><b>{room.title}</b><span>{room.category} · {room.max_members}{locale === "ko" ? "명" : " members"}</span></button>)}{!rooms.length && <p className="v58-empty">{locale === "ko" ? "열린 연구방이 없습니다." : "No rooms are open."}</p>}</div></section><section className="v58-chat"><header><div><small>HIBERNATABLE WEBSOCKET</small><h2>{selectedRoom?.title ?? (locale === "ko" ? "방을 선택하세요" : "Select a room")}</h2></div><i className={socketRef.current?.readyState===WebSocket.OPEN?"is-live":""}/></header><div className="v58-chat-stream">{messages.map((message) => <article key={message.id}><header><b>{message.displayName ?? message.display_name ?? (locale === "ko" ? "탈퇴한 사용자" : "Deleted user")}</b><small>{new Date(message.createdAt ?? message.created_at ?? Date.now()).toLocaleTimeString([], { hour:"2-digit",minute:"2-digit" })}</small></header><p>{message.body}</p></article>)}{selectedRoom && !messages.length && <p className="v58-empty">{locale === "ko" ? "아직 메시지가 없습니다." : "No messages yet."}</p>}</div><form onSubmit={(event) => { event.preventDefault();sendMessage(); }}><input aria-label={locale === "ko" ? "채팅 메시지" : "Chat message"} value={chatBody} maxLength={500} disabled={!selectedRoom} onChange={(event) => setChatBody(event.target.value)} placeholder={locale === "ko" ? "덱과 트리 근거를 함께 남겨 보세요" : "Discuss deck and tree evidence"}/><button disabled={!chatBody.trim() || !selectedRoom}>{locale === "ko" ? "전송" : "Send"}</button></form></section></div>}

    {section === "matchmaking" && <PartyBoard locale={locale} me={me} deck={deckIds} onRoom={(id,title)=>{setSection("rooms");void joinRoom({id,title,category:"coop",description:"",max_members:2,tags_json:"[]",slow_mode_seconds:0});}}/>}

    {section === "rewards" && <RewardsPanel locale={locale} me={me} platformConfigured={platformConfigured}/>} 
    {section === "privacy" && <PrivacyPanel locale={locale} me={me}/>} 
  </main>;
}

function RewardsPanel({ locale,me,platformConfigured }: { locale:Locale; me:PlatformMe|null; platformConfigured:boolean }) {
  const [events,setEvents] = useState<Array<{ id:string;title:string;description:string;ends_at:string;reward_points:number }>>([]);
  const [catalog,setCatalog] = useState<Array<{ id:string;name:string;category:string;cost:number }>>([]);
  useEffect(() => {
    if (!platformConfigured) return;
    void Promise.all([platformGet<{events:typeof events}>("/api/v1/events/active"),platformGet<{items:typeof catalog}>("/api/v1/points/catalog")]).then(([a,b]) => { setEvents(a.events);setCatalog(b.items); }).catch(() => undefined);
  },[platformConfigured]);
  return <section className="v58-rewards"><header><small>EVENTS · IMMUTABLE LEDGER</small><h2>{locale === "ko" ? "이벤트와 포인트" : "Events and points"}</h2><strong>{me ? `${me.points.toLocaleString()} P` : "Guest"}</strong></header><div><article><h3>{locale === "ko" ? "진행 중 이벤트" : "Active events"}</h3>{events.map((event) => <section key={event.id}><b>{event.title}</b><p>{event.description}</p><span>+{event.reward_points} P · {new Date(event.ends_at).toLocaleDateString()}</span></section>)}{!events.length && <p className="v58-empty">{locale === "ko" ? "현재 진행 중인 이벤트가 없습니다." : "No active events."}</p>}</article><article><h3>{locale === "ko" ? "교환 카탈로그" : "Redemption catalog"}</h3>{catalog.map((item) => <section key={item.id}><b>{item.name}</b><p>{item.category}</p><span>{item.cost.toLocaleString()} P</span></section>)}{!catalog.length && <p className="v58-empty">{locale === "ko" ? "등록된 교환 항목이 없습니다." : "No catalog items."}</p>}</article></div></section>;
}

function PrivacyPanel({ locale,me }: { locale:Locale; me:PlatformMe|null }) {
  return <section className="v58-privacy"><header><small>PRIVACY CONTROL</small><h2>{locale === "ko" ? "내 데이터 통제" : "Control your data"}</h2></header><div><article><h3>{locale === "ko" ? "로컬 우선" : "Local first"}</h3><p>{locale === "ko" ? "로그인하지 않아도 기존 localStorage 프로필, 계산, 공유 URL은 유지됩니다. 클라우드 저장은 명시적으로 실행할 때만 새 버전을 만듭니다." : "Local profiles, calculations, and share URLs work without sign-in. Cloud sync creates a version only when requested."}</p></article><article><h3>{locale === "ko" ? "내보내기와 삭제" : "Export and deletion"}</h3><p>{locale === "ko" ? "로그인 상태에서는 계정 데이터 JSON을 직접 내려받거나 계정을 삭제할 수 있습니다. 공개 기여는 익명화될 수 있습니다." : "Signed-in users can download their account JSON or delete the account. Public contributions may be anonymized."}</p>{me ? <a href={platformUrl("/api/v1/me/export")} download>{locale === "ko" ? "내 데이터 JSON 열기" : "Open my data JSON"}</a> : <span>{locale === "ko" ? "로그인 후 사용 가능" : "Sign in to use"}</span>}</article></div></section>;
}

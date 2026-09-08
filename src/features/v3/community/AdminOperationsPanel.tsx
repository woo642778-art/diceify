import { useCallback, useEffect, useState } from "react";
import { PlatformApiError, platformGet, platformMutate, type PlatformMe } from "../../../platform/api";

type Locale = "ko" | "en";
type Count = { count:number|null };
type Overview = { users:Count;rooms:Count;reports:Count;sockets:Count;environment:string };
type Report = { id:string;reporter_id:string;subject_user_id:string|null;message_id:string|null;reason:string;detail:string;state:"open"|"reviewing";created_at:string;updated_at:string };
type AuditEntry = { id:string;admin_user_id:string;action:string;target_type:string;target_id:string|null;metadata_json:string;created_at:string };
type ActionDraft = { resolution:string;sanctionLevel:number;sanctionHours:number };

const defaultDraft = ():ActionDraft => ({ resolution:"",sanctionLevel:0,sanctionHours:24 });

export function AdminOperationsPanel({ locale,me }: { locale:Locale;me:PlatformMe }) {
  const ko = locale === "ko";
  const [overview,setOverview] = useState<Overview|null>(null);
  const [reports,setReports] = useState<Report[]>([]);
  const [audit,setAudit] = useState<AuditEntry[]>([]);
  const [drafts,setDrafts] = useState<Record<string,ActionDraft>>({});
  const [pending,setPending] = useState<string|null>(null);
  const [notice,setNotice] = useState("");
  const [status,setStatus] = useState<"loading"|"ready"|"error">("loading");

  const refresh = useCallback(async() => {
    setStatus("loading");
    try {
      const [overviewResult,reportResult,auditResult] = await Promise.all([
        platformGet<Overview>("/api/v1/admin/overview"),
        platformGet<{reports:Report[]}>("/api/v1/admin/reports"),
        platformGet<{entries:AuditEntry[]}>("/api/v1/admin/audit"),
      ]);
      setOverview(overviewResult);
      setReports(reportResult.reports);
      setAudit(auditResult.entries);
      setStatus("ready");
    } catch(error) {
      setStatus("error");
      throw error;
    }
  },[]);

  useEffect(() => {
    void refresh().catch((error) => { setStatus("error");setNotice(error instanceof PlatformApiError ? error.code : "operations_unavailable"); });
  },[refresh]);

  const updateDraft = (reportId:string,patch:Partial<ActionDraft>) => {
    setDrafts((current) => ({ ...current,[reportId]:{ ...(current[reportId] ?? defaultDraft()),...patch } }));
  };

  const actionReport = async(report:Report,state:"reviewing"|"resolved"|"dismissed") => {
    const draft = drafts[report.id] ?? defaultDraft();
    setPending(report.id);setNotice("");
    try {
      await platformMutate(`/api/v1/admin/reports/${report.id}/action`,{
        state,
        resolution:draft.resolution.trim(),
        ...(state === "resolved" && draft.sanctionLevel > 0 ? { sanctionLevel:draft.sanctionLevel,sanctionHours:draft.sanctionHours } : {}),
      },me.csrf);
      await refresh();
      setNotice(ko ? "신고 상태와 감사 로그를 원자적으로 기록했습니다." : "Recorded the report state and audit trail atomically.");
    } catch(error) {
      setNotice(error instanceof PlatformApiError ? error.code : "report_action_failed");
    } finally { setPending(null); }
  };

  const metrics:Array<[string,Count|string|undefined]> = [
    [ko?"활성 계정":"Active accounts",overview?.users],
    [ko?"열린 연구방":"Open rooms",overview?.rooms],
    [ko?"열린 신고":"Open reports",overview?.reports],
    [ko?"환경":"Environment",overview?.environment],
  ];

  return <section className="v58-operations" aria-label={ko ? "운영 검토" : "Operations review"}>
    <header><div><small>OWNER · AUDITED OPERATIONS</small><h2>{ko ? "운영 검토 센터" : "Operations review center"}</h2><p>{ko ? "열린 신고를 검토하고, 선택적 제재와 처리 근거를 변경 불가능한 감사 로그에 남깁니다." : "Review open reports and record optional sanctions with an immutable audit trail."}</p></div><button type="button" disabled={status==="loading"} onClick={()=>void refresh().catch((error)=>{setStatus("error");setNotice(error instanceof PlatformApiError?error.code:"operations_unavailable");})}>{status==="loading"?(ko?"불러오는 중":"Loading"):(ko ? "새로고침" : "Refresh")}</button></header>
    {notice && <p className="v58-reward-notice" role="status">{notice}</p>}
    {status==="loading"&&<p className="v58-empty">{ko?"운영 지표와 신고 원장을 불러오는 중입니다.":"Loading operations metrics and report ledger."}</p>}
    {status==="error"&&<p className="v58-empty">{ko?"운영 데이터를 확인할 수 없습니다. 권한과 서버 연결을 확인하세요.":"Operations data is unavailable. Check authorization and server connectivity."}</p>}
    {status==="ready"&&<><div className="v58-ops-metrics">{metrics.map(([label,value])=><article key={label}><small>{label}</small><strong>{typeof value === "string" ? value.toUpperCase() : Number(value?.count ?? 0).toLocaleString()}</strong></article>)}</div>
    <div className="v58-ops-layout"><article className="v58-ops-reports"><header><h3>{ko ? "처리 대기 신고" : "Reports awaiting action"}</h3><span>{reports.length}</span></header>
      {reports.map((report)=>{const draft=drafts[report.id]??defaultDraft();return <section key={report.id}>
        <header><div><b>{report.reason}</b><small>{report.state.toUpperCase()} · {new Date(report.created_at).toLocaleString()}</small></div><code>{report.id}</code></header>
        <p>{report.detail || (ko ? "추가 설명 없음" : "No additional detail")}</p>
        <dl><div><dt>{ko ? "신고자" : "Reporter"}</dt><dd>{report.reporter_id}</dd></div><div><dt>{ko ? "대상" : "Subject"}</dt><dd>{report.subject_user_id ?? report.message_id ?? "-"}</dd></div></dl>
        <label>{ko ? "처리 근거" : "Resolution rationale"}<textarea aria-label={ko ? "처리 근거" : "Resolution rationale"} value={draft.resolution} maxLength={1000} onChange={(event)=>updateDraft(report.id,{resolution:event.target.value})}/></label>
        <div className="v58-ops-sanction"><label>{ko ? "제재 단계" : "Sanction level"}<select aria-label={ko ? "제재 단계" : "Sanction level"} value={draft.sanctionLevel} onChange={(event)=>updateDraft(report.id,{sanctionLevel:Number(event.target.value)})}><option value={0}>{ko?"제재 없음":"No sanction"}</option>{[1,2,3,4,5,6,7].map((level)=><option key={level} value={level}>{level}</option>)}</select></label><label>{ko ? "적용 시간" : "Duration hours"}<input aria-label={ko ? "적용 시간" : "Duration hours"} type="number" min={1} max={8760} disabled={!draft.sanctionLevel} value={draft.sanctionHours} onChange={(event)=>updateDraft(report.id,{sanctionHours:Number(event.target.value)})}/></label></div>
        <footer><button type="button" disabled={pending!==null} onClick={()=>void actionReport(report,"reviewing")}>{ko?"검토 시작":"Start review"}</button><button type="button" disabled={pending!==null} onClick={()=>void actionReport(report,"dismissed")}>{ko?"기각":"Dismiss"}</button><button className="is-primary" type="button" disabled={pending!==null || !draft.resolution.trim()} onClick={()=>void actionReport(report,"resolved")}>{pending===report.id?(ko?"처리 중":"Applying"):(ko?"해결 적용":"Resolve")}</button></footer>
      </section>})}
      {!reports.length&&<p className="v58-empty">{ko?"현재 처리할 신고가 없습니다.":"No reports currently require action."}</p>}
    </article><article className="v58-ops-audit"><header><h3>{ko ? "최근 감사 로그" : "Recent audit trail"}</h3><span>{audit.length}</span></header>{audit.map((entry)=><section key={entry.id}><b>{entry.action}</b><p>{entry.target_type} · {entry.target_id ?? "-"}</p><time>{new Date(entry.created_at).toLocaleString()}</time></section>)}{!audit.length&&<p className="v58-empty">{ko?"기록된 운영 작업이 없습니다.":"No operator actions have been recorded."}</p>}</article></div></>}
  </section>;
}

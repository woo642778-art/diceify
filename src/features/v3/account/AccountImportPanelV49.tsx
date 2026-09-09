import { useState } from "react";
import {
  createAccountSnapshotTemplateV49,
  lookupObservedAccountV49,
  parseFullAccountSnapshotV49,
  type FullAccountImportV49,
  type ObservedAccountV49,
} from "../../../account/accountImportV49";
import type { CanonicalGameData } from "../../../game-data/types";
import type { PlannerStateV3 } from "../../../planner-v3/types";
import { DiceIcon } from "../shared/DiceIcon";
import type { ScreenshotAccountDraftV52 } from "../../../account/screenshotImportV52";
import { ScreenshotAccountImportV52 } from "./ScreenshotAccountImportV52";

export function AccountImportPanelV49({
  data,
  locale,
  state,
  deckIds,
  onLocalAccount,
  onObservedImport,
  onFullImport,
  onScreenshotImport,
}: {
  data: CanonicalGameData;
  locale: "ko" | "en";
  state: PlannerStateV3;
  deckIds: string[];
  onLocalAccount: (nickname: string, pid?: string) => "loaded" | "created";
  onObservedImport: (account: ObservedAccountV49) => void;
  onFullImport: (account: FullAccountImportV49) => void;
  onScreenshotImport?: (draft: ScreenshotAccountDraftV52) => void;
}) {
  const [nickname, setNickname] = useState("");
  const [pid, setPid] = useState("");
  const [rankingIdentifier, setRankingIdentifier] = useState("");
  const [observed, setObserved] = useState<ObservedAccountV49>();
  const [json, setJson] = useState("");
  const [message, setMessage] = useState<string>();
  const openLocalAccount = () => {
    const clean = nickname.normalize("NFKC").trim();
    if (!clean) {
      setMessage(
        locale === "ko"
          ? "저장할 로컬 프로필 이름을 입력하세요."
          : "Enter a local planner profile name.",
      );
      return;
    }
    const cleanPid = pid.normalize("NFKC").trim();
    const result = onLocalAccount(clean, cleanPid || undefined);
    setMessage(
      result === "loaded"
        ? locale === "ko"
          ? `${clean} 로컬 프로필에 저장된 트리·덱·재화를 불러왔습니다. 서버 조회는 수행하지 않았습니다.`
          : `Loaded the locally saved tree, deck, and resources for ${clean}. No server lookup was performed.`
        : locale === "ko"
          ? `${clean} 로컬 프로필을 현재 입력으로 만들었습니다. 서버 조회는 수행하지 않았습니다.`
          : `Saved ${clean} as a local planner profile. No server lookup was performed.`,
    );
  };
  const searchRanking = () => {
    const result = lookupObservedAccountV49(rankingIdentifier);
    setObserved(result);
    setMessage(
      result
        ? undefined
        : locale === "ko"
          ? "보존된 공개 랭킹 자료에는 없습니다. 실제 계정의 존재 여부를 확인한 결과가 아닙니다."
          : "Not in the preserved ranking data. This does not establish whether a game account exists.",
    );
  };
  const importJson = () => {
    const parsed = parseFullAccountSnapshotV49(json, data, state);
    if (!parsed.ok) {
      setMessage(parsed.error[locale]);
      return;
    }
    setMessage(undefined);
    onFullImport(parsed.account);
  };
  return (
    <section className="v49-account-import" data-testid="v49-account-import">
      <header>
        <div>
          <small>MANUAL INPUT · LOCAL STORAGE</small>
          <h2>{locale === "ko" ? "수동 입력·로컬 저장" : "Manual input and local storage"}</h2>
        </div>
        <span>{locale === "ko" ? "로컬 처리" : "Local processing"}</span>
      </header>
      <div className="v49-account-columns">
        <article className="is-local-account">
          <h3>
            {locale === "ko" ? "계산 프로필 저장·불러오기" : "Save or load a planner profile"}
          </h3>
          <p>
            {locale === "ko"
              ? "현재 사이트 입력에 이름을 붙여 이 브라우저에 저장합니다. PID는 메모로만 보관하며, 게임 계정을 검색하거나 인증하지 않습니다."
              : "Name and save the current site inputs in this browser. The PID is only a note; this does not search for or authenticate a game account."}
          </p>
          <div>
            <input
              aria-label={
                locale === "ko" ? "로컬 프로필 이름" : "Local profile name"
              }
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder={locale === "ko" ? "예: 협동 덱 계산" : "Example: Co-op plan"}
              maxLength={32}
            />
            <input
              aria-label="PID"
              value={pid}
              onChange={(event) => setPid(event.target.value)}
              placeholder={locale === "ko" ? "PID 메모 (선택, 조회 안 함)" : "PID note (optional, not queried)"}
              maxLength={64}
            />
            <button type="button" onClick={openLocalAccount}>
              {locale === "ko" ? "로컬 저장·불러오기" : "Save or load locally"}
            </button>
          </div>
          <small>
            {locale === "ko"
              ? "새 이름은 현재 입력 상태로 생성되며, 같은 이름은 이 브라우저에 저장된 상태를 다시 불러옵니다."
              : "A new name uses the current inputs; the same name reloads state saved in this browser."}
          </small>
        </article>
        <article>
          <h3>
            {locale === "ko" ? "공개 랭킹 참고" : "Public ranking reference"}
          </h3>
          <p>
            {locale === "ko"
              ? "보존된 랭킹 화면에 등장한 닉네임 또는 #순위만 찾습니다. 전체 유저 계정 검색이 아닙니다."
              : "Searches only names or ranks present in the preserved ranking capture. This is not an all-player account search."}
          </p>
          <div>
            <input
              aria-label={
                locale === "ko"
                  ? "공개 랭킹 닉네임 또는 순위"
                  : "Public ranking nickname or rank"
              }
              value={rankingIdentifier}
              onChange={(event) => setRankingIdentifier(event.target.value)}
              placeholder={
                locale === "ko" ? "예: Asmo 또는 #1" : "Example: Asmo or #1"
              }
            />
            <button type="button" onClick={searchRanking}>
              {locale === "ko" ? "랭킹 참고 찾기" : "Find ranking reference"}
            </button>
          </div>
          {observed && (
            <div className="v49-observed-account">
              <b>
                #{observed.rank} · {observed.nickname}
              </b>
              <span>{observed.score?.toLocaleString()}</span>
              <div>
                {observed.diceIds.map((diceId) => (
                  <DiceIcon key={diceId} diceId={diceId} label={diceId} />
                ))}
              </div>
              <button type="button" onClick={() => onObservedImport(observed)}>
                {locale === "ko"
                  ? "관측 덱만 적용"
                  : "Apply observed deck only"}
              </button>
            </div>
          )}
        </article>
        <article>
          <h3>
            {locale === "ko"
              ? "수동 JSON 가져오기"
              : "Import manual JSON"}
          </h3>
          <p>
            {locale === "ko"
              ? "사이트 입력으로 JSON을 만들거나 직접 작성한 JSON을 적용합니다. 형식·값 검사만 수행하며, 게임 서버의 계정 데이터라는 보증은 아닙니다."
              : "Create JSON from the site inputs or apply your own. Validation checks structure and values only, not whether the data is genuine game-server account data."}
          </p>
          <div className="v49-snapshot-actions">
            <button
              type="button"
              onClick={() => {
                setJson(createAccountSnapshotTemplateV49(state, deckIds));
                setMessage(
                  locale === "ko"
                    ? "현재 입력으로 스냅샷 초안을 만들었습니다."
                    : "Created a snapshot draft from the current state.",
                );
              }}
            >
              {locale === "ko"
                ? "현재 입력으로 초안 만들기"
                : "Create from current state"}
            </button>
          </div>
          <textarea
            aria-label={
              locale === "ko" ? "계정 스냅샷 JSON" : "Account snapshot JSON"
            }
            value={json}
            onChange={(event) => setJson(event.target.value)}
            placeholder='{"schemaVersion":1,"nickname":"..."}'
          />
          <button type="button" disabled={!json.trim()} onClick={importJson}>
            {locale === "ko" ? "검증 후 전체 적용" : "Validate and apply"}
          </button>
        </article>
      </div>
      {onScreenshotImport && (
        <ScreenshotAccountImportV52
          data={data}
          locale={locale}
          onApply={onScreenshotImport}
        />
      )}
      {message && (
        <p role="status" className="v49-import-message">
          {message}
        </p>
      )}
      <footer>
        {locale === "ko"
          ? "이 도구들은 사용자 입력과 보존된 참고 자료만 사용합니다. 실제 게임 계정 조회 기능은 아직 구현되지 않았습니다."
          : "These tools use user inputs and preserved references only. Live game account lookup has not been implemented."}
      </footer>
    </section>
  );
}

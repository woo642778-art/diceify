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
          ? "사용할 닉네임을 입력하세요."
          : "Enter a nickname to use.",
      );
      return;
    }
    const cleanPid = pid.normalize("NFKC").trim();
    const result = onLocalAccount(clean, cleanPid || undefined);
    setMessage(
      result === "loaded"
        ? locale === "ko"
          ? `${clean} 계정에 저장된 트리·덱·재화를 불러왔습니다.`
          : `Loaded the saved tree, deck, and resources for ${clean}.`
        : locale === "ko"
          ? `${clean} 계정을 현재 입력으로 만들었습니다. 이 브라우저에서 다시 검색할 수 있습니다.`
          : `Created ${clean} from the current inputs. It can be found again in this browser.`,
    );
  };
  const searchRanking = () => {
    const result = lookupObservedAccountV49(rankingIdentifier);
    setObserved(result);
    setMessage(
      result
        ? undefined
        : locale === "ko"
          ? "보존된 공개 랭킹 자료에는 없습니다. 위의 내 닉네임 계정에서는 어떤 닉네임이든 만들거나 다시 불러올 수 있습니다."
          : "Not present in the preserved public ranking data. Use My nickname account above to create or reload any nickname.",
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
          <small>ACCOUNT CONNECT · V4.9</small>
          <h2>{locale === "ko" ? "내 계정 가져오기" : "Import my account"}</h2>
        </div>
        <span>{locale === "ko" ? "로컬 처리" : "Local processing"}</span>
      </header>
      <div className="v49-account-columns">
        <article className="is-local-account">
          <h3>
            {locale === "ko" ? "브라우저 계정 연결" : "Connect browser account"}
          </h3>
          <p>
            {locale === "ko"
              ? "닉네임과 선택적 PID를 현재 입력한 트리·덱·재화에 연결합니다. 게임 서버 자동 조회가 아니라 사용자가 검증할 수 있는 로컬 프로필입니다."
              : "Attach a nickname and optional PID to the tree, deck, and resources entered here. This is a verifiable local profile, not a game-server lookup."}
          </p>
          <div>
            <input
              aria-label={
                locale === "ko" ? "내 계정 닉네임" : "My account nickname"
              }
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder={locale === "ko" ? "게임 닉네임" : "Game nickname"}
            />
            <input
              aria-label="PID"
              value={pid}
              onChange={(event) => setPid(event.target.value)}
              placeholder={locale === "ko" ? "PID 선택 입력" : "Optional PID"}
            />
            <button type="button" onClick={openLocalAccount}>
              {locale === "ko" ? "프로필 연결" : "Connect profile"}
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
              ? "전체 계정 스냅샷 가져오기"
              : "Import a full account snapshot"}
          </h3>
          <p>
            {locale === "ko"
              ? "현재 사이트 입력으로 편집 가능한 JSON을 만든 뒤, PID·레벨을 보완해 검증 적용할 수 있습니다."
              : "Create an editable JSON from the current site state, add PID or levels, then validate and apply it."}
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
          ? "공개된 전체 유저 계정 조회 API를 확인하지 못했기 때문에 서버 스펙을 임의로 만들지 않습니다. 내 닉네임 계정은 사용자가 입력한 사이트 상태를 이 브라우저에 저장하며, 공개 랭킹 결과는 덱 참고 자료일 뿐입니다."
          : "No public all-player account API was found, so server specs are never fabricated. My nickname account stores the site state entered by the user in this browser; public ranking results are deck references only."}
      </footer>
    </section>
  );
}

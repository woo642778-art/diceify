import type { LiveGameStatusStateV62 } from "../../../live-data/types";

export function LiveDataIndicatorV62({
  status,
  canonicalVersion,
  locale,
  onOpen,
}: {
  status: LiveGameStatusStateV62;
  canonicalVersion: string;
  locale: "ko" | "en";
  onOpen: () => void;
}) {
  const current = status.data.officialStore.version === canonicalVersion;
  const live = status.phase === "live";
  const label = status.phase === "refreshing"
    ? (locale === "ko" ? "확인 중" : "Checking")
    : live
      ? (locale === "ko" ? "실시간" : "Live")
      : (locale === "ko" ? "최근 확인" : "Snapshot");

  return <button
    type="button"
    className={`v62-live-indicator ${current ? "is-current" : "is-outdated"}`}
    onClick={onOpen}
    aria-label={locale === "ko" ? "최신 게임 데이터 상태 열기" : "Open live game data status"}
  >
    <i aria-hidden="true" />
    <span>{label}</span>
    <strong>v{status.data.officialStore.version}</strong>
  </button>;
}

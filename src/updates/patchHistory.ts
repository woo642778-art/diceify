export interface OfficialPatchRecordV47 {
  version: string;
  releasedOn: string;
  title: { ko: string; en: string };
  notes: { ko: string[]; en: string[] };
  specificity: "specific" | "generic";
  sources: Array<{ label: string; url: string; checkedOn: string }>;
}

export const RANDOM_DICE_2_APP_STORE_URL = "https://apps.apple.com/kr/app/%EB%9E%9C%EB%8D%A4-%EB%8B%A4%EC%9D%B4%EC%8A%A4-2/id6748432502?platform=ipad";
export const RANDOM_DICE_2_GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.percent.aos.randomdice2";

/** Official storefront version history checked on 2026-09-08. */
export const OFFICIAL_PATCH_HISTORY_V47: readonly OfficialPatchRecordV47[] = [
  {
    version: "1.1.0",
    releasedOn: "2026-09-04",
    title: { ko: "초월과 태양 주사위", en: "Transcendence and Solar Dice" },
    notes: {
      ko: ["하드 난이도 추가", "초월 시스템과 태양 주사위 추가", "균열 상점 추가", "기타 개선과 버그 수정"],
      en: ["Hard difficulty added", "Transcendence system and Solar Dice added", "Rift Shop added", "Other improvements and bug fixes"],
    },
    specificity: "specific",
    sources: [{ label: "Google Play", url: RANDOM_DICE_2_GOOGLE_PLAY_URL, checkedOn: "2026-09-08" }],
  },
  {
    version: "1.0.3",
    releasedOn: "2026-08-21",
    title: { ko: "협동 모드·전술 효과 개선", en: "Co-op mode and tactical-effect improvements" },
    notes: {
      ko: ["협동 모드와 전술 효과 개선", "튜토리얼 개선 및 신고 기능 추가", "기타 개선과 버그 수정"],
      en: ["Co-op mode and tactical-effect improvements", "Tutorial improvements and report feature added", "Other improvements and bug fixes"],
    },
    specificity: "specific",
    sources: [{ label: "Korean App Store", url: RANDOM_DICE_2_APP_STORE_URL, checkedOn: "2026-09-03" }],
  },
  {
    version: "1.0.2",
    releasedOn: "2026-08-20",
    title: { ko: "오류 수정 및 최적화", en: "Error fixes and optimization" },
    notes: { ko: ["공식 기록에는 개별 밸런스 수치가 공개되지 않았습니다."], en: ["No individual balance values are published in the official record."] },
    specificity: "generic",
    sources: [{ label: "Korean App Store", url: RANDOM_DICE_2_APP_STORE_URL, checkedOn: "2026-09-03" }],
  },
  {
    version: "1.0.1",
    releasedOn: "2026-08-14",
    title: { ko: "오류 수정 및 최적화", en: "Error fixes and optimization" },
    notes: { ko: ["공식 스토어 설명에는 개별 주사위나 트리 수치 변경이 명시되지 않았습니다."], en: ["The official store note does not identify individual dice or tree balance changes."] },
    specificity: "generic",
    sources: [
      { label: "Korean App Store", url: RANDOM_DICE_2_APP_STORE_URL, checkedOn: "2026-09-03" },
      { label: "Google Play", url: RANDOM_DICE_2_GOOGLE_PLAY_URL, checkedOn: "2026-08-22" },
    ],
  },
  {
    version: "1.0.0",
    releasedOn: "2026-08-12",
    title: { ko: "랜덤 다이스 2 정식 출시", en: "Random Dice 2 official release" },
    notes: { ko: ["App Store 버전 기록에 정식 출시로 표시됩니다."], en: ["Listed as the official release in App Store version history."] },
    specificity: "specific",
    sources: [{ label: "Korean App Store", url: RANDOM_DICE_2_APP_STORE_URL, checkedOn: "2026-09-03" }],
  },
  {
    version: "0.0.5",
    releasedOn: "2026-06-11",
    title: { ko: "오류 수정 및 최적화", en: "Error fixes and optimization" },
    notes: { ko: ["공식 스토어 설명은 일반적인 수정 문구만 제공합니다."], en: ["The official store provides only a generic maintenance note."] },
    specificity: "generic",
    sources: [{ label: "Korean App Store", url: RANDOM_DICE_2_APP_STORE_URL, checkedOn: "2026-09-03" }],
  },
] as const;

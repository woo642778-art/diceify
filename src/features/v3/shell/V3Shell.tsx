import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { QRCodeSVG } from "qrcode.react";
import type { DiceFamilyV3 } from "../../../game-data/types";
import { gameDataV3 } from "../../../game-data/load";
import { playableDiceV3 } from "../../../game-data/playableDice";
import {
  createDigitalTwinV48,
  digitalTwinFromProfileV48,
  isDigitalTwinV48,
  updateTwinPlannerV48,
  type UserDigitalTwinV48,
} from "../../../account/digitalTwinV48";
import type {
  FullAccountImportV49,
  ObservedAccountV49,
} from "../../../account/accountImportV49";
import { recommendDeckV4 } from "../../../deck-lab/recommendDeck";
import { useI18n } from "../../../i18n/I18nContext";
import {
  recommendTreeInvestmentsV3,
  type V3RecommendationSet,
} from "../../../optimizer/recommendV3";
import {
  buildTreeHeatmapV3,
  type TreeHeatmapModeV3,
} from "../../../optimizer/treeHeatmapV3";
import {
  projectResources,
  simulatedInvestmentCost,
} from "../../../planner-v3/costs";
import { planNextRankRouteV3 } from "../../../planner-v3/routes";
import {
  createPlannerHistoryV3,
  effectiveRankV3,
  plannerReducerV3,
} from "../../../planner-v3/reducer";
import type {
  PlannerActionV3,
  PlannerStateV3,
} from "../../../planner-v3/types";
import { starterOwnedRanksV3 } from "../../../planner-v3/starterRanks";
import { resolveEnemyPresetV3 } from "../../../simulation/enemies/presets";
import type { SimulationInputV3 } from "../../../simulation/engine/types";
import { evaluateNodeV3 } from "../../../simulation/marginal/evaluateNode";
import { decodeV3FromHash, encodeV3 } from "../../../share/codecV3";
import {
  decodeSharedResultFromHashV47,
  encodeSharedResultV47,
  type SharedResultV47,
} from "../../../share/resultCodecV47";
import {
  findProfileByNameV3,
  saveProfileV3,
  type StoredProfileV3,
} from "../../../storage/profileStorageV3";
import { CompareWorkspace } from "../compare/CompareWorkspace";
import { DeckLabView } from "../decks/DeckLabView";
import { PurchaseEfficiencyView } from "../shop/PurchaseEfficiencyView";
import { SimulatorView } from "../simulator/SimulatorView";
import { UpdateCenterView } from "../updates/UpdateCenterView";
import { ProfileManagerV3 } from "../profile/ProfileManagerV3";
import { ShareResultComposer } from "../share/ShareResultComposer";
import { UiIcon } from "../shared/UiIcon";
import { SharedBuildView } from "../share/SharedBuildView";
import { NodeDetailSheet } from "../tree/NodeDetailSheet";
import { GuidedRoutePlanner } from "../tree/GuidedRoutePlanner";
import { RecommendationStrip } from "../tree/RecommendationStrip";
import {
  normalizeTreeSearchText,
  treeNodeSearchTextV3,
  TreeCanvasV3,
} from "../tree/TreeCanvasV3";
import { AccountIntelligenceView } from "../account/AccountIntelligenceView";
import { DiceifyHome } from "../diceify/DiceifyHome";
import { DiceCatalogV60 } from "../diceify/DiceCatalogV60";
import { RankingDirectoryV60 } from "../diceify/RankingDirectoryV60";
import { GuildDirectoryV60 } from "../diceify/GuildDirectoryV60";
import { TierMakerView } from "../tier/TierMakerView";
import { PwaUpdatePromptV55 } from "./PwaUpdatePromptV55";
import { PerformanceDiagnosticsV55 } from "./PerformanceDiagnosticsV55";
import type { ScreenshotAccountDraftV52 } from "../../../account/screenshotImportV52";
import { hasUnreadUpdateV55 } from "../../../updates/updateWatchV55";
import { useLiveGameStatusV62 } from "../../../live-data/useLiveGameStatusV62";
import { LiveDataIndicatorV62 } from "../updates/LiveDataIndicatorV62";
import type { IntelligenceResultV63 } from "../../../intelligence/types";

const OnlinePlatformView = lazy(() =>
  import("../community/OnlinePlatformView").then((module) => ({
    default: module.OnlinePlatformView,
  })),
);
const AIIntelligenceWorkspace = lazy(() =>
  import("../intelligence/AIIntelligenceWorkspace").then((module) => ({
    default: module.AIIntelligenceWorkspace,
  })),
);

type Tab =
  | "home"
  | "ai"
  | "account"
  | "tree"
  | "simulator"
  | "decks"
  | "dice"
  | "rankings"
  | "guild"
  | "community"
  | "tier"
  | "compare"
  | "shop"
  | "updates";
type TreeViewCommandV53 = {
  id: number;
  type: "zoomIn" | "zoomOut" | "fit" | "selected";
};

const PRIMARY_TABS: Tab[] = [
  "home",
  "ai",
  "decks",
  "dice",
  "tree",
  "rankings",
  "guild",
];
const TOOL_TABS: Tab[] = ["simulator", "community", "tier", "compare", "shop", "updates"];

function tabLabel(tab: Tab, locale: "ko" | "en") {
  const labels: Record<Tab, { ko: string; en: string }> = {
    home: { ko: "홈", en: "Home" },
    ai: { ko: "AI 분석", en: "AI Intelligence" },
    account: { ko: "내 계정", en: "My Account" },
    tree: { ko: "다이스 트리", en: "Dice Tree" },
    simulator: { ko: "시뮬레이터", en: "Simulator" },
    decks: { ko: "덱 연구소", en: "Deck Lab" },
    dice: { ko: "주사위", en: "Dice" },
    rankings: { ko: "랭킹", en: "Rankings" },
    guild: { ko: "길드", en: "Guilds" },
    community: { ko: "온라인", en: "Online" },
    tier: { ko: "티어 메이커", en: "Tier Maker" },
    compare: { ko: "비교", en: "Compare" },
    shop: { ko: "구매 효율", en: "Purchase Value" },
    updates: { ko: "업데이트", en: "Updates" },
  };
  return labels[tab][locale];
}

function useMobileLayoutV53() {
  const [mobile, setMobile] = useState(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 980px)").matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 980px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return mobile;
}

const STARTER_OWNED_RANKS = starterOwnedRanksV3(gameDataV3.tree);
const limits = {
  validNodeIds: new Set(gameDataV3.tree.map((node) => node.id)),
  maxRanks: new Map(gameDataV3.tree.map((node) => [node.id, node.maxRank])),
  prerequisites: new Map(
    gameDataV3.tree.map((node) => [node.id, node.prerequisites]),
  ),
  minimumOwnedRanks: new Map(Object.entries(STARTER_OWNED_RANKS)),
};
const selectableDice = playableDiceV3(gameDataV3);
const validDiceIds = new Set(selectableDice.map((dice) => dice.id));
const defaultDiceId = selectableDice.some((dice) => dice.id === "predator")
  ? "predator"
  : (selectableDice[0]?.id ?? "");
const EMPTY_RECOMMENDATIONS: V3RecommendationSet = {
  verified: [],
  partial: [],
};
const DEFAULT_DECK_IDS = recommendDeckV4(
  gameDataV3,
  "balanced",
  "free",
).dice.map((entry) => entry.diceId);
const ACCOUNT_STORAGE_KEY = "dicetree:v49:account";
export const CREATOR_WELCOME_STORAGE_KEY_V55 =
  "dicetree:v55:creator-welcome-seen";
const FAMILY_NAMES: Record<DiceFamilyV3, { ko: string; en: string }> = {
  nature: { ko: "자연", en: "Nature" },
  chaos: { ko: "혼돈", en: "Chaos" },
  order: { ko: "질서", en: "Order" },
  engineering: { ko: "공학", en: "Engineering" },
  magic: { ko: "마법", en: "Magic" },
};

function initialState(): PlannerStateV3 {
  return {
    schemaVersion: 3,
    dataVersion: `${gameDataV3.manifest.clientVersion}:${gameDataV3.manifest.sourceSha256.slice(0, 12)}`,
    ownedRanks: { ...STARTER_OWNED_RANKS },
    simulatedRanks: {},
    inventory: { gold: 0, stone: 0, solarCore: 0 },
    scenario: {
      diceId: defaultDiceId,
      diceProgressionLevel: 1,
      battleUpgradeLevel: 1,
      conditionValues: {},
      enemyPresetId: "custom",
      durationSeconds: 30,
    },
  };
}

function loadAccountTwin(): UserDigitalTwinV48 {
  const fallback = createDigitalTwinV48({
    planner: initialState(),
    activeDeckIds: DEFAULT_DECK_IDS,
    deckGoal: "balanced",
    spendProfile: "free",
  });
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(ACCOUNT_STORAGE_KEY) ?? "null",
    );
    if (!isDigitalTwinV48(parsed)) return fallback;
    return {
      ...parsed,
      planner: {
        ...parsed.planner,
        ownedRanks: { ...STARTER_OWNED_RANKS, ...parsed.planner.ownedRanks },
      },
    };
  } catch {
    return fallback;
  }
}

function rankMap(state: PlannerStateV3) {
  return Object.fromEntries(
    gameDataV3.tree.map((node) => [node.id, effectiveRankV3(state, node.id)]),
  );
}

function simulationInput(
  state: PlannerStateV3,
  overrides: Partial<SimulationInputV3> = {},
): SimulationInputV3 {
  const enemy = resolveEnemyPresetV3(
    state.scenario.enemyPresetId,
    state.scenario.enemyHpOverride,
    gameDataV3,
  );
  return {
    diceId: state.scenario.diceId,
    diceProgressionLevel: state.scenario.diceProgressionLevel,
    battleUpgradeLevel: state.scenario.battleUpgradeLevel,
    treeRanks: rankMap(state),
    conditionValues: state.scenario.conditionValues,
    enemy,
    durationSeconds: state.scenario.durationSeconds,
    ...overrides,
  };
}

export function V3Shell() {
  const { locale, setLocale } = useI18n();
  const mobileLayout = useMobileLayoutV53();
  const liveStatus = useLiveGameStatusV62();
  const [accountSeed] = useState(loadAccountTwin);
  const [tab, setTab] = useState<Tab>("home");
  const [headerScrolled, setHeaderScrolled] = useState(
    () => window.scrollY > 24,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [guidedRouteOpen, setGuidedRouteOpen] = useState(false);
  const [intelligenceOverlay, setIntelligenceOverlay] = useState<IntelligenceResultV63["overlay"]>({});
  const [familyFilter, setFamilyFilter] = useState<DiceFamilyV3 | "all">("all");
  const [query, setQuery] = useState("");
  const [heatmapMode, setHeatmapMode] = useState<TreeHeatmapModeV3>("none");
  const [showTreeCosts, setShowTreeCosts] = useState(true);
  const [focusPrerequisites, setFocusPrerequisites] = useState(true);
  const [shareNotice, setShareNotice] = useState<string>();
  const [deckGoal, setDeckGoal] = useState<"dealer" | "support" | "balanced">(
    () =>
      accountSeed.decks.find((deck) => deck.id === accountSeed.primaryDeckId)
        ?.role ?? "balanced",
  );
  const [spendProfile, setSpendProfile] = useState<
    "free" | "light" | "invested"
  >(accountSeed.preferences.spendProfile);
  const [activeDeckIds, setActiveDeckIds] = useState<string[]>(
    () =>
      accountSeed.decks.find((deck) => deck.id === accountSeed.primaryDeckId)
        ?.diceIds ?? DEFAULT_DECK_IDS,
  );
  const [digitalTwin, setDigitalTwin] = useState(accountSeed);
  const [profileOpen, setProfileOpen] = useState(false);
  const [shareComposerOpen, setShareComposerOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [treeResetOpen, setTreeResetOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [treeToolsOpen, setTreeToolsOpen] = useState(false);
  const [resourceEditorOpen, setResourceEditorOpen] = useState(false);
  const [continueOpen, setContinueOpen] = useState(false);
  const [creatorWelcome, setCreatorWelcome] = useState(() => {
    try {
      return (
        window.localStorage.getItem(CREATOR_WELCOME_STORAGE_KEY_V55) !== "1"
      );
    } catch {
      return true;
    }
  });
  const [aboutOpen, setAboutOpen] = useState(() => {
    try {
      return (
        window.localStorage.getItem(CREATOR_WELCOME_STORAGE_KEY_V55) !== "1"
      );
    } catch {
      return true;
    }
  });
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [updateUnread, setUpdateUnread] = useState(() =>
    hasUnreadUpdateV55(liveStatus.data.officialStore.version),
  );
  const [treeViewCommand, setTreeViewCommand] = useState<TreeViewCommandV53>();
  const desktopTreeSearchRef = useRef<HTMLInputElement>(null);
  const mobileTreeSearchRef = useRef<HTMLInputElement>(null);
  const [shareTitle, setShareTitle] = useState(
    locale === "ko" ? "내 다이스 트리 빌드" : "My Dice Tree Build",
  );
  const [shareNote, setShareNote] = useState("");
  const [sharedResult, setSharedResult] = useState<SharedResultV47 | null>(
    () => {
      const decoded = decodeSharedResultFromHashV47(window.location.hash, {
        ...limits,
        validDiceIds,
      });
      return decoded?.ok ? decoded.result : null;
    },
  );

  useEffect(() => {
    setUpdateUnread(hasUnreadUpdateV55(liveStatus.data.officialStore.version));
  }, [liveStatus.data.officialStore.version]);
  useEffect(() => {
    const updateHeader = () => setHeaderScrolled(window.scrollY > 24);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);
  const [history, dispatchBase] = useReducer(
    (
      current: ReturnType<typeof createPlannerHistoryV3>,
      action: PlannerActionV3,
    ) => plannerReducerV3(current, action, limits),
    undefined,
    () => createPlannerHistoryV3(accountSeed.planner),
  );
  const state = history.present;
  const dispatch = (action: PlannerActionV3) => dispatchBase(action);

  useEffect(() => {
    const restored = decodeV3FromHash(window.location.hash, {
      ...limits,
      validDiceIds,
    });
    if (!restored) return;
    if (!restored.ok) {
      setShareNotice(
        locale === "ko"
          ? "공유 상태를 읽지 못해 새 V3 플래너를 열었습니다."
          : "Could not restore the shared V3 state.",
      );
      return;
    }
    dispatch({ type: "load", state: restored.state });
    if (restored.warnings.length) setShareNotice(restored.warnings.join(" · "));
    // restore once; locale only changes presentation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      }
      if (event.key === "/" && tab === "tree") {
        event.preventDefault();
        if (
          typeof window.matchMedia === "function" &&
          window.matchMedia("(max-width: 980px)").matches
        ) {
          setTreeToolsOpen(true);
          window.setTimeout(() => mobileTreeSearchRef.current?.focus(), 0);
        } else desktopTreeSearchRef.current?.focus();
      }
      if (
        event.key.toLowerCase() === "f" &&
        tab === "tree" &&
        !(event.metaKey || event.ctrlKey || event.altKey)
      ) {
        const target = event.target as HTMLElement | null;
        if (target?.matches("input, textarea, select, [contenteditable=true]"))
          return;
        event.preventDefault();
        setTreeViewCommand({ id: Date.now(), type: "fit" });
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setMoreOpen(false);
        setHeaderMenuOpen(false);
        setTreeToolsOpen(false);
        setResourceEditorOpen(false);
        setContinueOpen(false);
        setAboutOpen(false);
        setCreatorWelcome(false);
        try {
          window.localStorage.setItem(CREATOR_WELCOME_STORAGE_KEY_V55, "1");
        } catch {
          /* Optional preference. */
        }
        setDiagnosticsOpen(false);
        setSelectedNodeId(undefined);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tab]);

  const spent = useMemo(
    () => simulatedInvestmentCost(gameDataV3.tree, state),
    [state],
  );
  const resources = useMemo(
    () => projectResources(state.inventory, spent),
    [spent, state.inventory],
  );
  const hasResettableTreeProgress =
    Object.keys(state.simulatedRanks).length > 0 ||
    Object.entries(state.ownedRanks).some(
      ([nodeId, rank]) => rank !== (STARTER_OWNED_RANKS[nodeId] ?? 0),
    );
  const selectedNode = gameDataV3.tree.find(
    (node) => node.id === selectedNodeId,
  );
  const currentRanks = useMemo(() => rankMap(state), [state]);
  const currentInput = useMemo(() => simulationInput(state), [state]);
  const currentTwin = useMemo(
    () => updateTwinPlannerV48(digitalTwin, state, activeDeckIds),
    [activeDeckIds, digitalTwin, state],
  );
  useEffect(() => {
    try {
      window.localStorage.setItem(
        ACCOUNT_STORAGE_KEY,
        JSON.stringify(currentTwin),
      );
    } catch {
      /* Storage can be unavailable in private mode. */
    }
  }, [currentTwin]);
  useEffect(() => {
    if (currentTwin.identity?.source !== "local-profile") return;
    const existing = findProfileByNameV3(currentTwin.identity.nickname);
    saveProfileV3(
      {
        name: currentTwin.identity.nickname,
        state,
        activeDeckIds,
        deckGoal,
        spendProfile,
        digitalTwin: currentTwin,
      },
      existing?.id,
    );
  }, [activeDeckIds, currentTwin, deckGoal, spendProfile, state]);
  const selectedRoute = useMemo(() => {
    if (!selectedNodeId) return undefined;
    try {
      return planNextRankRouteV3(gameDataV3.tree, currentRanks, selectedNodeId);
    } catch {
      return undefined;
    }
  }, [currentRanks, selectedNodeId]);
  const selectedRouteAffordable =
    !selectedRoute ||
    (selectedRoute.totalCost.gold <= resources.remaining.gold &&
      selectedRoute.totalCost.stone <= resources.remaining.stone &&
      (selectedRoute.totalCost.solarCore ?? 0) <=
        (resources.remaining.solarCore ?? 0));
  const marginal = useMemo(() => {
    if (!selectedNodeId) return undefined;
    try {
      return evaluateNodeV3(currentInput, gameDataV3, selectedNodeId);
    } catch {
      return undefined;
    }
  }, [currentInput, selectedNodeId]);
  const recommendations = useMemo<V3RecommendationSet>(() => {
    try {
      return recommendTreeInvestmentsV3(currentInput, gameDataV3, { limit: 5 });
    } catch {
      return EMPTY_RECOMMENDATIONS;
    }
  }, [currentInput]);
  const heatmap = useMemo(
    () => buildTreeHeatmapV3(currentInput, gameDataV3, heatmapMode),
    [currentInput, heatmapMode],
  );
  const recommendedIds = useMemo(
    () => new Set(recommendations.verified.map((entry) => entry.nodeId)),
    [recommendations],
  );
  const commandResults = useMemo(() => {
    const normalized = normalizeTreeSearchText(commandQuery.trim());
    const tabs: Array<{ id: string; kind: "tab"; tab: Tab; label: string }> = (
      [
        "home",
        "ai",
        "account",
        "tree",
        "simulator",
        "decks",
        "dice",
        "rankings",
        "guild",
        "community",
        "tier",
        "compare",
        "shop",
        "updates",
      ] as Tab[]
    ).map((target) => ({
      id: `tab:${target}`,
      kind: "tab",
      tab: target,
      label: tabLabel(target,locale),
    }));
    const dice = selectableDice.map((entry) => ({
      id: `dice:${entry.id}`,
      kind: "dice" as const,
      diceId: entry.id,
      label: entry.nameKey
        ? (gameDataV3.localization[locale][entry.nameKey] ?? entry.id)
        : entry.id,
    }));
    const nodes = gameDataV3.tree
      .filter((node) => node.kind !== "connector")
      .map((node) => ({
        id: `node:${node.id}`,
        kind: "node" as const,
        nodeId: node.id,
        label: node.nameKey
          ? (gameDataV3.localization[locale][node.nameKey] ?? node.id)
          : node.id,
        effect: node.descriptionKey
          ? (gameDataV3.localization[locale][node.descriptionKey] ?? "")
          : "",
        searchText: treeNodeSearchTextV3(gameDataV3, node, locale),
      }));
    return [...tabs, ...dice, ...nodes]
      .filter(
        (entry) =>
          !normalized ||
          ("searchText" in entry
            ? entry.searchText.includes(normalized)
            : normalizeTreeSearchText(`${entry.label} ${entry.id}`).includes(
                normalized,
              )),
      )
      .slice(0, 12);
  }, [commandQuery, locale]);
  const openCommandResult = (entry: (typeof commandResults)[number]) => {
    if (entry.kind === "tab") setTab(entry.tab);
    if (entry.kind === "dice") {
      dispatch({
        type: "setScenario",
        scenario: { diceId: entry.diceId, conditionValues: {} },
      });
      setTab("simulator");
    }
    if (entry.kind === "node") {
      setSelectedNodeId(entry.nodeId);
      setQuery(entry.label);
      setTab("tree");
    }
    setCommandOpen(false);
    setCommandQuery("");
  };

  const share = async () => {
    const encoded = encodeV3(state);
    const url = `${window.location.origin}${window.location.pathname}#b=${encodeURIComponent(encoded)}`;
    window.history.replaceState(null, "", `#b=${encodeURIComponent(encoded)}`);
    try {
      await navigator.clipboard?.writeText(url);
      setShareNotice(
        locale === "ko"
          ? "V3 빌드 링크를 복사했습니다."
          : "V3 build link copied.",
      );
    } catch {
      setShareNotice(url);
    }
  };

  const continuationUrl = useMemo(() => {
    const encoded = encodeV3(state);
    return `${window.location.origin}${window.location.pathname}#b=${encodeURIComponent(encoded)}`;
  }, [state]);

  const openTab = (nextTab: Tab) => {
    setTab(nextTab);
    setMoreOpen(false);
    setHeaderMenuOpen(false);
  };

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.documentElement.scrollLeft = 0;
    document.body.scrollTop = 0;
    document.body.scrollLeft = 0;
  }, [tab]);

  const openAbout = () => {
    setCreatorWelcome(false);
    setAboutOpen(true);
  };

  const closeAbout = () => {
    setAboutOpen(false);
    setCreatorWelcome(false);
    try {
      window.localStorage.setItem(CREATOR_WELCOME_STORAGE_KEY_V55, "1");
    } catch {
      /* Optional preference. */
    }
  };

  const setRemainingResource = (
    kind: "gold" | "stone" | "solarCore",
    rawValue: number,
  ) => {
    const value = Math.max(
      0,
      Math.round(Number.isFinite(rawValue) ? rawValue : 0),
    );
    dispatch({
      type: "setInventory",
      inventory: { [kind]: value + (spent[kind] ?? 0) },
    });
  };

  const adjustRemainingResource = (
    kind: "gold" | "stone" | "solarCore",
    delta: number,
  ) => {
    setRemainingResource(kind, (resources.remaining[kind] ?? 0) + delta);
  };

  const createResultShare = async () => {
    const result: SharedResultV47 = {
      state,
      deckIds: activeDeckIds,
      title: shareTitle,
      note: shareNote,
      author: locale === "ko" ? "모님" : "Monim",
    };
    const encoded = encodeSharedResultV47(result);
    const hash = `#r=${encodeURIComponent(encoded)}`;
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    window.history.replaceState(null, "", hash);
    try {
      await navigator.clipboard?.writeText(url);
    } catch {
      /* The visible result page remains shareable from the address bar. */
    }
    setShareComposerOpen(false);
    setSharedResult(result);
  };

  const loadProfile = (profile: StoredProfileV3) => {
    dispatch({ type: "load", state: profile.state });
    setActiveDeckIds(profile.activeDeckIds);
    setDeckGoal(profile.deckGoal);
    setSpendProfile(profile.spendProfile);
    setDigitalTwin(digitalTwinFromProfileV48(profile));
    setProfileOpen(false);
    setShareNotice(
      locale === "ko"
        ? `${profile.name} 프로필을 불러왔습니다.`
        : `Loaded ${profile.name}.`,
    );
  };

  const openLocalAccount = (
    nickname: string,
    pid?: string,
  ): "loaded" | "created" => {
    const existing = findProfileByNameV3(nickname);
    if (existing) {
      loadProfile(existing);
      const loadedTwin = digitalTwinFromProfileV48(existing);
      const connectedTwin: UserDigitalTwinV48 = {
        ...loadedTwin,
        identity: {
          nickname,
          ...(pid || loadedTwin.identity?.pid
            ? { pid: pid ?? loadedTwin.identity?.pid }
            : {}),
          source: "local-profile",
          importedAt: new Date().toISOString(),
        },
      };
      setDigitalTwin(connectedTwin);
      saveProfileV3(
        {
          name: existing.name,
          state: existing.state,
          activeDeckIds: existing.activeDeckIds,
          deckGoal: existing.deckGoal,
          spendProfile: existing.spendProfile,
          digitalTwin: connectedTwin,
        },
        existing.id,
      );
      return "loaded";
    }
    const now = new Date().toISOString();
    const twin: UserDigitalTwinV48 = {
      ...currentTwin,
      identity: {
        nickname,
        ...(pid ? { pid } : {}),
        source: "local-profile",
        importedAt: now,
      },
      decks: currentTwin.decks.map((deck) =>
        deck.id === currentTwin.primaryDeckId
          ? { ...deck, name: nickname }
          : deck,
      ),
    };
    setDigitalTwin(twin);
    saveProfileV3({
      name: nickname,
      state,
      activeDeckIds,
      deckGoal,
      spendProfile,
      digitalTwin: twin,
    });
    setShareNotice(
      locale === "ko"
        ? `${nickname} 로컬 계산 프로필을 이 브라우저에 저장했습니다. 서버 조회는 수행하지 않았습니다.`
        : `Saved ${nickname} as a local planner profile. No server lookup was performed.`,
    );
    return "created";
  };

  const importObservedAccount = (account: ObservedAccountV49) => {
    setActiveDeckIds([...account.diceIds]);
    setDigitalTwin((twin) => ({
      ...twin,
      decks: twin.decks.map((deck) =>
        deck.id === twin.primaryDeckId
          ? { ...deck, diceIds: [...account.diceIds] }
          : deck,
      ),
    }));
    setShareNotice(
      locale === "ko"
        ? `${account.nickname}의 관측 랭킹 덱만 적용했습니다. 트리·재화·레벨은 변경하지 않았습니다.`
        : `Applied only ${account.nickname}'s observed ranked deck. Tree, resources, and levels were not changed.`,
    );
  };

  const importFullAccount = (account: FullAccountImportV49) => {
    dispatch({ type: "load", state: account.planner });
    setActiveDeckIds([...account.deckIds]);
    setDeckGoal(account.goal);
    setSpendProfile(account.spendProfile);
    setDigitalTwin((twin) => ({
      ...twin,
      planner: structuredClone(account.planner),
      roster: structuredClone(account.roster),
      identity: account.identity,
      decks: [
        {
          id: "primary",
          name: account.identity.nickname,
          diceIds: [...account.deckIds],
          role: account.goal,
        },
      ],
      primaryDeckId: "primary",
      preferences: { ...twin.preferences, spendProfile: account.spendProfile },
      goal: { ...twin.goal, targetDiceId: account.deckIds[0] },
    }));
    setSelectedNodeId(undefined);
    setGuidedRouteOpen(false);
    setTab("tree");
    setShareNotice(
      locale === "ko"
        ? `${account.identity.nickname} JSON의 형식·값을 검사해 적용했습니다. 서버에서 확인한 계정 데이터는 아닙니다.`
        : `Checked and applied ${account.identity.nickname}'s JSON structure and values. This is not server-verified account data.`,
    );
  };

  const importScreenshotAccount = (draft: ScreenshotAccountDraftV52) => {
    const candidateRanks = { ...state.ownedRanks, ...draft.nodeRanks };
    const validRanks = { ...STARTER_OWNED_RANKS };
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of gameDataV3.tree) {
        const rank = candidateRanks[node.id] ?? 0;
        if (rank <= 0 || validRanks[node.id] === rank) continue;
        if (
          node.prerequisites.every(
            (prerequisite) =>
              (validRanks[prerequisite.nodeId] ??
                candidateRanks[prerequisite.nodeId] ??
                0) >= prerequisite.minRank,
          )
        ) {
          validRanks[node.id] = Math.min(node.maxRank, rank);
          changed = true;
        }
      }
    }
    const nextState: PlannerStateV3 = {
      ...state,
      inventory: {
        ...state.inventory,
        gold: draft.gold ?? state.inventory.gold,
        stone: draft.stone ?? state.inventory.stone,
      },
      ownedRanks: validRanks,
      simulatedRanks: {},
    };
    dispatch({ type: "load", state: nextState });
    setDigitalTwin((current) => ({
      ...current,
      roster: {
        ...current.roster,
        ...Object.fromEntries(
          Object.entries(draft.diceLevels).map(([diceId, level]) => [
            diceId,
            { owned: true, level },
          ]),
        ),
      },
    }));
    setShareNotice(
      locale === "ko"
        ? `스크린샷에서 확인한 재화와 ${Object.keys(validRanks).length}개 노드 상태를 적용했습니다.`
        : `Applied reviewed resources and ${Object.keys(validRanks).length} node states from screenshots.`,
    );
  };

  const resetTree = () => {
    dispatch({ type: "resetTreeProgress" });
    setSelectedNodeId(undefined);
    setGuidedRouteOpen(false);
    setTreeResetOpen(false);
    setShareNotice(
      locale === "ko"
        ? "다이스 트리를 기본 해금 상태로 초기화했습니다. 실행 취소로 복원할 수 있습니다."
        : "Reset the Dice Tree to its starter unlocks. Undo can restore it.",
    );
  };

  const openSharedBuild = (targetTab: Tab) => {
    if (!sharedResult) return;
    dispatch({ type: "load", state: sharedResult.state });
    if (sharedResult.deckIds.length) setActiveDeckIds(sharedResult.deckIds);
    setTab(targetTab);
    const encoded = encodeV3(sharedResult.state);
    window.history.replaceState(null, "", `#b=${encodeURIComponent(encoded)}`);
    setSharedResult(null);
  };

  if (sharedResult)
    return (
      <SharedBuildView
        data={gameDataV3}
        locale={locale}
        result={sharedResult}
        myState={state}
        myDeckIds={activeDeckIds}
        myInput={currentInput}
        friendInput={simulationInput(sharedResult.state)}
        onCopyBuild={() => openSharedBuild("tree")}
        onOpenSimulator={() => openSharedBuild("simulator")}
      />
    );

  return (
    <div className={`v3-app v41-mode-${tab}`} data-testid="v3-app">
      <PwaUpdatePromptV55 locale={locale} />
      <header className={`v3-header ${tab === "home" ? "is-home-header" : ""} ${headerScrolled ? "is-scrolled" : ""}`}>
        <button
          className="v3-brand"
          type="button"
          onClick={() => setTab("home")}
          aria-label="Diceify home"
        >
          <span className="d60-brand-word">diceify</span>
          <span className="d60-brand-die" aria-hidden="true"><UiIcon name="more" size={14} /></span>
        </button>
        <nav
          className="v3-nav v53-desktop-nav"
          aria-label={locale === "ko" ? "주요 화면" : "Primary views"}
        >
          {PRIMARY_TABS.map((item) => (
            <button
              key={item}
              type="button"
              className={tab === item ? "is-active" : ""}
              onClick={() => openTab(item)}
            >
              {tabLabel(item, locale)}
            </button>
          ))}
          <div className="v53-tools-menu">
            <button
              type="button"
              className={TOOL_TABS.includes(tab) ? "is-active" : ""}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
            >
              {locale === "ko" ? "도구" : "Tools"} ▾
            </button>
            {moreOpen && (
              <div role="menu">
                {TOOL_TABS.map((item) => (
                  <button
                    role="menuitem"
                    key={item}
                    type="button"
                    className={`${tab === item ? "is-active" : ""} ${item === "updates" && updateUnread ? "has-update" : ""}`}
                    onClick={() => openTab(item)}
                  >
                    {tabLabel(item, locale)}
                    {item === "updates" && updateUnread && (
                      <i aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>
        <div className="v3-header-actions">
          <LiveDataIndicatorV62
            status={liveStatus}
            canonicalVersion={gameDataV3.manifest.clientVersion}
            locale={locale}
            onOpen={() => openTab("updates")}
          />
          <button className="d60-account-button" type="button" onClick={() => openTab("account")}>{tabLabel("account", locale)}</button>
          <button
            className="v53-desktop-credit"
            type="button"
            onClick={openAbout}
          >
            {locale === "ko" ? "제작자 모님" : "Created by Monim"}
          </button>
          <button
            className="v48-command-open"
            type="button"
            onClick={() => setCommandOpen(true)}
            aria-label={locale === "ko" ? "통합 검색" : "Universal search"}
          >
            <UiIcon name="search" size={15} /> <span>⌘K</span>
          </button>
          <button
            className="v47-profile-button"
            type="button"
            aria-label={locale === "ko" ? "내 프로필" : "Profiles"}
            onClick={() => setProfileOpen(true)}
          >
            <UiIcon name="user" size={16} />
            <span>{locale === "ko" ? "내 프로필" : "Profiles"}</span>
          </button>
          <button
            className="v47-result-button v53-desktop-action"
            type="button"
            onClick={() => setShareComposerOpen(true)}
          >
            {locale === "ko" ? "결과 카드" : "Result card"}
          </button>
          <button
            className="v47-state-share-button v53-desktop-action"
            type="button"
            aria-label={locale === "ko" ? "공유" : "Share"}
            onClick={share}
          >
            {locale === "ko" ? "상태 공유" : "State link"}
          </button>
          <button
            className="v47-locale-button v53-desktop-action"
            type="button"
            onClick={() => setLocale(locale === "ko" ? "en" : "ko")}
          >
            {locale === "ko" ? "EN" : "KO"}
          </button>
          <button
            className="v53-header-menu-button"
            type="button"
            aria-label={locale === "ko" ? "더 많은 작업" : "More actions"}
            aria-expanded={headerMenuOpen}
            onClick={() => setHeaderMenuOpen((open) => !open)}
          >
            <UiIcon name="more" size={18} />
          </button>
        </div>
      </header>

      {headerMenuOpen && (
        <div className="v53-header-menu" role="menu">
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setHeaderMenuOpen(false);
              setShareComposerOpen(true);
            }}
          >
            {locale === "ko" ? "결과 카드 만들기" : "Create result card"}
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setHeaderMenuOpen(false);
              void share();
            }}
          >
            {locale === "ko" ? "상태 링크 복사" : "Copy state link"}
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setHeaderMenuOpen(false);
              setContinueOpen(true);
            }}
          >
            {locale === "ko"
              ? "다른 기기에서 계속"
              : "Continue on another device"}
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setHeaderMenuOpen(false);
              setDiagnosticsOpen(true);
            }}
          >
            {locale === "ko"
              ? "사이트 성능 진단"
              : "Site performance diagnostics"}
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setHeaderMenuOpen(false);
              openAbout();
            }}
          >
            {locale === "ko"
              ? "제작자 및 사이트 정보"
              : "Creator and site info"}
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setLocale(locale === "ko" ? "en" : "ko");
              setHeaderMenuOpen(false);
            }}
          >
            {locale === "ko" ? "English로 전환" : "한국어로 전환"}
          </button>
        </div>
      )}

      <section
        className="v3-resource-rail"
        aria-label={
          locale === "ko" ? "다이스 트리 재화" : "Dice Tree resources"
        }
      >
        <div className="v3-resource-item gold">
          <span className="v3-resource-icon">●</span>
          <label>
            {locale === "ko" ? "남은 골드" : "Remaining Gold"}
            <input
              aria-label={locale === "ko" ? "남은 골드" : "Remaining Gold"}
              type="number"
              min="0"
              step="1000"
              inputMode="numeric"
              value={Math.max(0, resources.remaining.gold)}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) =>
                setRemainingResource("gold", Number(event.target.value))
              }
            />
          </label>
          <small>
            {locale === "ko" ? "계획에서 사용" : "Plan spent"}{" "}
            {spent.gold.toLocaleString()}
          </small>
        </div>
        <div className="v3-resource-item stone">
          <span className="v3-resource-icon">◆</span>
          <label>
            {locale === "ko" ? "남은 다이스 코어" : "Remaining Dice Core"}
            <input
              aria-label={
                locale === "ko" ? "남은 다이스 코어" : "Remaining Dice Core"
              }
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={Math.max(0, resources.remaining.stone)}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) =>
                setRemainingResource("stone", Number(event.target.value))
              }
            />
          </label>
          <small>
            {locale === "ko" ? "계획에서 사용" : "Plan spent"}{" "}
            {spent.stone.toLocaleString()}
          </small>
        </div>
        <div className="v3-resource-item solar">
          <img
            className="v59-resource-icon-image"
            src={`${import.meta.env.BASE_URL}tree-node-icons/currency-solar-core.webp`}
            alt=""
          />
          <label>
            {locale === "ko" ? "남은 태양 코어" : "Remaining Solar Core"}
            <input
              aria-label={
                locale === "ko" ? "남은 태양 코어" : "Remaining Solar Core"
              }
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={Math.max(0, resources.remaining.solarCore ?? 0)}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) =>
                setRemainingResource("solarCore", Number(event.target.value))
              }
            />
          </label>
          <small>
            {locale === "ko" ? "계획에서 사용" : "Plan spent"}{" "}
            {(spent.solarCore ?? 0).toLocaleString()}
          </small>
        </div>
        <div
          className={`v3-resource-status ${resources.affordable ? "is-ok" : "is-short"}`}
        >
          <strong>
            {resources.affordable
              ? locale === "ko"
                ? "투자 가능"
                : "Affordable"
              : locale === "ko"
                ? "재화 부족"
                : "Shortfall"}
          </strong>
          <span>
            {locale === "ko" ? "가상 투자 비용" : "Simulated cost"}:{" "}
            {spent.gold.toLocaleString()} G · {spent.stone.toLocaleString()} C ·{" "}
            {(spent.solarCore ?? 0).toLocaleString()} S
          </span>
          {!resources.affordable && (
            <small>
              {locale === "ko" ? "추가 필요" : "Need"}{" "}
              {resources.shortage.gold.toLocaleString()} G ·{" "}
              {resources.shortage.stone.toLocaleString()} C ·{" "}
              {(resources.shortage.solarCore ?? 0).toLocaleString()} S
            </small>
          )}
        </div>
        <div className="v3-history-actions">
          <button
            type="button"
            onClick={() => dispatch({ type: "clearSimulatedRanks" })}
            disabled={!Object.keys(state.simulatedRanks).length}
          >
            {locale === "ko" ? "전체 계획 취소" : "Clear plan"}
          </button>
          <button
            className="v49-tree-reset-open"
            type="button"
            onClick={() => setTreeResetOpen(true)}
            disabled={!hasResettableTreeProgress}
          >
            {locale === "ko" ? "트리 전체 초기화" : "Reset full tree"}
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "undo" })}
            disabled={!history.past.length}
          >
            {locale === "ko" ? "실행 취소" : "Undo"}
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "redo" })}
            disabled={!history.future.length}
          >
            {locale === "ko" ? "다시 실행" : "Redo"}
          </button>
        </div>
      </section>

      <button
        className={`v53-resource-hud ${resources.affordable ? "is-ok" : "is-short"}`}
        type="button"
        onClick={() => setResourceEditorOpen(true)}
        aria-label={locale === "ko" ? "재화 편집" : "Edit resources"}
      >
        <span>
          <small>{locale === "ko" ? "골드" : "Gold"}</small>
          <strong>
            {Math.max(0, resources.remaining.gold).toLocaleString()}
          </strong>
        </span>
        <span>
          <small>{locale === "ko" ? "코어" : "Core"}</small>
          <strong>
            {Math.max(0, resources.remaining.stone).toLocaleString()}
          </strong>
        </span>
        <span>
          <small>{locale === "ko" ? "태양" : "Solar"}</small>
          <strong>
            {Math.max(0, resources.remaining.solarCore ?? 0).toLocaleString()}
          </strong>
        </span>
        <span>
          <small>{locale === "ko" ? "계획 비용" : "Plan"}</small>
          <strong>
            {spent.gold.toLocaleString()} G · {spent.stone.toLocaleString()} C ·{" "}
            {(spent.solarCore ?? 0).toLocaleString()} S
          </strong>
        </span>
        {!resources.affordable && (
          <span className="v53-shortage">
            <small>{locale === "ko" ? "부족" : "Need"}</small>
            <strong>
              {resources.shortage.gold.toLocaleString()} G ·{" "}
              {resources.shortage.stone.toLocaleString()} C ·{" "}
              {(resources.shortage.solarCore ?? 0).toLocaleString()} S
            </strong>
          </span>
        )}
      </button>

      {shareNotice && (
        <div className="v3-notice" role="status">
          <span>{shareNotice}</span>
          <button type="button" onClick={() => setShareNotice(undefined)}>
            ×
          </button>
        </div>
      )}
      {resourceEditorOpen && (
        <div
          className="v53-sheet-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setResourceEditorOpen(false);
          }}
        >
          <section
            className="v53-action-sheet v53-resource-editor v55-resource-editor"
            role="dialog"
            aria-modal="true"
            aria-label={locale === "ko" ? "재화 편집" : "Edit resources"}
          >
            <div className="v53-sheet-handle" />
            <header>
              <div>
                <small>
                  {locale === "ko" ? "RESOURCE CONTROL" : "RESOURCE CONTROL"}
                </small>
                <h2>
                  {locale === "ko"
                    ? "계획 후 남을 재화를 입력하세요"
                    : "Enter resources left after this plan"}
                </h2>
              </div>
              <button
                type="button"
                aria-label={
                  locale === "ko" ? "재화 편집 닫기" : "Close resource editor"
                }
                onClick={() => setResourceEditorOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="v55-resource-grid">
              <article className="is-gold">
                <header>
                  <span aria-hidden="true">●</span>
                  <div>
                    <strong>{locale === "ko" ? "골드" : "Gold"}</strong>
                    <small>
                      {locale === "ko"
                        ? `계획 전 총 ${state.inventory.gold.toLocaleString()}`
                        : `Total before plan ${state.inventory.gold.toLocaleString()}`}
                    </small>
                  </div>
                </header>
                <label>
                  {locale === "ko"
                    ? "계획 후 남은 골드"
                    : "Gold remaining after plan"}
                  <input
                    autoFocus
                    aria-label={
                      locale === "ko"
                        ? "계획 후 남은 골드"
                        : "Gold remaining after plan"
                    }
                    type="number"
                    min="0"
                    step="1000"
                    inputMode="numeric"
                    value={Math.max(0, resources.remaining.gold)}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) =>
                      setRemainingResource("gold", Number(event.target.value))
                    }
                  />
                </label>
                <output>
                  {Math.max(0, resources.remaining.gold).toLocaleString()} G
                </output>
                <div
                  className="v55-resource-presets"
                  aria-label={
                    locale === "ko" ? "골드 빠른 추가" : "Quick Gold add"
                  }
                >
                  {[10000, 50000, 100000].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => adjustRemainingResource("gold", amount)}
                    >
                      +{amount.toLocaleString()}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setRemainingResource("gold", 0)}
                  >
                    0
                  </button>
                </div>
              </article>
              <article className="is-core">
                <header>
                  <span aria-hidden="true">◆</span>
                  <div>
                    <strong>
                      {locale === "ko" ? "다이스 코어" : "Dice Core"}
                    </strong>
                    <small>
                      {locale === "ko"
                        ? `계획 전 총 ${state.inventory.stone.toLocaleString()}`
                        : `Total before plan ${state.inventory.stone.toLocaleString()}`}
                    </small>
                  </div>
                </header>
                <label>
                  {locale === "ko"
                    ? "계획 후 남은 다이스 코어"
                    : "Dice Core remaining after plan"}
                  <input
                    aria-label={
                      locale === "ko"
                        ? "계획 후 남은 다이스 코어"
                        : "Dice Core remaining after plan"
                    }
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={Math.max(0, resources.remaining.stone)}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) =>
                      setRemainingResource("stone", Number(event.target.value))
                    }
                  />
                </label>
                <output>
                  {Math.max(0, resources.remaining.stone).toLocaleString()} C
                </output>
                <div
                  className="v55-resource-presets"
                  aria-label={
                    locale === "ko"
                      ? "다이스 코어 빠른 추가"
                      : "Quick Dice Core add"
                  }
                >
                  {[10, 50, 100].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => adjustRemainingResource("stone", amount)}
                    >
                      +{amount.toLocaleString()}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setRemainingResource("stone", 0)}
                  >
                    0
                  </button>
                </div>
              </article>
              <article className="is-solar">
                <header>
                  <img
                    className="v59-resource-icon-image"
                    src={`${import.meta.env.BASE_URL}tree-node-icons/currency-solar-core.webp`}
                    alt=""
                  />
                  <div>
                    <strong>
                      {locale === "ko" ? "태양 코어" : "Solar Core"}
                    </strong>
                    <small>
                      {locale === "ko"
                        ? `계획 전 총 ${(state.inventory.solarCore ?? 0).toLocaleString()}`
                        : `Total before plan ${(state.inventory.solarCore ?? 0).toLocaleString()}`}
                    </small>
                  </div>
                </header>
                <label>
                  {locale === "ko"
                    ? "계획 후 남은 태양 코어"
                    : "Solar Core remaining after plan"}
                  <input
                    aria-label={
                      locale === "ko"
                        ? "계획 후 남은 태양 코어"
                        : "Solar Core remaining after plan"
                    }
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={Math.max(0, resources.remaining.solarCore ?? 0)}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) =>
                      setRemainingResource(
                        "solarCore",
                        Number(event.target.value),
                      )
                    }
                  />
                </label>
                <output>
                  {Math.max(
                    0,
                    resources.remaining.solarCore ?? 0,
                  ).toLocaleString()}{" "}
                  S
                </output>
                <div className="v55-resource-presets">
                  {[10, 50, 100].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      aria-label={
                        locale === "ko"
                          ? `태양 코어 +${amount}`
                          : `Solar Core +${amount}`
                      }
                      onClick={() =>
                        adjustRemainingResource("solarCore", amount)
                      }
                    >
                      +{amount.toLocaleString()}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setRemainingResource("solarCore", 0)}
                  >
                    0
                  </button>
                </div>
              </article>
            </div>
            <div
              className={`v55-resource-summary ${resources.affordable ? "is-ok" : "is-short"}`}
            >
              <strong>
                {resources.affordable
                  ? locale === "ko"
                    ? "현재 계획을 감당할 수 있습니다"
                    : "This plan is affordable"
                  : locale === "ko"
                    ? "현재 계획에 재화가 부족합니다"
                    : "This plan exceeds your resources"}
              </strong>
              <span>
                {locale === "ko"
                  ? `가상 계획에서 ${spent.gold.toLocaleString()} 골드, ${spent.stone.toLocaleString()} 코어, ${(spent.solarCore ?? 0).toLocaleString()} 태양 코어가 자동 차감됩니다.`
                  : `${spent.gold.toLocaleString()} Gold, ${spent.stone.toLocaleString()} Core, and ${(spent.solarCore ?? 0).toLocaleString()} Solar Core are deducted automatically.`}
              </span>
            </div>
            <button
              className="is-primary"
              type="button"
              onClick={() => setResourceEditorOpen(false)}
            >
              {locale === "ko" ? "적용하고 닫기" : "Apply and close"}
            </button>
          </section>
        </div>
      )}
      {continueOpen && (
        <div
          className="v53-sheet-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setContinueOpen(false);
          }}
        >
          <section
            className="v53-action-sheet v53-continue-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={
              locale === "ko"
                ? "다른 기기에서 계속"
                : "Continue on another device"
            }
          >
            <div className="v53-sheet-handle" />
            <header>
              <div>
                <small>
                  {locale === "ko"
                    ? "기기 간 이어하기"
                    : "CONTINUE ON ANOTHER DEVICE"}
                </small>
                <h2>
                  {locale === "ko"
                    ? "QR 코드를 스캔하세요"
                    : "Scan this QR code"}
                </h2>
              </div>
              <button type="button" onClick={() => setContinueOpen(false)}>
                ×
              </button>
            </header>
            <div className="v53-qr">
              <QRCodeSVG
                value={continuationUrl}
                size={196}
                level="M"
                marginSize={2}
              />
            </div>
            <p>
              {locale === "ko"
                ? "현재 트리, 보유 재화, 선택 주사위와 시뮬레이션 입력이 링크에 함께 저장됩니다."
                : "The link carries the current tree, resources, selected dice, and simulator inputs."}
            </p>
            <button
              className="is-primary"
              type="button"
              onClick={() => void share()}
            >
              {locale === "ko" ? "링크 복사" : "Copy link"}
            </button>
          </section>
        </div>
      )}
      {aboutOpen && (
        <div
          className={`v53-sheet-backdrop v55-creator-backdrop ${creatorWelcome ? "is-welcome" : ""}`}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAbout();
          }}
        >
          <section
            className="v53-action-sheet v54-about-sheet v55-creator-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="v54-about-title"
          >
            <div className="v53-sheet-handle" />
            <header>
              <div>
                <small>
                  {creatorWelcome
                    ? "WELCOME TO DICEIFY"
                    : "DICEIFY · COMMUNITY TOOL"}
                </small>
                <h2 id="v54-about-title">
                  {locale === "ko" ? "제작자 모님" : "Created by Monim"}
                </h2>
              </div>
              <button
                autoFocus
                type="button"
                aria-label={
                  locale === "ko" ? "사이트 정보 닫기" : "Close site info"
                }
                onClick={closeAbout}
              >
                ×
              </button>
            </header>
            <div className="v54-about-mark" aria-hidden="true">
              <b>RD</b>
              <i>2</i>
            </div>
            {creatorWelcome && (
              <p className="v55-welcome-line">
                {locale === "ko"
                  ? "다이스 트리 투자를 결정하기 전에, 비용과 성능을 먼저 검증하세요."
                  : "Verify cost and performance before committing a Dice Tree investment."}
              </p>
            )}
            <p className="v54-about-intro">
              {locale === "ko"
                ? "게임 안에서 재화를 쓰기 전에 다이스 트리 투자, 덱 구성, 전투 결과를 안전하게 검토할 수 있도록 만든 랜덤 다이스 2 비공식 팬 도구입니다."
                : "An unofficial Random Dice 2 fan tool for reviewing Dice Tree investments, deck composition, and combat results before spending resources in game."}
            </p>
            <div className="v54-about-principles">
              <article>
                <strong>
                  {locale === "ko"
                    ? "근거를 구분합니다"
                    : "Evidence stays visible"}
                </strong>
                <span>
                  {locale === "ko"
                    ? "검증된 계산, 부분 검증, 추정을 결과마다 표시합니다."
                    : "Every result distinguishes verified, partial, and estimated calculations."}
                </span>
              </article>
              <article>
                <strong>
                  {locale === "ko"
                    ? "사용자 선택을 우선합니다"
                    : "Your choices come first"}
                </strong>
                <span>
                  {locale === "ko"
                    ? "추천 이유와 비용을 보여주고 사용자가 경로를 다시 조정할 수 있게 합니다."
                    : "Recommendations expose their reasons and costs so routes remain editable."}
                </span>
              </article>
            </div>
            <a
              className="v54-about-link"
              href="https://github.com/woo642778-art/diceify"
              target="_blank"
              rel="noreferrer"
            >
              {locale === "ko"
                ? "GitHub에서 diceify 보기"
                : "View diceify on GitHub"}
            </a>
            <small className="v54-about-disclaimer">
              {locale === "ko"
                ? "diceify는 게임 제작사와 제휴되지 않은 비공식 팬 프로젝트입니다."
                : "diceify is an unofficial fan project and is not affiliated with the game's publisher."}
            </small>
          </section>
        </div>
      )}
      {treeResetOpen && (
        <div
          className="v49-reset-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTreeResetOpen(false);
          }}
        >
          <section
            className="v49-reset-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="v49-reset-title"
          >
            <small>
              {locale === "ko" ? "되돌릴 수 있는 초기화" : "UNDOABLE RESET"}
            </small>
            <h2 id="v49-reset-title">
              {locale === "ko"
                ? "다이스 트리를 전부 초기화할까요?"
                : "Reset the entire Dice Tree?"}
            </h2>
            <p>
              {locale === "ko"
                ? "실제로 찍은 랭크와 가상 계획을 초기화하고, 게임에서 처음 열려 있는 기본 주사위 5개는 유지합니다. 입력한 골드·코어와 시뮬레이터 설정은 유지되며 실행 취소로 복원할 수 있습니다."
                : "Owned ranks and simulated plans return to the starter unlocks. Gold, Core, and simulator settings are preserved, and Undo can restore the tree."}
            </p>
            <div>
              <button type="button" onClick={() => setTreeResetOpen(false)}>
                {locale === "ko" ? "취소" : "Cancel"}
              </button>
              <button type="button" className="is-danger" onClick={resetTree}>
                {locale === "ko" ? "트리 전체 초기화" : "Reset full tree"}
              </button>
            </div>
          </section>
        </div>
      )}
      {commandOpen && (
        <div
          className="v48-command-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCommandOpen(false);
          }}
        >
          <section
            className="v48-command-palette"
            role="dialog"
            aria-modal="true"
            aria-label={locale === "ko" ? "통합 검색" : "Universal search"}
          >
            <header>
              <input
                autoFocus
                aria-label={
                  locale === "ko" ? "통합 검색어" : "Universal search query"
                }
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && commandResults[0])
                    openCommandResult(commandResults[0]);
                }}
                placeholder={
                  locale === "ko"
                    ? "화면, 주사위, 노드, 효과 검색"
                    : "Search views, dice, nodes, effects"
                }
              />
              <kbd>ESC</kbd>
            </header>
            <div>
              {commandResults.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => openCommandResult(entry)}
                >
                  <span>
                    {entry.kind === "tab"
                      ? locale === "ko"
                        ? "화면"
                        : "View"
                      : entry.kind === "dice"
                        ? locale === "ko"
                          ? "주사위"
                          : "Dice"
                        : locale === "ko"
                          ? "노드"
                          : "Node"}
                  </span>
                  <b>{entry.label}</b>
                  {"effect" in entry && entry.effect ? (
                    <small>{entry.effect}</small>
                  ) : null}
                </button>
              ))}
            </div>
            <footer>
              {locale === "ko"
                ? "Enter로 이동 · Esc로 닫기"
                : "Enter to open · Esc to close"}
            </footer>
          </section>
        </div>
      )}
      {profileOpen && (
        <ProfileManagerV3
          locale={locale}
          state={state}
          activeDeckIds={activeDeckIds}
          deckGoal={deckGoal}
          spendProfile={spendProfile}
          digitalTwin={currentTwin}
          onLoad={loadProfile}
          onClose={() => setProfileOpen(false)}
        />
      )}
      {shareComposerOpen && (
        <ShareResultComposer
          locale={locale}
          title={shareTitle}
          note={shareNote}
          onTitleChange={setShareTitle}
          onNoteChange={setShareNote}
          onCreate={createResultShare}
          onClose={() => setShareComposerOpen(false)}
        />
      )}

      {tab === "home" && <DiceifyHome data={gameDataV3} locale={locale} onNavigate={openTab} onSelectDice={(diceId)=>{dispatch({type:"setScenario",scenario:{diceId,conditionValues:{}}});setTab("dice");}} gold={Math.max(0,resources.remaining.gold)} core={Math.max(0,resources.remaining.stone)} solarCore={Math.max(0,resources.remaining.solarCore??0)} plannedNodes={Object.keys(state.simulatedRanks).length} targetDiceId={state.scenario.diceId} activeDeckIds={activeDeckIds} liveStatus={liveStatus} />}

      {tab === "ai" && (
        <Suspense fallback={<main className="v63-ai-loading">{locale === "ko" ? "AI 결정 엔진을 불러오는 중입니다." : "Loading the intelligence engine."}</main>}>
          <AIIntelligenceWorkspace
            data={gameDataV3}
            locale={locale}
            input={currentInput}
            resources={{
              gold: Math.max(0, resources.remaining.gold),
              stone: Math.max(0, resources.remaining.stone),
              solarCore: Math.max(0, resources.remaining.solarCore ?? 0),
            }}
            activeDeckIds={activeDeckIds}
            onApplyRanks={(ranks) => dispatch({ type: "applyRoute", ranks })}
            onViewTree={(result) => {
              setIntelligenceOverlay(result.overlay);
              setTab("tree");
            }}
            onInspectNode={(result, nodeId) => {
              setIntelligenceOverlay(result.overlay);
              setSelectedNodeId(nodeId);
              setTab("tree");
            }}
          />
        </Suspense>
      )}

      {tab === "account" && (
        <AccountIntelligenceView
          data={gameDataV3}
          locale={locale}
          state={state}
          input={currentInput}
          deckIds={activeDeckIds}
          twin={currentTwin}
          onTwinChange={setDigitalTwin}
          onApplyRanks={(ranks) => dispatch({ type: "applyRoute", ranks })}
          onDeckChange={setActiveDeckIds}
          onLocalAccount={openLocalAccount}
          onObservedAccountImport={importObservedAccount}
          onFullAccountImport={importFullAccount}
          onScreenshotImport={importScreenshotAccount}
          onOpenTree={() => setTab("tree")}
          onOpenSimulator={() => setTab("simulator")}
        />
      )}

      {tab === "dice" && <DiceCatalogV60 data={gameDataV3} locale={locale} onSimulate={(diceId)=>{dispatch({type:"setScenario",scenario:{diceId,conditionValues:{}}});setTab("simulator");}} />}

      {tab === "rankings" && <RankingDirectoryV60 data={gameDataV3} locale={locale} onApply={(ids)=>{setActiveDeckIds(ids);setTab("decks");}} />}

      {tab === "guild" && <GuildDirectoryV60 locale={locale} />}

      {tab === "tree" && (
        <main
          className={`v3-tree-view ${selectedNode || guidedRouteOpen ? "has-detail" : ""}`}
          data-testid="v3-tree-view"
        >
          <section className="v3-tree-main">
            <header
              className="v56-tree-context"
              aria-label={
                locale === "ko"
                  ? "다이스 트리 관제 상태"
                  : "Dice Tree control status"
              }
            >
              <div>
                <small>
                  {locale === "ko"
                    ? "BUILD CONTROL · 경로 관제"
                    : "BUILD CONTROL · PATH INTELLIGENCE"}
                </small>
                <strong>
                  {locale === "ko"
                    ? "다이스 트리 투자 지도"
                    : "Dice Tree investment map"}
                </strong>
              </div>
              <dl>
                <div>
                  <dt>{locale === "ko" ? "데이터" : "Data"}</dt>
                  <dd>v{gameDataV3.manifest.clientVersion}</dd>
                </div>
                <div>
                  <dt>{locale === "ko" ? "계획 노드" : "Plan nodes"}</dt>
                  <dd>{Object.keys(state.simulatedRanks).length}</dd>
                </div>
                <div>
                  <dt>{locale === "ko" ? "검증 추천" : "Verified"}</dt>
                  <dd>{recommendations.verified.length}</dd>
                </div>
              </dl>
            </header>
            <div className="v3-tree-toolbar">
              <div className="v3-family-filter">
                <button
                  type="button"
                  className={familyFilter === "all" ? "is-active" : ""}
                  onClick={() => setFamilyFilter("all")}
                >
                  {locale === "ko" ? "전체" : "All"}
                </button>
                {(
                  [
                    "nature",
                    "chaos",
                    "order",
                    "engineering",
                    "magic",
                  ] as DiceFamilyV3[]
                ).map((family) => (
                  <button
                    key={family}
                    type="button"
                    className={
                      familyFilter === family
                        ? `is-active family-${family}`
                        : `family-${family}`
                    }
                    onClick={() => setFamilyFilter(family)}
                  >
                    {FAMILY_NAMES[family][locale]}
                  </button>
                ))}
              </div>
              <input
                ref={desktopTreeSearchRef}
                aria-label={locale === "ko" ? "트리 검색" : "Tree search"}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  locale === "ko" ? "노드·효과 검색" : "Search node or effect"
                }
              />
              <select
                className="v47-heatmap-select"
                aria-label={
                  locale === "ko" ? "효율 히트맵" : "Efficiency heatmap"
                }
                value={heatmapMode}
                onChange={(event) =>
                  setHeatmapMode(event.target.value as TreeHeatmapModeV3)
                }
              >
                <option value="none">
                  {locale === "ko" ? "히트맵 끄기" : "Heatmap off"}
                </option>
                <option value="gold">
                  {locale === "ko" ? "골드 1만당" : "Per 10k Gold"}
                </option>
                <option value="stone">
                  {locale === "ko" ? "코어 1개당" : "Per Core"}
                </option>
                <option value="path">
                  {locale === "ko" ? "선행 경로 포함" : "Including path"}
                </option>
              </select>
              <button
                className="v45-guided-route-open"
                type="button"
                onClick={() => {
                  setSelectedNodeId(undefined);
                  setGuidedRouteOpen(true);
                }}
              >
                {locale === "ko" ? "맞춤 전체 루트" : "Guided full route"}
              </button>
            </div>
            <RecommendationStrip
              data={gameDataV3}
              recommendations={recommendations}
              locale={locale}
              onSelectNode={setSelectedNodeId}
            />
            <div
              className="v57-tree-view-options"
              aria-label={
                locale === "ko" ? "트리 보기 옵션" : "Tree view options"
              }
            >
              <button
                type="button"
                className={focusPrerequisites ? "is-active" : ""}
                aria-pressed={focusPrerequisites}
                onClick={() => setFocusPrerequisites((value) => !value)}
              >
                {locale === "ko" ? "선행 경로" : "Prerequisites"}
              </button>
              <button
                type="button"
                className={showTreeCosts ? "is-active" : ""}
                aria-pressed={showTreeCosts}
                onClick={() => setShowTreeCosts((value) => !value)}
              >
                {locale === "ko" ? "비용" : "Costs"}
              </button>
            </div>
            <TreeCanvasV3
              data={gameDataV3}
              nodes={gameDataV3.tree}
              ownedRanks={state.ownedRanks}
              simulatedRanks={state.simulatedRanks}
              selectedNodeId={selectedNodeId}
              selectedDiceId={state.scenario.diceId}
              recommendedIds={recommendedIds}
              intelligenceOverlay={intelligenceOverlay}
              heatmap={heatmap}
              heatmapMode={heatmapMode}
              showCosts={showTreeCosts}
              focusPrerequisites={focusPrerequisites}
              familyFilter={familyFilter}
              query={query}
              locale={locale}
              onSelect={setSelectedNodeId}
              command={treeViewCommand}
            />
            <section
              className={`v56-analysis-dock ${selectedNode ? "has-selection" : ""} ${resources.affordable ? "is-affordable" : "is-short"}`}
              data-testid="v56-analysis-dock"
              aria-label={
                locale === "ko" ? "트리 분석 도크" : "Tree analysis dock"
              }
            >
              <div className="v56-dock-signal" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <div className="v56-dock-focus">
                <small>
                  {selectedNode
                    ? locale === "ko"
                      ? "현재 선택"
                      : "CURRENT FOCUS"
                    : locale === "ko"
                      ? "경로 대기"
                      : "ROUTE STANDBY"}
                </small>
                <strong>
                  {selectedNode
                    ? selectedNode.nameKey
                      ? (gameDataV3.localization[locale][
                          selectedNode.nameKey
                        ] ?? selectedNode.id)
                      : selectedNode.id
                    : locale === "ko"
                      ? "노드를 선택해 투자 근거를 확인하세요"
                      : "Select a node to inspect investment evidence"}
                </strong>
              </div>
              <dl className="v56-dock-metrics">
                <div>
                  <dt>{locale === "ko" ? "사용" : "Spent"}</dt>
                  <dd>
                    {spent.gold.toLocaleString()} G <span>·</span>{" "}
                    {spent.stone.toLocaleString()} C
                  </dd>
                </div>
                <div>
                  <dt>{locale === "ko" ? "잔여" : "Remaining"}</dt>
                  <dd>
                    {Math.max(0, resources.remaining.gold).toLocaleString()} G{" "}
                    <span>·</span>{" "}
                    {Math.max(0, resources.remaining.stone).toLocaleString()} C
                  </dd>
                </div>
              </dl>
              <div className="v56-dock-actions">
                <button
                  type="button"
                  onClick={() => setResourceEditorOpen(true)}
                >
                  {locale === "ko" ? "재화 조정" : "Resources"}
                </button>
                {selectedNode && (
                  <button
                    type="button"
                    onClick={() =>
                      setTreeViewCommand({ id: Date.now(), type: "selected" })
                    }
                  >
                    {locale === "ko" ? "선택으로 이동" : "Focus node"}
                  </button>
                )}
                <button
                  className="is-primary"
                  type="button"
                  onClick={() => {
                    setSelectedNodeId(undefined);
                    setGuidedRouteOpen(true);
                  }}
                >
                  {locale === "ko" ? "최적 경로 설계" : "Design optimal route"}
                </button>
              </div>
            </section>
          </section>
          <aside
            className={`v53-tree-inspector ${selectedNode || guidedRouteOpen ? "has-content" : "is-empty"}`}
          >
            {selectedNode ? (
              <NodeDetailSheet
                node={selectedNode}
                data={gameDataV3}
                state={state}
                locale={locale}
                selectedDiceId={state.scenario.diceId}
                marginal={marginal}
                heatmap={heatmap.get(selectedNode.id)}
                route={selectedRoute}
                routeAffordable={selectedRouteAffordable}
                onApplyRoute={(ranks) =>
                  dispatch({ type: "applyRoute", ranks })
                }
                onCancelPlan={() =>
                  dispatch({
                    type: "setSimulatedRank",
                    nodeId: selectedNode.id,
                    rank: state.ownedRanks[selectedNode.id] ?? 0,
                  })
                }
                onSetOwnedRank={(nodeId, rank) =>
                  dispatch({ type: "setOwnedRank", nodeId, rank })
                }
                onSetSimulatedRank={(nodeId, rank) =>
                  dispatch({ type: "setSimulatedRank", nodeId, rank })
                }
                onClose={() => setSelectedNodeId(undefined)}
              />
            ) : guidedRouteOpen ? (
              <GuidedRoutePlanner
                data={gameDataV3}
                locale={locale}
                selectedDiceId={state.scenario.diceId}
                currentRanks={currentRanks}
                budget={{
                  gold: Math.max(0, resources.remaining.gold),
                  stone: Math.max(0, resources.remaining.stone),
                  solarCore: Math.max(0, resources.remaining.solarCore ?? 0),
                }}
                onApply={(ranks) => dispatch({ type: "applyRoute", ranks })}
                onSelectNode={(nodeId) => {
                  setGuidedRouteOpen(false);
                  setSelectedNodeId(nodeId);
                }}
                onClose={() => setGuidedRouteOpen(false)}
              />
            ) : (
              <div className="v53-inspector-empty">
                <small>
                  {locale === "ko" ? "노드 인스펙터" : "NODE INSPECTOR"}
                </small>
                <strong>
                  {locale === "ko" ? "노드를 선택하세요" : "Select a node"}
                </strong>
                <p>
                  {locale === "ko"
                    ? "트리 위치는 유지한 채 효과, 비용, 선행 경로와 투자 근거를 확인할 수 있습니다."
                    : "Inspect effects, costs, prerequisites, and investment evidence without shifting the tree."}
                </p>
              </div>
            )}
          </aside>
          {!selectedNode && !guidedRouteOpen && (
            <nav
              className="v53-tree-dock"
              aria-label={
                locale === "ko" ? "트리 빠른 조작" : "Quick tree controls"
              }
            >
              <button type="button" onClick={() => setTreeToolsOpen(true)}>
                {locale === "ko" ? "필터" : "Filter"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTreeToolsOpen(true);
                  window.setTimeout(
                    () => mobileTreeSearchRef.current?.focus(),
                    0,
                  );
                }}
              >
                {locale === "ko" ? "검색" : "Search"}
              </button>
              <button
                type="button"
                aria-label={locale === "ko" ? "축소" : "Zoom out"}
                onClick={() =>
                  setTreeViewCommand({ id: Date.now(), type: "zoomOut" })
                }
              >
                −
              </button>
              <button
                type="button"
                onClick={() =>
                  setTreeViewCommand({ id: Date.now(), type: "fit" })
                }
              >
                Fit
              </button>
              <button
                type="button"
                aria-label={locale === "ko" ? "확대" : "Zoom in"}
                onClick={() =>
                  setTreeViewCommand({ id: Date.now(), type: "zoomIn" })
                }
              >
                +
              </button>
            </nav>
          )}
          {treeToolsOpen && (
            <div
              className="v53-sheet-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget)
                  setTreeToolsOpen(false);
              }}
            >
              <section
                className="v53-action-sheet v53-tree-tools"
                role="dialog"
                aria-modal="true"
                aria-label={locale === "ko" ? "트리 도구" : "Tree tools"}
              >
                <div className="v53-sheet-handle" />
                <header>
                  <div>
                    <small>
                      {locale === "ko" ? "트리 도구" : "TREE TOOLS"}
                    </small>
                    <h2>
                      {locale === "ko"
                        ? "찾고 분석하고 이동하세요"
                        : "Find, analyze, and navigate"}
                    </h2>
                  </div>
                  <button type="button" onClick={() => setTreeToolsOpen(false)}>
                    ×
                  </button>
                </header>
                <input
                  ref={mobileTreeSearchRef}
                  aria-label={
                    locale === "ko" ? "모바일 트리 검색" : "Mobile tree search"
                  }
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={
                    locale === "ko"
                      ? "노드 이름 또는 효과 검색"
                      : "Search node name or effect"
                  }
                />
                <div className="v53-family-grid">
                  <button
                    type="button"
                    className={familyFilter === "all" ? "is-active" : ""}
                    onClick={() => setFamilyFilter("all")}
                  >
                    {locale === "ko" ? "전체" : "All"}
                  </button>
                  {(
                    [
                      "nature",
                      "chaos",
                      "order",
                      "engineering",
                      "magic",
                    ] as DiceFamilyV3[]
                  ).map((family) => (
                    <button
                      key={family}
                      type="button"
                      className={familyFilter === family ? "is-active" : ""}
                      onClick={() => setFamilyFilter(family)}
                    >
                      {FAMILY_NAMES[family][locale]}
                    </button>
                  ))}
                </div>
                <label>
                  {locale === "ko" ? "효율 히트맵" : "Efficiency heatmap"}
                  <select
                    value={heatmapMode}
                    onChange={(event) =>
                      setHeatmapMode(event.target.value as TreeHeatmapModeV3)
                    }
                  >
                    <option value="none">
                      {locale === "ko" ? "끄기" : "Off"}
                    </option>
                    <option value="gold">
                      {locale === "ko" ? "골드 1만당" : "Per 10k Gold"}
                    </option>
                    <option value="stone">
                      {locale === "ko" ? "코어 1개당" : "Per Core"}
                    </option>
                    <option value="path">
                      {locale === "ko" ? "선행 경로 포함" : "Including path"}
                    </option>
                  </select>
                </label>
                <div className="v57-mobile-view-toggles">
                  <button
                    type="button"
                    className={focusPrerequisites ? "is-active" : ""}
                    onClick={() => setFocusPrerequisites((value) => !value)}
                  >
                    {locale === "ko" ? "선행 경로 표시" : "Show prerequisites"}
                  </button>
                  <button
                    type="button"
                    className={showTreeCosts ? "is-active" : ""}
                    onClick={() => setShowTreeCosts((value) => !value)}
                  >
                    {locale === "ko" ? "노드 비용 표시" : "Show node costs"}
                  </button>
                </div>
                <div className="v53-sheet-actions">
                  <button
                    type="button"
                    disabled={!selectedNodeId}
                    onClick={() => {
                      setTreeViewCommand({ id: Date.now(), type: "selected" });
                      setTreeToolsOpen(false);
                    }}
                  >
                    {locale === "ko"
                      ? "선택 노드로 이동"
                      : "Return to selected"}
                  </button>
                  <button
                    className="is-primary"
                    type="button"
                    onClick={() => {
                      setSelectedNodeId(undefined);
                      setGuidedRouteOpen(true);
                      setTreeToolsOpen(false);
                    }}
                  >
                    {locale === "ko" ? "맞춤 전체 루트" : "Guided full route"}
                  </button>
                </div>
              </section>
            </div>
          )}
        </main>
      )}

      {tab === "simulator" && (
        <SimulatorView
          data={gameDataV3}
          state={state}
          locale={locale}
          onScenarioChange={(patch) =>
            dispatch({ type: "setScenario", scenario: patch })
          }
        />
      )}

      {tab === "decks" && (
        <DeckLabView
          data={gameDataV3}
          locale={locale}
          goal={deckGoal}
          spendProfile={spendProfile}
          onGoalChange={setDeckGoal}
          onSpendProfileChange={setSpendProfile}
          activeDeckIds={activeDeckIds}
          onActiveDeckChange={setActiveDeckIds}
          onSimulate={(diceId) => {
            dispatch({
              type: "setScenario",
              scenario: { diceId, conditionValues: {} },
            });
            setTab("simulator");
          }}
        />
      )}

      {tab === "tier" && <TierMakerView data={gameDataV3} locale={locale} />}

      {tab === "compare" && (
        <CompareWorkspace
          data={gameDataV3}
          locale={locale}
          baseInput={currentInput}
        />
      )}

      {tab === "shop" && <PurchaseEfficiencyView locale={locale} />}
      {tab === "updates" && (
        <UpdateCenterView
          data={gameDataV3}
          locale={locale}
          activeDeckIds={activeDeckIds}
          state={state}
          liveStatus={liveStatus}
          onRefreshLiveData={liveStatus.refresh}
          onUpdateSeen={() => setUpdateUnread(false)}
        />
      )}
      {tab === "community" && (
        <Suspense
          fallback={
            <main className="v58-online">
              <p className="v58-empty">
                {locale === "ko"
                  ? "온라인 플랫폼을 불러오는 중입니다."
                  : "Loading the online platform."}
              </p>
            </main>
          }
        >
          <OnlinePlatformView
            locale={locale}
            state={state}
            deckIds={activeDeckIds}
            onRestore={(restored) =>
              dispatch({ type: "load", state: restored })
            }
            onDeckChange={setActiveDeckIds}
          />
        </Suspense>
      )}

      {mobileLayout && (
        <nav
          className="v53-mobile-nav"
          aria-label={
            locale === "ko" ? "모바일 주요 화면" : "Mobile primary views"
          }
        >
          {(["home", "ai", "tree"] as Tab[]).map((item) => (
            <button
              key={item}
              type="button"
              className={tab === item ? "is-active" : ""}
              onClick={() => openTab(item)}
            >
              <span aria-hidden="true"><UiIcon name={item === "home" ? "home" : item === "tree" ? "tree" : "analysis"} size={18} /></span>
              {tabLabel(item, locale)}
            </button>
          ))}
          <button
            type="button"
            className={`${TOOL_TABS.includes(tab) || ["decks","dice","rankings","guild","account"].includes(tab) ? "is-active" : ""} ${updateUnread ? "has-update" : ""}`}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(true)}
          >
            <span aria-hidden="true"><UiIcon name="more" size={19} /></span>
            {locale === "ko" ? "더보기" : "More"}
            {updateUnread && <i aria-hidden="true" />}
          </button>
        </nav>
      )}
      {mobileLayout && moreOpen && (
        <div
          className="v53-sheet-backdrop v53-more-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMoreOpen(false);
          }}
        >
          <section
            className="v53-action-sheet v53-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={locale === "ko" ? "더보기" : "More"}
          >
            <div className="v53-sheet-handle" />
            <header>
              <div>
                <small>{locale === "ko" ? "더보기" : "MORE"}</small>
                <h2>{locale === "ko" ? "분석 도구" : "Analysis tools"}</h2>
              </div>
              <button type="button" onClick={() => setMoreOpen(false)}>
                ×
              </button>
            </header>
            <div className="v53-more-grid">
              {(["decks", "dice", "rankings", "guild", "account", ...TOOL_TABS] as Tab[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`${tab === item ? "is-active" : ""} ${item === "updates" && updateUnread ? "has-update" : ""}`}
                  onClick={() => openTab(item)}
                >
                  <strong>
                    {tabLabel(item, locale)}
                    {item === "updates" && updateUnread && (
                      <i aria-hidden="true" />
                    )}
                  </strong>
                  <small>
                    {item === "dice"
                      ? locale === "ko"
                        ? "인게임 주사위 정보"
                        : "In-game dice data"
                      : item === "rankings"
                        ? locale === "ko"
                          ? "관측 협동 랭킹"
                          : "Observed co-op ranking"
                        : item === "guild"
                          ? locale === "ko"
                            ? "등록과 사이트 추천"
                            : "Listings and site picks"
                          : item === "account"
                            ? locale === "ko"
                              ? "계정 연결 상태"
                              : "Account connection"
                      : item === "community"
                        ? locale === "ko"
                          ? "빌드·연구방·파티"
                          : "Builds, rooms, parties"
                        : item === "tier"
                          ? locale === "ko"
                            ? "나만의 등급표"
                            : "Custom rankings"
                          : item === "compare"
                            ? locale === "ko"
                              ? "두 설정 비교"
                              : "Compare builds"
                            : item === "shop"
                              ? locale === "ko"
                                ? "예산 최적화"
                                : "Budget optimizer"
                              : locale === "ko"
                                ? "패치와 메타"
                                : "Patches and meta"}
                  </small>
                </button>
              ))}
            </div>
            <footer>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setContinueOpen(true);
                }}
              >
                {locale === "ko"
                  ? "다른 기기에서 계속"
                  : "Continue on another device"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setDiagnosticsOpen(true);
                }}
              >
                {locale === "ko"
                  ? "사이트 성능 진단"
                  : "Performance diagnostics"}
              </button>
              <button
                type="button"
                className="v54-more-creator"
                onClick={() => {
                  setMoreOpen(false);
                  openAbout();
                }}
              >
                {locale === "ko" ? "제작자 모님" : "Created by Monim"}
              </button>
            </footer>
          </section>
        </div>
      )}
      {diagnosticsOpen && (
        <PerformanceDiagnosticsV55
          locale={locale}
          onClose={() => setDiagnosticsOpen(false)}
        />
      )}
    </div>
  );
}

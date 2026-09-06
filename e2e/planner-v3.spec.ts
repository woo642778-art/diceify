import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    if (!window.location.search.includes("welcome-test=1")) window.localStorage.setItem("dicetree:v55:creator-welcome-seen", "1");
  });
});

function captureBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  return errors;
}

async function selectDiceByInternalId(page: Page, diceId: string) {
  await page.getByRole("textbox", { name: "주사위 검색" }).fill(diceId);
  const list = page.getByRole("listbox", { name: "주사위 목록" });
  const option = list.getByRole("option").first();
  await expect(option).toBeVisible();
  await option.click();
}

async function openShellTab(page: Page, label: string) {
  const candidates = page.getByRole("button", { name: label, exact: true });
  for (let index = 0; index < await candidates.count(); index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible()) {
      await candidate.click();
      return;
    }
  }
  if ((page.viewportSize()?.width ?? 1000) <= 760) {
    const mobileNavigation = page.getByRole("navigation", { name: /모바일 주요 화면|Mobile primary views/ });
    await expect(mobileNavigation).toBeVisible();
    await mobileNavigation.getByRole("button", { name: /더보기|More/ }).click();
    const dialog = page.getByRole("dialog", { name: /더보기|More/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button").filter({ hasText: label }).click();
    return;
  }
  await page.getByRole("button", { name: /도구|Tools/ }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}

async function setTreeResources(page: Page, gold: string, core: string) {
  const desktopGold = page.getByRole("spinbutton", { name: "남은 골드" });
  if (!await desktopGold.isVisible()) await page.getByRole("button", { name: "재화 편집" }).click();
  await page.getByRole("spinbutton", { name: "남은 골드" }).filter({ visible: true }).fill(gold);
  await page.getByRole("spinbutton", { name: "남은 다이스 코어" }).filter({ visible: true }).fill(core);
  const done = page.getByRole("button", { name: /완료|적용하고 닫기/, exact: true });
  if (await done.isVisible().catch(() => false)) await done.click();
}

async function readTreeResources(page: Page) {
  const desktopGold = page.getByRole("spinbutton", { name: "남은 골드" });
  if (await desktopGold.isVisible()) return {
    gold: await desktopGold.inputValue(),
    core: await page.getByRole("spinbutton", { name: "남은 다이스 코어" }).inputValue(),
  };
  const values = page.getByRole("button", { name: "재화 편집" }).locator("strong");
  return {
    gold: (await values.nth(0).textContent() ?? "0").replaceAll(",", ""),
    core: (await values.nth(1).textContent() ?? "0").replaceAll(",", ""),
  };
}

async function shareState(page: Page) {
  const direct = page.getByRole("button", { name: "공유", exact: true });
  if (await direct.isVisible().catch(() => false)) await direct.click();
  else {
    await page.getByRole("button", { name: "더 많은 작업" }).click();
    await page.getByRole("menuitem", { name: "상태 링크 복사" }).click();
  }
}

async function focusTreeNode(page: Page, nodeId: string) {
  const isMobileViewport = (page.viewportSize()?.width ?? 1000) <= 760;
  if (isMobileViewport) {
    await page.getByRole("button", { name: "검색", exact: true }).click();
    const tools = page.getByRole("dialog", { name: "트리 도구" });
    await expect(tools).toBeVisible();
    await tools.getByRole("textbox", { name: "모바일 트리 검색" }).fill(nodeId);
    await tools.locator("header button").click();
  } else {
    await page.getByRole("textbox", { name: "트리 검색" }).fill(nodeId);
  }
  const node = page.getByTestId(`v3-node-${nodeId}`);
  await expect(node).toBeVisible();
  return node;
}

async function investTreeNode(page: Page, nodeId: string) {
  const node = await focusTreeNode(page, nodeId);
  await expect(node).toHaveAttribute("data-can-increment", "true");
  const before = Number(await node.getAttribute("data-simulated-rank") ?? "0");
  await node.click();
  const increment = page.getByRole("button", { name: "가상 랭크 올리기" });
  await expect(increment).toBeEnabled();
  await increment.click();
  await expect(node).toHaveAttribute("data-simulated-rank", String(before + 1));
  await page.getByRole("button", { name: "닫기" }).click();
}

test("tree pan renders before pointer release and never flashes a white document", async ({ page, context, isMobile }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  const canvas = page.getByTestId("v3-tree-canvas");
  const transform = page.getByTestId("v3-tree-transform");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const before = await transform.getAttribute("transform");
  const startX = box!.x + box!.width * 0.5;
  const startY = box!.y + box!.height * 0.45;
  let mobileCdp: Awaited<ReturnType<typeof context.newCDPSession>> | null = null;
  if (isMobile) {
    mobileCdp = await context.newCDPSession(page);
    await mobileCdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y: startY, id: 1 }] });
    await mobileCdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: startX - 120, y: startY - 80, id: 1 }] });
  } else {
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 120, startY - 80, { steps: 4 });
  }
  await expect(canvas).toHaveAttribute("data-interacting", "true");
  await expect.poll(() => transform.getAttribute("transform")).not.toBe(before);
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(2, 7, 6)");
  await expect(page.locator("body")).not.toHaveCSS("background-color", "rgb(255, 255, 255)");
  if (isMobile) {
    await mobileCdp!.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else await page.mouse.up();
  await expect(canvas).toHaveAttribute("data-interacting", "false");
  const beforeWheel = await transform.getAttribute("transform");
  await canvas.dispatchEvent("wheel", { deltaY: -180, clientX: startX, clientY: startY });
  await expect.poll(() => transform.getAttribute("transform")).not.toBe(beforeWheel);
  expect(errors).toEqual([]);
});

test("online platform preserves an honest local fallback when no Worker is attached", async ({ page }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await openShellTab(page,"온라인");
  await expect(page.getByTestId("v58-online-platform")).toBeVisible();
  await expect(page.getByText("로컬 모드")).toBeVisible();
  await expect(page.getByText("가짜 예시는 표시하지 않습니다.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("personal lab saves what-if scenarios without changing the current account",async({page})=>{
  const errors=captureBrowserErrors(page);
  await page.goto("/dicetree/");
  const original=await readTreeResources(page);
  await openShellTab(page,"온라인");
  await page.getByRole("button",{name:"내 연구 · What-if"}).click();
  const lab=page.getByTestId("personal-lab");
  await lab.getByLabel("연구 이름").fill("현재 기준");
  await lab.getByRole("button",{name:"시나리오 저장"}).click();
  await lab.getByLabel("연구 이름").fill("미래 시나리오");
  await lab.getByLabel("추가 골드").fill("100000");
  await lab.getByLabel("주사위 레벨 증가").fill("3");
  await lab.getByRole("button",{name:"시나리오 저장"}).click();
  await expect(lab.getByRole("heading",{name:"미래 시나리오"})).toBeVisible();
  const boxes=lab.getByRole("checkbox",{name:"비교 선택"});
  await boxes.nth(0).check();await boxes.nth(1).check();
  await expect(lab.getByTestId("v3-compare-view")).toBeVisible();
  await openShellTab(page,"다이스 트리");
  expect(await readTreeResources(page)).toEqual(original);
  expect(errors).toEqual([]);
});

test("V3 Dice Tree invests, shares and restores Gold/Dice Core state", async ({ page, browser, isMobile }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await expect(page.getByTestId("v3-tree-view")).toBeVisible();
  await expect(page.getByTestId("v3-tree-canvas")).toBeVisible();
  await expect(page.getByLabel("다이스 트리 재화")).toContainText("골드");
  await expect(page.getByLabel("다이스 트리 재화")).toContainText("다이스 코어");
  if (isMobile) {
    await expect(page.locator(".v53-desktop-credit")).toBeHidden();
    await page.getByRole("button", { name: "더보기" }).click();
    await page.getByRole("dialog", { name: "더보기" }).getByRole("button", { name: "제작자 모님" }).click();
  } else await page.getByRole("button", { name: "제작자 모님" }).click();
  const about = page.getByRole("dialog", { name: "제작자 모님" });
  await expect(about).toContainText("비공식 팬 도구");
  await expect(about.getByRole("link", { name: "GitHub에서 DiceTree 보기" })).toHaveAttribute("href", "https://github.com/woo642778-art/dicetree");
  await page.screenshot({ path: `test-results/qa-v54-about-${isMobile ? "mobile" : "desktop"}.png`, fullPage: false });
  await about.getByRole("button", { name: "사이트 정보 닫기" }).click();
  await expect(page.locator('[data-testid^="v41-cost-"]').first()).toBeAttached();
  await expect(page.locator(".v3-tree-wrap")).not.toHaveCSS("background-image", "none");
  await expect(page.locator("body")).not.toContainText("파란 재화");
  await expect(page.locator("body")).not.toContainText("빨간 재화");
  await expect(page.locator("body")).not.toContainText("프리즘 재화");
  await expect(page.locator("body")).not.toContainText(/IPA/i);
  await expect(page.locator('image[data-dice-id]').first()).toBeAttached();
  await page.screenshot({ path: `test-results/qa-v3-tree-${isMobile ? "mobile" : "desktop"}.png`, fullPage: false });

  await setTreeResources(page, "9999999", "9999");
  const selectedNode = await focusTreeNode(page, "1205");
  await expect(selectedNode).toBeVisible();
  await expect(selectedNode).toHaveAttribute("data-can-increment", "false");
  const nodeTestId = "v3-node-1205";
  const beforeSimulatedRank = Number(await selectedNode.getAttribute("data-simulated-rank") ?? "0");
  await selectedNode.click();
  await expect(page.getByTestId("v3-node-detail-sheet")).toBeVisible();
  await page.screenshot({ path: `test-results/qa-v3-node-detail-${isMobile ? "mobile" : "desktop"}.png`, fullPage: false });
  const increment = page.locator(".v3-rank-controls").getByRole("button", { name: "선행 노드 포함 가상 구매" });
  await expect(increment).toBeEnabled();
  await increment.click();
  await expect(selectedNode).toHaveAttribute("data-simulated-rank", String(beforeSimulatedRank + 1));
  await expect.poll(async () => Number((await readTreeResources(page)).gold)).toBeLessThan(9999999);
  const simulatedRank = await selectedNode.getAttribute("data-simulated-rank");
  const { gold: sharedGold, core: sharedCore } = await readTreeResources(page);
  expect(simulatedRank).not.toBeNull();

  await shareState(page);
  await expect.poll(() => page.url()).toContain("#b=v3.");
  const sharedUrl = page.url();

  const context = await browser.newContext();
  await context.addInitScript(() => window.localStorage.setItem("dicetree:v55:creator-welcome-seen", "1"));
  const shared = await context.newPage();
  const sharedErrors = captureBrowserErrors(shared);
  await shared.goto(sharedUrl);
  await expect.poll(async () => (await readTreeResources(shared)).gold).toBe(sharedGold);
  await expect.poll(async () => (await readTreeResources(shared)).core).toBe(sharedCore);
  await expect(await focusTreeNode(shared, "1205")).toHaveAttribute("data-simulated-rank", simulatedRank!);
  expect(errors).toEqual([]);
  expect(sharedErrors).toEqual([]);
  await context.close();
});

test("V4.8 account intelligence exposes optimizer, encyclopedia, meta clusters and install manifest", async ({ page, isMobile }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await openShellTab(page, "시뮬레이터");
  await selectDiceByInternalId(page, "wind");
  await setTreeResources(page, "300000", "60");
  await openShellTab(page, "내 계정");
  await expect(page.getByTestId("v48-account-intelligence")).toBeVisible();
  await expect(page.getByText("빌드 건강도")).toBeVisible();
  await page.screenshot({ path: `test-results/qa-v48-account-${isMobile ? "mobile" : "desktop"}.png`, fullPage: false });

  await page.getByRole("button", { name: "전역 최적화" }).click();
  await expect(page.getByTestId("v52-optimization-suite")).toBeVisible();
  await page.getByRole("spinbutton", { name: "V52 목표 DPS" }).fill("1000");
  await page.getByRole("button", { name: "1·5·10·20단계 역산" }).click();
  await expect(page.getByTestId("v52-growth-roadmap")).toBeVisible();
  await expect(page.getByTestId("v52-evaluated-states")).not.toContainText("0개 상태 비교");
  await expect(page.getByTestId("v52-plan-steps").locator("li").first()).toBeVisible();
  await expect(page.getByText("이 예산으로 어디까지 강해지나")).toBeVisible();
  await page.screenshot({ path: `test-results/qa-v52-optimizer-${isMobile ? "mobile" : "desktop"}.png`, fullPage: false });
  await expect(page.getByText("목표 성능 역산")).toBeVisible();
  await page.getByRole("button", { name: "역산 시작" }).click();
  await expect(page.getByTestId("v48-reverse-result")).toBeVisible();

  await page.getByRole("button", { name: "주사위 백과" }).click();
  await page.getByRole("textbox", { name: "백과사전 검색" }).fill("원자");
  await expect(page.getByRole("button", { name: /원자/ })).toBeVisible();
  await page.getByRole("button", { name: /원자/ }).click();
  await expect(page.getByText("함께 쓰기 좋은 주사위")).toBeVisible();

  await page.getByRole("button", { name: "메타 인텔리전스" }).click();
  await expect(page.getByText("메타 군집과 환경 점수")).toBeVisible();
  await expect(page.locator(".v48-cluster-grid > article")).toHaveCount(3);

  const manifest = await page.request.get("/dicetree/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).display).toBe("standalone");
  expect(errors).toEqual([]);
});

test("V4.6 center hub mirrors family investment levels and uses the full Terror dice art", async ({ page, isMobile }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");

  const hub = page.getByTestId("v46-tree-core");
  const nature = page.getByTestId("v46-family-count-nature");
  await expect(hub).toBeVisible();
  await expect(hub).toContainText("다이스 트리");
  await expect(nature).toHaveAttribute("data-level", "1");
  await expect(page.locator('image[data-dice-id="fear"]')).toHaveAttribute("href", "/dicetree/dice-icons/fear.webp");

  await setTreeResources(page, "9999999", "9999");
  await investTreeNode(page, "1005");
  await expect(nature).toHaveAttribute("data-level", "2");
  await page.screenshot({ path: `test-results/qa-v46-tree-core-${isMobile ? "mobile" : "desktop"}.png`, fullPage: false });

  await (await focusTreeNode(page, "1005")).click();
  await page.getByRole("button", { name: "가상 랭크 내리기" }).click();
  await expect(nature).toHaveAttribute("data-level", "1");
  expect(errors).toEqual([]);
});

test("V4.8.1 starts with base dice unlocked, buys the next nodes and deducts the live balance", async ({ page, isMobile }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await setTreeResources(page, "3000", "10");

  await expect(page.getByTestId("v3-node-1001")).toHaveAttribute("data-owned-rank", "1");
  await expect(page.getByTestId("v3-node-1001")).toHaveAttribute("data-can-increment", "false");

  await expect(page.getByTestId("v3-node-1005")).toHaveAttribute("data-can-increment", "true");
  await (await focusTreeNode(page, "1005")).click();
  await page.getByRole("button", { name: "이 노드 가상 구매" }).click();
  await expect.poll(async () => (await readTreeResources(page)).core).toBe("5");
  await page.getByRole("button", { name: "닫기" }).click();

  await expect(page.getByTestId("v3-node-1205")).toHaveAttribute("data-can-increment", "true");
  await (await focusTreeNode(page, "1205")).click();
  await page.getByRole("button", { name: "이 노드 가상 구매" }).click();
  await expect.poll(async () => (await readTreeResources(page)).gold).toBe("1000");
  await page.screenshot({ path: `test-results/qa-v481-direct-purchase-${isMobile ? "mobile" : "desktop"}.png`, fullPage: false });
  expect(errors).toEqual([]);
});

test("V4.8.1 protects starter ownership and unlocks its child without spending resources", async ({ page }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await setTreeResources(page, "0", "10");

  await expect(page.getByTestId("v3-node-1001")).toHaveAttribute("data-owned-rank", "1");
  await expect(page.getByTestId("v3-node-1005")).toHaveAttribute("data-can-increment", "true");
  await (await focusTreeNode(page, "1001")).click();
  await expect(page.getByRole("button", { name: "보유 랭크 내리기" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "보유 랭크 올리기" })).toBeDisabled();
  await expect.poll(async () => (await readTreeResources(page)).core).toBe("10");
  expect(errors).toEqual([]);
});

test("V5 virtual routes work at zero balance and nickname accounts reload outside the ranking snapshot", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop covers persistent account storage and the virtual shortfall workflow; mobile uses the same state model");
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");

  const core = page.getByRole("spinbutton", { name: "남은 다이스 코어" });
  await expect(core).toHaveValue("0");
  await (await focusTreeNode(page, "1005")).click();
  const virtualBuy = page.getByRole("button", { name: "이 노드 가상 구매" });
  await expect(virtualBuy).toBeEnabled();
  await virtualBuy.click();
  await expect(page.getByTestId("v3-node-1005")).toHaveAttribute("data-simulated-rank", "1");
  await expect(page.getByLabel("다이스 트리 재화")).toContainText("추가 필요 0 G · 5 C");

  await openShellTab(page, "내 계정");
  await page.getByLabel("내 계정 닉네임").fill("랭킹밖테스트유저");
  await page.getByRole("button", { name: "불러오기·만들기" }).click();
  await expect(page.locator(".v49-import-message")).toContainText("현재 입력으로 만들었습니다");

  await openShellTab(page, "다이스 트리");
  await page.getByRole("spinbutton", { name: "남은 골드" }).fill("12345");
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("dicetree.profiles.v3") ?? "[]")[0]?.state?.inventory?.gold)).toBe(12345);
  await page.evaluate(() => localStorage.removeItem("dicetree:v49:account"));
  await page.reload();
  await openShellTab(page, "내 계정");
  await page.getByLabel("내 계정 닉네임").fill("랭킹밖테스트유저");
  await page.getByRole("button", { name: "불러오기·만들기" }).click();
  await expect(page.locator(".v49-import-message")).toContainText("저장된 트리·덱·재화를 불러왔습니다");
  await openShellTab(page, "다이스 트리");
  await expect(page.getByRole("spinbutton", { name: "남은 골드" })).toHaveValue("12345");

  await openShellTab(page, "구매 효율");
  await expect(page.getByTestId("v50-popup-VIP_HOTDEAL")).toContainText("₩29,000");
  await page.getByLabel("VIP_HOTDEAL core").fill("100");
  await expect(page.getByTestId("v47-budget-optimizer")).toContainText("VIP 핫딜");
  expect(errors).toEqual([]);
});

test("V5.1 purchase planner combines daily farming with the cheapest deadline package", async ({ page, isMobile }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await openShellTab(page, "구매 효율");
  const planner = page.getByTestId("v51-time-cash-planner");
  await planner.scrollIntoViewIfNeeded();
  await expect(planner).toBeVisible();

  await page.getByLabel("현재 골드", { exact: true }).fill("0");
  await page.getByLabel("목표 골드", { exact: true }).fill("1000");
  await page.getByLabel("현재 다이스 코어", { exact: true }).fill("0");
  await page.getByLabel("목표 다이스 코어", { exact: true }).fill("10");
  await page.getByLabel("하루 획득 골드", { exact: true }).fill("100");
  await page.getByLabel("하루 획득 코어", { exact: true }).fill("1");
  await page.getByLabel("투자 가능 일수", { exact: true }).fill("10");
  await page.getByLabel("최대 현금 예산", { exact: true }).fill("10000");
  await page.getByLabel("최적화 기준", { exact: true }).selectOption("min-spend");
  await expect(planner).toContainText("₩0 + 10일");
  await expect(planner).toContainText("결제하지 않고 파밍으로 진행");

  await page.getByLabel("투자 가능 일수", { exact: true }).fill("5");
  await expect(planner).toContainText("₩3,300 + 2일");
  await expect(planner).toContainText("첫 구매 패키지");
  await page.screenshot({ path: `test-results/qa-v51-time-cash-${isMobile ? "mobile" : "desktop"}.png`, fullPage: false });
  expect(errors).toEqual([]);
});

test("V4 route planner applies prerequisites as one preview and supports cancellation", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop verifies the full route and header-level clear action; route logic is covered by unit tests on all viewports");
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await page.getByRole("spinbutton", { name: "남은 골드" }).fill("9999999");
  await page.getByRole("spinbutton", { name: "남은 다이스 코어" }).fill("9999");
  await (await focusTreeNode(page, "1205")).click();

  const route = page.getByTestId("v4-route-plan");
  await expect(route).toBeVisible();
  await expect(route.locator("li")).toHaveCount(2);
  await expect(route).not.toContainText("<tag>");
  await expect(route).not.toContainText("{0}");
  await page.locator(".v3-rank-controls").getByRole("button", { name: "선행 노드 포함 가상 구매" }).click();
  await expect(page.getByTestId("v3-node-1001")).toHaveAttribute("data-owned-rank", "1");
  await expect(page.getByTestId("v3-node-1005")).toHaveAttribute("data-simulated-rank", "1");
  await expect(page.getByTestId("v3-node-1205")).toHaveAttribute("data-simulated-rank", "1");

  await route.getByRole("button", { name: "이 노드 계획 취소" }).click();
  await expect(page.getByTestId("v3-node-1205")).toHaveAttribute("data-simulated-rank", "0");
  await page.getByRole("button", { name: "전체 계획 취소" }).click();
  await expect(page.getByTestId("v3-node-1001")).toHaveAttribute("data-owned-rank", "1");
  await expect(page.getByTestId("v3-node-1005")).toHaveAttribute("data-simulated-rank", "0");
  expect(errors).toEqual([]);
});

test("V4.4 Tree search focuses normalized effect terms and drag distance follows the pointer", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop validates precise mouse dragging; mobile touch navigation remains covered separately");
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");

  const search = page.getByRole("textbox", { name: "트리 검색" });
  const transform = page.getByTestId("v3-tree-transform");
  const initialTransform = await transform.getAttribute("transform");
  await search.fill("공격 속도");
  await expect(page.getByTestId("v44-tree-search-status")).toContainText("개 검색 결과");
  await expect.poll(() => transform.getAttribute("transform")).not.toBe(initialTransform);

  await search.fill("원자");
  await expect(page.getByTestId("v3-node-2004")).not.toHaveClass(/is-dimmed/);
  await page.screenshot({ path: "test-results/qa-v44-tree-search-desktop.png", fullPage: false });
  await search.fill("");
  await page.getByTestId("v3-fit-tree").click();

  const root = page.getByTestId("v3-node-1001");
  const before = await root.boundingBox();
  expect(before).not.toBeNull();
  await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
  await page.mouse.down();
  await page.mouse.move(before!.x + before!.width / 2 + 280, before!.y + before!.height / 2 + 80, { steps: 8 });
  await page.mouse.up();
  const after = await root.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.x - before!.x).toBeGreaterThan(220);
  expect(after!.y - before!.y).toBeGreaterThan(50);
  await expect(page.getByTestId("v3-node-detail-sheet")).toHaveCount(0);
  await page.screenshot({ path: "test-results/qa-v44-tree-pan-desktop.png", fullPage: false });
  expect(errors).toEqual([]);
});

test("V5.5 mobile tree search remains dark, populated and usable at 6x zoom", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile Safari-style compositing guard is the target of this regression test");
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  const search = page.getByRole("textbox", { name: "모바일 트리 검색" });
  await search.fill("공속");
  await expect(page.getByTestId("v44-tree-search-status")).toContainText(/^[1-9]\d*개 검색 결과/);
  await search.fill("");
  await page.keyboard.press("Escape");
  const canvas = page.getByTestId("v3-tree-canvas");
  const zoomIn = page.getByRole("button", { name: "확대", exact: true });
  for (let index = 0; index < 40 && Number(await canvas.getAttribute("data-scale")) < 6; index += 1) await zoomIn.click();
  await expect(canvas).toHaveAttribute("data-scale", "6.00");
  await expect(canvas).toHaveAttribute("data-render-profile", "mobile-safe");
  await expect.poll(async () => Number(await canvas.getAttribute("data-rendered-nodes"))).toBeLessThan(239);
  await expect.poll(async () => Number(await canvas.getAttribute("data-rendered-nodes"))).toBeGreaterThan(0);
  await expect(page.locator(".v3-tree-background")).toHaveCSS("fill", "rgb(7, 17, 15)");
  await expect(page.locator(".v3-tree-wrap")).toHaveCSS("background-color", "rgb(8, 18, 31)");
  await expect(page.locator(".v3-node-shell").first()).toHaveCSS("filter", "none");
  await page.screenshot({ path: "test-results/qa-v5-mobile-max-zoom.png", fullPage: false });
  expect(errors).toEqual([]);
});

test("V5.5 first visit introduces creator Monim and persists dismissal", async ({ page }) => {
  await page.goto("/dicetree/?welcome-test=1");
  const dialog = page.getByRole("dialog", { name: "제작자 모님" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("WELCOME TO DICETREE");
  await expect(dialog.getByRole("link", { name: "GitHub에서 DiceTree 보기" })).toHaveAttribute("href", "https://github.com/woo642778-art/dicetree");
  await dialog.getByRole("button", { name: "사이트 정보 닫기" }).click();
  await page.reload();
  await expect(dialog).toHaveCount(0);
});

test("V5 account import, current-state draft and local persistence work end to end", async ({ page }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await openShellTab(page, "내 계정");
  await page.getByLabel("공개 랭킹 닉네임 또는 순위").fill("#8");
  await page.getByRole("button", { name: "랭킹 참고 찾기" }).click();
  await expect(page.getByText(/#8 · #8 관측 계정/)).toBeVisible();
  await page.getByRole("button", { name: "관측 덱만 적용" }).click();
  await expect(page.getByRole("status")).toContainText("관측 랭킹 덱만 적용");
  await page.getByRole("button", { name: "현재 입력으로 초안 만들기" }).click();
  await expect(page.getByLabel("계정 스냅샷 JSON")).toHaveValue(/"schemaVersion": 1/);
  await page.reload();
  await openShellTab(page, "내 계정");
  await expect(page.getByText("#8 관측 계정").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("V5 tier maker filters, assigns and restores a local 41-dice draft", async ({ page }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await openShellTab(page, "티어 메이커");
  await expect(page.getByTestId("v50-tier-maker")).toBeVisible();
  await page.getByLabel("티어 주사위 검색").fill("원자");
  const atom = page.locator(".v50-tier-pool button").filter({ hasText: "원자" });
  await expect(atom).toHaveCount(1);
  await atom.click();
  await expect(page.locator(".v50-tier-board article").first()).toContainText("원자");
  await page.reload();
  await openShellTab(page, "티어 메이커");
  await expect(page.locator(".v50-tier-board article").first()).toContainText("원자");
  expect(errors).toEqual([]);
});

test("V3 Simulator exposes dice-specific conditions and partial-safe Predator output", async ({ page, isMobile }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await openShellTab(page, "시뮬레이터");
  await expect(page.getByTestId("v3-simulator-view")).toBeVisible();
  await expect(page.getByTestId("v3-condition-controls")).toBeVisible();
  await expect(page.getByTestId("v3-condition-controls")).toContainText("포식 스택");
  await expect(page.getByTestId("v3-condition-controls")).not.toContainText("sim_condition_");
  await expect(page.locator('img[data-dice-id="predator"]')).toHaveCount(2);
  await expect(page.locator("img[data-dice-id='predator']").first()).toHaveJSProperty("complete", true);
  await expect(page.getByTestId("v3-stat-panel")).toContainText(/부분 계산|Partial/);
  await page.screenshot({ path: `test-results/qa-v3-predator-simulator-${isMobile ? "mobile" : "desktop"}.png`, fullPage: false });

  await selectDiceByInternalId(page, "gear");
  const conditionPanel = page.getByTestId("v3-condition-controls");
  await expect(conditionPanel).toBeVisible();
  await expect(conditionPanel.getByRole("spinbutton")).toBeVisible();
  await page.screenshot({ path: `test-results/qa-v3-gear-simulator-${isMobile ? "mobile" : "desktop"}.png`, fullPage: false });
  expect(errors).toEqual([]);
});

test("V3 client-table projection reacts to permanent level and battle upgrade without claiming exact DPS", async ({ page, isMobile }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await openShellTab(page, "시뮬레이터");
  await selectDiceByInternalId(page, "wind");

  await expect(page.getByTestId("stat-attack")).toContainText("100");
  await expect(page.getByTestId("stat-attackInterval")).toContainText("0.45");
  await page.getByRole("spinbutton", { name: "영구 주사위 레벨" }).fill("2");
  await page.getByRole("spinbutton", { name: "전투 파워업" }).fill("2");

  await expect(page.getByTestId("stat-attack")).toHaveAttribute("data-projected", "true");
  await expect(page.getByTestId("stat-attack")).toContainText("300");
  await expect(page.getByTestId("stat-attackInterval")).toContainText("0.425");
  await expect(page.getByTestId("stat-projectedBasicAttackDps")).toContainText("705.88");
  await expect(page.getByTestId("v3-stat-panel")).toContainText(/표 기반 예상|Table projection/);
  await expect(page.getByTestId("stat-practical-dps")).toHaveAttribute("data-dps-kind", "projected-basic");
  await expect(page.getByTestId("stat-practical-dps")).toContainText("705.88");
  await expect(page.getByTestId("v3-damage-graph")).toContainText("특수효과 제외 기본 공격 피해");
  await page.screenshot({ path: `test-results/qa-v3-wind-growth-${isMobile ? "mobile" : "desktop"}.png`, fullPage: false });
  expect(errors).toEqual([]);
});

test("V3 custom enemy HP changes kill time through the shared scenario engine", async ({ page }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await openShellTab(page, "시뮬레이터");
  await selectDiceByInternalId(page, "wind");

  await page.getByRole("spinbutton", { name: "적 HP" }).fill("1000");
  await expect(page.getByTestId("stat-practical-dps")).toContainText("222.22");
  await expect(page.getByTestId("damage-kill-time")).toContainText("4.5s");
  await page.getByRole("spinbutton", { name: "적 HP" }).fill("2000");
  await expect(page.getByTestId("damage-kill-time")).toContainText("9s");
  expect(errors).toEqual([]);
});

test("V3 real Wind Dice Tree path changes the selected dice tree stat without fabricating practical DPS", async ({ page, isMobile }) => {
  test.skip(isMobile, "canonical multi-node route interaction is covered on desktop; mobile pan/detail flow is separate");
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await page.getByRole("spinbutton", { name: "남은 골드" }).fill("9999999");
  await page.getByRole("spinbutton", { name: "남은 다이스 코어" }).fill("9999");

  await openShellTab(page, "시뮬레이터");
  await selectDiceByInternalId(page, "wind");
  await openShellTab(page, "다이스 트리");

  await investTreeNode(page, "1005");
  await investTreeNode(page, "1205");

  await openShellTab(page, "시뮬레이터");
  const bullet = page.getByTestId("stat-bulletDamagePercent");
  await expect(bullet).toBeVisible();
  await expect.poll(async () => Number((await bullet.locator("strong").textContent())?.replaceAll(",", "") ?? "0")).toBeGreaterThan(0);
  await expect(page.getByTestId("stat-practical-dps")).toHaveAttribute("data-dps-kind", /tree-excluded/);
  await expect(page.getByTestId("stat-practical-dps")).not.toHaveText("—");
  expect(errors).toEqual([]);
});

test("V4.3 Deck Lab separates ranked dealer and support decks from forecasts and opens Simulator", async ({ page, isMobile }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await openShellTab(page, "덱 연구소");
  await expect(page.getByTestId("v4-deck-lab")).toBeVisible();
  await expect(page.getByTestId("v4-meta-status")).toContainText("2026.08.16 협동 랭킹 스냅샷");
  await expect(page.getByTestId("v43-ranking-snapshot")).toContainText("105개 랭킹 덱");
  await expect(page.getByTestId("v43-dealer-lane")).toContainText("딜러 덱");
  await expect(page.getByTestId("v43-support-lane")).toContainText("서포트 덱");
  await expect(page.getByTestId("v43-forecast")).toContainText("차기 메타 후보");
  await expect(page.getByTestId("v43-forecast")).toContainText("예측 · 랭킹 사실 아님");
  for (let index = 1; index <= 5; index += 1) await expect(page.getByTestId(`deck-slot-${index}`)).toBeVisible();
  await expect(page.locator(".v4-deck-grid img[data-dice-id]")).toHaveCount(5);
  await expect(page.locator("body")).not.toContainText(/IPA/i);
  await page.getByLabel("플레이 역할").selectOption("support");
  await page.getByLabel("투자 성향").selectOption("invested");
  await page.screenshot({ path: `test-results/qa-v4-deck-lab-${isMobile ? "mobile" : "desktop"}.png`, fullPage: true });
  await page.getByRole("button", { name: "주 딜러 시뮬레이션" }).click();
  await expect(page.getByTestId("v3-simulator-view")).toBeVisible();
  await expect(page.getByTestId("stat-practical-dps")).not.toHaveText("—");
  expect(errors).toEqual([]);
});

test("V4.3 Purchase Value uses won in Korean and dollars in English", async ({ page, isMobile }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await openShellTab(page, "구매 효율");
  await expect(page.getByTestId("v41-purchase-efficiency")).toBeVisible();
  await expect(page.getByTestId("v41-purchase-source")).toContainText("게임 내 상품 구성");
  await expect(page.locator("body")).not.toContainText(/IPA/i);
  await expect(page.getByTestId("v41-top-pick")).toContainText("몰래 빼돌린 재설계 보따리");
  await expect(page.getByTestId("v41-top-pick")).toContainText("400");

  await page.getByLabel("과금 성향").selectOption("invested");
  await expect(page.getByTestId("v41-top-pick")).toContainText("몰래 빼돌린 코어 보따리");
  await expect(page.getByTestId("v41-top-pick")).toContainText("510");

  await page.getByLabel("우선 목표").selectOption("gold");
  await expect(page.getByTestId("v41-top-pick")).toContainText("몰래 빼돌린 골드 보따리");
  await page.getByLabel("우선 목표").selectOption("redesign");
  await expect(page.getByTestId("v41-top-pick")).toContainText("몰래 빼돌린 재설계 보따리");
  await expect(page.getByTestId("v41-top-pick")).toContainText("₩12,000");
  await expect(page.getByTestId("v41-intro-offer")).toContainText("₩3,300");
  await expect(page.getByTestId("v41-purchase-efficiency")).not.toContainText("$");
  await page.screenshot({ path: `test-results/qa-v43-purchase-value-ko-${isMobile ? "mobile" : "desktop"}.png`, fullPage: true });
  if (isMobile) {
    await page.getByRole("button", { name: "더 많은 작업" }).click();
    await page.getByRole("menuitem", { name: "English로 전환" }).click();
  } else await page.getByRole("button", { name: "EN" }).click();
  await expect(page.locator(".v41-price strong").first()).toContainText("$");
  await expect(page.getByTestId("v41-purchase-efficiency")).not.toContainText("₩");
  await page.screenshot({ path: `test-results/qa-v43-purchase-value-en-${isMobile ? "mobile" : "desktop"}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("V4.5 Simulator, Compare and Purchase Value allow document scrolling", async ({ page }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  for (const label of ["시뮬레이터", "비교", "구매 효율"]) {
    await openShellTab(page, label);
    await page.evaluate(() => window.scrollTo(0, 0));
    const dimensions = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, viewport: innerHeight }));
    expect(dimensions.height).toBeGreaterThan(dimensions.viewport);
    await page.mouse.wheel(0, 900);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  expect(errors).toEqual([]);
});

test("V3 Compare uses the shared engine and stays confidence-aware", async ({ page, isMobile }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await openShellTab(page, "비교");
  await expect(page.getByTestId("v3-compare-view")).toBeVisible();
  await expect(page.getByTestId("compare-left")).toBeVisible();
  await expect(page.getByTestId("compare-right")).toBeVisible();
  await expect(page.getByTestId("compare-delta")).toBeVisible();
  await expect(page.getByTestId("compare-left-dps")).not.toHaveText("—");
  await expect(page.getByTestId("compare-right-dps")).not.toHaveText("—");
  await page.getByLabel("B 주사위").selectOption("wind");
  await page.getByLabel("B 영구 레벨").fill("2");
  await page.getByLabel("B 전투 파워업").fill("2");
  await expect(page.getByLabel("A 주사위")).toHaveValue("predator");
  await expect(page.getByLabel("B 주사위")).toHaveValue("wind");
  await expect(page.getByTestId("compare-delta")).toContainText(/추정 비교|Estimated/);
  await page.getByRole("button", { name: "A/B 바꾸기" }).click();
  await expect(page.getByLabel("A 주사위")).toHaveValue("wind");
  await page.screenshot({ path: `test-results/qa-v3-compare-${isMobile ? "mobile" : "desktop"}.png`, fullPage: false });
  expect(errors).toEqual([]);
});

test("V4.5 guided route provides a complete justified affordable plan and applies it", async ({ page, isMobile }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await setTreeResources(page, "9999999", "999");
  if (isMobile) await page.getByRole("button", { name: "필터", exact: true }).click();
  await page.getByRole("button", { name: "맞춤 전체 루트" }).click();
  await expect(page.getByTestId("v45-guided-route")).toBeVisible();
  await page.getByLabel("중심 주사위").selectOption("element");
  await page.getByLabel("역할").selectOption("dealer");
  await page.getByLabel("핵심 목표").selectOption("selected-dice");
  await page.getByLabel("우선순위").selectOption("specialized");
  await page.getByRole("button", { name: "이 조건으로 전체 루트 만들기" }).click();
  const summary = page.getByTestId("v45-route-summary");
  await expect(summary).toContainText("원자");
  await expect(summary).toContainText("선행 조건");
  await expect(summary).toContainText("비용 합계");
  await expect(summary).toContainText("예산 이내");
  await expect(summary).toContainText("도달");
  await expect(page.getByTestId("v45-route-steps").locator("li").first()).toBeVisible();
  const beforeGold = Number((await readTreeResources(page)).gold);
  await page.getByRole("button", { name: "전체 경로 가상 적용" }).click();
  await expect.poll(async () => Number((await readTreeResources(page)).gold)).toBeLessThan(beforeGold);
  await page.screenshot({ path: `test-results/qa-v45-guided-route-${isMobile ? "mobile" : "desktop"}.png`, fullPage: false });
  expect(errors).toEqual([]);
});

test("V3 malformed share state fails safely", async ({ page }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/#b=v3.not-valid");
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.getByTestId("v3-tree-canvas")).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile V3 tree supports touch pan and bottom-sheet node details", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile project only");
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await expect(page.getByRole("button", { name: "내 프로필" })).toBeVisible();
  const canvas = page.getByTestId("v3-tree-canvas");
  const transform = page.getByTestId("v3-tree-transform");
  const before = await transform.getAttribute("transform");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * .18;
  const y = box!.y + box!.height * .28;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 54, y: y + 44 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(transform).not.toHaveAttribute("transform", before ?? "");

  const reachable = page.locator('[data-tree-node="true"][data-can-increment="true"]').first();
  await reachable.click();
  await expect(page.getByTestId("v3-node-detail-sheet")).toBeVisible();
  const sheetPosition = await page.getByTestId("v3-node-detail-sheet").evaluate((element) => getComputedStyle(element).position);
  expect(sheetPosition).toBe("fixed");
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1);

  const navigation = page.getByRole("navigation", { name: "모바일 주요 화면" });
  const nav = await navigation.boundingBox();
  const viewport = page.viewportSize();
  expect(nav).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(nav!.y).toBeGreaterThan(viewport!.height / 2);
  expect(nav!.y + nav!.height).toBeLessThanOrEqual(viewport!.height);
  const navButtons = await navigation.getByRole("button").evaluateAll((buttons) => (
    buttons.map((button) => ({ height: button.getBoundingClientRect().height, label: button.textContent?.trim() }))
  ));
  expect(navButtons).toHaveLength(4);
  expect(navButtons.every(({ height }) => height >= 44)).toBe(true);
  expect(navButtons.map(({ label }) => label)).toEqual(["●내 계정", "◇다이스 트리", "▶시뮬레이터", "•••더보기"]);

  await page.getByRole("button", { name: "90%" }).click();
  await expect(page.getByTestId("v3-node-detail-sheet")).toHaveAttribute("data-snap", "90");
  await page.keyboard.press("Escape");

  const scaleBefore = Number(await canvas.getAttribute("data-scale"));
  await page.getByRole("button", { name: "확대", exact: true }).click();
  await expect.poll(async () => Number(await canvas.getAttribute("data-scale"))).toBeGreaterThan(scaleBefore);
  const background = await canvas.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).not.toBe("rgb(255, 255, 255)");

  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "트리 도구" })).toBeVisible();
  await page.getByRole("textbox", { name: "모바일 트리 검색" }).fill("공격 속도");
  await expect(page.getByTestId("v44-tree-search-status")).toContainText(/^[1-9]\d*개 검색 결과/);
  expect(errors).toEqual([]);
});

test("V4.7 filters non-dice records and exposes scenario sweeps, deck analysis and updates", async ({ page, isMobile }) => {
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await openShellTab(page, "시뮬레이터");
  await expect(page.getByTestId("v47-scenario-sweep")).toBeVisible();
  const diceList = page.getByRole("listbox", { name: "주사위 목록" });
  await expect(diceList.locator('[data-dice-id="spgemstone"]')).toHaveCount(0);
  await expect(diceList.locator('[data-dice-id="altar"]')).toHaveCount(0);
  await expect(diceList.locator('[data-dice-id="bomb"]')).toHaveCount(0);
  await page.screenshot({ path: `test-results/qa-v47-scenario-sweep-${isMobile ? "mobile" : "desktop"}.png`, fullPage: true });

  await openShellTab(page, "비교");
  await expect(page.getByTestId("v47-compare-sweep")).toBeVisible();
  await openShellTab(page, "덱 연구소");
  await expect(page.getByTestId("v47-my-deck-analyzer")).toBeVisible();
  await page.screenshot({ path: `test-results/qa-v47-deck-analyzer-${isMobile ? "mobile" : "desktop"}.png`, fullPage: true });
  await openShellTab(page, "업데이트");
  await expect(page.getByTestId("v47-update-center")).toBeVisible();
  await expect(page.getByTestId("v47-update-center")).toContainText("1.0.1");
  await page.screenshot({ path: `test-results/qa-v47-updates-${isMobile ? "mobile" : "desktop"}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("V4.7 saves local profiles and creates a dedicated shared result page", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop composer verification");
  const errors = captureBrowserErrors(page);
  await page.goto("/dicetree/");
  await page.getByRole("button", { name: "내 프로필" }).click();
  await page.getByRole("textbox", { name: "프로필 이름" }).fill("본계정");
  await page.getByRole("button", { name: "현재 상태 저장" }).click();
  await expect(page.getByTestId("v47-profile-panel")).toContainText("본계정");
  await page.getByRole("button", { name: "닫기" }).click();
  await page.getByRole("button", { name: "결과 카드" }).click();
  await page.getByLabel("빌드 이름").fill("포식 성장 빌드");
  await page.getByLabel("작성자 메모").fill("초반 안정성을 우선한 세팅");
  await page.getByRole("button", { name: "결과 페이지 링크 복사" }).click();
  await expect(page.getByTestId("v47-shared-build")).toBeVisible();
  await expect(page.getByTestId("v47-shared-build")).toContainText("포식 성장 빌드");
  await expect(page).toHaveURL(/#r=r47\./);
  await page.screenshot({ path: "test-results/qa-v47-shared-build-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "이 빌드 복사" }).click();
  await expect(page.getByTestId("v3-tree-view")).toBeVisible();
  expect(errors).toEqual([]);
});

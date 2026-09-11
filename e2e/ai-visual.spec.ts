import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const;

test("V6.3 AI workspace remains legible across seven required viewports", async ({ browser, isMobile }) => {
  test.skip(isMobile, "single seven-viewport audit runs in the desktop project");
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => window.localStorage.setItem("dicetree:v55:creator-welcome-seen", "1"));
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4173/diceify/");
    const aiButton = page.getByRole("button", { name: "AI 분석", exact: true }).filter({ visible: true });
    await aiButton.click();
    const workspace = page.getByTestId("v63-ai-workspace");
    await expect(workspace).toBeVisible();
    const gold = page.getByRole("spinbutton", { name: "남은 골드" }).filter({ visible: true });
    if (await gold.isVisible().catch(() => false)) {
      await gold.fill("100000");
      await page.getByRole("spinbutton", { name: "남은 다이스 코어" }).filter({ visible: true }).fill("100");
    }
    await workspace.locator("select").first().selectOption("target-dice");
    await workspace.getByRole("button", { name: "경로 계산", exact: true }).click();
    await expect(workspace).toContainText(/우선 투자 경로|현재 재화로 실행 가능한 경로가 없습니다/);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
    await page.screenshot({ path: `test-results/qa-v63-ai-${viewport.width}x${viewport.height}.png`, fullPage: true });
    await context.close();
  }
});

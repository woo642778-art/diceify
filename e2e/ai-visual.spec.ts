import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { width: 1665, height: 927 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 430, height: 932 },
] as const;

test("V6.4 AI workspace remains legible across seven required viewports", async ({ browser, isMobile }) => {
  test.skip(isMobile, "single seven-viewport audit runs in the desktop project");
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => window.localStorage.setItem("dicetree:v55:creator-welcome-seen", "1"));
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4173/diceify/");
    const aiButton = page.getByRole("button", { name: "AI 분석", exact: true }).filter({ visible: true });
    await aiButton.click();
    const workspace = page.getByTestId("v64-ai-workspace");
    await expect(workspace).toBeVisible();
    await workspace.getByLabel("Diceify에 분석 조건 질문").fill("골드 100만 코어 1000 다음 4개");
    await workspace.getByRole("button", { name: "분석", exact: true }).click();
    await expect(workspace).toContainText("지금은 이 경로");
    await expect(workspace).not.toContainText(/모델 다운로드|WebGPU|LOCAL FIRST/);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
    await page.screenshot({ path: `test-results/qa-v64-ai-${viewport.width}x${viewport.height}.png`, fullPage: true });
    await context.close();
  }
});

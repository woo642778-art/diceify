import { expect, test } from "@playwright/test";

test("V6.4 measures initial recommendation, resource recalc, and local command latency", async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, "desktop timing avoids mobile device-emulation noise");
  await page.addInitScript(() => window.localStorage.setItem("dicetree:v55:creator-welcome-seen", "1"));
  const initialStarted = Date.now();
  await page.goto("/diceify/");
  await page.getByRole("button", { name: "AI 분석", exact: true }).click();
  const workspace = page.getByTestId("v64-ai-workspace");
  await workspace.locator(".v64-compact-empty, .v64-route-hero").first().waitFor();
  const initialMs = Date.now() - initialStarted;

  await workspace.getByLabel("Gold").fill("1000000");
  const goldRevision = await workspace.locator(".v64-result").getAttribute("data-analysis-revision");
  await expect.poll(() => workspace.locator(".v64-result").getAttribute("data-analysis-revision")).not.toBe(goldRevision);
  const beforeCoreRevision = await workspace.locator(".v64-result").getAttribute("data-analysis-revision");
  const recalcStarted = Date.now();
  await workspace.getByLabel("Core", { exact: true }).fill("1000");
  await expect.poll(() => workspace.locator(".v64-result").getAttribute("data-analysis-revision")).not.toBe(beforeCoreRevision);
  const resourceRecalcMs = Date.now() - recalcStarted;
  const optimizerMs = Number(await workspace.locator(".v64-result").getAttribute("data-optimizer-ms"));

  const localParseStarted = Date.now();
  const beforeCommandRevision = await workspace.locator(".v64-result").getAttribute("data-analysis-revision");
  await workspace.getByLabel("Diceify에 분석 조건 질문").fill("코어 50개 더");
  await workspace.getByRole("button", { name: "분석", exact: true }).click();
  await expect(workspace.getByText(/Core .*→ 1,050/)).toBeVisible();
  await expect.poll(() => workspace.locator(".v64-result").getAttribute("data-analysis-revision")).not.toBe(beforeCommandRevision);
  const localParseMs = Date.now() - localParseStarted;

  await testInfo.attach("diceify-ai-latency.json", {
    body: JSON.stringify({ initialMs, optimizerMs, resourceRecalcMs, localParseMs }),
    contentType: "application/json",
  });
  console.log(`Diceify AI latency: initial=${initialMs}ms optimizer=${optimizerMs}ms resource-recalc=${resourceRecalcMs}ms local-parse=${localParseMs}ms`);
  expect(initialMs).toBeLessThan(3_000);
  expect(resourceRecalcMs).toBeLessThan(1_000);
  expect(optimizerMs).toBeLessThan(300);
  expect(localParseMs).toBeLessThan(500);
});

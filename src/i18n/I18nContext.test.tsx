import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { I18nProvider, useI18n } from "./I18nContext";

function Probe({ semanticRank }: { semanticRank: number }) {
  const { locale, setLocale, t } = useI18n();
  return <>
    <span data-testid="title">{t("app.title")}</span>
    <output data-testid="semantic-rank">{semanticRank}</output>
    <button type="button" onClick={() => setLocale(locale === "ko" ? "en" : "ko")}>switch</button>
  </>;
}

beforeEach(() => localStorage.clear());

it("changes display language without touching semantic planner data", () => {
  render(<I18nProvider><Probe semanticRank={3} /></I18nProvider>);
  expect(screen.getByTestId("title")).toHaveTextContent("diceify · 랜덤다이스 2");
  expect(screen.getByTestId("semantic-rank")).toHaveTextContent("3");
  fireEvent.click(screen.getByRole("button", { name: "switch" }));
  expect(screen.getByTestId("title")).toHaveTextContent("diceify · Random Dice 2");
  expect(screen.getByTestId("semantic-rank")).toHaveTextContent("3");
});

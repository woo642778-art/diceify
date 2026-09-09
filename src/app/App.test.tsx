import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n/I18nContext";
import { App } from "./App";

afterEach(cleanup);

describe("V3 planner shell", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("dicetree:v55:creator-welcome-seen", "1");
    window.history.replaceState(null, "", "/dicetree/");
  });

  it("defaults to the Dice Tree with Gold and Dice Core only", () => {
    const { container } = render(<I18nProvider><App /></I18nProvider>);
    expect(screen.getByTestId("v3-app")).toBeInTheDocument();
    expect(screen.getByTestId("v3-tree-view")).toBeInTheDocument();
    expect(screen.getByTestId("v3-tree-canvas")).toBeInTheDocument();
    const resources = screen.getByLabelText("다이스 트리 재화");
    expect(resources).toHaveTextContent("골드");
    expect(resources).toHaveTextContent("다이스 코어");
    expect(screen.getByText(/제작자 모님/)).toBeInTheDocument();
    expect(container).not.toHaveTextContent("파란 재화");
    expect(container).not.toHaveTextContent("빨간 재화");
    expect(container).not.toHaveTextContent("프리즘 재화");
    expect(container).not.toHaveTextContent(/IPA/i);
    expect(container.querySelector(".v2-app")).toBeNull();
  });

  it("keeps the control dock connected to live plan resources", () => {
    render(<I18nProvider><App /></I18nProvider>);
    const dock = screen.getByTestId("v56-analysis-dock");
    expect(dock).toHaveTextContent("경로 대기");
    expect(dock).toHaveTextContent("0 G");
    expect(dock).toHaveTextContent("0 C");
    fireEvent.click(screen.getByRole("button", { name: "최적 경로 설계" }));
    expect(screen.getByRole("heading", { name: "맞춤 트리 루트" })).toBeInTheDocument();
  });

  it("switches primary views directly and opens analytical tools from the Tools menu", () => {
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "시뮬레이터" }));
    expect(screen.getByTestId("v3-simulator-view")).toBeInTheDocument();
    expect(screen.queryByTestId("v3-tree-view")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /도구/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "비교" }));
    expect(screen.getByTestId("v3-compare-view")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다이스 트리" }));
    expect(screen.getByTestId("v3-tree-view")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /도구/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "구매 효율" }));
    expect(screen.getByTestId("v41-purchase-efficiency")).toBeInTheDocument();
    expect(screen.getByTestId("v41-top-pick")).toHaveTextContent("몰래 빼돌린 재설계 보따리");
    expect(screen.getByTestId("v41-purchase-source")).toHaveTextContent("게임 내 상품 구성");
    expect(document.body).not.toHaveTextContent(/IPA/i);
  });

  it("opens the creator and site information panel", () => {
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "제작자 모님" }));
    const dialog = screen.getByRole("dialog", { name: "제작자 모님" });
    expect(dialog).toHaveTextContent("비공식 팬 도구");
    expect(dialog).toHaveTextContent("검증된 계산, 부분 검증, 추정");
    expect(screen.getByRole("link", { name: "GitHub에서 DiceTree 보기" })).toHaveAttribute("href", "https://github.com/woo642778-art/dicetree");
    fireEvent.click(screen.getByRole("button", { name: "사이트 정보 닫기" }));
    expect(screen.queryByRole("dialog", { name: "제작자 모님" })).not.toBeInTheDocument();
  });

  it("shows the creator introduction once on first visit and remembers dismissal", () => {
    localStorage.removeItem("dicetree:v55:creator-welcome-seen");
    render(<I18nProvider><App /></I18nProvider>);
    expect(screen.getByRole("dialog", { name: "제작자 모님" })).toHaveTextContent("WELCOME TO DICETREE");
    fireEvent.click(screen.getByRole("button", { name: "사이트 정보 닫기" }));
    expect(localStorage.getItem("dicetree:v55:creator-welcome-seen")).toBe("1");
    cleanup();
    render(<I18nProvider><App /></I18nProvider>);
    expect(screen.queryByRole("dialog", { name: "제작자 모님" })).not.toBeInTheDocument();
  });

  it("edits post-plan resources with formatted quick amounts", () => {
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "재화 편집" }));
    fireEvent.click(screen.getByRole("button", { name: /^\+10,000$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^\+50$/ }));
    expect(screen.getByRole("spinbutton", { name: "계획 후 남은 골드" })).toHaveValue(10000);
    expect(screen.getByRole("spinbutton", { name: "계획 후 남은 다이스 코어" })).toHaveValue(50);
    expect(screen.getByText("10,000 G")).toBeInTheDocument();
    expect(screen.getByText("50 C")).toBeInTheDocument();
  });

  it("opens account intelligence, encyclopedia, meta clusters, and universal search", () => {
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "내 계정" }));
    expect(screen.getByTestId("v48-account-intelligence")).toHaveTextContent("계정 미연결");
    expect(screen.getByTestId("v48-account-intelligence")).not.toHaveTextContent("빌드 건강도");
    expect(screen.queryByText("계정 전체 다음 행동")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "주사위 백과" }));
    expect(screen.getByText("이 주사위 왜 쓰는 거야?")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "백과사전 검색" }), { target: { value: "원자" } });
    expect(screen.getByRole("button", { name: /원자/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "메타 인텔리전스" }));
    expect(screen.getByText("메타 군집과 환경 점수")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "통합 검색" }));
    fireEvent.change(screen.getByRole("textbox", { name: "통합 검색어" }), { target: { value: "시뮬레이터" } });
    fireEvent.click(screen.getByRole("button", { name: /화면\s*시뮬레이터/ }));
    expect(screen.getByTestId("v3-simulator-view")).toBeInTheDocument();
  });

  it("keeps a public ranking deck separate from a connected account", () => {
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "내 계정" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "공개 랭킹 닉네임 또는 순위" }),
      { target: { value: "#8" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "랭킹 참고 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "관측 덱만 적용" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "관측 랭킹 덱만 적용",
    );
    expect(screen.getByTestId("v48-account-intelligence")).toHaveTextContent(
      "계정 미연결",
    );
    expect(screen.queryByText("입력 상태 평가")).not.toBeInTheDocument();
  });

  it("does not replace a connected browser identity with a ranking reference", () => {
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "내 계정" }));
    fireEvent.change(screen.getByRole("textbox", { name: "내 계정 닉네임" }), {
      target: { value: "내 실제 입력" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "PID" }), {
      target: { value: "verified-local-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "프로필 연결" }));

    fireEvent.change(
      screen.getByRole("textbox", { name: "공개 랭킹 닉네임 또는 순위" }),
      { target: { value: "#8" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "랭킹 참고 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "관측 덱만 적용" }));

    expect(screen.getAllByText("내 실제 입력")[0]).toBeInTheDocument();
    expect(screen.getByText("PID verified-local-001")).toBeInTheDocument();
    expect(screen.getByText("입력 상태 평가")).toBeInTheDocument();
  });

  it("keeps a legacy observed-ranking identity disconnected", () => {
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "내 계정" }));
    fireEvent.change(screen.getByRole("textbox", { name: "내 계정 닉네임" }), {
      target: { value: "임시 계정" },
    });
    fireEvent.click(screen.getByRole("button", { name: "프로필 연결" }));

    const stored = JSON.parse(
      localStorage.getItem("dicetree:v49:account") ?? "null",
    );
    stored.identity = {
      nickname: "#8 관측 계정",
      source: "observed-ranking",
      importedAt: new Date().toISOString(),
      publicRank: 8,
    };
    localStorage.setItem("dicetree:v49:account", JSON.stringify(stored));

    cleanup();
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "내 계정" }));

    expect(screen.getByText("계정 미연결")).toBeInTheDocument();
    expect(screen.queryByText("#8 관측 계정")).not.toBeInTheDocument();
    expect(screen.queryByText("입력 상태 평가")).not.toBeInTheDocument();
  });

  it("keeps V3 share state semantic and restorable", async () => {
    const clipboard = { writeText: async () => undefined };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.change(screen.getByRole("spinbutton", { name: "남은 골드" }), { target: { value: "12345" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "남은 다이스 코어" }), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    expect(window.location.hash).toMatch(/^#b=v3\./);
  });
});

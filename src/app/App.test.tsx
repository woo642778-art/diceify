import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n/I18nContext";
import { App } from "./App";

afterEach(cleanup);

describe("V3 planner shell", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("dicetree:v55:creator-welcome-seen", "1");
    window.history.replaceState(null, "", "/diceify/");
  });

  it("defaults to the Diceify home with evidence-backed discovery", () => {
    const { container } = render(<I18nProvider><App /></I18nProvider>);
    expect(screen.getByTestId("v3-app")).toBeInTheDocument();
    expect(screen.getByTestId("diceify-home")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /지금 쓰는 덱/ })).toBeInTheDocument();
    expect(screen.getByText(/승률 예측이 아니라 동일 조합의 실제 관측 횟수/)).toBeInTheDocument();
    expect(screen.queryByText(/승률 80%/)).not.toBeInTheDocument();
    expect(screen.getByText(/제작자 모님/)).toBeInTheDocument();
    expect(container).not.toHaveTextContent("파란 재화");
    expect(container).not.toHaveTextContent("빨간 재화");
    expect(container).not.toHaveTextContent("프리즘 재화");
    expect(container).not.toHaveTextContent(/IPA/i);
    expect(container.querySelector(".v2-app")).toBeNull();
  });

  it("keeps the control dock connected to live plan resources", () => {
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "다이스 트리" }));
    const dock = screen.getByTestId("v56-analysis-dock");
    expect(dock).toHaveTextContent("경로 대기");
    expect(dock).toHaveTextContent("0 G");
    expect(dock).toHaveTextContent("0 C");
    fireEvent.click(screen.getByRole("button", { name: "최적 경로 설계" }));
    expect(screen.getByRole("heading", { name: "맞춤 트리 루트" })).toBeInTheDocument();
  });

  it("switches primary views directly and opens analytical tools from the Tools menu", () => {
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: /도구/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "시뮬레이터" }));
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
    expect(screen.getByRole("link", { name: "GitHub에서 diceify 보기" })).toHaveAttribute("href", "https://github.com/woo642778-art/diceify");
    fireEvent.click(screen.getByRole("button", { name: "사이트 정보 닫기" }));
    expect(screen.queryByRole("dialog", { name: "제작자 모님" })).not.toBeInTheDocument();
  });

  it("shows the creator introduction once on first visit and remembers dismissal", () => {
    localStorage.removeItem("dicetree:v55:creator-welcome-seen");
    render(<I18nProvider><App /></I18nProvider>);
    expect(screen.getByRole("dialog", { name: "제작자 모님" })).toHaveTextContent("WELCOME TO DICEIFY");
    fireEvent.click(screen.getByRole("button", { name: "사이트 정보 닫기" }));
    expect(localStorage.getItem("dicetree:v55:creator-welcome-seen")).toBe("1");
    cleanup();
    render(<I18nProvider><App /></I18nProvider>);
    expect(screen.queryByRole("dialog", { name: "제작자 모님" })).not.toBeInTheDocument();
  });

  it("edits post-plan resources with formatted quick amounts", () => {
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "다이스 트리" }));
    fireEvent.click(screen.getByRole("button", { name: "재화 편집" }));
    fireEvent.click(screen.getByRole("button", { name: /^\+10,000$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^\+50$/ }));
    expect(screen.getByRole("spinbutton", { name: "계획 후 남은 골드" })).toHaveValue(10000);
    expect(screen.getByRole("spinbutton", { name: "계획 후 남은 다이스 코어" })).toHaveValue(50);
    expect(screen.getByText("10,000 G")).toBeInTheDocument();
    expect(screen.getByText("50 C")).toBeInTheDocument();
  });

  it("opens account intelligence, dice data, rankings, and universal search", () => {
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "내 계정" }));
    expect(screen.getByTestId("v48-account-intelligence")).toHaveTextContent("계정 미연결");
    expect(screen.getByTestId("v48-account-intelligence")).not.toHaveTextContent("빌드 건강도");
    expect(screen.queryByText("계정 전체 다음 행동")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "주사위" }));
    expect(screen.getByTestId("diceify-dice-catalog")).toHaveTextContent("플레이 가능 주사위 53종");
    fireEvent.change(screen.getByRole("textbox", { name: "주사위 이름 검색" }), { target: { value: "원자" } });
    expect(screen.getByRole("button", { name: /원자/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "랭킹" }));
    expect(screen.getByTestId("diceify-ranking")).toHaveTextContent("1~105위");

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
    fireEvent.change(screen.getByRole("textbox", { name: "로컬 프로필 이름" }), {
      target: { value: "내 실제 입력" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "PID" }), {
      target: { value: "verified-local-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "로컬 저장·불러오기" }));

    fireEvent.change(
      screen.getByRole("textbox", { name: "공개 랭킹 닉네임 또는 순위" }),
      { target: { value: "#8" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "랭킹 참고 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "관측 덱만 적용" }));

    expect(screen.getAllByText("내 실제 입력")[0]).toBeInTheDocument();
    expect(screen.getByText("PID verified-local-001")).toBeInTheDocument();
    expect(screen.queryByText("입력 상태 평가")).not.toBeInTheDocument();
    expect(document.querySelector(".v48-health-orbit")).not.toHaveAttribute("data-score");
    expect(screen.getByTestId("v59-account-locked")).toBeInTheDocument();
  });

  it("keeps a legacy observed-ranking identity disconnected", () => {
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "내 계정" }));
    fireEvent.change(screen.getByRole("textbox", { name: "로컬 프로필 이름" }), {
      target: { value: "임시 계정" },
    });
    fireEvent.click(screen.getByRole("button", { name: "로컬 저장·불러오기" }));

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

  it.each(["local-profile", "verified-import"])("never treats a restored %s as a server account", (source) => {
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "내 계정" }));
    fireEvent.change(screen.getByRole("textbox", { name: "로컬 프로필 이름" }), {
      target: { value: "저장된 입력" },
    });
    fireEvent.click(screen.getByRole("button", { name: "로컬 저장·불러오기" }));
    const stored = JSON.parse(localStorage.getItem("dicetree:v49:account")!);
    stored.identity.source = source;
    localStorage.setItem("dicetree:v49:account", JSON.stringify(stored));
    cleanup();
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "내 계정" }));
    expect(screen.getByText("저장된 입력")).toBeInTheDocument();
    expect(screen.getByText("계정 미연결")).toBeInTheDocument();
    expect(document.querySelector(".v48-health-orbit")).not.toHaveAttribute("data-score");
    expect(screen.getByTestId("v59-account-locked")).toBeInTheDocument();
    if (source === "verified-import") {
      expect(screen.getByText("사용자 입력 JSON · 서버 미검증")).toBeInTheDocument();
    }
  });

  it("opens manual calculations explicitly without creating or scoring an account", () => {
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "내 계정" }));
    fireEvent.click(screen.getByRole("button", { name: "전역 최적화" }));
    expect(screen.queryByTestId("v52-optimization-suite")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "수동 계산 열기" }));
    expect(screen.getByTestId("v52-optimization-suite")).toBeInTheDocument();
    expect(screen.getByText("계정 미연결")).toBeInTheDocument();
    expect(document.querySelector(".v48-health-orbit")).not.toHaveAttribute("data-score");
    expect(JSON.parse(localStorage.getItem("dicetree:v49:account")!).identity).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "수동 계산 닫기" }));
    expect(screen.queryByTestId("v52-optimization-suite")).not.toBeInTheDocument();
  });

  it("keeps V3 share state semantic and restorable", async () => {
    const clipboard = { writeText: async () => undefined };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
    render(<I18nProvider><App /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "다이스 트리" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "남은 골드" }), { target: { value: "12345" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "남은 다이스 코어" }), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    expect(window.location.hash).toMatch(/^#b=v3\./);
  });
});

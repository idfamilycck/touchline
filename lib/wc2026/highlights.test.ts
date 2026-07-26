// 명장면은 "실제로 그랬다"는 문장을 화면에 싣는다. 데이터가 바뀌어 그 전제가
// 깨지면 카피가 거짓이 되므로, 각 항목의 근거를 실제 기록으로 검증한다.

import { describe, it, expect } from "vitest";
import { registerWc2026 } from "@/lib/wc2026/register";
import { highlights } from "@/lib/wc2026/highlights";
import { wc2026MatchById } from "@/lib/wc2026/source";

registerWc2026();

describe("highlights", () => {
  const list = highlights();

  it("모든 항목이 실제 경기·팀으로 해석된다", () => {
    expect(list.length).toBeGreaterThan(0);
    for (const h of list) {
      const m = wc2026MatchById(h.matchId);
      expect(m).toBeDefined();
      expect([m!.home, m!.away]).toContain(h.side);
      expect(h.takeoverMinute).toBeGreaterThanOrEqual(0);
      expect(h.takeoverMinute).toBeLessThanOrEqual(90);
    }
  });

  it("인수 시점 스코어가 실제 이벤트와 일치한다(핵심 사례)", () => {
    // 이집트: 74분 시점에 2-0으로 앞서고 있어야 "2-0 리드를 지켜라"가 참이다.
    const egy = list.find((h) => h.id === "hl-arg-egy");
    expect(egy).toBeDefined();
    expect(egy!.scoreMe).toBe(2);
    expect(egy!.scoreOpp).toBe(0);

    // 잉글랜드 4강: 80분에 1-0으로 앞서고 있어야 "결승까지 10분"이 참이다.
    const eng = list.find((h) => h.id === "hl-eng-arg-sf");
    expect(eng).toBeDefined();
    expect(eng!.scoreMe).toBe(1);
    expect(eng!.scoreOpp).toBe(0);

    // 결승: 45분 시점 0-0(정규시간 무득점 경기).
    const fin = list.find((h) => h.id === "hl-final");
    expect(fin).toBeDefined();
    expect(fin!.scoreMe).toBe(0);
    expect(fin!.scoreOpp).toBe(0);

    // 일본: 51분에 1-0 리드(29분 선제골 이후, 56분 동점 이전).
    const jpn = list.find((h) => h.id === "hl-bra-jpn");
    expect(jpn).toBeDefined();
    expect(jpn!.scoreMe).toBe(1);
    expect(jpn!.scoreOpp).toBe(0);
  });

  it("한국 항목은 실제로 탈락이 갈린 조별리그 최종전이다", () => {
    const kor = list.find((h) => h.id === "hl-kor-rsa");
    expect(kor).toBeDefined();
    const m = wc2026MatchById(kor!.matchId)!;
    expect(m.round).toBe("group");
    expect([m.home, m.away]).toContain("RSA");
    // 실제로 한국이 진 경기여야 "막아라"가 성립한다.
    const korIsHome = m.home === "KOR";
    const korScore = korIsHome ? m.scoreHome : m.scoreAway;
    const oppScore = korIsHome ? m.scoreAway : m.scoreHome;
    expect(korScore).toBeLessThan(oppScore);
  });

  it("잉글랜드 퇴장 항목은 실제 퇴장이 인수 시점 이전(또는 그 시점)에 있다", () => {
    const mex = list.find((h) => h.id === "hl-mex-eng");
    expect(mex).toBeDefined();
    const m = wc2026MatchById(mex!.matchId)!;
    const red = m.events.find((e) => e.type === "red" && e.teamCode === "ENG");
    expect(red).toBeDefined();
    expect(red!.minute).toBeLessThanOrEqual(mex!.takeoverMinute);
  });
});

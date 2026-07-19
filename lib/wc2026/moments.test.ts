// lib/wc2026/moments.test.ts
import { describe, it, expect } from "vitest";
import { extractMoments } from "@/lib/wc2026/moments";
import type { Wc2026Match } from "@/lib/wc2026/types";

function mk(events: Wc2026Match["events"], home = "KOR", away = "BRA"): Wc2026Match {
  return {
    id: "t", round: "group", home, away, scoreHome: 0, scoreAway: 0,
    venueKo: "메트라이프", kickoffISO: "2026-06-11T00:00:00Z",
    events, lineups: [] as unknown as Wc2026Match["lineups"],
  };
}

describe("extractMoments (side=KOR)", () => {
  it("실점은 concede 순간을 만든다", () => {
    const m = mk([{ minute: 88, type: "goal", teamCode: "BRA", playerId: "b1", playerName: "X" }]);
    const out = extractMoments(m, "KOR");
    expect(out.some((d) => d.kind === "concede" && d.eventMinute === 88)).toBe(true);
  });
  it("takeoverMinute는 사건-5분, 하한 0", () => {
    const m = mk([{ minute: 3, type: "goal", teamCode: "BRA", playerId: "b1", playerName: "X" }]);
    expect(extractMoments(m, "KOR")[0].takeoverMinute).toBe(0);
  });
  it("연장(90분 초과) 사건은 제외", () => {
    const m = mk([{ minute: 105, type: "goal", teamCode: "BRA", playerId: "b1", playerName: "X" }]);
    expect(extractMoments(m, "KOR")).toHaveLength(0);
  });
  it("우리 팀 레드카드는 red 순간을 만든다", () => {
    const m = mk([{ minute: 60, type: "red", teamCode: "KOR", playerId: "k1", playerName: "Y" }]);
    expect(extractMoments(m, "KOR").some((d) => d.kind === "red")).toBe(true);
  });
  it("같은 분 실점+리드상실은 하나의 순간으로 합침", () => {
    // 1-0 리드 중 88분 실점(동점) → concede/lead_lost 중복 → 1개
    const m = mk([
      { minute: 20, type: "goal", teamCode: "KOR", playerId: "k9", playerName: "G" },
      { minute: 88, type: "goal", teamCode: "BRA", playerId: "b1", playerName: "X" },
    ]);
    const at88 = extractMoments(m, "KOR").filter((d) => d.eventMinute === 88);
    expect(at88).toHaveLength(1);
  });

  it("우리 팀의 자책골(own_goal, teamCode=side)은 concede 순간을 만든다", () => {
    const m = mk([{ minute: 55, type: "own_goal", teamCode: "KOR", playerId: "k2", playerName: "Z" }]);
    const out = extractMoments(m, "KOR");
    expect(out.some((d) => d.kind === "concede" && d.eventMinute === 55)).toBe(true);
  });

  it("상대의 자책골(own_goal, teamCode=opponent)은 concede가 아니다(우리 득점)", () => {
    const m = mk([{ minute: 55, type: "own_goal", teamCode: "BRA", playerId: "b2", playerName: "W" }]);
    const out = extractMoments(m, "KOR");
    expect(out.some((d) => d.eventMinute === 55 && d.kind === "concede")).toBe(false);
  });
});

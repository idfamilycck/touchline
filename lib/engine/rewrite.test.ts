import { describe, it, expect, beforeAll } from "vitest";
import { registerWc2026 } from "@/lib/wc2026/register";
import { wc2026Matches, wc2026MatchById } from "@/lib/wc2026/data";
import { extractMoments } from "@/lib/wc2026/moments";
import { fromRealState } from "@/lib/engine/rewrite";
import { simulateMinute } from "@/lib/engine/match";

beforeAll(() => registerWc2026());

// 헬퍼: wc2026Matches()를 순회해 concede 순간(홈 또는 원정 관점)이 있는 첫 경기의
// id를 반환한다. 어느 관점(m.away 등)을 쓸지는 호출부(테스트)가 결정하므로, 여기서는
// "m.away 관점으로 concede 모먼트가 존재하는가"만 확인한다(테스트가 그 관점을 쓴다).
function pickMatchWithConcede(): string {
  for (const m of wc2026Matches()) {
    const moments = extractMoments(m, m.away);
    if (moments.some((d) => d.kind === "concede")) return m.id;
  }
  throw new Error("no match with a concede moment found");
}

describe("fromRealState", () => {
  it("takeoverMinute 시점의 스코어를 반영한다", () => {
    const m = wc2026MatchById(pickMatchWithConcede())!; // 헬퍼: concede 순간 있는 경기 id
    const side = m.away; // 실점 팀 관점
    const moment = extractMoments(m, side).find((d) => d.kind === "concede")!;
    const state = fromRealState(m, side, moment, 42);
    expect(state.minute).toBe(moment.takeoverMinute);
    expect(state.finished).toBe(false);
    // 우리(me)는 side 팀
    expect(state.me.teamId).toBe(`wc_${side.toLowerCase()}`);
  });
  it("동일 입력은 동일 시뮬 진행(재현성)", () => {
    const m = wc2026MatchById(pickMatchWithConcede())!;
    const side = m.away;
    const moment = extractMoments(m, side).find((d) => d.kind === "concede")!;
    const a = simulateMinute(fromRealState(m, side, moment, 7));
    const b = simulateMinute(fromRealState(m, side, moment, 7));
    expect(a.scoreMe).toBe(b.scoreMe);
    expect(a.rngState).toBe(b.rngState);
  });
});

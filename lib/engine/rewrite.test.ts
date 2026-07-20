import { describe, it, expect, beforeAll } from "vitest";
import { registerWc2026 } from "@/lib/wc2026/register";
import { wc2026Matches, wc2026MatchById } from "@/lib/wc2026/data";
import { extractMoments } from "@/lib/wc2026/moments";
import { fromRealState } from "@/lib/engine/rewrite";
import { simulateMinute } from "@/lib/engine/match";
import { venueById } from "@/lib/data/venues";
import { wc2026VenueId } from "@/lib/wc2026/venues";

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

  it("고도 매치(멕시코시티, Estadio Banorte)는 wc_default가 아닌 실제 경기장 venueId로 해석된다", () => {
    // 760415: MEX(홈) vs RSA(원정) @ Estadio Banorte — data/wc2026/matches.json에서
    // 확인한 멕시코시티 개최 경기(고도 2240m).
    const m = wc2026MatchById("760415")!;
    const state = fromRealState(m, m.home, { takeoverMinute: 30 }, 1);
    const expectedVenueId = wc2026VenueId(m.venueKo);
    expect(state.venueId).toBe(expectedVenueId);
    expect(state.venueId).not.toBe("wc_default");
    const venue = venueById(state.venueId);
    expect(venue).toBeDefined();
    expect(venue!.altitude).toBeGreaterThan(1500);
  });

  it("상대(opponent)의 인수 시점 이전 퇴장이 반영되어 라인업이 10명 이하가 된다", () => {
    // 760415: RSA 선수(228595, RSA 선발)가 49분에 퇴장. side=MEX(홈)로 인수하면
    // opponent=RSA이므로, takeoverMinute이 49분 이후면 RSA(=opp)는 10명이어야 한다.
    // 과거엔 opp 라인업 교체/퇴장을 반영하지 않아 opp가 항상 원래 선발 11명이었다.
    const m = wc2026MatchById("760415")!;
    const state = fromRealState(m, m.home, { takeoverMinute: 50 }, 1);
    expect(Object.keys(state.opp.lineup).length).toBeLessThan(11);
    // 퇴장당한 선수 본인은 더 이상 온피치에 없어야 한다.
    expect(Object.values(state.opp.lineup)).not.toContain("228595");
  });

  it("인수 시점 이전이면(퇴장 이전 분) 상대는 여전히 11명이다", () => {
    const m = wc2026MatchById("760415")!;
    const state = fromRealState(m, m.home, { takeoverMinute: 30 }, 1);
    expect(Object.keys(state.opp.lineup).length).toBe(11);
  });
});

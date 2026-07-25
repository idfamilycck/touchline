import { describe, it, expect } from "vitest";
import { makeSetup } from "./__testutils__";
import {
  initMatch,
  simulateMinute,
  applyIntervention,
  runFullMatch,
  winProbGivenScore,
  advanceProb,
  type MatchState,
} from "./match";
import { playersOf } from "@/lib/data/players";

function runMinutes(state: MatchState, n: number): MatchState {
  let s = state;
  for (let i = 0; i < n; i++) s = simulateMinute(s);
  return s;
}

function avgStaminaOnPitch(state: MatchState): number {
  const ids = [...Object.values(state.me.lineup), ...Object.values(state.opp.lineup)];
  const vals = ids.map((id) => state.stamina[id] ?? 1);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

describe("match simulation", () => {
  it("같은 시드+같은 개입 → 이벤트 로그 완전 동일 (재현성)", () => {
    const kor = makeSetup("kor", "4-3-3");
    const bra = makeSetup("bra", "4-3-3");
    const a = runFullMatch(kor, bra, "metlife", 123);
    const b = runFullMatch(kor, bra, "metlife", 123);
    expect(a.events).toEqual(b.events);
    expect(a.scoreMe).toBe(b.scoreMe);
  });

  it("다른 시드 → 대체로 다른 전개 (10개 시드 중 8개 이상 이벤트 수 상이)", () => {
    const kor = makeSetup("kor", "4-3-3");
    const bra = makeSetup("bra", "4-3-3");
    const baseline = runFullMatch(kor, bra, "metlife", 1000);
    let differing = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const run = runFullMatch(kor, bra, "metlife", seed);
      if (run.events.length !== baseline.events.length) differing++;
    }
    expect(differing).toBeGreaterThanOrEqual(8);
  });

  it("90분 이상 진행 후 finished=true, 이벤트에 fulltime 존재", () => {
    const kor = makeSetup("kor", "4-3-3");
    const bra = makeSetup("bra", "4-3-3");
    const result = runFullMatch(kor, bra, "metlife", 42);
    expect(result.finished).toBe(true);
    expect(result.minute).toBeGreaterThan(90);
    expect(result.events.some((e) => e.type === "fulltime")).toBe(true);
  });

  it("교체 개입이 라인업에 반영되고 subsUsedMe 증가, 5명 초과 교체는 무시", () => {
    const kor = makeSetup("kor", "4-3-3");
    const bra = makeSetup("bra", "4-3-3");
    let state = initMatch(kor, bra, "metlife", 7);
    state = runMinutes(state, 60);

    const onPitch = Object.values(state.me.lineup);
    const bench = playersOf("kor")
      .map((p) => p.id)
      .filter((id) => !onPitch.includes(id));

    // 첫 교체 하나: 라인업 반영 + subsUsedMe=1 확인
    const outId = state.me.lineup["st"];
    const afterFirst = applyIntervention(state, {
      minute: state.minute,
      side: "me",
      subs: [{ out: outId, in: bench[0] }],
    });
    expect(afterFirst.me.lineup["st"]).toBe(bench[0]);
    expect(afterFirst.subsUsedMe).toBe(1);
    expect(afterFirst.events.some((e) => e.type === "sub")).toBe(true);

    // 온피치 11명 중 6명을 한 번에 벤치 6명과 교체 시도 → 5명 초과분은 무시되어야 함
    const stillOnPitch = Object.values(state.me.lineup);
    const subs = stillOnPitch.slice(0, 6).map((out, i) => ({ out, in: bench[i] }));
    const capped = applyIntervention(state, { minute: state.minute, side: "me", subs });
    expect(capped.subsUsedMe).toBe(5);
    expect(capped.events.filter((e) => e.type === "sub")).toHaveLength(5);
    // 6번째(마지막) 교체는 반영되지 않아야 함
    const sixthOut = subs[5].out;
    const sixthIn = subs[5].in;
    expect(Object.values(capped.me.lineup)).toContain(sixthOut);
    expect(Object.values(capped.me.lineup)).not.toContain(sixthIn);
  });

  it("교체 개입이 여러 호출에 걸쳐도 5명 누적 상한을 지킨다 (46'에 3명 + 70'에 3명 → 5명, sub 이벤트 5개)", () => {
    const kor = makeSetup("kor", "4-3-3");
    const bra = makeSetup("bra", "4-3-3");
    let state = initMatch(kor, bra, "metlife", 11);
    state = runMinutes(state, 46);

    const onPitchAt46 = Object.values(state.me.lineup);
    const bench = playersOf("kor")
      .map((p) => p.id)
      .filter((id) => !onPitchAt46.includes(id));

    const firstSubs = onPitchAt46.slice(0, 3).map((out, i) => ({ out, in: bench[i] }));
    state = applyIntervention(state, { minute: state.minute, side: "me", subs: firstSubs });
    expect(state.subsUsedMe).toBe(3);

    state = runMinutes(state, 24); // now at minute 70

    const onPitchAt70 = Object.values(state.me.lineup);
    const secondSubs = onPitchAt70
      .filter((id) => !firstSubs.some((s) => s.in === id)) // 방금 투입된 선수는 다시 빼지 않음
      .slice(0, 3)
      .map((out, i) => ({ out, in: bench[3 + i] }));
    state = applyIntervention(state, { minute: state.minute, side: "me", subs: secondSubs });

    expect(state.subsUsedMe).toBe(5);
    expect(state.events.filter((e) => e.type === "sub")).toHaveLength(5);
  });

  it("이미 라인업에 있는 선수를 투입하는 교체는 무시된다 (중복 배치 방지)", () => {
    const kor = makeSetup("kor", "4-3-3");
    const bra = makeSetup("bra", "4-3-3");
    let state = initMatch(kor, bra, "metlife", 11);
    state = runMinutes(state, 46);

    const outId = state.me.lineup["st"];
    const alreadyOnPitchId = state.me.lineup["wg_l"]; // 라인업에 이미 있는 선수
    const before = { ...state.me.lineup };

    const after = applyIntervention(state, {
      minute: state.minute,
      side: "me",
      subs: [{ out: outId, in: alreadyOnPitchId }],
    });

    expect(after.me.lineup).toEqual(before);
    expect(after.subsUsedMe).toBe(0);
    expect(after.events.some((e) => e.type === "sub")).toBe(false);
  });

  it("교체로 빠진 선수는 재투입 불가 (A→B 후 C→A 시도는 무시)", () => {
    const kor = makeSetup("kor", "4-3-3");
    const bra = makeSetup("bra", "4-3-3");
    let state = initMatch(kor, bra, "metlife", 11);
    state = runMinutes(state, 46);

    const onPitchAt46 = Object.values(state.me.lineup);
    const bench = playersOf("kor")
      .map((p) => p.id)
      .filter((id) => !onPitchAt46.includes(id));

    // 46'에 A→B 교체 (A가 경기에서 빠짐)
    const playerA = state.me.lineup["st"];
    const playerB = bench[0];
    state = applyIntervention(state, {
      minute: state.minute,
      side: "me",
      subs: [{ out: playerA, in: playerB }],
    });
    expect(state.subsUsedMe).toBe(1);
    expect(Object.values(state.me.lineup)).toContain(playerB);
    expect(Object.values(state.me.lineup)).not.toContain(playerA);

    state = runMinutes(state, 24); // 70분

    // 70'에 C→A 교체 시도 (이미 빠진 A를 다시 투입) → 무시되어야 함
    const playerC = Object.values(state.me.lineup)[5];
    const lineupBefore = { ...state.me.lineup };
    const after = applyIntervention(state, {
      minute: state.minute,
      side: "me",
      subs: [{ out: playerC, in: playerA }],
    });
    expect(after.me.lineup).toEqual(lineupBefore); // 라인업 불변
    expect(after.subsUsedMe).toBe(1); // 증가하지 않음
    expect(Object.values(after.me.lineup)).not.toContain(playerA);
    // 무시된 교체는 sub 이벤트를 남기지 않는다 (기존 1건만 유지)
    expect(after.events.filter((e) => e.type === "sub")).toHaveLength(1);
  });

  it("후반 평균 스태미나 < 전반 평균 스태미나", () => {
    const kor = makeSetup("kor", "4-3-3");
    const bra = makeSetup("bra", "4-3-3");
    let state = initMatch(kor, bra, "metlife", 55);
    state = runMinutes(state, 45);
    const firstHalfAvg = avgStaminaOnPitch(state);
    state = runMinutes(state, 45);
    const secondHalfAvg = avgStaminaOnPitch(state);
    expect(secondHalfAvg).toBeLessThan(firstHalfAvg);
  });

  it("고지대 경기의 80분 시점 평균 스태미나 < 평지 경기 (같은 시드·매치업)", () => {
    const kor = makeSetup("kor", "4-3-3");
    const bra = makeSetup("bra", "4-3-3");
    const azteca = runMinutes(initMatch(kor, bra, "azteca", 99), 80);
    const metlife = runMinutes(initMatch(kor, bra, "metlife", 99), 80);
    expect(avgStaminaOnPitch(azteca)).toBeLessThan(avgStaminaOnPitch(metlife));
  });
});

describe("winProbGivenScore / advanceProb", () => {
  it("승·무·패 합이 1이다", () => {
    for (const [sm, so, lm, lo] of [
      [0, 0, 1.4, 1.2],
      [2, 0, 0.5, 0.9],
      [0, 3, 1.1, 0.2],
    ] as const) {
      const p = winProbGivenScore(sm, so, lm, lo);
      expect(p.win + p.draw + p.loss).toBeCloseTo(1, 6);
    }
  });

  it("잔여 λ가 0이면 현재 스코어가 그대로 확정된다", () => {
    expect(winProbGivenScore(1, 0, 0, 0)).toEqual({ win: 1, draw: 0, loss: 0 });
    expect(winProbGivenScore(0, 0, 0, 0)).toEqual({ win: 0, draw: 1, loss: 0 });
    expect(winProbGivenScore(0, 2, 0, 0)).toEqual({ win: 0, draw: 0, loss: 1 });
  });

  it("무승부 확률이 승부차기 승률만큼 진출 확률에 더해진다", () => {
    const p = winProbGivenScore(0, 0, 1.0, 1.0);
    expect(p.draw).toBeGreaterThan(0);
    // 대칭 매치업 + 승부차기 50% → 진출 확률은 정확히 50%
    expect(advanceProb(p, 0.5)).toBeCloseTo(0.5, 6);
    // 승부차기에 강하면 진출 확률이 순수 승률보다 높다
    expect(advanceProb(p, 0.8)).toBeGreaterThan(p.win);
    // 승부차기 승률 0이면 진출 확률 = 순수 승률
    expect(advanceProb(p, 0)).toBeCloseTo(p.win, 6);
  });

  it("0:0 팽팽한 경기는 열세 경기보다 무승부 확률이 높다", () => {
    const even = winProbGivenScore(0, 0, 1.2, 1.2);
    const behind = winProbGivenScore(0, 2, 1.2, 1.2);
    expect(even.draw).toBeGreaterThan(behind.draw);
  });
});

describe("경고·퇴장", () => {
  it("경고를 받은 선수는 booked에 쌓이고, 같은 선수가 다시 지목되면 퇴장한다", () => {
    // 압박 최대(카드 확률 최대)로 여러 시드를 돌려 실제로 퇴장이 나오는 경기를 찾는다.
    const me = makeSetup("kor", "4-3-3", { pressing: 3 });
    const opp = makeSetup("bra", "4-3-3", { pressing: 3 });

    let found: MatchState | undefined;
    for (let seed = 1; seed <= 400 && !found; seed++) {
      const s = runFullMatch(me, opp, "metlife", seed);
      if (s.events.some((e) => e.type === "red")) found = s;
    }
    expect(found, "400개 시드 안에 퇴장 경기가 하나도 없다면 카드 확률 설정을 확인해야 한다").toBeDefined();

    const red = found!.events.find((e) => e.type === "red")!;
    // 퇴장 선수는 그 전에 경고를 받은 적이 있어야 한다(2차 경고 퇴장).
    const earlierCard = found!.events.find(
      (e) => e.type === "card" && e.playerId === red.playerId && e.minute <= red.minute
    );
    expect(earlierCard).toBeDefined();

    // 퇴장 후 그 선수는 라인업에서 빠져 10인 체제가 된다.
    const lineup = red.side === "me" ? found!.me.lineup : found!.opp.lineup;
    expect(Object.values(lineup)).not.toContain(red.playerId);
    expect(Object.keys(lineup).length).toBeLessThan(11);
  });

  it("퇴장한 팀의 λ는 내려가고 상대 λ는 올라간다 (같은 경기 내 전후 비교)", () => {
    const me = makeSetup("kor", "4-3-3", { pressing: 3 });
    const opp = makeSetup("bra", "4-3-3", { pressing: 3 });

    for (let seed = 1; seed <= 400; seed++) {
      let state = initMatch(me, opp, "metlife", seed);
      let before: { me: number; opp: number } | undefined;
      while (!state.finished) {
        const prev = { me: state.lambdaMe, opp: state.lambdaOpp };
        state = simulateMinute(state);
        const red = state.events.filter((e) => e.minute === state.minute && e.type === "red")[0];
        if (red && red.side === "opp") {
          before = prev;
          expect(state.lambdaOpp).toBeLessThan(before.opp);
          expect(state.lambdaMe).toBeGreaterThan(before.me);
          return;
        }
      }
    }
    throw new Error("400개 시드 안에 상대 퇴장이 발생하지 않았다");
  });

  it("경고 누적은 재현 가능하다 (같은 시드 → 같은 booked)", () => {
    const me = makeSetup("kor", "4-3-3", { pressing: 3 });
    const opp = makeSetup("bra", "4-3-3", { pressing: 3 });
    const a = runFullMatch(me, opp, "metlife", 7);
    const b = runFullMatch(me, opp, "metlife", 7);
    expect(a.booked).toEqual(b.booked);
  });
});

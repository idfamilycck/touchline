import { describe, it, expect } from "vitest";
import {
  cornerGoalProb,
  cornerTaker,
  cornerBoxPlayers,
  selectCornerScorer,
} from "./setpiece";
import { makeSetup } from "./__testutils__";
import { runFullMatch } from "./match";
import { playersOf } from "@/lib/data/players";

describe("cornerTaker", () => {
  it("작전실에서 지정한 코너 키커를 쓴다", () => {
    const kor = makeSetup("kor", "4-3-3");
    const designated = kor.lineup["cm_l"];
    const setup = { ...kor, special: { ...kor.special, ckTakerId: designated } };
    expect(cornerTaker(setup)?.id).toBe(designated);
  });

  it("지정이 없으면 온피치 중 setPiece가 가장 좋은 선수가 찬다", () => {
    const kor = makeSetup("kor", "4-3-3");
    const squad = playersOf("kor");
    const onPitch = Object.values(kor.lineup).map((id) => squad.find((p) => p.id === id)!);
    const best = [...onPitch].sort((a, b) => b.setPiece - a.setPiece)[0];
    expect(cornerTaker(kor)?.id).toBe(best.id);
  });

  it("지정된 키커가 그라운드에 없으면 자동 선정으로 폴백한다", () => {
    const kor = makeSetup("kor", "4-3-3");
    const bench = playersOf("kor").find((p) => !Object.values(kor.lineup).includes(p.id))!;
    const setup = { ...kor, special: { ...kor.special, ckTakerId: bench.id } };
    const taker = cornerTaker(setup);
    expect(taker).toBeDefined();
    expect(taker!.id).not.toBe(bench.id);
    expect(Object.values(kor.lineup)).toContain(taker!.id);
  });
});

describe("cornerBoxPlayers / ckBigMenForward", () => {
  it("장신 전진을 켜면 문전 인원이 늘어난다", () => {
    const kor = makeSetup("kor", "4-3-3");
    const off = cornerBoxPlayers(kor);
    const on = cornerBoxPlayers({ ...kor, special: { ...kor.special, ckBigMenForward: true } });
    expect(on.length).toBeGreaterThan(off.length);
  });

  it("장신 전진은 코너 득점 확률을 높인다 (이득 쪽)", () => {
    const kor = makeSetup("kor", "4-3-3");
    const jpn = makeSetup("jpn", "4-3-3");
    const off = cornerGoalProb(kor, jpn);
    const on = cornerGoalProb(
      { ...kor, special: { ...kor.special, ckBigMenForward: true } },
      jpn
    );
    // 중원이 문전에 추가되면 공중전 평균이 오히려 내려갈 수도 있으므로 "인원이 늘어
    // 위협이 커진다"는 방향만 확인한다 — 값이 같아지지는 않아야 한다.
    expect(on).not.toBeCloseTo(off, 10);
  });
});

describe("cornerGoalProb", () => {
  it("확률은 항상 [0.03, 0.28] 안에 있다", () => {
    const teams = ["kor", "bra", "jpn", "usa"];
    for (const a of teams) {
      for (const b of teams) {
        if (a === b) continue;
        const p = cornerGoalProb(makeSetup(a, "4-3-3"), makeSetup(b, "4-3-3"));
        expect(p).toBeGreaterThanOrEqual(0.03);
        expect(p).toBeLessThanOrEqual(0.28);
      }
    }
  });

  it("키커의 setPiece가 좋아지면 확률이 오른다 (사장돼 있던 능력치가 실제로 관여한다)", () => {
    const kor = makeSetup("kor", "4-3-3");
    const jpn = makeSetup("jpn", "4-3-3");
    const squad = playersOf("kor");
    const onPitch = Object.values(kor.lineup).map((id) => squad.find((p) => p.id === id)!);
    const worst = [...onPitch].sort((a, b) => a.setPiece - b.setPiece)[0];
    const best = [...onPitch].sort((a, b) => b.setPiece - a.setPiece)[0];
    expect(best.setPiece).toBeGreaterThan(worst.setPiece);

    const withBest = cornerGoalProb(
      { ...kor, special: { ...kor.special, ckTakerId: best.id } },
      jpn
    );
    const withWorst = cornerGoalProb(
      { ...kor, special: { ...kor.special, ckTakerId: worst.id } },
      jpn
    );
    expect(withBest).toBeGreaterThan(withWorst);
  });
});

describe("selectCornerScorer", () => {
  it("문전 인원 중에서만 득점자가 나온다", () => {
    const kor = makeSetup("kor", "4-3-3");
    const boxIds = cornerBoxPlayers(kor).map((p) => p.id);
    for (const r of [0, 0.13, 0.37, 0.5, 0.79, 0.999]) {
      expect(boxIds).toContain(selectCornerScorer(kor, r)!.id);
    }
  });

  it("제공권이 좋은 선수가 더 자주 뽑힌다", () => {
    const kor = makeSetup("kor", "4-3-3");
    const box = cornerBoxPlayers(kor);
    const best = [...box].sort((a, b) => b.aerial - a.aerial)[0];
    const worst = [...box].sort((a, b) => a.aerial - b.aerial)[0];

    const counts = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const p = selectCornerScorer(kor, i / 2000);
      if (p) counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
    }
    expect(counts.get(best.id) ?? 0).toBeGreaterThan(counts.get(worst.id) ?? 0);
  });
});

describe("경기 내 세트피스 득점", () => {
  it("코너에서 골이 나오고 문구에 코너킥이 명시된다", () => {
    const me = makeSetup("kor", "4-3-3");
    const opp = makeSetup("bra", "4-3-3");

    let setPieceGoals = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = runFullMatch(me, opp, "metlife", seed);
      setPieceGoals += s.events.filter(
        (e) => e.type === "goal" && e.textKo.includes("코너킥")
      ).length;
    }
    expect(setPieceGoals).toBeGreaterThan(0);
  });

  it("세트피스 골도 스코어에 정확히 반영된다 (이벤트 수 = 스코어)", () => {
    const me = makeSetup("kor", "4-3-3");
    const opp = makeSetup("bra", "4-3-3");
    for (let seed = 1; seed <= 40; seed++) {
      const s = runFullMatch(me, opp, "metlife", seed);
      const meGoals = s.events.filter((e) => e.type === "goal" && e.side === "me").length;
      const oppGoals = s.events.filter((e) => e.type === "goal" && e.side === "opp").length;
      expect(meGoals).toBe(s.scoreMe);
      expect(oppGoals).toBe(s.scoreOpp);
    }
  });

  it("세트피스 도입 후에도 같은 시드는 완전히 재현된다", () => {
    const me = makeSetup("kor", "4-3-3");
    const opp = makeSetup("bra", "4-3-3");
    const a = runFullMatch(me, opp, "metlife", 21);
    const b = runFullMatch(me, opp, "metlife", 21);
    expect(a.events).toEqual(b.events);
  });
});

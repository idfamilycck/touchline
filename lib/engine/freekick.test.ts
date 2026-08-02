import { describe, it, expect } from "vitest";
import { pickFoulZone, freeKickGoalProb, freeKickTaker } from "./freekick";
import { makeSetup } from "./__testutils__";
import { playersOf } from "@/lib/data/players";

describe("pickFoulZone", () => {
  it("압박이 낮을수록 수비 존(def) 비중이 높다", () => {
    // rand=0.1은 pressing 1(def 0.5)/2(def 0.35)/3(def 0.2) 모두 def에 들어간다 —
    // 대신 def/mid 경계값 바로 위에서 압박별 분기를 확인한다.
    expect(pickFoulZone(1, 0.4)).toBe("def"); // 1: def=0.5
    expect(pickFoulZone(2, 0.4)).toBe("mid"); // 2: def=0.35, def+mid=0.75
    expect(pickFoulZone(3, 0.4)).toBe("mid"); // 3: def=0.2, def+mid=0.55
    expect(pickFoulZone(3, 0.6)).toBe("att"); // 3: 0.6 >= def+mid(0.55)
  });

  it("rand가 1에 가까우면 항상 공격 존(att)이다", () => {
    expect(pickFoulZone(1, 0.99)).toBe("att");
    expect(pickFoulZone(2, 0.99)).toBe("att");
    expect(pickFoulZone(3, 0.99)).toBe("att");
  });
});

describe("freeKickGoalProb", () => {
  it("박스 바로 앞(def)이 중거리(mid)보다 항상 위험하다", () => {
    expect(freeKickGoalProb("def", 50)).toBeGreaterThan(freeKickGoalProb("mid", 50));
  });

  it("setPiece가 높을수록 골 확률이 오른다", () => {
    expect(freeKickGoalProb("def", 90)).toBeGreaterThan(freeKickGoalProb("def", 30));
    expect(freeKickGoalProb("mid", 90)).toBeGreaterThan(freeKickGoalProb("mid", 30));
  });

  it("확률은 항상 [0,1] 안에 클램프된다", () => {
    expect(freeKickGoalProb("def", 999)).toBeLessThanOrEqual(1);
    expect(freeKickGoalProb("mid", -999)).toBeGreaterThanOrEqual(0);
  });
});

describe("freeKickTaker", () => {
  it("작전실에서 지정한 fkTakerId를 쓴다", () => {
    const kor = makeSetup("kor", "4-3-3");
    const designated = kor.lineup["cm_l"];
    const setup = { ...kor, special: { ...kor.special, fkTakerId: designated } };
    expect(freeKickTaker(setup)?.id).toBe(designated);
  });

  it("지정이 없으면 온피치 필드 플레이어 중 setPiece가 가장 좋은 선수가 찬다", () => {
    const kor = makeSetup("kor", "4-3-3");
    const squad = playersOf("kor");
    const onPitchFieldPlayers = Object.entries(kor.lineup)
      .filter(([slotId]) => !slotId.startsWith("gk"))
      .map(([, id]) => squad.find((p) => p.id === id)!);
    const best = [...onPitchFieldPlayers].sort((a, b) => b.setPiece - a.setPiece)[0];
    expect(freeKickTaker(kor)?.id).toBe(best.id);
  });

  it("GK는 절대 프리킥 키커로 선택되지 않는다", () => {
    const kor = makeSetup("kor", "4-3-3");
    const gkId = kor.lineup["gk"];
    const setup = { ...kor, special: { ...kor.special, fkTakerId: gkId } };
    expect(freeKickTaker(setup)?.id).not.toBe(gkId);
  });

  it("지정된 키커가 그라운드에 없으면 자동 선정으로 폴백한다", () => {
    const kor = makeSetup("kor", "4-3-3");
    const bench = playersOf("kor").find((p) => !Object.values(kor.lineup).includes(p.id))!;
    const setup = { ...kor, special: { ...kor.special, fkTakerId: bench.id } };
    const taker = freeKickTaker(setup);
    expect(taker).toBeDefined();
    expect(taker!.id).not.toBe(bench.id);
    expect(Object.values(kor.lineup)).toContain(taker!.id);
  });
});

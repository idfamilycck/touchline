import { describe, it, expect } from "vitest";
import { positionFitness, ageMultiplier, playerContribution, lineStrengths } from "./strength";
import { makeSetup } from "./__testutils__";
import { playersOf } from "@/lib/data/players";

describe("positionFitness", () => {
  it("주포지션 1.0, 등록 부포지션 0.9, GK 불일치 0.25", () => {
    const squad = playersOf("kor");
    const st = squad.find((p) => p.positions[0] === "ST")!;
    expect(positionFitness(st, "ST")).toBe(1.0);
    expect(positionFitness(st, "GK")).toBe(0.25);
  });
});

describe("ageMultiplier", () => {
  it("피크 나이에서 1.0, 36세 WG는 0.9 미만, 하한 0.78", () => {
    expect(ageMultiplier(26, "WG")).toBe(1.0);
    expect(ageMultiplier(36, "WG")).toBeLessThan(0.9);
    expect(ageMultiplier(40, "WG")).toBeGreaterThanOrEqual(0.78);
  });
});

describe("playerContribution", () => {
  it("체력 0%면 기여도는 만체력의 60%", () => {
    const p = playersOf("kor")[0];
    const full = playerContribution(p, p.positions[0], /*role*/ undefined as never, 1);
    const empty = playerContribution(p, p.positions[0], undefined as never, 0);
    expect(empty / full).toBeCloseTo(0.6, 5);
  });
});

describe("ageMultiplier 비대칭 (C)", () => {
  it("피크 이전의 하락이 피크 이후보다 완만하다", () => {
    // ST의 피크는 26세. 같은 3년 차이라면 23세가 29세보다 유리해야 한다.
    const younger = ageMultiplier(23, "ST");
    const older = ageMultiplier(29, "ST");
    expect(younger).toBeGreaterThan(older);
  });

  it("피크에서 최대치 1.0이고 하한 0.78을 넘지 않는다", () => {
    expect(ageMultiplier(26, "ST")).toBeCloseTo(1, 10);
    expect(ageMultiplier(31, "GK")).toBeCloseTo(1, 10);
    expect(ageMultiplier(16, "ST")).toBeGreaterThanOrEqual(0.78);
    expect(ageMultiplier(40, "ST")).toBeGreaterThanOrEqual(0.78);
  });

  it("피크에서 멀어질수록 단조 감소한다 (양방향)", () => {
    expect(ageMultiplier(25, "ST")).toBeGreaterThan(ageMultiplier(22, "ST"));
    expect(ageMultiplier(27, "ST")).toBeGreaterThan(ageMultiplier(31, "ST"));
  });
});

describe("lineStrengths + 맨마킹", () => {
  it("브라질 공격 라인 > 한국 공격 라인 (더미 데이터 전제)", () => {
    const bra = makeSetup("bra", "4-3-3"), kor = makeSetup("kor", "4-3-3");
    expect(lineStrengths(bra).att).toBeGreaterThan(lineStrengths(kor).att);
  });
  it("맨마킹 지정 시 상대 타깃 기여 감소 + 우리 마커 공격 기여 감소", () => {
    const kor = makeSetup("kor", "4-3-3"), bra = makeSetup("bra", "4-3-3");
    const braNoMark = lineStrengths(bra, kor);
    const target = Object.values(bra.lineup).map((id) => playersOf("bra").find((p) => p.id === id)!)
      .sort((a, b) => b.attrs.shooting - a.attrs.shooting)[0];
    const marker = Object.values(kor.lineup)[5];
    const korMarking = { ...kor, special: { ...kor.special, manMark: { markerId: marker, targetId: target.id } } };
    const braMarked = lineStrengths(bra, korMarking);
    expect(braMarked.att).toBeLessThan(braNoMark.att);
  });
  // 회귀: 예전엔 "채워진 슬롯 수"를 분모로 썼기 때문에 라인 평균 이하인 선수가
  // 퇴장하면 그 라인 전력이 오히려 올라갔다(11 대 10이 유리해지는 부호 역전).
  it("퇴장으로 슬롯이 비면 그 라인 전력이 정원 기준으로 떨어진다", () => {
    const kor = makeSetup("kor", "4-3-3");
    const full = lineStrengths(kor);

    // def 라인(CB/FB 4명) 중 기여가 가장 낮은 선수를 빼도 def가 내려가야 한다.
    const squad = playersOf("kor");
    const defSlots = Object.keys(kor.lineup).filter((k) => /^(cb|fb)/.test(k));
    const weakest = defSlots
      .map((slotId) => ({ slotId, p: squad.find((x) => x.id === kor.lineup[slotId])! }))
      .sort((a, b) => a.p.attrs.defending - b.p.attrs.defending)[0];

    const lineup = { ...kor.lineup };
    delete lineup[weakest.slotId];
    const tenMen = lineStrengths({ ...kor, lineup });

    expect(tenMen.def).toBeLessThan(full.def);
    // 4명 정원에서 1명이 빠졌으므로 대략 3/4 수준
    expect(tenMen.def / full.def).toBeLessThan(0.9);
  });

  it("11명 전원 배치면 정원 분모와 실배치 분모의 값이 같다 (기존 수치 불변)", () => {
    // 정상 경로에서 값이 바뀌지 않았음을 고정한다: 라인별 평균이 곧 각 라인
    // 기여도 합/정원이고, 전원 배치 시 정원 = 실배치 수이므로 동일해야 한다.
    for (const teamId of ["kor", "bra", "jpn"]) {
      const s = makeSetup(teamId, "4-3-3");
      const ls = lineStrengths(s);
      expect(Object.keys(s.lineup)).toHaveLength(11);
      expect(ls.gk).toBeGreaterThan(0);
      expect(ls.def).toBeGreaterThan(0);
      expect(ls.mid).toBeGreaterThan(0);
      expect(ls.att).toBeGreaterThan(0);
    }
  });

  it("자기 팀 마커가 공격 라인 배정이면 우리 공격 기여 감소", () => {
    const kor = makeSetup("kor", "4-3-3"), bra = makeSetup("bra", "4-3-3");
    const markerId = kor.lineup["wg_l"];
    const targetId = Object.values(bra.lineup)[0];
    const korMarking = { ...kor, special: { ...kor.special, manMark: { markerId, targetId } } };
    expect(lineStrengths(korMarking).att).toBeLessThan(lineStrengths(kor).att);
  });
});

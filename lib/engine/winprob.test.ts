import { describe, it, expect } from "vitest";
import { makeSetup } from "./__testutils__";
import { RULE_DEFS, applyModifiers, saturate, type RuleCtx } from "./modifiers";
import { computeLambdas, winProbability } from "./winprob";
import { teamById } from "@/lib/data/teams";
import { venueById } from "@/lib/data/venues";
import { playersOf } from "@/lib/data/players";
import { FORMATIONS } from "@/lib/data/formations";
import type { Player, SpecialInstructions, Team, TeamInstructions, Venue } from "@/lib/types";

// ---- RULE_DEFS 단위 테스트용 헬퍼 --------------------------------------
// 실제 선수단 데이터는 pace/mental/form 등이 일부 규칙의 임계값(예: mental>=85,
// form<=3)에 자연스럽게 도달하지 않으므로, 규칙 로직 자체(when/effect/textKo)를
// RuleCtx를 직접 구성해 결정론적으로 검증한다.
function baseCtx(overrides: Partial<RuleCtx> = {}): RuleCtx {
  const me = makeSetup("kor", "4-3-3");
  const opp = makeSetup("jpn", "4-3-3");
  return {
    me,
    opp,
    venue: venueById("metlife")!,
    meTeam: teamById("kor")!,
    oppTeam: teamById("jpn")!,
    h2h: undefined,
    meSquad: playersOf("kor"),
    oppSquad: playersOf("jpn"),
    meFormation: FORMATIONS["4-3-3"],
    oppFormation: FORMATIONS["4-3-3"],
    meAttPaceAvg: 70,
    oppAttPaceAvg: 70,
    oppDefContribAvg: 60,
    oppFbLContrib: 60,
    oppFbRContrib: 60,
    oppAttDribblingAvg: 70,
    // 적합도 기본값은 0(중립) — 개별 규칙 테스트가 스쿼드 편차에 흔들리지 않게 한다.
    meDirectFit: 0,
    meWideFit: 0,
    ...overrides,
  };
}

function withMe(
  ctx: RuleCtx,
  instr: Partial<TeamInstructions> = {},
  special: Partial<SpecialInstructions> = {}
): RuleCtx {
  return {
    ...ctx,
    me: {
      ...ctx.me,
      instructions: { ...ctx.me.instructions, ...instr },
      special: { ...ctx.me.special, ...special },
    },
  };
}

function withOpp(ctx: RuleCtx, instr: Partial<TeamInstructions> = {}): RuleCtx {
  return { ...ctx, opp: { ...ctx.opp, instructions: { ...ctx.opp.instructions, ...instr } } };
}

function findRule(id: string) {
  const rule = RULE_DEFS.find((d) => d.id === id);
  if (!rule) throw new Error(`rule not found: ${id}`);
  return rule;
}

// 회귀: 세부 지시(빌드업·폭·공격 방향)가 조건부 규칙만 갖고 있어서, 조건이 안 맞으면
// 토글해도 승률이 전혀 움직이지 않던 문제. 이제 각 선택지에 상시 트레이드오프가 붙는다.
describe("세부 지시 상시 기본 효과", () => {
  it("빌드업은 조건 없이 항상 발동한다", () => {
    const rule = findRule("buildup_style");
    expect(rule.when(withMe(baseCtx(), { buildup: "direct" }))).toBe(true);
    expect(rule.when(withMe(baseCtx(), { buildup: "short" }))).toBe(true);
  });

  it("폭도 조건 없이 항상 발동한다", () => {
    const rule = findRule("width_style");
    expect(rule.when(withMe(baseCtx(), { width: "wide" }))).toBe(true);
    expect(rule.when(withMe(baseCtx(), { width: "narrow" }))).toBe(true);
  });

  it("공격 방향은 중앙일 때만 발동하지 않는다(중앙이 기준점)", () => {
    const rule = findRule("focus_style");
    expect(rule.when(withMe(baseCtx(), { focus: "center" }))).toBe(false);
    expect(rule.when(withMe(baseCtx(), { focus: "left" }))).toBe(true);
    expect(rule.when(withMe(baseCtx(), { focus: "right" }))).toBe(true);
  });

  it("빌드업 효과는 스쿼드 적합도의 부호를 따르고 롱볼/짧은패스가 서로 반대다", () => {
    // 어느 한쪽이 항상 정답이면 안 된다. 공중전·피지컬 스쿼드는 롱볼이,
    // 패스·드리블 스쿼드는 짧은 패스가 이득이어야 한다.
    const rule = findRule("buildup_style");
    const aerialSquad = baseCtx({ meDirectFit: 0.8 });
    const techSquad = baseCtx({ meDirectFit: -0.8 });

    expect(rule.effect(withMe(aerialSquad, { buildup: "direct" })).da).toBeGreaterThan(0);
    expect(rule.effect(withMe(aerialSquad, { buildup: "short" })).da).toBeLessThan(0);
    expect(rule.effect(withMe(techSquad, { buildup: "short" })).da).toBeGreaterThan(0);
    expect(rule.effect(withMe(techSquad, { buildup: "direct" })).da).toBeLessThan(0);
  });

  it("폭 효과도 측면 자원 적합도의 부호를 따른다", () => {
    const rule = findRule("width_style");
    const wingers = baseCtx({ meWideFit: 0.8 });
    expect(rule.effect(withMe(wingers, { width: "wide" })).da).toBeGreaterThan(0);
    expect(rule.effect(withMe(wingers, { width: "narrow" })).da).toBeLessThan(0);
  });

  it("적합도가 0이면 기본 효과도 0이라 밸런스 기준선이 흔들리지 않는다", () => {
    const neutral = baseCtx({ meDirectFit: 0, meWideFit: 0 });
    for (const id of ["buildup_style", "width_style"]) {
      const rule = findRule(id);
      const e = rule.effect(withMe(neutral, { buildup: "short", width: "wide" }));
      expect(e.da).toBeCloseTo(0, 10);
      expect(e.dd).toBeCloseTo(0, 10);
    }
  });

  it("공격/수비 효과가 정확히 상쇄되지 않는다(상쇄하면 승률이 안 움직인다)", () => {
    // 회귀: 처음엔 da +0.02 / dd -0.02 로 맞바꿨더니 양 팀 득점 기대값이 같이
    // 올라가 승률이 0.3%p밖에 안 움직였다. 주 효과(공격)가 부수 효과(수비)보다
    // 확실히 커야 한다.
    const rule = findRule("buildup_style");
    const e = rule.effect(withMe(baseCtx({ meDirectFit: 1 }), { buildup: "direct" }));
    expect(Math.abs(e.da)).toBeGreaterThan(Math.abs(e.dd) * 2);
  });
});

describe("RULE_DEFS 개별 규칙", () => {
  // 램프(A-3): 임계값 절벽을 없앴으므로 "임계값 넘으면 정확히 -0.08"이 아니라
  // "램프 상단(86)에서 -0.08, 하단(74)에서 0, 그 사이는 연속 증가"를 검증한다.
  it("high_line_vs_pace: 상대 pace 램프에 비례해 deltaDefense가 0 → -0.08로 연속 증가", () => {
    const rule = findRule("high_line_vs_pace");
    const at = (pace: number) => withMe(baseCtx({ oppAttPaceAvg: pace }), { line: 3 });

    // 램프 상단(86 이상)에서 최대 효과
    expect(rule.effect(at(86)).dd).toBeCloseTo(-0.08, 6);
    expect(rule.effect(at(95)).dd).toBeCloseTo(-0.08, 6);
    expect(rule.textKo(at(86))).toContain("−8%");

    // 램프 하단 이하에서는 발동조차 하지 않는다
    expect(rule.when(at(74))).toBe(false);
    expect(rule.when(at(70))).toBe(false);

    // 원래 임계값 80은 램프 중앙 → 절반 효과
    expect(rule.effect(at(80)).dd).toBeCloseTo(-0.04, 6);

    // 절벽 없음: 임계값 근처에서 0.2 차이는 효과 차이도 미미해야 한다.
    const jump = Math.abs(rule.effect(at(80.1)).dd - rule.effect(at(79.9)).dd);
    expect(jump).toBeLessThan(0.005);

    // 단조 증가
    expect(rule.effect(at(84)).dd).toBeLessThan(rule.effect(at(78)).dd);
  });

  it("direct_targetman: buildup=direct & ST 역할=st_target → deltaAttack +0.06", () => {
    const rule = findRule("direct_targetman");
    let ctx = withMe(baseCtx(), { buildup: "direct" });
    ctx = { ...ctx, me: { ...ctx.me, roles: { ...ctx.me.roles, st: "st_target" } } };
    expect(rule.when(ctx)).toBe(true);
    expect(rule.effect(ctx)).toEqual({ da: 0.06, dd: 0 });

    const withoutTarget = withMe(baseCtx(), { buildup: "direct" });
    expect(rule.when(withoutTarget)).toBe(false);
  });

  it("short_vs_press: buildup=short & 상대 pressing=3 → deltaAttack -0.05", () => {
    const rule = findRule("short_vs_press");
    const ctx = withOpp(withMe(baseCtx(), { buildup: "short" }), { pressing: 3 });
    expect(rule.when(ctx)).toBe(true);
    expect(rule.effect(ctx)).toEqual({ da: -0.05, dd: 0 });
  });

  it("focus_vs_weakflank: 상대 측면 약점 정도에 비례해 deltaAttack이 커진다", () => {
    const rule = findRule("focus_vs_weakflank");
    const at = (fbR: number) =>
      withMe(baseCtx({ oppDefContribAvg: 60, oppFbRContrib: fbR, oppFbLContrib: 60 }), {
        focus: "left",
      });

    // 평균의 86%(=14% 부족)면 램프 상단 → 최대 +0.07
    const wideOpen = at(60 * 0.86);
    expect(rule.when(wideOpen)).toBe(true);
    expect(rule.effect(wideOpen).da).toBeCloseTo(0.07, 6);
    expect(rule.textKo(wideOpen)).toContain("오른쪽");

    // 거의 평균 수준이면 발동하지 않는다
    expect(rule.when(at(59.5))).toBe(false);

    // 약할수록 크다(단조)
    expect(rule.effect(at(52)).da).toBeGreaterThan(rule.effect(at(56)).da);

    // 중앙 집중이면 애초에 대상이 없다
    const center = withMe(baseCtx({ oppDefContribAvg: 60, oppFbRContrib: 40 }), { focus: "center" });
    expect(rule.when(center)).toBe(false);
  });

  it("wide_vs_narrow: 나=wide 상대=narrow → +0.03 / 나=narrow 상대=wide → -0.03", () => {
    const rule = findRule("wide_vs_narrow");
    const plus = withOpp(withMe(baseCtx(), { width: "wide" }), { width: "narrow" });
    expect(rule.when(plus)).toBe(true);
    expect(rule.effect(plus)).toEqual({ da: 0.03, dd: 0 });

    const minus = withOpp(withMe(baseCtx(), { width: "narrow" }), { width: "wide" });
    expect(rule.when(minus)).toBe(true);
    expect(rule.effect(minus)).toEqual({ da: -0.03, dd: 0 });
  });

  it("counter_style: attacking=1 & 상대 line=3 → deltaAttack +0.06", () => {
    const rule = findRule("counter_style");
    const ctx = withOpp(withMe(baseCtx(), { attacking: 1 }), { line: 3 });
    expect(rule.when(ctx)).toBe(true);
    expect(rule.effect(ctx)).toEqual({ da: 0.06, dd: 0 });
  });

  it("offside_trap: 느린 상대 +0.04 → 빠른 상대 -0.05로 부호가 연속적으로 뒤집힌다", () => {
    const rule = findRule("offside_trap");
    const at = (pace: number) => withMe(baseCtx({ oppAttPaceAvg: pace }), { offsideTrap: true });

    // 램프 하단(76 이하): 순이득
    expect(rule.effect(at(76)).dd).toBeCloseTo(0.04, 6);
    expect(rule.effect(at(60)).dd).toBeCloseTo(0.04, 6);
    // 램프 상단(88 이상): 순손해
    expect(rule.effect(at(88)).dd).toBeCloseTo(-0.05, 6);
    expect(rule.effect(at(99)).dd).toBeCloseTo(-0.05, 6);

    // 트랩을 안 걸면 발동하지 않는다
    expect(rule.when(withMe(baseCtx({ oppAttPaceAvg: 88 }), { offsideTrap: false }))).toBe(false);

    // 중간 지점에서 부호가 한 번만 뒤집히고, 그 전이가 매끄럽다
    const jump = Math.abs(rule.effect(at(82.1)).dd - rule.effect(at(81.9)).dd);
    expect(jump).toBeLessThan(0.005);
    expect(rule.effect(at(80)).dd).toBeGreaterThan(rule.effect(at(84)).dd);
  });

  it("man_marking_fatigue: manMark 지정 → deltaDefense +0.05", () => {
    const rule = findRule("man_marking_fatigue");
    const ctx = withMe(baseCtx(), {}, { manMark: { markerId: "kor_10", targetId: "jpn_16" } });
    expect(rule.when(ctx)).toBe(true);
    expect(rule.effect(ctx)).toEqual({ da: 0, dd: 0.05 });

    expect(rule.when(baseCtx())).toBe(false);
  });

  it("man_marking_scheme: 상대 개인기가 좋아질수록 +0.02 → -0.03으로 연속 전환", () => {
    const rule = findRule("man_marking_scheme");
    const at = (dribble: number) =>
      withMe(baseCtx({ oppAttDribblingAvg: dribble }), { marking: "man" });

    // 램프 상단(84 이상): 뚫린다
    expect(rule.effect(at(84)).dd).toBeCloseTo(-0.03, 6);
    expect(rule.textKo(at(84))).toContain("−3%");
    // 램프 하단(72 이하): 봉쇄된다
    expect(rule.effect(at(72)).dd).toBeCloseTo(0.02, 6);
    expect(rule.textKo(at(72))).toContain("+2%");

    // 전환이 매끄럽다
    const jump = Math.abs(rule.effect(at(78.1)).dd - rule.effect(at(77.9)).dd);
    expect(jump).toBeLessThan(0.005);

    // 지역방어면 이 규칙은 아예 발동하지 않는다(램프와 무관한 이산 조건)
    const zonal = withMe(baseCtx({ oppAttDribblingAvg: 82 }), { marking: "zonal" });
    expect(rule.when(zonal)).toBe(false);
  });

  it("altitude: venue.altitude>1500 & pressing=3 → deltaAttack -0.04", () => {
    const rule = findRule("altitude");
    const highAltVenue: Venue = {
      id: "test-alt",
      nameKo: "테스트",
      cityKo: "테스트",
      altitude: 2000,
      avgTempC: 20,
      dome: false,
      capacity: 1000,
    };
    const ctx = { ...withMe(baseCtx(), { pressing: 3 }), venue: highAltVenue };
    expect(rule.when(ctx)).toBe(true);
    expect(rule.effect(ctx)).toEqual({ da: -0.04, dd: 0 });
  });

  it("heat: avgTempC>=30 & !dome & pressing=3 → deltaAttack -0.03", () => {
    const rule = findRule("heat");
    const hotVenue: Venue = {
      id: "test-heat",
      nameKo: "테스트",
      cityKo: "테스트",
      altitude: 100,
      avgTempC: 33,
      dome: false,
      capacity: 1000,
    };
    const ctx = { ...withMe(baseCtx(), { pressing: 3 }), venue: hotVenue };
    expect(rule.when(ctx)).toBe(true);
    expect(rule.effect(ctx)).toEqual({ da: -0.03, dd: 0 });

    const domeVenue: Venue = { ...hotVenue, id: "test-dome", dome: true };
    const domeCtx = { ...withMe(baseCtx(), { pressing: 3 }), venue: domeVenue };
    expect(rule.when(domeCtx)).toBe(false);
  });

  it("form: 폼 1~10을 -0.03~+0.03으로 선형 사상하고, 중간 폼에서는 카드를 띄우지 않는다", () => {
    const rule = findRule("form");
    const at = (form: number) => ({
      ...baseCtx(),
      meTeam: { ...teamById("kor")!, form } as Team,
    });

    // 양 극단
    expect(rule.effect(at(10)).da).toBeCloseTo(0.03, 6);
    expect(rule.effect(at(1)).da).toBeCloseTo(-0.03, 6);
    // 중앙(5.5)에서 0
    expect(rule.effect(at(5.5)).da).toBeCloseTo(0, 6);

    // 카드는 확실히 좋다/나쁘다일 때만
    expect(rule.when(at(9))).toBe(true);
    expect(rule.when(at(2))).toBe(true);
    expect(rule.when(at(5))).toBe(false);
    expect(rule.when(at(6))).toBe(false);

    // ELO에서 파생된 폼(register.ts의 formFromElo)이 1점 움직여도 절벽이 없다
    const jump = Math.abs(rule.effect(at(8)).da - rule.effect(at(7)).da);
    expect(jump).toBeLessThan(0.008);
  });

  it("h2h_edge: 한쪽 승수가 2배 이상 & 3승 이상 → deltaAttack +0.02", () => {
    const rule = findRule("h2h_edge");
    const ctx = { ...baseCtx(), h2h: { teamA: "kor", teamB: "jpn", winA: 42, draw: 23, winB: 15 } };
    expect(rule.when(ctx)).toBe(true);
    expect(rule.effect(ctx)).toEqual({ da: 0.02, dd: 0 });

    const balanced = { ...baseCtx(), h2h: { teamA: "kor", teamB: "usa", winA: 1, draw: 2, winB: 1 } };
    expect(rule.when(balanced)).toBe(false);
  });

  it("captain_mental: 주장 mental>=85 → deltaDefense +0.02 (실제 데이터, 손흥민 mental=91)", () => {
    const rule = findRule("captain_mental");
    // kor_16 (손흥민)은 실제 데이터셋에서 mental=91로 상향되어 이 규칙을 자연스럽게
    // 발동시키는 리더 선수다 (Task 6: captain_mental이 사장된 규칙이었던 문제 수정).
    const captain = playersOf("kor").find((p) => p.id === "kor_16")!;
    expect(captain.mental).toBeGreaterThanOrEqual(85);
    const ctxHi = withMe(baseCtx(), {}, { captainId: "kor_16" });
    expect(rule.when(ctxHi)).toBe(true);
    // 램프(78~92): mental 91이면 거의 최대치, 92 이상이면 정확히 +0.02
    expect(rule.effect(ctxHi).dd).toBeGreaterThan(0.017);
    expect(rule.effect(ctxHi).dd).toBeLessThanOrEqual(0.02);

    const ironWilled: Player = { ...captain, id: "test_captain_max", mental: 95 };
    const ctxMax = withMe({ ...baseCtx(), meSquad: [...playersOf("kor"), ironWilled] }, {}, {
      captainId: "test_captain_max",
    });
    expect(rule.effect(ctxMax).dd).toBeCloseTo(0.02, 6);

    const lowSynthetic: Player = { ...captain, id: "test_captain_lo", mental: 70 };
    const ctxLo = withMe({ ...baseCtx(), meSquad: [...playersOf("kor"), lowSynthetic] }, {}, {
      captainId: "test_captain_lo",
    });
    expect(rule.when(ctxLo)).toBe(false);
  });

  it("tempo_stamina: tempo=3 → deltaAttack +0.03", () => {
    const rule = findRule("tempo_stamina");
    const ctx = withMe(baseCtx(), { tempo: 3 });
    expect(rule.when(ctx)).toBe(true);
    expect(rule.effect(ctx)).toEqual({ da: 0.03, dd: 0 });
  });
});

describe("winProbability", () => {
  it("승+무+패=1", () => {
    const kor = makeSetup("kor", "4-3-3");
    const jpn = makeSetup("jpn", "4-3-3");
    const result = winProbability(kor, jpn, "metlife");
    expect(result.win + result.draw + result.loss).toBeCloseTo(1, 5);
  });

  it("captain_mental 통합: 실제 mental>=85 주장 지정 시 winProbability.rules에 captain_mental 포함, 미지정 시 미포함", () => {
    const withCaptain = makeSetup("kor", "4-3-3", {}, { captainId: "kor_16" }); // 손흥민 mental=91
    const withoutCaptain = makeSetup("kor", "4-3-3");
    const opp = makeSetup("jpn", "4-3-3");

    const resultWith = winProbability(withCaptain, opp, "metlife");
    expect(resultWith.rules.some((r) => r.id === "captain_mental")).toBe(true);

    const resultWithout = winProbability(withoutCaptain, opp, "metlife");
    expect(resultWithout.rules.some((r) => r.id === "captain_mental")).toBe(false);
  });

  it("man_marking_scheme 통합: marking=man 지정 시 winProbability.rules에 man_marking_scheme 포함, zonal이면 미포함", () => {
    const man = makeSetup("kor", "4-3-3", { marking: "man" });
    const zonal = makeSetup("kor", "4-3-3", { marking: "zonal" });
    const opp = makeSetup("jpn", "4-3-3");

    const resultMan = winProbability(man, opp, "metlife");
    expect(resultMan.rules.some((r) => r.id === "man_marking_scheme")).toBe(true);

    const resultZonal = winProbability(zonal, opp, "metlife");
    expect(resultZonal.rules.some((r) => r.id === "man_marking_scheme")).toBe(false);
  });

  // 주의: 이 테스트는 "규칙 엔진이 개입한 상태에서의 우위"를 검증하는 것이지,
  // 브라질 스쿼드의 순수 능력치 우위(raw-quality invariant)를 검증하는 것이 아니다.
  // 아래처럼 브라질에 유리한 전술(넓은 폭, 역습, 오프사이드 트랩, 높은 템포)과
  // 미국에 불리한 전술(좁은 폭, 높은 라인)을 의도적으로 조합해 여러 보정 규칙을
  // 쌓아야 60%를 넘는다. 동일 매치업을 양 팀 모두 기본 전술(default tactics)로
  // 두면 승률은 약 55% 수준(대략 53~57% 범위)에 그친다. 팀 간 밸런스 자체를
  // 튜닝하는 작업은 별도의 몬테카를로 밸런스 태스크에서 다룬다.
  it("ELO 최상위 bra vs 최하위 팀 승률 ≥ 60% (규칙 엔진 보정 누적 시나리오)", () => {
    // 정석적인 우세 팀의 전술(넓은 폭 공격, 역습, 오프사이드 트랩, 높은 템포)을
    // 조합하면 브라질의 스쿼드/ELO 우위가 여러 보정 규칙과 함께 누적된다.
    const bra = makeSetup("bra", "4-3-3", {
      width: "wide",
      attacking: 1,
      tempo: 3,
      offsideTrap: true,
    });
    const usa = makeSetup("usa", "4-3-3", { width: "narrow", line: 3 });
    const result = winProbability(bra, usa, "metlife");
    expect(result.win).toBeGreaterThanOrEqual(0.6);
  });

  // 회귀: 세부 지시를 바꿔도 승률이 1도 안 움직이던 문제.
  // 조건부 규칙이 하나도 안 걸리는 "밋밋한" 매치업에서도 토글이 반응해야 한다.
  it("조건부 규칙이 안 걸려도 세부 지시 토글이 승률을 움직인다", () => {
    const opp = makeSetup("jpn", "4-3-3");

    // 빌드업: 롱볼(공격↑수비↓) vs 짧은 패스(공격↓수비↑)
    const direct = winProbability(makeSetup("kor", "4-3-3", { buildup: "direct" }), opp, "metlife");
    const short = winProbability(makeSetup("kor", "4-3-3", { buildup: "short" }), opp, "metlife");
    expect(direct.win).not.toBeCloseTo(short.win, 6);

    // 폭: 넓게 vs 좁게
    const wide = winProbability(makeSetup("kor", "4-3-3", { width: "wide" }), opp, "metlife");
    const narrow = winProbability(makeSetup("kor", "4-3-3", { width: "narrow" }), opp, "metlife");
    expect(wide.win).not.toBeCloseTo(narrow.win, 6);

    // 공격 방향: 중앙 vs 측면
    const center = winProbability(makeSetup("kor", "4-3-3", { focus: "center" }), opp, "metlife");
    const left = winProbability(makeSetup("kor", "4-3-3", { focus: "left" }), opp, "metlife");
    expect(center.win).not.toBeCloseTo(left.win, 6);
  });

  it("고지대(azteca)에서 pressing=3 팀의 λ가 평지 대비 감소", () => {
    const me = makeSetup("kor", "4-3-3", { pressing: 3 });
    const opp = makeSetup("jpn", "4-3-3");
    const azteca = computeLambdas(me, opp, "azteca");
    const flat = computeLambdas(me, opp, "metlife");
    expect(azteca.lambdaMe).toBeLessThan(flat.lambdaMe);
  });

  it("직접 빌드업+타겟맨이 숏패스+포처보다 규칙 direct_targetman을 발동", () => {
    const direct = makeSetup("kor", "4-3-3", { buildup: "direct" });
    direct.roles["st"] = "st_target";
    const short = makeSetup("kor", "4-3-3", { buildup: "short" });
    short.roles["st"] = "st_poacher";
    const opp = makeSetup("jpn", "4-3-3");

    const rDirect = computeLambdas(direct, opp, "metlife").rulesMe;
    const rShort = computeLambdas(short, opp, "metlife").rulesMe;

    expect(rDirect.some((r) => r.id === "direct_targetman")).toBe(true);
    expect(rShort.some((r) => r.id === "direct_targetman")).toBe(false);
  });

  it("보정 포화: 델타를 아무리 쌓아도 상한을 넘지 않는다", () => {
    // 작은 합에서는 종전 곱셈과 거의 같고, 큰 합에서는 눌린다.
    expect(saturate(0)).toBeCloseTo(1, 10);
    expect(saturate(0.05)).toBeCloseTo(1.05, 3); // 단일 보정은 사실상 그대로
    expect(saturate(0.1)).toBeGreaterThan(1.09);
    expect(saturate(0.1)).toBeLessThan(1.1);

    // 극단 중첩은 포화한다
    expect(saturate(0.6)).toBeLessThan(1.4);
    expect(saturate(2.0)).toBeLessThan(1.46);
    expect(saturate(100)).toBeLessThan(1.46);

    // 음수 쪽도 대칭으로 눌린다(0 이하로 내려가 λ 부호가 뒤집히지 않는다)
    expect(saturate(-100)).toBeGreaterThan(0.54);
    expect(saturate(-0.05)).toBeCloseTo(0.95, 3);

    // 단조 증가
    expect(saturate(0.3)).toBeGreaterThan(saturate(0.2));
  });

  it("보정 포화: 모든 매치업에서 attackMult/defenseMult가 합리적 범위에 머문다", () => {
    // recommend()가 23,328개 조합에서 최대 중첩을 찾아내도록 만들어져 있으므로,
    // 극단 설정을 물려도 배수가 폭주하지 않아야 한다.
    const me = makeSetup("kor", "4-3-3", {
      line: 3,
      tempo: 3,
      pressing: 3,
      attacking: 1,
      buildup: "direct",
      possession: 3,
      transitionSpeed: 3,
      lineSpacing: 3,
      width: "wide",
      focus: "left",
      marking: "man",
      offsideTrap: true,
    });
    const opp = makeSetup("bra", "4-3-3", { line: 3, pressing: 3, width: "narrow" });
    const venue = venueById("metlife")!;
    const meTeam = teamById("kor")!;
    const oppTeam = teamById("bra")!;
    const mod = applyModifiers(me, opp, venue, meTeam, oppTeam);
    expect(mod.attackMult).toBeLessThan(1.46);
    expect(mod.attackMult).toBeGreaterThan(0.54);
    expect(mod.defenseMult).toBeLessThan(1.46);
    expect(mod.defenseMult).toBeGreaterThan(0.54);
  });

  it("수적 열세: 10인이 되면 내 λ는 내려가고 상대 λ는 올라간다", () => {
    const me = makeSetup("kor", "4-3-3");
    const opp = makeSetup("jpn", "4-3-3");
    const even = computeLambdas(me, opp, "metlife");

    // 센터백 1명 퇴장(가장 방어적인 위치를 골라, 공격 라인 손실이 아닌 순수
    // 수적 열세 효과만 남긴다).
    const lineup = { ...me.lineup };
    delete lineup["cb1"];
    const short = computeLambdas({ ...me, lineup }, opp, "metlife");

    expect(short.lambdaMe).toBeLessThan(even.lambdaMe);
    expect(short.lambdaOpp).toBeGreaterThan(even.lambdaOpp);
  });

  it("수적 열세: 공격수 퇴장이 수비수 퇴장보다 내 λ를 더 깎는다", () => {
    const me = makeSetup("kor", "4-3-3");
    const opp = makeSetup("jpn", "4-3-3");
    const loseCb = { ...me.lineup };
    delete loseCb["cb1"];
    const loseSt = { ...me.lineup };
    delete loseSt["st"];

    const withoutCb = computeLambdas({ ...me, lineup: loseCb }, opp, "metlife");
    const withoutSt = computeLambdas({ ...me, lineup: loseSt }, opp, "metlife");

    expect(withoutSt.lambdaMe).toBeLessThan(withoutCb.lambdaMe);
  });

  it("모든 AppliedRule의 textKo는 비어있지 않고 delta는 ±0.15 이내", () => {
    const matchups: [string, string, string][] = [
      ["kor", "jpn", "metlife"],
      ["bra", "usa", "azteca"],
      ["esp", "por", "monterrey"],
      ["ger", "fra", "dallas"],
    ];
    for (const [a, b, venueId] of matchups) {
      const me = makeSetup(a, "4-3-3", { line: 3, tempo: 3, pressing: 3, offsideTrap: true });
      const opp = makeSetup(b, "4-3-3", { pressing: 3 });
      const { rulesMe, rulesOpp } = computeLambdas(me, opp, venueId);
      for (const r of [...rulesMe, ...rulesOpp]) {
        expect(r.textKo.length).toBeGreaterThan(0);
        expect(Math.abs(r.deltaAttack)).toBeLessThanOrEqual(0.15);
        expect(Math.abs(r.deltaDefense)).toBeLessThanOrEqual(0.15);
      }
    }
  });
});

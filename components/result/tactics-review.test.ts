import { describe, expect, it } from "vitest";
import type { MatchEvent, MatchState } from "@/lib/engine/match";
import type { AppliedRule, ModifierResult } from "@/lib/engine/modifiers";
import { buildTacticsReview, buildScoutingRetro } from "./tactics-review";
import type { OppScouting } from "@/lib/wc2026/scouting";

const rule = (id: string, da: number, dd = 0): AppliedRule => ({
  id,
  textKo: `rule-${id}`,
  deltaAttack: da,
  deltaDefense: dd,
  iconKey: "bolt",
});

const mod = (rules: AppliedRule[], flags: Partial<ModifierResult["staminaFlags"]> = {}): ModifierResult => ({
  rules,
  attackMult: 1,
  defenseMult: 1,
  staminaFlags: { altitude: false, heat: false, highTempo: false, highPress: false, ...flags },
});

const ev = (type: MatchEvent["type"], side: "me" | "opp" = "me"): MatchEvent => ({
  minute: 10,
  type,
  side,
  textKo: type,
});

const matchOf = (over: Partial<MatchState>): MatchState =>
  ({ events: [], scoreMe: 0, scoreOpp: 0, ...over }) as MatchState;

describe("buildTacticsReview", () => {
  it("내 규칙을 종합효과 부호로 통함/발목으로 나누고 효과 크기순 정렬한다", () => {
    const review = buildTacticsReview(
      matchOf({}),
      mod([rule("plus_small", 0.02), rule("minus", -0.05), rule("plus_big", 0.08), rule("zero", 0)]),
      mod([])
    );
    expect(review.worked.map((r) => r.id)).toEqual(["plus_big", "plus_small"]);
    expect(review.hurt.map((r) => r.id)).toEqual(["minus"]);
  });

  // 회귀: 스쿼드 적합도가 중립에 가까우면 효과가 ±0.3%p로 떨어지는데, 그걸 감점으로
  // 분류하면 "이 스쿼드에는 무난합니다"가 빨간 "발목 잡은 부분" 카드에 실렸다.
  it("±0.5%p 미만의 미미한 효과는 통함/발목 어느 쪽으로도 분류하지 않는다", () => {
    const review = buildTacticsReview(
      matchOf({}),
      mod([rule("tiny_plus", 0.003), rule("tiny_minus", -0.003), rule("real_plus", 0.04)]),
      mod([])
    );
    expect(review.worked.map((r) => r.id)).toEqual(["real_plus"]);
    expect(review.hurt).toEqual([]);
  });

  // 회귀: 졌는데 "전술 감점 요인은 없었어요"만 뜨던 문제.
  // 내 감점이 없어도 상대 우위를 꺼내 왜 졌는지 설명해야 한다.
  describe("oppEdge — 내 감점이 없는데 이기지 못한 경우", () => {
    it("패배 시 상대의 우위 규칙을 효과 크기순으로 최대 3개 노출한다", () => {
      const review = buildTacticsReview(
        matchOf({ scoreMe: 0, scoreOpp: 2 }),
        mod([rule("my_plus", 0.03)]),
        mod([rule("o1", 0.02), rule("o2", 0.09), rule("o3", 0.05), rule("o4", 0.01), rule("o_neg", -0.04)])
      );
      expect(review.hurt).toEqual([]);
      expect(review.oppEdge.map((r) => r.id)).toEqual(["o2", "o3", "o1"]);
    });

    it("무승부도 '이기지 못한' 것으로 보고 상대 우위를 낸다", () => {
      const review = buildTacticsReview(
        matchOf({ scoreMe: 1, scoreOpp: 1 }),
        mod([]),
        mod([rule("o1", 0.05)])
      );
      expect(review.oppEdge.map((r) => r.id)).toEqual(["o1"]);
    });

    it("이겼으면 상대 우위를 꺼내지 않는다", () => {
      const review = buildTacticsReview(
        matchOf({ scoreMe: 3, scoreOpp: 1 }),
        mod([]),
        mod([rule("o1", 0.05)])
      );
      expect(review.oppEdge).toEqual([]);
    });

    // 회귀: 양 팀이 같은 기본 세팅이면 같은 규칙이 양쪽에 발동해, "통한 전술"과
    // "상대가 앞선 부분"에 똑같은 문구가 나란히 실렸다. 내가 이미 가진 강점은
    // 상대의 우위가 아니다.
    it("내가 이미 가진 강점은 상대 우위에서 제외한다", () => {
      const shared = rule("shared_plus", 0.04);
      const review = buildTacticsReview(
        matchOf({ scoreMe: 0, scoreOpp: 1 }),
        mod([shared]),
        mod([rule("shared_plus", 0.04), rule("opp_only", 0.03)])
      );
      expect(review.worked.map((r) => r.id)).toEqual(["shared_plus"]);
      expect(review.oppEdge.map((r) => r.id)).toEqual(["opp_only"]);
    });

    it("내 감점이 있으면 그쪽이 우선이라 상대 우위는 비운다", () => {
      const review = buildTacticsReview(
        matchOf({ scoreMe: 0, scoreOpp: 1 }),
        mod([rule("my_minus", -0.06)]),
        mod([rule("o1", 0.05)])
      );
      expect(review.hurt.map((r) => r.id)).toEqual(["my_minus"]);
      expect(review.oppEdge).toEqual([]);
    });
  });

  it("위기 2회 이상이면 라인/역할 조정 팁이 나온다", () => {
    const review = buildTacticsReview(
      matchOf({ events: [ev("crisis"), ev("crisis")] }),
      mod([]),
      mod([])
    );
    expect(review.tips.some((t) => t.includes("위기"))).toBe(true);
  });

  it("슛 열세면 기회 생산 팁, 2실점 이상이면 상대 강점 억제 팁이 나온다", () => {
    const review = buildTacticsReview(
      matchOf({
        scoreOpp: 2,
        events: [ev("shot", "me"), ev("shot", "opp"), ev("shot", "opp"), ev("shot", "opp")],
      }),
      mod([]),
      mod([rule("opp_strength", 0.07)])
    );
    expect(review.tips.some((t) => t.includes("슛 1:3"))).toBe(true);
    expect(review.tips.some((t) => t.includes("rule-opp_strength"))).toBe(true);
  });

  it("폭염+고압박이면 체력 관리 팁이 나온다", () => {
    const review = buildTacticsReview(matchOf({}), mod([], { heat: true, highPress: true }), mod([]));
    expect(review.tips.some((t) => t.includes("폭염"))).toBe(true);
  });

  // 상한은 4에서 6으로 올렸다("전술 평가가 너무 부족하다"는 지적). 그 이상은 리포트가
  // 아니라 목록이 되어 오히려 안 읽히므로 상한 자체는 유지한다.
  it("근거가 없으면 유지 코멘트 1개, 팁은 최대 6개", () => {
    const clean = buildTacticsReview(matchOf({ scoreMe: 2, scoreOpp: 0 }), mod([]), mod([]));
    expect(clean.tips).toHaveLength(1);

    const busy = buildTacticsReview(
      matchOf({
        scoreOpp: 3,
        events: [ev("crisis"), ev("crisis"), ev("shot", "opp"), ev("shot", "opp")],
      }),
      mod([rule("bad", -0.06)], { heat: true, highTempo: true }),
      mod([rule("opp_top", 0.05)])
    );
    expect(busy.tips.length).toBeLessThanOrEqual(6);
    expect(busy.tips.length).toBeGreaterThanOrEqual(2);
  });

  // 회귀: 규칙 발동만 보면 "전술은 문제없었는데 왜 졌는지"가 비었다.
  // 실제 기록(결정력·수비 노출)과 개입 효과를 함께 읽어야 리포트가 된다.
  describe("경기 지표 기반 진단", () => {
    it("유효슈팅을 많이 만들고 못 넣으면 결정력을 지적한다", () => {
      const events = [
        ...Array.from({ length: 5 }, () => ev("save", "me")),
        ev("goal", "me"),
      ];
      const review = buildTacticsReview(
        matchOf({ scoreMe: 1, scoreOpp: 2, events }),
        mod([]),
        mod([])
      );
      expect(review.tips.some((t) => t.includes("마무리"))).toBe(true);
    });

    it("상대 유효슈팅을 많이 허용하면 수비를 지적한다", () => {
      const events = Array.from({ length: 6 }, () => ev("save", "opp"));
      const review = buildTacticsReview(
        matchOf({ scoreMe: 0, scoreOpp: 2, events }),
        mod([]),
        mod([])
      );
      expect(review.tips.some((t) => t.includes("유효슈팅을"))).toBe(true);
    });

    it("졌는데 개입이 한 번도 없으면 개입을 권한다", () => {
      const review = buildTacticsReview(
        matchOf({ scoreMe: 0, scoreOpp: 1, interventions: [] }),
        mod([]),
        mod([])
      );
      expect(review.tips.some((t) => t.includes("작전 변경"))).toBe(true);
    });
  });
});

// ── 스카우팅 대조 ────────────────────────────────────────────────────────────

const goalAt = (minute: number, side: "me" | "opp"): MatchEvent => ({
  minute,
  type: "goal",
  side,
  textKo: "goal",
});

const scoutWith = (traits: OppScouting["traits"]): OppScouting =>
  ({ nameKo: "상대팀", traits, counters: [] }) as unknown as OppScouting;

const trait = (id: string, tone: OppScouting["traits"][number]["tone"] = "threat") => ({
  id,
  labelKo: id,
  evidenceKo: `근거-${id}`,
  tone,
});

describe("buildScoutingRetro (경기 전 분석 vs 실제 결과)", () => {
  it("스카우팅이 없으면 빈 배열 (free 모드 등)", () => {
    expect(buildScoutingRetro(matchOf({}), undefined)).toEqual([]);
  });

  it("성향 태그가 없으면 대조할 것도 없다", () => {
    expect(buildScoutingRetro(matchOf({}), scoutWith([]))).toEqual([]);
  });

  it("막판 취약 상대에게 막판 득점하면 살린 것으로 잡고 분까지 인용한다", () => {
    const [line] = buildScoutingRetro(
      matchOf({ events: [goalAt(82, "me")], scoreMe: 1 }),
      scoutWith([trait("late_collapse", "weakness")])
    );
    expect(line.favorable).toBe(true);
    expect(line.textKo).toContain("82분");
  });

  it("막판 취약 상대인데 막판 득점이 없으면 놓친 것으로 잡는다", () => {
    // 60분 득점은 막판(75분+)이 아니다.
    const [line] = buildScoutingRetro(
      matchOf({ events: [goalAt(60, "me")], scoreMe: 1 }),
      scoutWith([trait("late_collapse", "weakness")])
    );
    expect(line.favorable).toBe(false);
  });

  it("화력형 경고가 적중하면(2실점 이상) 우리에게 불리한 것으로 잡는다", () => {
    const [line] = buildScoutingRetro(
      matchOf({ scoreOpp: 3 }),
      scoutWith([trait("firepower")])
    );
    expect(line.favorable).toBe(false);
    expect(line.textKo).toContain("3실점");
  });

  it("화력형 상대를 묶으면 유리한 것으로 잡는다", () => {
    const [line] = buildScoutingRetro(matchOf({ scoreOpp: 1 }), scoutWith([trait("firepower")]));
    expect(line.favorable).toBe(true);
  });

  it("후반 강세 경고: 후반 실점 여부로 갈린다 (전반 실점은 해당 없음)", () => {
    const firstHalfOnly = buildScoutingRetro(
      matchOf({ events: [goalAt(20, "opp")], scoreOpp: 1 }),
      scoutWith([trait("second_half")])
    );
    expect(firstHalfOnly[0].favorable).toBe(true);

    const secondHalf = buildScoutingRetro(
      matchOf({ events: [goalAt(70, "opp")], scoreOpp: 1 }),
      scoutWith([trait("second_half")])
    );
    expect(secondHalf[0].favorable).toBe(false);
  });

  it("수비 불안 상대는 다득점했을 때만 살린 것으로 잡는다", () => {
    expect(
      buildScoutingRetro(matchOf({ scoreMe: 2 }), scoutWith([trait("leaky", "weakness")]))[0]
        .favorable
    ).toBe(true);
    expect(
      buildScoutingRetro(matchOf({ scoreMe: 1 }), scoutWith([trait("leaky", "weakness")]))[0]
        .favorable
    ).toBe(false);
  });

  it("수비 불안과 저실점 조직이 동시에 잡히면 모순이므로 한 줄만 낸다", () => {
    const lines = buildScoutingRetro(
      matchOf({ scoreMe: 2 }),
      scoutWith([trait("leaky", "weakness"), trait("solid")])
    );
    expect(lines.map((l) => l.id)).toEqual(["leaky"]);
  });

  it("단단한 상대의 골문을 열면 살린 것으로 잡는다", () => {
    expect(buildScoutingRetro(matchOf({ scoreMe: 1 }), scoutWith([trait("solid")]))[0].favorable).toBe(true);
    expect(buildScoutingRetro(matchOf({ scoreMe: 0 }), scoutWith([trait("solid")]))[0].favorable).toBe(false);
  });

  it("최대 4줄까지만 낸다 (리포트지 목록이 아니다)", () => {
    const lines = buildScoutingRetro(
      matchOf({ events: [goalAt(80, "me"), goalAt(70, "opp")], scoreMe: 2, scoreOpp: 2 }),
      scoutWith([
        trait("late_collapse", "weakness"),
        trait("firepower"),
        trait("second_half"),
        trait("leaky", "weakness"),
        trait("solid"),
      ])
    );
    expect(lines.length).toBeLessThanOrEqual(4);
  });

  it("모든 줄에 실측 근거가 인용된다", () => {
    const lines = buildScoutingRetro(
      matchOf({ events: [goalAt(80, "me")], scoreMe: 1, scoreOpp: 2 }),
      scoutWith([trait("late_collapse", "weakness"), trait("firepower")])
    );
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l.textKo).toContain("근거-");
  });

  it("buildTacticsReview가 스카우팅을 받으면 리뷰에 함께 실린다", () => {
    const review = buildTacticsReview(
      matchOf({ scoreOpp: 2 }),
      mod([]),
      mod([]),
      scoutWith([trait("firepower")])
    );
    expect(review.scoutingRetro).toHaveLength(1);
    // 스카우팅을 안 넘기면 빈 배열 (기존 호출부 호환).
    expect(buildTacticsReview(matchOf({}), mod([]), mod([])).scoutingRetro).toEqual([]);
  });
});

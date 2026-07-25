import { describe, it, expect } from "vitest";
import {
  matchStats,
  interventionImpacts,
  IMPACT_WINDOW_MIN,
  recentMomentum,
  teamStaminaPct,
  MOMENTUM_WINDOW_MIN,
} from "./match-stats";
import type { MatchEvent, Intervention } from "./match";

const ev = (type: MatchEvent["type"], side: "me" | "opp", minute = 10): MatchEvent => ({
  minute,
  type,
  side,
  textKo: type,
});

describe("matchStats", () => {
  it("이벤트 사슬에서 슈팅·유효슈팅·코너를 정확히 센다", () => {
    const s = matchStats({
      events: [
        ev("chance", "me"),
        ev("shot", "me"),
        ev("goal", "me"),
        ev("chance", "me"),
        ev("shot", "me"),
        ev("save", "me"),
        ev("chance", "me"),
        ev("shot", "me"),
        ev("corner", "me"),
        ev("chance", "opp"),
      ],
    });
    expect(s.me.shots).toBe(3);
    // 유효슈팅 = 골 + 선방. 코너로 흘러간 슈팅은 골문 안쪽이 아니다.
    expect(s.me.onTarget).toBe(2);
    expect(s.me.goals).toBe(1);
    expect(s.me.corners).toBe(1);
    expect(s.me.chances).toBe(3);
  });

  it("결정력은 유효슈팅 대비 득점이고, 유효슈팅이 없으면 null이다", () => {
    const scored = matchStats({ events: [ev("goal", "me"), ev("save", "me")] });
    expect(scored.me.conversion).toBeCloseTo(0.5, 6);

    const none = matchStats({ events: [ev("chance", "me")] });
    expect(none.me.conversion).toBeNull();
  });

  it("양 팀 이벤트가 섞여도 side로 분리된다", () => {
    const s = matchStats({ events: [ev("goal", "me"), ev("goal", "opp"), ev("goal", "opp")] });
    expect(s.me.goals).toBe(1);
    expect(s.opp.goals).toBe(2);
  });

  it("공격 점유는 찬스 생성 비중이고, 둘 다 0이면 50으로 둔다", () => {
    const lopsided = matchStats({
      events: [ev("chance", "me"), ev("chance", "me"), ev("chance", "me"), ev("chance", "opp")],
    });
    expect(lopsided.attackShareMe).toBe(75);

    const empty = matchStats({ events: [] });
    expect(empty.attackShareMe).toBe(50);
    expect(empty.totalChances).toBe(0);
  });

  it("점유율은 누적값/분으로 계산하고, 누적 필드가 없으면 50%로 폴백한다", () => {
    // 30분 중 me가 합계 18(평균 0.6) -> 60%
    const withPoss = matchStats({ events: [], possMeAccum: 18, possMinutes: 30 });
    expect(withPoss.possessionMe).toBe(60);

    // 옛 상태(누적 필드 없음)는 폴백.
    const legacy = matchStats({ events: [] });
    expect(legacy.possessionMe).toBe(50);
  });
});

describe("interventionImpacts", () => {
  const timeline = [
    { minute: 0, win: 0.4 },
    { minute: 20, win: 0.42 },
    { minute: 30, win: 0.5 },
    { minute: 40, win: 0.58 },
    { minute: 60, win: 0.3 },
  ];
  const iv = (minute: number): Intervention => ({ minute }) as Intervention;

  it("개입 직전과 관찰 구간 뒤의 승률 차이를 낸다", () => {
    const [impact] = interventionImpacts([iv(30)], timeline);
    expect(impact.minute).toBe(30);
    expect(impact.before).toBe(50);
    // 30 + 10 = 40분 시점
    expect(impact.after).toBe(58);
    expect(impact.deltaPct).toBe(8);
  });

  it("악화된 개입도 그대로 음수로 보고한다", () => {
    const [impact] = interventionImpacts([iv(55)], timeline);
    expect(impact.deltaPct).toBeLessThan(0);
  });

  it("타임라인이 비면 아무것도 내지 않는다", () => {
    expect(interventionImpacts([iv(30)], [])).toEqual([]);
  });

  it("관찰 구간이 경기 끝을 넘어가면 마지막 값을 쓴다", () => {
    const [impact] = interventionImpacts([iv(88)], timeline);
    expect(impact.after).toBe(30);
    expect(IMPACT_WINDOW_MIN).toBe(10);
  });
});

describe("recentMomentum (최근 흐름)", () => {
  it("구간 밖 이벤트는 무시한다", () => {
    // 60분 기준 창은 (50, 60]. 40분의 폭격은 흐름에 들어오면 안 된다.
    const events = [
      ev("goal", "me", 40),
      ev("shot", "me", 40),
      ev("shot", "opp", 55),
    ];
    const m = recentMomentum(events, 60);
    expect(m.fromMinute).toBe(60 - MOMENTUM_WINDOW_MIN);
    expect(m.meShare).toBe(0); // 구간 안에는 상대 슈팅만 있다
  });

  it("현재 분보다 미래의 이벤트는 세지 않는다", () => {
    const m = recentMomentum([ev("goal", "me", 70)], 60);
    expect(m.totalWeight).toBe(0);
  });

  it("조용한 구간은 50%(대등)으로 본다 — 0/0이 100%로 튀지 않는다", () => {
    const m = recentMomentum([], 60);
    expect(m.meShare).toBe(50);
    expect(m.totalWeight).toBe(0);
  });

  it("골이 슈팅보다 무겁게 반영된다", () => {
    // 우리 골 1 vs 상대 슈팅 2 -> 가중치 5 vs 4 이므로 우리가 앞선다.
    const m = recentMomentum([ev("goal", "me", 58), ev("shot", "opp", 58), ev("shot", "opp", 59)], 60);
    expect(m.meShare).toBeGreaterThan(50);
  });

  it("한쪽이 독점하면 100/0으로 간다", () => {
    const m = recentMomentum([ev("shot", "opp", 58), ev("chance", "opp", 59)], 60);
    expect(m.meShare).toBe(0);
  });

  it("득점과 무관한 이벤트(휘슬 등)는 흐름에 영향이 없다", () => {
    const withCard = recentMomentum([ev("shot", "me", 58), ev("card", "opp", 59)], 60);
    const without = recentMomentum([ev("shot", "me", 58)], 60);
    expect(withCard.meShare).toBe(without.meShare);
    expect(withCard.totalWeight).toBe(without.totalWeight);
  });

  it("창 크기를 넓히면 더 오래된 장면까지 들어온다", () => {
    const events = [ev("goal", "me", 30), ev("shot", "opp", 58)];
    expect(recentMomentum(events, 60, 10).meShare).toBe(0);
    expect(recentMomentum(events, 60, 40).meShare).toBeGreaterThan(50);
  });
});

describe("teamStaminaPct (선발 평균 체력)", () => {
  it("배치된 선수만 평균에 넣는다 (벤치가 평균을 올리지 않는다)", () => {
    const lineup = { gk: "a", cb_1: "b" };
    const stamina = { a: 0.5, b: 0.7, bench1: 1.0 };
    expect(teamStaminaPct(lineup, stamina)).toBe(60);
  });

  it("빈 슬롯(퇴장 등)은 건너뛴다", () => {
    const lineup = { gk: "a", cb_1: undefined, cb_2: "b" };
    const stamina = { a: 0.4, b: 0.6 };
    expect(teamStaminaPct(lineup, stamina)).toBe(50);
  });

  it("체력 기록이 없는 선수는 만땅으로 본다", () => {
    expect(teamStaminaPct({ gk: "a" }, {})).toBe(100);
  });

  it("아무도 없으면 100", () => {
    expect(teamStaminaPct({}, {})).toBe(100);
  });
});

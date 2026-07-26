import { describe, it, expect } from "vitest";
import {
  matchStats,
  interventionImpacts,
  IMPACT_WINDOW_MIN,
  recentMomentum,
  teamStaminaPct,
  MOMENTUM_WINDOW_MIN,
  playerRatings,
  manOfTheMatch,
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

describe("playerRatings (C)", () => {
  const evP = (
    type: MatchEvent["type"],
    side: "me" | "opp",
    playerId: string,
    minute = 10
  ): MatchEvent => ({ minute, type, side, playerId, textKo: type });

  it("골은 가점, 경고는 감점, 퇴장은 큰 감점", () => {
    const rows = playerRatings([
      evP("goal", "me", "scorer"),
      evP("card", "me", "fouler"),
      evP("card", "me", "fouler", 20),
      evP("red", "me", "fouler", 30),
    ]);
    const scorer = rows.find((r) => r.playerId === "scorer")!;
    const fouler = rows.find((r) => r.playerId === "fouler")!;
    expect(scorer.rating).toBeGreaterThan(6.0);
    expect(scorer.goals).toBe(1);
    expect(fouler.rating).toBeLessThan(6.0);
    expect(fouler.cards).toBe(2);
    expect(fouler.sentOff).toBe(true);
  });

  it("평점은 4.0~10.0으로 제한된다", () => {
    const manyGoals = playerRatings(
      Array.from({ length: 20 }, (_, i) => evP("goal", "me", "machine", i + 1))
    )[0];
    expect(manyGoals.rating).toBeLessThanOrEqual(10.0);

    const manyReds = playerRatings(
      Array.from({ length: 10 }, (_, i) => evP("red", "me", "villain", i + 1))
    )[0];
    expect(manyReds.rating).toBeGreaterThanOrEqual(4.0);
  });

  it("평점 내림차순으로 정렬된다", () => {
    const rows = playerRatings([
      evP("chance", "me", "quiet"),
      evP("goal", "me", "star"),
      evP("shot", "me", "busy"),
      evP("shot", "me", "busy", 20),
    ]);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].rating).toBeGreaterThanOrEqual(rows[i].rating);
    }
    expect(rows[0].playerId).toBe("star");
  });

  it("playerId 없는 이벤트와 평점에 관여하지 않는 이벤트는 무시한다", () => {
    const rows = playerRatings([
      ev("kickoff", "me"),
      ev("halftime", "me"),
      ev("opp_tactic", "opp"),
      evP("goal", "me", "scorer"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].playerId).toBe("scorer");
  });

  it("양 팀 선수가 같은 id여도 팀별로 분리 집계된다", () => {
    const rows = playerRatings([evP("goal", "me", "x"), evP("card", "opp", "x")]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.side === "me")!.rating).toBeGreaterThan(6);
    expect(rows.find((r) => r.side === "opp")!.rating).toBeLessThan(6);
  });

  it("manOfTheMatch는 해당 팀 최고 평점을 준다", () => {
    const events = [
      evP("goal", "me", "hero"),
      evP("shot", "me", "other"),
      evP("goal", "opp", "villain"),
    ];
    expect(manOfTheMatch(events, "me")!.playerId).toBe("hero");
    expect(manOfTheMatch(events, "opp")!.playerId).toBe("villain");
    expect(manOfTheMatch([], "me")).toBeUndefined();
  });
});

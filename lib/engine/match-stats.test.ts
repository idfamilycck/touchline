import { describe, it, expect } from "vitest";
import { matchStats, interventionImpacts, IMPACT_WINDOW_MIN } from "./match-stats";
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

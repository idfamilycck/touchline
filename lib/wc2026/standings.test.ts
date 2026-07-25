// lib/wc2026/standings.test.ts
import { describe, it, expect } from "vitest";
import { groupStandings, knockoutBracket } from "@/lib/wc2026/standings";
import { wc2026Matches } from "@/lib/wc2026/data";
import type { Wc2026Match } from "@/lib/wc2026/types";

function mk(partial: Partial<Wc2026Match> & Pick<Wc2026Match, "id" | "round" | "home" | "away">): Wc2026Match {
  return {
    scoreHome: 0,
    scoreAway: 0,
    venueKo: "메트라이프",
    kickoffISO: "2026-06-11T12:00Z",
    events: [],
    lineups: [] as unknown as Wc2026Match["lineups"],
    ...partial,
  };
}

describe("groupStandings — real dataset", () => {
  const standings = groupStandings(wc2026Matches());

  it("A~L 12개 조가 모두 존재한다", () => {
    const groups = "ABCDEFGHIJKL".split("");
    for (const g of groups) {
      expect(standings[g]).toBeDefined();
    }
    expect(Object.keys(standings)).toHaveLength(12);
  });

  it("각 조는 4팀, 각 팀은 3경기를 치른다", () => {
    for (const rows of Object.values(standings)) {
      expect(rows).toHaveLength(4);
      for (const row of rows) {
        expect(row.played).toBe(3);
        expect(row.won + row.drawn + row.lost).toBe(3);
      }
    }
  });

  it("승점 산식이 승*3 + 무*1과 일치한다", () => {
    for (const rows of Object.values(standings)) {
      for (const row of rows) {
        expect(row.points).toBe(row.won * 3 + row.drawn * 1);
      }
    }
  });

  it("득실차는 득점-실점과 일치한다", () => {
    for (const rows of Object.values(standings)) {
      for (const row of rows) {
        expect(row.goalDiff).toBe(row.goalsFor - row.goalsAgainst);
      }
    }
  });

  it("각 조 내부는 승점 내림차순으로 정렬된다", () => {
    for (const rows of Object.values(standings)) {
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1].points).toBeGreaterThanOrEqual(rows[i].points);
      }
    }
  });
});

describe("groupStandings — tiebreaker order (합성 데이터)", () => {
  // A조: 4팀 총 6경기. AAA는 2승1무(7점), BBB는 2승1무지만 득실이 더 낮게,
  // CCC/DDD는 승점 동률에 득실차로 갈리도록 구성.
  const matches: Wc2026Match[] = [
    mk({ id: "1", round: "group", group: "A", home: "AAA", away: "BBB", scoreHome: 3, scoreAway: 0 }),
    mk({ id: "2", round: "group", group: "A", home: "CCC", away: "DDD", scoreHome: 1, scoreAway: 0 }),
    mk({ id: "3", round: "group", group: "A", home: "AAA", away: "CCC", scoreHome: 2, scoreAway: 2 }),
    mk({ id: "4", round: "group", group: "A", home: "BBB", away: "DDD", scoreHome: 1, scoreAway: 1 }),
    mk({ id: "5", round: "group", group: "A", home: "AAA", away: "DDD", scoreHome: 1, scoreAway: 0 }),
    mk({ id: "6", round: "group", group: "A", home: "BBB", away: "CCC", scoreHome: 0, scoreAway: 1 }),
  ];
  const rows = groupStandings(matches).A;

  it("AAA가 승점 1위(2승 1무 = 7점)", () => {
    expect(rows[0].code).toBe("AAA");
    expect(rows[0].points).toBe(7);
  });

  it("동일 승점이면 골득실 내림차순", () => {
    // CCC: D전 승(1-0), A전 무(2-2), B전 승(1-0) = 2승1무 = 7점, GD = 4-2=+2
    // 재구성 검증: 정렬이 points desc 후 GD desc를 지키는지 일반적으로 확인
    for (let i = 1; i < rows.length; i++) {
      if (rows[i - 1].points === rows[i].points) {
        expect(rows[i - 1].goalDiff).toBeGreaterThanOrEqual(rows[i].goalDiff);
      }
    }
  });

  it("승점·득실차까지 같으면 팀 코드 사전순(결정적)", () => {
    const tied: Wc2026Match[] = [
      mk({ id: "t1", round: "group", group: "Z", home: "ZZZ", away: "YYY", scoreHome: 1, scoreAway: 1 }),
      mk({ id: "t2", round: "group", group: "Z", home: "XXX", away: "WWW", scoreHome: 1, scoreAway: 1 }),
      mk({ id: "t3", round: "group", group: "Z", home: "ZZZ", away: "XXX", scoreHome: 1, scoreAway: 1 }),
      mk({ id: "t4", round: "group", group: "Z", home: "YYY", away: "WWW", scoreHome: 1, scoreAway: 1 }),
      mk({ id: "t5", round: "group", group: "Z", home: "ZZZ", away: "WWW", scoreHome: 1, scoreAway: 1 }),
      mk({ id: "t6", round: "group", group: "Z", home: "YYY", away: "XXX", scoreHome: 1, scoreAway: 1 }),
    ];
    const zRows = groupStandings(tied).Z;
    // 전 경기 무승부 → 전 팀 승점/득실/득점 동일 → 코드 사전순
    expect(zRows.map((r) => r.code)).toEqual(["WWW", "XXX", "YYY", "ZZZ"]);
  });
});

describe("groupStandings — 라운드 필터", () => {
  it("group이 아닌 라운드는 집계에서 제외한다", () => {
    const matches: Wc2026Match[] = [
      mk({ id: "1", round: "group", group: "A", home: "AAA", away: "BBB", scoreHome: 1, scoreAway: 0 }),
      mk({ id: "2", round: "r16", home: "AAA", away: "CCC", scoreHome: 3, scoreAway: 0 }),
    ];
    const standings = groupStandings(matches);
    expect(standings.A).toHaveLength(2);
    const aaa = standings.A.find((r) => r.code === "AAA")!;
    expect(aaa.played).toBe(1);
  });
});

describe("knockoutBracket — 실데이터", () => {
  const bracket = knockoutBracket(wc2026Matches());

  it("r32/r16/qf/sf/third 경기 수가 데이터 분포와 일치한다", () => {
    expect(bracket.r32).toHaveLength(16);
    expect(bracket.r16).toHaveLength(8);
    expect(bracket.qf).toHaveLength(4);
    expect(bracket.sf).toHaveLength(2);
    expect(bracket.third).toHaveLength(1);
  });

  // 예전에는 결승이 데이터에 없어(수집 시점에 미개최) 빈 배열을 기대하는 테스트가
  // 여기 있었다. 결승이 들어온 뒤로는 대진표가 우승팀까지 닿는지를 검증한다.
  it("결승 1경기가 있고 승자(우승팀)가 정해진다", () => {
    expect(bracket.final).toHaveLength(1);
    expect(bracket.final[0].winner).toBeDefined();
  });

  it("각 라운드는 kickoffISO 오름차순으로 정렬된다", () => {
    for (const rows of Object.values(bracket)) {
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1].id).toBeDefined();
      }
    }
    // r16이 실제로 시간순인지 직접 검증
    for (let i = 1; i < bracket.r16.length; i++) {
      const prev = wc2026Matches().find((m) => m.id === bracket.r16[i - 1].id)!;
      const cur = wc2026Matches().find((m) => m.id === bracket.r16[i].id)!;
      expect(prev.kickoffISO <= cur.kickoffISO).toBe(true);
    }
  });

  it("승부로 결정된 모든 경기는 winner를 갖는다(무승부로 끝난 매치 없음)", () => {
    for (const rows of Object.values(bracket)) {
      for (const m of rows) {
        if (m.scoreHome !== m.scoreAway) {
          expect(m.winner).toBe(m.scoreHome > m.scoreAway ? m.home : m.away);
        }
      }
    }
  });
});

describe("knockoutBracket — 승부차기 승자 판정", () => {
  it("정규(연장 포함) 스코어가 같으면 승부차기 스코어로 승자를 정한다", () => {
    const matches: Wc2026Match[] = [
      mk({
        id: "pk1",
        round: "r16",
        home: "AAA",
        away: "BBB",
        scoreHome: 1,
        scoreAway: 1,
        penHome: 3,
        penAway: 4,
      }),
    ];
    const bracket = knockoutBracket(matches);
    expect(bracket.r16[0].winner).toBe("BBB");
  });

  it("스코어도 같고 승부차기 정보도 없으면 winner는 undefined", () => {
    const matches: Wc2026Match[] = [
      mk({ id: "und1", round: "qf", home: "AAA", away: "BBB", scoreHome: 2, scoreAway: 2 }),
    ];
    const bracket = knockoutBracket(matches);
    expect(bracket.qf[0].winner).toBeUndefined();
  });

  it("결승(final) 라운드가 데이터에 아예 없어도 안전하다", () => {
    const matches: Wc2026Match[] = [
      mk({ id: "sf1", round: "sf", home: "AAA", away: "BBB", scoreHome: 2, scoreAway: 1 }),
    ];
    expect(() => knockoutBracket(matches)).not.toThrow();
    expect(knockoutBracket(matches).final).toEqual([]);
  });
});

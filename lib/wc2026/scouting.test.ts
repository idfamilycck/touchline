import { describe, it, expect } from "vitest";
import { wc2026Matches } from "@/lib/wc2026/source";
import {
  scoutTeam,
  shapeFromStarters,
  codeOfTeamId,
  wcEloOf,
  LATE_MINUTE,
  EARLY_MINUTE,
} from "@/lib/wc2026/scouting";
import teamsJson from "@/data/wc2026/teams.json";

const CODES = (teamsJson as Array<{ code: string }>).map((t) => t.code);

// 스카우팅이 "실제 기록"이라고 주장하려면 원본 JSON을 독립적으로 다시 집계해도 같은
// 수가 나와야 한다. 아래 재집계는 scouting.ts의 코드를 재사용하지 않고 손으로 다시
// 센다 — 구현이 바뀌어 수치가 흔들리면 여기서 잡힌다.
function recount(code: string) {
  let played = 0, gf = 0, ga = 0, wins = 0, draws = 0, losses = 0, cleanSheets = 0;
  for (const m of wc2026Matches()) {
    const home = m.home === code;
    const away = m.away === code;
    if (!home && !away) continue;
    played += 1;
    const own = home ? m.scoreHome : m.scoreAway;
    const against = home ? m.scoreAway : m.scoreHome;
    gf += own;
    ga += against;
    if (against === 0) cleanSheets += 1;
    if (own > against) wins += 1;
    else if (own < against) losses += 1;
    else draws += 1;
  }
  return { played, gf, ga, wins, draws, losses, cleanSheets };
}

describe("scoutTeam (실제 WC2026 기록 집계)", () => {
  it("48개국 전부 리포트가 나오고, 모두 실제로 경기를 치렀다", () => {
    for (const code of CODES) {
      const s = scoutTeam(code);
      expect(s, code).toBeDefined();
      expect(s!.played, code).toBeGreaterThan(0);
    }
  });

  it("승무패·득실·무실점 집계가 원본 JSON 재집계와 일치한다", () => {
    for (const code of CODES) {
      const s = scoutTeam(code)!;
      const r = recount(code);
      expect({ code, ...r }).toEqual({
        code,
        played: s.played,
        gf: s.gf,
        ga: s.ga,
        wins: s.wins,
        draws: s.draws,
        losses: s.losses,
        cleanSheets: s.cleanSheets,
      });
      expect(s.wins + s.draws + s.losses, code).toBe(s.played);
    }
  });

  it("골 시간대 분해의 합이 총 득실과 맞는다", () => {
    for (const code of CODES) {
      const s = scoutTeam(code)!;
      expect(s.goalsFirstHalf + s.goalsSecondHalf, `${code} 득점 분해`).toBe(s.gf);
      expect(s.concededFirstHalf + s.concededSecondHalf, `${code} 실점 분해`).toBe(s.ga);
      // 막판/초반은 부분집합이므로 전체를 넘지 않는다.
      expect(s.lateGoals).toBeLessThanOrEqual(s.gf);
      expect(s.lateConceded).toBeLessThanOrEqual(s.ga);
      expect(s.earlyConceded).toBeLessThanOrEqual(s.ga);
      // 막판(75분+)은 정의상 후반 구간에 포함된다.
      expect(s.lateGoals).toBeLessThanOrEqual(s.goalsSecondHalf);
      expect(s.lateConceded).toBeLessThanOrEqual(s.concededSecondHalf);
      // 초반(15분 이내)은 전반 구간에 포함된다.
      expect(s.earlyConceded).toBeLessThanOrEqual(s.concededFirstHalf);
    }
  });

  it("대회 전체 득점 합 == 실점 합 (자책골 귀속이 맞아야 성립)", () => {
    let gf = 0;
    let ga = 0;
    for (const code of CODES) {
      const s = scoutTeam(code)!;
      gf += s.gf;
      ga += s.ga;
    }
    expect(gf).toBe(ga);
  });

  it("모든 팀에 대응책이 최소 1개 나온다 (빈 화면 없음)", () => {
    for (const code of CODES) {
      const s = scoutTeam(code)!;
      expect(s.counters.length, code).toBeGreaterThan(0);
      // 대응책 문장은 근거 수치를 인용하므로 충분히 길다.
      for (const c of s.counters) {
        expect(c.headlineKo.length, `${code}/${c.id}`).toBeGreaterThan(3);
        expect(c.reasonKo.length, `${code}/${c.id}`).toBeGreaterThan(10);
      }
    }
  });

  it("성향 태그에는 항상 근거 수치가 붙는다", () => {
    for (const code of CODES) {
      for (const t of scoutTeam(code)!.traits) {
        expect(t.evidenceKo, `${code}/${t.id}`).toMatch(/\d/);
      }
    }
  });

  it("대부분의 팀이 최소 1개의 성향 태그를 갖는다 (임계값이 무의미하지 않다)", () => {
    const tagged = CODES.filter((c) => scoutTeam(c)!.traits.length > 0).length;
    expect(tagged).toBeGreaterThanOrEqual(Math.floor(CODES.length * 0.8));
  });

  it("myElo를 주면 전력 격차가 우리 기준으로 계산된다", () => {
    const braElo = wcEloOf("BRA")!;
    const strongOpp = scoutTeam("BRA", { myElo: braElo - 300 })!;
    expect(strongOpp.eloDiff).toBe(300);
    expect(strongOpp.traits.find((t) => t.id === "elo")?.labelKo).toBe("전력 우위");

    const weakOpp = scoutTeam("BRA", { myElo: braElo + 300 })!;
    expect(weakOpp.eloDiff).toBe(-300);
    expect(weakOpp.traits.find((t) => t.id === "elo")?.labelKo).toBe("전력 열세");
  });

  it("matchId를 주면 그 경기 실제 선발 기준 포메이션이 나온다", () => {
    const m = wc2026Matches()[0];
    const s = scoutTeam(m.home, { matchId: m.id })!;
    expect(s.shapeKo).toMatch(/^\d(-\d){2,3}$/);
    expect(s.shapeFromOpponent).toBe(m.away);
    // 포메이션 숫자의 합은 필드 플레이어 수(보통 10).
    const sum = s.shapeKo!.split("-").reduce((a, b) => a + Number(b), 0);
    expect(sum).toBeGreaterThanOrEqual(9);
    expect(sum).toBeLessThanOrEqual(10);
  });

  it("실제 대회 전 경기에서 양 팀 포메이션이 역산된다", () => {
    for (const m of wc2026Matches()) {
      for (const lineup of m.lineups) {
        const shape = shapeFromStarters(lineup.starters.map((s) => s.position));
        expect(shape, `${m.id}/${lineup.teamCode}`).toBeDefined();
      }
    }
  });

  it("teamId와 코드 둘 다 받는다", () => {
    expect(codeOfTeamId("wc_kor")).toBe("KOR");
    expect(codeOfTeamId("KOR")).toBe("KOR");
    expect(scoutTeam("wc_kor")!.teamCode).toBe("KOR");
    expect(scoutTeam("wc_kor")).toEqual(scoutTeam("KOR"));
  });

  it("대회에 없는 팀은 undefined", () => {
    expect(scoutTeam("ZZZ")).toBeUndefined();
    expect(scoutTeam("")).toBeUndefined();
  });

  it("레거시 팀 id(소문자 3글자)는 같은 나라의 실제 기록으로 해석된다", () => {
    // lib/data/teams.ts의 옛 16개국 id("kor","bra")는 대문자로 올리면 WC 코드와
    // 같으므로 그대로 그 나라의 실제 대회 기록을 가리킨다 — 오히려 바람직한 폴백이다.
    expect(scoutTeam("kor")).toEqual(scoutTeam("KOR"));
    expect(scoutTeam("bra")).toEqual(scoutTeam("BRA"));
  });

  it("결정론적이다 (같은 입력 -> 같은 결과)", () => {
    expect(scoutTeam("ARG", { myElo: 1800, matchId: wc2026Matches()[0].id })).toEqual(
      scoutTeam("ARG", { myElo: 1800, matchId: wc2026Matches()[0].id })
    );
  });

  it("구간 경계 상수가 축구 상식과 맞는다", () => {
    expect(LATE_MINUTE).toBeGreaterThan(45);
    expect(EARLY_MINUTE).toBeLessThan(45);
  });
});

describe("shapeFromStarters", () => {
  it("4-2-3-1: 홀딩 2 + 공미 3", () => {
    expect(
      shapeFromStarters(["G", "CD-L", "CD-R", "LB", "RB", "DM", "DM", "AM-L", "AM", "AM-R", "F"])
    ).toBe("4-2-3-1");
  });

  it("4-4-2: 홀딩/공미 없이 중원 4", () => {
    expect(
      shapeFromStarters(["G", "CD-L", "CD-R", "LB", "RB", "LM", "CM-L", "CM-R", "RM", "F", "F"])
    ).toBe("4-4-2");
  });

  it("4-1-4-1: 홀딩 1 + 중원 4", () => {
    expect(
      shapeFromStarters(["G", "CD-L", "CD-R", "LB", "RB", "DM", "CM-L", "CM-R", "LM", "RM", "F"])
    ).toBe("4-1-4-1");
  });

  it("3-5-2: 스리백", () => {
    expect(
      shapeFromStarters(["G", "CD-L", "CD", "CD-R", "LM", "CM-L", "CM", "CM-R", "RM", "F", "F"])
    ).toBe("3-5-2");
  });

  it("퇴장으로 필드 플레이어가 9명이어도 표기한다", () => {
    expect(
      shapeFromStarters(["G", "CD-L", "CD-R", "LB", "RB", "CM-L", "CM-R", "LM", "F", "F"])
    ).toBe("4-3-2");
  });

  it("인원이 너무 적으면 표기하지 않는다", () => {
    expect(shapeFromStarters(["G", "CD-L", "CD-R"])).toBeUndefined();
  });
});

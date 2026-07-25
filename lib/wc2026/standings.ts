// lib/wc2026/standings.ts
//
// Pure computation over the WC2026 dataset: group-stage standings tables and
// the knockout bracket. No React, no I/O — everything is derived at render
// time from wc2026Matches() (see /tournament), matching the "do not
// pre-materialize a tournament table" constraint in data/wc2026/*.json.

import type { Wc2026Match, Wc2026Round } from "@/lib/wc2026/types";

export interface GroupRow {
  code: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

const KNOCKOUT_ROUNDS: Wc2026Round[] = ["r32", "r16", "qf", "sf", "third", "final"];

// 조별리그 순위표: A~L 각 조를 승점 → 골득실 → 다득점 → 팀 코드(사전순)로 정렬한다.
// 이 정렬 규칙은 결정적이라 동순위가 나와도 매 렌더에 같은 결과를 낸다(실제 FIFA
// 타이브레이커인 승자승/페어플레이는 이 데이터셋으로는 계산할 수 없어 제외).
export function groupStandings(matches: Wc2026Match[]): Record<string, GroupRow[]> {
  const byGroup = new Map<string, Map<string, GroupRow>>();

  function rowFor(group: string, code: string): GroupRow {
    let bucket = byGroup.get(group);
    if (!bucket) {
      bucket = new Map();
      byGroup.set(group, bucket);
    }
    let row = bucket.get(code);
    if (!row) {
      row = {
        code,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        points: 0,
      };
      bucket.set(code, row);
    }
    return row;
  }

  for (const m of matches) {
    if (m.round !== "group" || !m.group) continue;

    const home = rowFor(m.group, m.home);
    const away = rowFor(m.group, m.away);

    home.played += 1;
    away.played += 1;
    home.goalsFor += m.scoreHome;
    home.goalsAgainst += m.scoreAway;
    away.goalsFor += m.scoreAway;
    away.goalsAgainst += m.scoreHome;

    if (m.scoreHome > m.scoreAway) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (m.scoreHome < m.scoreAway) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  const result: Record<string, GroupRow[]> = {};
  for (const [group, bucket] of byGroup) {
    const rows = [...bucket.values()];
    for (const row of rows) {
      row.goalDiff = row.goalsFor - row.goalsAgainst;
    }
    rows.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
    });
    result[group] = rows;
  }
  return result;
}

export interface BracketMatch {
  id: string;
  round: Wc2026Round;
  home: string;
  away: string;
  scoreHome: number;
  scoreAway: number;
  penHome?: number;
  penAway?: number;
  winner?: string;
}

function decideWinner(m: Wc2026Match): string | undefined {
  if (m.scoreHome > m.scoreAway) return m.home;
  if (m.scoreAway > m.scoreHome) return m.away;
  if (m.penHome !== undefined && m.penAway !== undefined) {
    if (m.penHome > m.penAway) return m.home;
    if (m.penAway > m.penHome) return m.away;
  }
  return undefined;
}

// 토너먼트 대진표: r32/r16/qf/sf/third/final을 각각 kickoffISO 오름차순으로 묶는다.
// 데이터에 없는 라운드는 빈 배열로 채워, 호출부가 매
// 라운드 키를 항상 안전하게 인덱싱할 수 있게 한다(throw 없음).
export function knockoutBracket(matches: Wc2026Match[]): Record<Wc2026Round, BracketMatch[]> {
  const result = {
    group: [],
    r32: [],
    r16: [],
    qf: [],
    sf: [],
    third: [],
    final: [],
  } as Record<Wc2026Round, BracketMatch[]>;

  const byRound = new Map<Wc2026Round, Wc2026Match[]>();
  for (const m of matches) {
    if (!KNOCKOUT_ROUNDS.includes(m.round)) continue;
    let bucket = byRound.get(m.round);
    if (!bucket) {
      bucket = [];
      byRound.set(m.round, bucket);
    }
    bucket.push(m);
  }

  for (const round of KNOCKOUT_ROUNDS) {
    const bucket = byRound.get(round) ?? [];
    const sorted = [...bucket].sort((a, b) =>
      a.kickoffISO < b.kickoffISO ? -1 : a.kickoffISO > b.kickoffISO ? 1 : 0,
    );
    result[round] = sorted.map((m) => ({
      id: m.id,
      round: m.round,
      home: m.home,
      away: m.away,
      scoreHome: m.scoreHome,
      scoreAway: m.scoreAway,
      penHome: m.penHome,
      penAway: m.penAway,
      winner: decideWinner(m),
    }));
  }

  return result;
}

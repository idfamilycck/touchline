#!/usr/bin/env node
// scripts/build-wc2026.mjs
//
// Transforms raw ESPN summary JSON (data/wc2026/raw/summary-*.json, produced by
// scripts/ingest-wc2026.mjs) into the clean Wc2026Match[] schema defined in
// lib/wc2026/types.ts, written to data/wc2026/matches.json.
//
// Field mapping notes (verified against real raw files — see
// .superpowers/sdd/task-A2-brief.md and task-A2-report.md for details):
//   - round: derived from header.season.name ("2026 FIFA World Cup, <Round>")
//   - group: header.competitions[0].groups.id (1..12) -> letter A..L
//       (ESPN's `groups.name` is inconsistently "Group 1".."Group 6" for the
//       first six groups but "Group G".."Group L" for the last six — the
//       numeric `id` is consistent across all 12, so we map id -> letter
//       ourselves instead of trusting the name/abbreviation strings.)
//   - team codes: header.competitions[0].competitors[].team.abbreviation
//   - score: competitors[].score (regulation+ET, excludes shootout)
//   - shootout: competitors[].shootoutScore (present only on STATUS_FINAL_PEN)
//   - venue: gameInfo.venue.fullName (header.competitions[0].venue is always
//       absent in this dataset)
//   - events: keyEvents[], filtered to goal/own-goal/penalty-scored/
//       substitution/yellow-card/red-card/var-red-card-upgrade; minute from
//       clock.displayValue via parseInt (folds "90'+3'" -> 90)
//   - lineups: rosters[].roster[], split by `starter` boolean
//
// Matches with status.type.completed === false (e.g. a Final that hasn't
// kicked off yet) are skipped entirely — they have no score/events to parse.
//
// Usage: node scripts/build-wc2026.mjs

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, "..", "data", "wc2026", "raw");
const OUT_PATH = path.join(__dirname, "..", "data", "wc2026", "matches.json");
const TEAMS_OUT_PATH = path.join(__dirname, "..", "data", "wc2026", "teams.json");

const ROUND_MAP = [
  [/group stage/i, "group"],
  [/round of 32/i, "r32"],
  [/round of 16/i, "r16"],
  [/quarterfinal/i, "qf"],
  [/semifinal/i, "sf"],
  [/3rd.?place|third.?place/i, "third"],
  [/final/i, "final"], // must come after "semifinal"/"quarterfinal" checks
];

// keyEvents[].type.type -> Wc2026Event.type. Anything not listed here is
// skipped (kickoff/halftime/delays/period markers/missed or saved penalties/
// shootout kicks are not part of the schema).
const EVENT_TYPE_MAP = {
  goal: "goal",
  "goal---header": "goal",
  "goal---free-kick": "goal",
  "goal---volley": "goal",
  "goal---penalty": "pen_goal",
  "own-goal": "own_goal",
  "penalty---scored": "pen_goal",
  substitution: "sub",
  "yellow-card": "yellow",
  "red-card": "red",
  "var---red-card-upgrade": "red",
};

// --- Team finish round ----------------------------------------------------
// A team's "finish round" is the deepest round it is seen playing in across
// matches.json, laddering from group stage (weakest) upward.
//
// "champion"은 라운드가 아니라 결과다. 결승전이 데이터에 들어오기 전까지는 두
// 결승 진출팀을 구분할 방법이 없어 둘 다 "final"에 두고 준우승/우승을 뭉뚱그렸는데,
// 결승 결과가 수집된 뒤로는 승자를 champion으로 올린다. 결승이 아직 없는 데이터로
// 다시 돌려도 동작하도록(승자 없음 -> 승격 없음) 방어적으로 짠다.
const ROUND_ORDER = ["group", "r32", "r16", "qf", "sf", "third", "final", "champion"];

// 팀 ELO는 "실제 국제 축구 랭킹(경기 전, 2026 결과와 무관)"에서 온다.
// 과거에는 finishRound(대회에서 얼마나 깊이 갔는가)로 ELO를 역산했는데, 그러면
// "결과로 만든 ELO로 결과를 예측"하는 순환이 되어 재현율 검증이 무의미해졌다.
// (또한 48팀이 6개 값에 뭉쳐 독일=남아공처럼 구분 불가였다.) eloratings.net/FIFA
// 랭킹 ~2025 기준의 독립적 사전 전력으로 교체 — 검증이 진짜 예측이 되고, 실측상
// 재현율도 오히려 오른다(lib/engine/validation.test.ts).
// eloratings.net/2026_World_Cup 실측값(2026-07-25 수집, World Football Elo Ratings).
// 코드 매핑은 eloratings 2자리(예: ES/AR/EN/SQ) -> 우리 3자리로 변환했다.
const REAL_ELO = {
  ALG: 1756, ARG: 2173, AUS: 1795, AUT: 1821, BEL: 1948, BIH: 1605, BRA: 1993,
  CAN: 1729, CIV: 1727, COD: 1704, COL: 2003, CPV: 1619, CRO: 1882, CUW: 1438,
  CZE: 1680, ECU: 1871, EGY: 1742, ENG: 2125, ESP: 2259, FRA: 2070, GER: 1908,
  GHA: 1570, HAI: 1517, IRN: 1764, IRQ: 1561, JOR: 1628, JPN: 1888, KOR: 1723,
  KSA: 1596, MAR: 1901, MEX: 1913, NED: 1971, NOR: 1951, NZL: 1534, PAN: 1658,
  PAR: 1814, POR: 1995, QAT: 1411, RSA: 1559, SCO: 1745, SEN: 1816, SUI: 1928,
  SWE: 1731, TUN: 1562, TUR: 1852, URU: 1841, USA: 1747, UZB: 1631,
};
const ELO_FALLBACK = 1600; // 표에 없는 코드(데이터 이상)용 중위값

function eloForCode(code) {
  return REAL_ELO[code] ?? ELO_FALLBACK;
}

// Nice-to-have Korean names for the 48 nations seen in this dataset; falls
// back to the raw 3-letter code for anything not listed here.
const TEAM_NAME_KO = {
  ALG: "알제리", ARG: "아르헨티나", AUS: "호주", AUT: "오스트리아", BEL: "벨기에",
  BIH: "보스니아 헤르체고비나", BRA: "브라질", CAN: "캐나다", CIV: "코트디부아르",
  COD: "콩고민주공화국", COL: "콜롬비아", CPV: "카보베르데", CRO: "크로아티아",
  CUW: "퀴라소", CZE: "체코", ECU: "에콰도르", EGY: "이집트", ENG: "잉글랜드",
  ESP: "스페인", FRA: "프랑스", GER: "독일", GHA: "가나", HAI: "아이티",
  IRN: "이란", IRQ: "이라크", JOR: "요르단", JPN: "일본", KOR: "대한민국",
  KSA: "사우디아라비아", MAR: "모로코", MEX: "멕시코", NED: "네덜란드",
  NOR: "노르웨이", NZL: "뉴질랜드", PAN: "파나마", PAR: "파라과이",
  POR: "포르투갈", QAT: "카타르", RSA: "남아프리카공화국", SCO: "스코틀랜드",
  SEN: "세네갈", SUI: "스위스", SWE: "스웨덴", TUN: "튀니지", TUR: "튀르키예",
  URU: "우루과이", USA: "미국", UZB: "우즈베키스탄",
};

function matchWinner(m) {
  if (m.scoreHome !== m.scoreAway) return m.scoreHome > m.scoreAway ? m.home : m.away;
  if (typeof m.penHome === "number" && typeof m.penAway === "number") {
    return m.penHome > m.penAway ? m.home : m.away;
  }
  return null; // draw with no shootout recorded (shouldn't happen in knockouts)
}

function buildTeams(matches) {
  const bestRoundIdx = new Map(); // teamCode -> deepest ROUND_ORDER index reached

  for (const m of matches) {
    const idx = ROUND_ORDER.indexOf(m.round);
    if (idx < 0) continue;
    for (const code of [m.home, m.away]) {
      const prev = bestRoundIdx.get(code) ?? -1;
      if (idx > prev) bestRoundIdx.set(code, idx);
    }
  }

  // 결승 진출: 4강 승자 둘은 결승을 치렀으므로 "final" 등급으로 올린다.
  // (결승 경기 자체가 데이터에 있으면 위 루프에서 이미 올라가지만, 결승이 아직
  //  수집되지 않은 데이터로 돌릴 때를 위해 남겨둔다.)
  const finalIdx = ROUND_ORDER.indexOf("final");
  for (const m of matches) {
    if (m.round !== "sf") continue;
    const winner = matchWinner(m);
    if (!winner) continue;
    const prev = bestRoundIdx.get(winner) ?? -1;
    if (finalIdx > prev) bestRoundIdx.set(winner, finalIdx);
  }

  // 우승: 결승 승자만 champion. 결승이 데이터에 없으면 아무도 승격되지 않아
  // 예전과 동일하게 두 결승 진출팀이 "final"로 남는다.
  const championIdx = ROUND_ORDER.indexOf("champion");
  for (const m of matches) {
    if (m.round !== "final") continue;
    const winner = matchWinner(m);
    if (!winner) continue;
    bestRoundIdx.set(winner, championIdx);
  }

  const teams = [...bestRoundIdx.entries()]
    .map(([code, idx]) => ({
      code,
      id: `wc_${code.toLowerCase()}`,
      nameKo: TEAM_NAME_KO[code] ?? code,
      elo: eloForCode(code),
      finishRound: ROUND_ORDER[idx],
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return teams;
}

function resolveRound(seasonName) {
  const name = seasonName ?? "";
  for (const [re, code] of ROUND_MAP) {
    if (re.test(name)) return code;
  }
  return null;
}

function groupIdToLetter(groupId) {
  const n = Number(groupId);
  if (!Number.isInteger(n) || n < 1 || n > 12) return undefined;
  return String.fromCharCode(64 + n); // 1 -> A ... 12 -> L
}

function parseMinute(displayValue) {
  if (!displayValue) return NaN;
  const m = /^(\d+)/.exec(displayValue);
  return m ? Number(m[1]) : NaN;
}

function buildTeamCodeMap(competitors) {
  const map = new Map();
  for (const c of competitors) {
    map.set(String(c.team.id), c.team.abbreviation);
  }
  return map;
}

function buildEvents(keyEvents, teamCodeMap) {
  const events = [];
  for (const e of keyEvents ?? []) {
    if (e.shootout) continue; // shootout kicks aren't match events in this schema
    const mappedType = EVENT_TYPE_MAP[e.type?.type];
    if (!mappedType) continue;

    const minute = parseMinute(e.clock?.displayValue);
    if (Number.isNaN(minute)) continue;

    const teamId = e.team?.id != null ? String(e.team.id) : undefined;
    let teamCode = teamId ? teamCodeMap.get(teamId) : undefined;
    if (!teamCode) continue;

    // ESPN's `team` field on an own-goal event names the BENEFICIARY team
    // (the team credited with the goal in the running score), not the team
    // whose player put it into their own net. E.g. "Own Goal by Aymen
    // Hussein, Iraq. Iraq 1, Norway 4." has team.id === Norway even though
    // Hussein plays for Iraq. Our schema stores own_goal.teamCode as the
    // OFFENDING team (the team that conceded into their own net) so it can
    // be credited to the opponent uniformly elsewhere (see integrity gate).
    // Flip it here — always exactly two teams per match.
    if (mappedType === "own_goal") {
      const other = [...teamCodeMap.values()].find((c) => c !== teamCode);
      if (other) teamCode = other;
    }

    const participants = e.participants ?? [];
    const primary = participants[0]?.athlete;
    if (!primary?.id || !primary?.displayName) continue;

    const event = {
      minute,
      type: mappedType,
      teamCode,
      playerId: String(primary.id),
      playerName: primary.displayName,
    };

    if (mappedType === "sub") {
      const out = participants[1]?.athlete;
      if (out?.id) event.relatedPlayerId = String(out.id);
    }

    events.push(event);
  }
  // Stable sort preserves original (ESPN chronological) ordering for ties,
  // e.g. multiple stoppage-time events folded to the same minute.
  events.sort((a, b) => a.minute - b.minute);
  return events;
}

function buildLineups(rosters) {
  if (!Array.isArray(rosters) || rosters.length !== 2) return null;

  const byHomeAway = { home: null, away: null };
  for (const r of rosters) {
    const teamCode = r.team?.abbreviation;
    if (!teamCode) return null;

    const starters = [];
    const bench = [];
    for (const p of r.roster ?? []) {
      if (!p.athlete?.id || !p.athlete?.displayName) continue;
      const entry = {
        playerId: String(p.athlete.id),
        name: p.athlete.displayName,
        position: p.position?.abbreviation ?? p.position?.displayName ?? "",
      };
      if (p.starter) starters.push(entry);
      else bench.push(entry);
    }

    byHomeAway[r.homeAway] = { teamCode, starters, bench };
  }

  if (!byHomeAway.home || !byHomeAway.away) return null;
  return [byHomeAway.home, byHomeAway.away];
}

function buildMatch(raw, fileName) {
  const header = raw.header;
  const comp = header?.competitions?.[0];
  if (!comp) return { skip: `${fileName}: missing header.competitions[0]` };

  if (comp.status?.type?.completed !== true) {
    return { skip: `${fileName}: match not completed (${comp.status?.type?.name ?? "unknown status"})` };
  }

  const round = resolveRound(header?.season?.name);
  if (!round) return { skip: `${fileName}: unrecognized round name "${header?.season?.name}"` };

  const competitors = comp.competitors ?? [];
  if (competitors.length !== 2) return { skip: `${fileName}: expected 2 competitors, got ${competitors.length}` };

  const homeComp = competitors.find((c) => c.homeAway === "home");
  const awayComp = competitors.find((c) => c.homeAway === "away");
  if (!homeComp || !awayComp) return { skip: `${fileName}: missing home/away competitor` };

  const home = homeComp.team?.abbreviation;
  const away = awayComp.team?.abbreviation;
  if (!/^[A-Z]{3}$/.test(home ?? "") || !/^[A-Z]{3}$/.test(away ?? "")) {
    return { skip: `${fileName}: bad team codes home="${home}" away="${away}"` };
  }

  const scoreHome = Number(homeComp.score);
  const scoreAway = Number(awayComp.score);
  if (Number.isNaN(scoreHome) || Number.isNaN(scoreAway)) {
    return { skip: `${fileName}: unparseable score` };
  }

  const teamCodeMap = buildTeamCodeMap(competitors);
  const events = buildEvents(raw.keyEvents, teamCodeMap);

  const lineups = buildLineups(raw.rosters);
  if (!lineups) return { skip: `${fileName}: missing/malformed rosters` };

  const match = {
    id: String(header.id ?? comp.id ?? fileName),
    round,
    home,
    away,
    scoreHome,
    scoreAway,
    venueKo: raw.gameInfo?.venue?.fullName ?? "미정",
    kickoffISO: comp.date ?? "",
    events,
    lineups,
  };

  if (round === "group" && comp.groups?.id != null) {
    const letter = groupIdToLetter(comp.groups.id);
    if (letter) match.group = letter;
  }

  const hasShootout = comp.status?.type?.name === "STATUS_FINAL_PEN";
  if (hasShootout) {
    const penHome = homeComp.shootoutScore;
    const penAway = awayComp.shootoutScore;
    if (typeof penHome === "number" && typeof penAway === "number") {
      match.penHome = penHome;
      match.penAway = penAway;
    }
  }

  return { match };
}

// --- Integrity gate (Task A3) --------------------------------------------
// Same checks as lib/wc2026/integrity.test.ts, run here so bad matches can
// be marked `excluded: true` at build time rather than merely reported by
// the test suite. Each check is a pure predicate over a built Wc2026Match.

function checkGoalTally(m) {
  const goalsHome = m.events.filter(
    (e) => (e.type === "goal" || e.type === "pen_goal") && e.teamCode === m.home
  ).length;
  const ownForHome = m.events.filter(
    (e) => e.type === "own_goal" && e.teamCode === m.away
  ).length;
  return goalsHome + ownForHome === m.scoreHome;
}

function checkSubCounts(m) {
  return [m.home, m.away].every((code) => {
    const subs = m.events.filter((e) => e.type === "sub" && e.teamCode === code).length;
    return subs <= 6;
  });
}

function checkStarterCounts(m) {
  return m.lineups.every((lu) => lu.starters.length === 11);
}

function checkRedCardFollowup(m) {
  const reds = m.events.filter((e) => e.type === "red");
  return reds.every((r) => {
    const later = m.events.filter(
      (e) => e.minute > r.minute && e.playerId === r.playerId && e.type !== "red"
    );
    return later.length === 0;
  });
}

const INTEGRITY_CHECKS = [checkGoalTally, checkSubCounts, checkStarterCounts, checkRedCardFollowup];

function isIntegrityValid(match) {
  return INTEGRITY_CHECKS.every((check) => check(match));
}

async function main() {
  const files = (await readdir(RAW_DIR)).filter((f) => f.startsWith("summary-") && f.endsWith(".json"));

  const matches = [];
  const skipped = [];

  for (const fileName of files.sort()) {
    const raw = JSON.parse(await readFile(path.join(RAW_DIR, fileName), "utf-8"));
    const { match, skip } = buildMatch(raw, fileName);
    if (skip) {
      skipped.push(skip);
      continue;
    }
    matches.push(match);
  }

  matches.sort((a, b) => a.kickoffISO.localeCompare(b.kickoffISO));

  const excludedIds = [];
  for (const m of matches) {
    if (!isIntegrityValid(m)) {
      m.excluded = true;
      excludedIds.push(m.id);
    }
  }

  await writeFile(OUT_PATH, JSON.stringify(matches, null, 2) + "\n", "utf-8");

  console.log(`wrote ${matches.length} matches`);
  if (skipped.length > 0) {
    console.log(`skipped ${skipped.length} file(s):`);
    for (const s of skipped) console.log(`  - ${s}`);
  }
  console.log(`excluded ${excludedIds.length} matches: [${excludedIds.join(", ")}]`);

  // Team ELO is fully derived from how deep each team got (Task A4). Player
  // attributes are NOT stored here — lineups keep only id/name/position, and
  // lib/wc2026/players.ts#makeVirtualPlayer generates deterministic stats at
  // runtime from (id, teamId, name, position, teamElo).
  const teams = buildTeams(matches);
  await writeFile(TEAMS_OUT_PATH, JSON.stringify(teams, null, 2) + "\n", "utf-8");
  console.log(`wrote ${teams.length} teams`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});

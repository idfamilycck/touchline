// 상대팀 실제 선수명단 + 포메이션 배치.
//
// 스카우팅 리포트(lib/wc2026/scouting.ts)는 상대가 "어떤 팀인가"를 수치로 말한다.
// 이 모듈은 그 다음 질문 — "그래서 누가 어디에 서는가" — 에 답한다. 전부 실제
// 데이터다: data/wc2026/matches.json의 그 경기 실제 선발 11명과 교체 명단이며,
// 좌표는 ESPN 포지션 라벨(G / CD-L / DM / AM-R / LF …)에서 역산한다.
//
// 선수 능력치는 여기서 다루지 않는다. WC2026 선수의 능력치는 합성값이라
// (lib/wc2026/players.ts) "실제 선수 정보"로 제시하면 거짓이 된다. 이 화면은
// 이름·포지션·배치까지만 — 전부 실측인 것만 — 보여준다.

import { wc2026Matches, wc2026MatchById } from "@/lib/wc2026/source";
import { bandOf, codeOfTeamId, shapeFromStarters } from "@/lib/wc2026/scouting";
import type { Wc2026Match, Wc2026Round } from "@/lib/wc2026/types";

export type LineupBand = ReturnType<typeof bandOf>;

export interface LineupSlot {
  playerId: string;
  name: string;
  /** 원본 포지션 라벨(G, CD-L, AM-R …). */
  position: string;
  band: LineupBand;
  /** 0(왼쪽 터치라인) ~ 100(오른쪽). */
  x: number;
  /** 0(자기 골문) ~ 100(상대 골문). */
  y: number;
}

export interface OppLineup {
  teamCode: string;
  /** "4-2-3-1" 등. 인원이 모자라 판정 불가면 undefined. */
  shapeKo?: string;
  starters: LineupSlot[];
  bench: Array<{ playerId: string; name: string; position: string }>;
  /** 이 명단을 가져온 실제 경기. */
  matchId: string;
  vsCode: string;
  round: Wc2026Round;
  kickoffISO: string;
  scoreFor: number;
  scoreAgainst: number;
}

// ── 좌표 ──────────────────────────────────────────────────────────────────────

/** 밴드별 세로 위치(0=자기 골문). 실제 축구 대형의 간격감에 맞춘 값. */
const BAND_Y: Record<LineupBand, number> = {
  gk: 7,
  def: 26,
  dm: 43,
  mid: 57,
  am: 73,
  att: 88,
};

/** 밴드를 후방->전방 순으로 정렬할 때 쓰는 순서. */
const BAND_ORDER: LineupBand[] = ["gk", "def", "dm", "mid", "am", "att"];

/**
 * 포지션 라벨의 가로 순위. -2(왼쪽 측면) / -1(중앙 왼쪽) / 0(중앙) / +1 / +2.
 *
 * ESPN 라벨은 두 가지 방식을 섞어 쓰는데, 둘은 폭이 다르다:
 *   · 접두사(LB, RM, LF) = 진짜 측면 자원 -> 가장 넓게 (±2)
 *   · 접미사(CD-L, CM-R) = 중앙 조합의 왼쪽/오른쪽 -> 안쪽 (±1)
 * 이걸 한 단계(±1)로 뭉치면 4백에서 CD-L과 LB가 동점이 되어, 정렬이 원래 배열
 * 순서로 결정되며 센터백이 풀백보다 바깥에 서는 그림이 나온다.
 */
export function lateralRank(rawPosition: string): -2 | -1 | 0 | 1 | 2 {
  const p = (rawPosition ?? "").trim().toUpperCase();
  // 측면 자원 먼저 — "LF"는 접미사 규칙에 걸리지 않지만 "CF-L"과 구분해야 한다.
  if (/^L[BMF]$/.test(p)) return -2;
  if (/^R[BMF]$/.test(p)) return 2;
  // RCF는 "right center forward" — 측면이 아니라 중앙 조합의 오른쪽이다.
  if (p === "RCF") return 1;
  if (p.endsWith("-L")) return -1;
  if (p.endsWith("-R")) return 1;
  return 0;
}

/** 한 줄에 n명을 놓을 때의 가로 위치들. 폭은 인원이 많을수록 넓게 쓴다. */
function spreadX(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [50];
  // 2명은 좁게, 5명은 터치라인까지. 양 끝을 12~88 범위 안에서 인원수에 따라 잡는다.
  const half = Math.min(38, 10 + n * 7);
  const left = 50 - half;
  const step = (half * 2) / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.round(left + step * i));
}

/**
 * 실제 선발 명단을 피치 좌표로 배치한다.
 * 같은 밴드 안에서는 좌우 성향으로 정렬해, 왼쪽 라벨이 왼쪽에 오도록 한다.
 */
export function layoutLineup(
  starters: Array<{ playerId: string; name: string; position: string }>
): LineupSlot[] {
  const byBand = new Map<LineupBand, typeof starters>();
  for (const s of starters) {
    const band = bandOf(s.position);
    const list = byBand.get(band) ?? [];
    list.push(s);
    byBand.set(band, list);
  }

  const out: LineupSlot[] = [];
  for (const band of BAND_ORDER) {
    const list = byBand.get(band);
    if (!list || list.length === 0) continue;
    // 왼쪽 측면 -> 중앙 -> 오른쪽 측면 순. 같은 순위면 원래 순서 유지(안정 정렬).
    const sorted = [...list].sort((a, b) => lateralRank(a.position) - lateralRank(b.position));
    const xs = spreadX(sorted.length);
    sorted.forEach((s, i) => {
      out.push({
        playerId: s.playerId,
        name: s.name,
        position: s.position,
        band,
        x: xs[i],
        y: BAND_Y[band],
      });
    });
  }
  return out;
}

// ── 조회 ──────────────────────────────────────────────────────────────────────

function lineupOf(match: Wc2026Match, code: string) {
  return match.lineups.find((l) => l.teamCode === code);
}

/** 그 팀이 치른 경기들을 킥오프 시각 오름차순으로. */
function matchesOf(code: string): Wc2026Match[] {
  return wc2026Matches()
    .filter((m) => m.home === code || m.away === code)
    .sort((a, b) => a.kickoffISO.localeCompare(b.kickoffISO));
}

/**
 * 상대팀의 실제 선발 명단.
 *
 * matchId를 주면(다시 쓰기 모드) 바로 그 경기의 명단을, 없으면(자유 대전) 그 팀이
 * 대회에서 마지막으로 치른 경기의 명단을 쓴다 — 아무것도 안 보여주는 것보다,
 * 어느 경기 기준인지 밝히고 보여주는 편이 감독에게 쓸모 있다.
 */
export function oppLineup(teamIdOrCode: string, matchId?: string): OppLineup | undefined {
  const code = codeOfTeamId(teamIdOrCode);

  const match = matchId ? wc2026MatchById(matchId) : matchesOf(code).at(-1);
  if (!match) return undefined;
  const lineup = lineupOf(match, code);
  if (!lineup || lineup.starters.length === 0) return undefined;

  const isHome = match.home === code;
  const slots = layoutLineup(lineup.starters);

  return {
    teamCode: code,
    shapeKo: shapeFromStarters(lineup.starters.map((s) => s.position)),
    starters: slots,
    bench: lineup.bench,
    matchId: match.id,
    vsCode: isHome ? match.away : match.home,
    round: match.round,
    kickoffISO: match.kickoffISO,
    scoreFor: isHome ? match.scoreHome : match.scoreAway,
    scoreAgainst: isHome ? match.scoreAway : match.scoreHome,
  };
}

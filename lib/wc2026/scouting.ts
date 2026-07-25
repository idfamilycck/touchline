// 상대 스카우팅 리포트 — 실제 2026 월드컵 기록에서 뽑아낸 상대 팀 프로필.
//
// 이 앱의 전제는 "당신이 감독이라면"인데, 감독이 전술을 짜는 근거는 상대다. 그동안
// 작전실은 슬라이더를 움직이면 승률 숫자가 반응하는 화면이었지, 상대를 보고 전술을
// 고르는 화면이 아니었다. 이 모듈이 그 근거를 만든다.
//
// 중요 — 전부 실측이다. 지어낸 수치가 하나도 없다:
//   · 대회 성적(경기수/득실/승무패)      : data/wc2026/matches.json의 실제 스코어
//   · 골 시간대 분포(전/후반, 막판, 초반) : 실제 골 이벤트의 minute
//   · 카드                                : 실제 옐로/레드 이벤트
//   · 포메이션                            : 그 경기 실제 선발 11명의 포지션 라벨에서 역산
//   · ELO                                 : data/wc2026/teams.json
// 선수 능력치(합성값)에는 의존하지 않는다. 스카우팅은 "실제로 이 팀이 어떻게 했는가"만
// 말하고, 라인별 전력 비교(합성 능력치 기반)는 작전실의 별도 패널이 담당한다.
//
// 성향 태그(traits)와 대응책(counters)은 아래 임계값에서 결정론적으로 파생된다.
// 임계값은 전부 이 파일 상단에 모아, 근거 문장에 실제 수치를 함께 실어 보낸다
// ("후반 강세"라고만 하지 않고 "전반 3골 vs 후반 9골"을 같이 준다).

import { wc2026Matches, wc2026MatchById } from "@/lib/wc2026/source";
import { stageOf } from "@/lib/wc2026/stage";
import { normalizePosition } from "@/lib/wc2026/players";
import type { Wc2026Match, Wc2026Lineup } from "@/lib/wc2026/types";
import teamsJson from "@/data/wc2026/teams.json";

interface TeamRow {
  code: string;
  id: string;
  nameKo: string;
  elo: number;
  finishRound: string;
}

const TEAM_ROWS = teamsJson as TeamRow[];

// ── 임계값 ────────────────────────────────────────────────────────────────────
// 실제 대회 분포를 기준으로 잡았다. 48개국 전체에 대해 최소 1개, 보통 3~5개의 태그가
// 붙도록(전부 "평범"으로 수렴하지 않도록) 설정한다.

/** 경기당 득점이 이 이상이면 화력형. */
const GF_HIGH = 1.8;
/** 경기당 득점이 이 이하면 빈공. */
const GF_LOW = 0.9;
/** 경기당 실점이 이 이하면 저실점 조직. */
const GA_LOW = 0.9;
/** 경기당 실점이 이 이상이면 수비 불안. */
const GA_HIGH = 1.7;
/** 후반 득점이 전반의 이 배수 이상이면 후반 강세. */
const SECOND_HALF_RATIO = 1.6;
/** 전체 실점 중 막판(75분+) 실점 비중이 이 이상이면 막판 취약. */
const LATE_CONCEDE_SHARE = 0.3;
/** 전체 득점 중 막판(75분+) 득점 비중이 이 이상이면 막판 뒷심. */
const LATE_GOAL_SHARE = 0.3;
/** 전체 실점 중 초반(15분 이내) 실점 비중이 이 이상이면 슬로 스타터. */
const EARLY_CONCEDE_SHARE = 0.25;
/** 경기당 카드가 이 이상이면 거친 경기 운영. */
const CARDS_HIGH = 2.6;
/**
 * 무실점 경기 비율이 이 이상이면 잠그는 팀.
 * 0.4로 두면 5경기 중 2경기만 막아도 붙어서, 같은 대회에서 8실점한 팀(미국)에도
 * "잠그는 팀"이 달렸다. 과반을 요구해야 태그가 실제 의미를 갖는다.
 */
const CLEAN_SHEET_SHARE = 0.5;
/** ELO 차가 이 이상이면 전력 격차를 태그로 명시한다. */
const ELO_GAP = 60;

/** "막판"의 기준 분. */
export const LATE_MINUTE = 75;
/** "초반"의 기준 분. */
export const EARLY_MINUTE = 15;

// ── 타입 ──────────────────────────────────────────────────────────────────────

/**
 * 상대의 성향 한 줄. tone은 감독 관점의 의미다 —
 * threat(상대의 강점, 경계 대상) / weakness(상대의 약점, 파고들 지점) / neutral(맥락).
 */
export interface ScoutTrait {
  id: string;
  labelKo: string;
  /** 이 태그가 붙은 실제 근거 수치. 태그만 있고 근거가 없으면 지어낸 말처럼 읽힌다. */
  evidenceKo: string;
  tone: "threat" | "weakness" | "neutral";
}

/** 전술 축 — 대응책이 어떤 지시를 건드리라는 것인지. */
export type CounterAxis = "line" | "pressing" | "attacking" | "tempo" | "marking" | "formation";

export interface CounterTip {
  id: string;
  /** 무엇을 할지. "수비 라인을 낮게" */
  headlineKo: string;
  /** 왜 그런지 — 반드시 위 traits의 실측 근거를 인용한다. */
  reasonKo: string;
  axis: CounterAxis;
  direction: "up" | "down" | "hold";
}

export interface OppScouting {
  teamCode: string;
  nameKo: string;
  elo: number;
  /** 우리 ELO 대비 차(양수면 상대가 강함). myElo 미제공 시 0. */
  eloDiff: number;
  /** 대회 최종 성적 라벨("8강" 등). */
  finishKo: string;

  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gfPerMatch: number;
  gaPerMatch: number;
  cleanSheets: number;

  goalsFirstHalf: number;
  goalsSecondHalf: number;
  concededFirstHalf: number;
  concededSecondHalf: number;
  /** 75분 이후 득점/실점. */
  lateGoals: number;
  lateConceded: number;
  /** 15분 이내 실점. */
  earlyConceded: number;

  yellows: number;
  reds: number;

  /** 지정 경기의 실제 선발 기준 포메이션("4-2-3-1"). 경기 미지정/라인업 부족 시 undefined. */
  shapeKo?: string;
  /** shapeKo를 뽑아낸 경기의 상대 팀 코드(문구에 "vs BRA 선발 기준"으로 쓴다). */
  shapeFromOpponent?: string;

  traits: ScoutTrait[];
  counters: CounterTip[];
}

// ── 포메이션 역산 ─────────────────────────────────────────────────────────────
// ESPN 포지션 라벨(G/CD-L/DM/AM-R/LF/F...)을 밴드로 묶어 통용 표기로 되돌린다.
// normalizePosition()은 엔진 Position(8종)으로 줄이면서 LM/RM을 WG(공격)로 합쳐버리는데,
// 포메이션 표기에서 LM/RM은 미드필드 줄이므로 여기서는 원본 라벨을 직접 밴딩한다.

type Band = "gk" | "def" | "dm" | "mid" | "am" | "att";

export function bandOf(rawPosition: string): Band {
  const p = (rawPosition ?? "").trim().toUpperCase();
  if (p === "G" || p === "GK") return "gk";
  if (p === "SW" || p.startsWith("CD") || p === "CB" || p === "LB" || p === "RB" || p === "FB") return "def";
  if (p === "DM") return "dm";
  if (p.startsWith("AM")) return "am";
  if (p === "LM" || p === "RM" || p.startsWith("CM") || p === "M") return "mid";
  if (p === "LF" || p === "RF" || p.startsWith("CF") || p === "RCF" || p === "F" || p === "ST") return "att";
  // 미상 라벨은 엔진 정규화로 한 번 더 시도한다(SUB, 빈 문자열 등).
  const n = normalizePosition(p);
  if (n === "GK") return "gk";
  if (n === "CB" || n === "FB") return "def";
  if (n === "DM") return "dm";
  if (n === "AM") return "am";
  if (n === "ST" || n === "WG") return "att";
  return "mid";
}

/** 선발 11명의 포지션 라벨 -> "4-2-3-1" 같은 통용 포메이션 표기. */
export function shapeFromStarters(positions: string[]): string | undefined {
  const counts: Record<Band, number> = { gk: 0, def: 0, dm: 0, mid: 0, am: 0, att: 0 };
  for (const p of positions) counts[bandOf(p)] += 1;

  const outfield = counts.def + counts.dm + counts.mid + counts.am + counts.att;
  // 퇴장 등으로 10명일 수 있으므로 9명 이상이면 표기한다(그 이하는 신뢰할 수 없다).
  if (outfield < 9) return undefined;

  const { def, dm, mid, am, att } = counts;

  // 4-2-3-1 류: 홀딩과 공미가 모두 있으면 네 줄로 표기한다.
  if (dm > 0 && am > 0) return `${def}-${dm}-${mid + am}-${att}`;
  // 4-1-4-1 류: 홀딩이 따로 있고 중원이 두터우면 홀딩을 분리한다.
  if (dm > 0 && mid >= 3) return `${def}-${dm}-${mid}-${att}`;
  // 공미만 있는 변형(4-4-2 다이아 등)은 공미 줄을 살려 네 칸으로.
  if (am > 0 && dm === 0) return `${def}-${mid}-${am}-${att}`;
  return `${def}-${dm + mid + am}-${att}`;
}

function lineupOf(match: Wc2026Match, code: string): Wc2026Lineup | undefined {
  return match.lineups.find((l) => l.teamCode === code);
}

// ── 집계 ──────────────────────────────────────────────────────────────────────

interface Tally {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  cleanSheets: number;
  goalsFirstHalf: number;
  goalsSecondHalf: number;
  concededFirstHalf: number;
  concededSecondHalf: number;
  lateGoals: number;
  lateConceded: number;
  earlyConceded: number;
  yellows: number;
  reds: number;
}

const GOAL_TYPES = new Set(["goal", "pen_goal", "own_goal"]);

function tally(code: string): Tally {
  const t: Tally = {
    played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, cleanSheets: 0,
    goalsFirstHalf: 0, goalsSecondHalf: 0, concededFirstHalf: 0, concededSecondHalf: 0,
    lateGoals: 0, lateConceded: 0, earlyConceded: 0, yellows: 0, reds: 0,
  };

  for (const m of wc2026Matches()) {
    const isHome = m.home === code;
    const isAway = m.away === code;
    if (!isHome && !isAway) continue;

    t.played += 1;
    const own = isHome ? m.scoreHome : m.scoreAway;
    const against = isHome ? m.scoreAway : m.scoreHome;
    t.gf += own;
    t.ga += against;
    if (against === 0) t.cleanSheets += 1;
    // 승부차기로 갈린 경기는 정규+연장 스코어 기준 무승부로 집계한다(실제 기록 방식).
    if (own > against) t.wins += 1;
    else if (own < against) t.losses += 1;
    else t.draws += 1;

    for (const e of m.events) {
      if (GOAL_TYPES.has(e.type)) {
        // 자책골은 "골을 넣은 팀"이 아니라 상대에게 득점이 가산된다.
        const scoringTeam =
          e.type === "own_goal" ? (e.teamCode === m.home ? m.away : m.home) : e.teamCode;
        const forUs = scoringTeam === code;
        const secondHalf = e.minute > 45;
        if (forUs) {
          if (secondHalf) t.goalsSecondHalf += 1;
          else t.goalsFirstHalf += 1;
          if (e.minute >= LATE_MINUTE) t.lateGoals += 1;
        } else {
          if (secondHalf) t.concededSecondHalf += 1;
          else t.concededFirstHalf += 1;
          if (e.minute >= LATE_MINUTE) t.lateConceded += 1;
          if (e.minute <= EARLY_MINUTE) t.earlyConceded += 1;
        }
      } else if (e.teamCode === code) {
        if (e.type === "yellow") t.yellows += 1;
        else if (e.type === "red") t.reds += 1;
      }
    }
  }

  return t;
}

// ── 성향 태그 ─────────────────────────────────────────────────────────────────

function buildTraits(t: Tally, eloDiff: number): ScoutTrait[] {
  const out: ScoutTrait[] = [];
  if (t.played === 0) return out;

  const gfPer = t.gf / t.played;
  const gaPer = t.ga / t.played;
  const cardsPer = (t.yellows + t.reds) / t.played;
  const per = (v: number) => v.toFixed(1);

  if (gfPer >= GF_HIGH) {
    out.push({
      id: "firepower",
      labelKo: "화력형",
      evidenceKo: `${t.played}경기 ${t.gf}득점 · 경기당 ${per(gfPer)}골`,
      tone: "threat",
    });
  } else if (gfPer <= GF_LOW) {
    out.push({
      id: "blunt",
      labelKo: "결정력 부족",
      evidenceKo: `${t.played}경기 ${t.gf}득점 · 경기당 ${per(gfPer)}골`,
      tone: "weakness",
    });
  }

  if (gaPer <= GA_LOW) {
    out.push({
      id: "solid",
      labelKo: "저실점 조직",
      evidenceKo: `${t.played}경기 ${t.ga}실점 · 경기당 ${per(gaPer)}실점`,
      tone: "threat",
    });
  } else if (gaPer >= GA_HIGH) {
    out.push({
      id: "leaky",
      labelKo: "수비 불안",
      evidenceKo: `${t.played}경기 ${t.ga}실점 · 경기당 ${per(gaPer)}실점`,
      tone: "weakness",
    });
  }

  if (t.cleanSheets / t.played >= CLEAN_SHEET_SHARE) {
    out.push({
      id: "cleansheet",
      labelKo: "잠그는 팀",
      evidenceKo: `${t.played}경기 중 ${t.cleanSheets}경기 무실점`,
      tone: "threat",
    });
  }

  if (t.goalsSecondHalf >= t.goalsFirstHalf * SECOND_HALF_RATIO && t.goalsSecondHalf >= 2) {
    out.push({
      id: "second_half",
      labelKo: "후반 강세",
      evidenceKo: `전반 ${t.goalsFirstHalf}골 vs 후반 ${t.goalsSecondHalf}골`,
      tone: "threat",
    });
  }

  if (t.ga > 0 && t.lateConceded / t.ga >= LATE_CONCEDE_SHARE) {
    out.push({
      id: "late_collapse",
      labelKo: "막판 실점 취약",
      evidenceKo: `${t.ga}실점 중 ${t.lateConceded}골이 ${LATE_MINUTE}분 이후`,
      tone: "weakness",
    });
  }

  if (t.gf > 0 && t.lateGoals / t.gf >= LATE_GOAL_SHARE) {
    out.push({
      id: "late_push",
      labelKo: "막판 뒷심",
      evidenceKo: `${t.gf}득점 중 ${t.lateGoals}골이 ${LATE_MINUTE}분 이후`,
      tone: "threat",
    });
  }

  if (t.ga > 0 && t.earlyConceded / t.ga >= EARLY_CONCEDE_SHARE) {
    out.push({
      id: "slow_start",
      labelKo: "초반 실점 잦음",
      evidenceKo: `${t.ga}실점 중 ${t.earlyConceded}골이 ${EARLY_MINUTE}분 이내`,
      tone: "weakness",
    });
  }

  if (cardsPer >= CARDS_HIGH) {
    out.push({
      id: "rough",
      labelKo: "거친 경기 운영",
      evidenceKo: `경고 ${t.yellows}장${t.reds > 0 ? ` · 퇴장 ${t.reds}회` : ""} · 경기당 ${per(cardsPer)}장`,
      tone: "weakness",
    });
  }

  if (Math.abs(eloDiff) >= ELO_GAP) {
    out.push({
      id: "elo",
      labelKo: eloDiff > 0 ? "전력 우위" : "전력 열세",
      evidenceKo: `ELO ${eloDiff > 0 ? "+" : "−"}${Math.abs(Math.round(eloDiff))} (우리 대비)`,
      tone: eloDiff > 0 ? "threat" : "weakness",
    });
  }

  return out;
}

// ── 대응책 ────────────────────────────────────────────────────────────────────
// 각 대응은 위 traits 중 하나에서 파생되고, 근거 문장에 그 실측치를 그대로 인용한다.
// 승률 숫자를 주지 않는 대신 "왜 이 전술인가"를 준다 — 감독이 판단할 재료다.

function buildCounters(t: Tally, traits: ScoutTrait[]): CounterTip[] {
  const has = (id: string) => traits.find((x) => x.id === id);
  const out: CounterTip[] = [];

  const firepower = has("firepower");
  if (firepower) {
    out.push({
      id: "drop_line",
      headlineKo: "수비 라인을 낮게",
      reasonKo: `${firepower.evidenceKo}. 라인을 높이면 배후 공간이 그대로 화력에 노출됩니다.`,
      axis: "line",
      direction: "down",
    });
  }

  const solid = has("solid") ?? has("cleansheet");
  if (solid) {
    out.push({
      id: "raise_attacking",
      headlineKo: "공격 가담을 늘려 밀집을 흔들기",
      reasonKo: `${solid.evidenceKo}. 소극적으로 두면 한 골도 나오지 않습니다 — 숫자를 올려 균열을 만들어야 합니다.`,
      axis: "attacking",
      direction: "up",
    });
  }

  const leaky = has("leaky");
  if (leaky) {
    out.push({
      id: "press_high",
      headlineKo: "압박을 올려 실수를 유도",
      reasonKo: `${leaky.evidenceKo}. 수비가 흔들리는 팀이라 전방에서 밀어붙일수록 기회가 늘어납니다.`,
      axis: "pressing",
      direction: "up",
    });
  }

  const late = has("late_collapse");
  if (late) {
    out.push({
      id: "late_surge",
      headlineKo: `${LATE_MINUTE}분 이후에 승부수를 아껴두기`,
      reasonKo: `${late.evidenceKo}. 막판에 무너지는 팀이니 교체 카드와 템포를 그 구간에 몰아주세요.`,
      axis: "tempo",
      direction: "up",
    });
  }

  const secondHalf = has("second_half") ?? has("late_push");
  if (secondHalf) {
    out.push({
      id: "hold_second",
      headlineKo: "후반에 체력을 남겨둘 것",
      reasonKo: `${secondHalf.evidenceKo}. 전반에 모든 걸 쏟으면 상대가 살아나는 구간에 버틸 힘이 없습니다.`,
      axis: "pressing",
      direction: "hold",
    });
  }

  const slowStart = has("slow_start");
  if (slowStart) {
    out.push({
      id: "fast_start",
      headlineKo: "초반에 강하게 몰아치기",
      reasonKo: `${slowStart.evidenceKo}. 경기 시작 구간이 이 팀의 가장 약한 시간대입니다.`,
      axis: "tempo",
      direction: "up",
    });
  }

  const blunt = has("blunt");
  if (blunt) {
    out.push({
      id: "push_up",
      headlineKo: "라인을 올려 주도권 잡기",
      reasonKo: `${blunt.evidenceKo}. 뒷공간을 내줘도 응징당할 확률이 낮은 상대입니다.`,
      axis: "line",
      direction: "up",
    });
  }

  const eloTrait = has("elo");
  if (eloTrait?.tone === "threat") {
    out.push({
      id: "compact",
      headlineKo: "간격을 좁혀 버티고 역습",
      reasonKo: `${eloTrait.evidenceKo}. 전력이 앞선 상대와 맞불을 놓으면 손해입니다.`,
      axis: "marking",
      direction: "hold",
    });
  }

  // 태그가 하나도 안 붙은 평범한 상대(임계값 사이)에도 최소 한 줄은 준다.
  if (out.length === 0 && t.played > 0) {
    out.push({
      id: "balanced",
      headlineKo: "균형 잡힌 세팅으로 출발",
      reasonKo: `${t.played}경기 ${t.gf}득점 ${t.ga}실점 — 뚜렷한 편향이 없는 상대입니다. 경기 흐름을 보고 지표에 맞춰 조정하세요.`,
      axis: "formation",
      direction: "hold",
    });
  }

  return out;
}

// ── 공개 API ──────────────────────────────────────────────────────────────────

const rowByCode = new Map(TEAM_ROWS.map((r) => [r.code, r]));

/** teamId("wc_kor") 또는 코드("KOR")를 코드로 정규화한다. */
export function codeOfTeamId(teamIdOrCode: string): string {
  const raw = teamIdOrCode ?? "";
  return raw.startsWith("wc_") ? raw.slice(3).toUpperCase() : raw.toUpperCase();
}

export interface ScoutOptions {
  /** 우리 팀 ELO. 주면 전력 격차 태그가 붙는다. */
  myElo?: number;
  /** 실제 WC2026 경기 id. 주면 그 경기 실제 선발 기준 포메이션을 뽑는다. */
  matchId?: string;
}

/**
 * 상대 팀 스카우팅 리포트. teamIdOrCode는 "wc_bra" 또는 "BRA" 둘 다 받는다.
 * 실제 대회에 없는 팀(레거시 16개국 등)이면 undefined.
 */
export function scoutTeam(teamIdOrCode: string, opts: ScoutOptions = {}): OppScouting | undefined {
  const code = codeOfTeamId(teamIdOrCode);
  const row = rowByCode.get(code);
  if (!row) return undefined;

  const t = tally(code);
  const eloDiff = opts.myElo === undefined ? 0 : row.elo - opts.myElo;
  const traits = buildTraits(t, eloDiff);
  const counters = buildCounters(t, traits);

  let shapeKo: string | undefined;
  let shapeFromOpponent: string | undefined;
  if (opts.matchId) {
    const m = wc2026MatchById(opts.matchId);
    const lineup = m ? lineupOf(m, code) : undefined;
    if (m && lineup) {
      shapeKo = shapeFromStarters(lineup.starters.map((s) => s.position));
      shapeFromOpponent = m.home === code ? m.away : m.home;
    }
  }

  return {
    teamCode: code,
    nameKo: row.nameKo,
    elo: row.elo,
    eloDiff,
    finishKo: stageOf(row.finishRound).labelKo,
    played: t.played,
    wins: t.wins,
    draws: t.draws,
    losses: t.losses,
    gf: t.gf,
    ga: t.ga,
    gfPerMatch: t.played > 0 ? t.gf / t.played : 0,
    gaPerMatch: t.played > 0 ? t.ga / t.played : 0,
    cleanSheets: t.cleanSheets,
    goalsFirstHalf: t.goalsFirstHalf,
    goalsSecondHalf: t.goalsSecondHalf,
    concededFirstHalf: t.concededFirstHalf,
    concededSecondHalf: t.concededSecondHalf,
    lateGoals: t.lateGoals,
    lateConceded: t.lateConceded,
    earlyConceded: t.earlyConceded,
    yellows: t.yellows,
    reds: t.reds,
    shapeKo,
    shapeFromOpponent,
    traits,
    counters,
  };
}

/** 팀 id/코드로 ELO만 빠르게. 스카우팅에 우리 팀 ELO를 넘길 때 쓴다. */
export function wcEloOf(teamIdOrCode: string): number | undefined {
  return rowByCode.get(codeOfTeamId(teamIdOrCode))?.elo;
}

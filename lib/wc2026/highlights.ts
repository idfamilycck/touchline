// 명장면 — 큐레이션된 대표 순간.
//
// 104경기 목록 앞에서 "뭘 골라야 하지"로 멈추는 첫 방문자를 위해, 감정이 가장 크게
// 걸린 순간 몇 개를 골라 바로 들어가게 한다. 전부 실제 기록이며 각 항목의 "판돈
// (stakeKo)"은 데이터로 확인한 사실이다:
//   · KOR-RSA: 한국은 3점 3위, 남아공은 4점 2위로 조별리그 탈락/진출이 갈렸다.
//   · ARG-EGY: 이집트가 2-0으로 앞서다 79·83·90분에 내리 3실점했다.
//   · ENG-ARG(4강): 잉글랜드가 55분 리드 후 85·90분에 뒤집혔다.
//   · ESP-ARG(결승): 정규시간 0-0, 연장 106분에 승부가 났다.
//   · MEX-ENG(16강): 잉글랜드가 54분 퇴장으로 10명이 됐는데도 멕시코가 졌다.
//   · BRA-JPN(32강): 일본이 29분부터 앞서다 56·90분에 역전당했다.
//
// resolve 시 실제 데이터와 대조해 경기·팀이 없으면 그 항목을 조용히 제외한다
// (데이터가 바뀌어도 화면이 거짓을 말하지 않는다). highlights.test.ts가 강제한다.

import { wc2026MatchById } from "@/lib/wc2026/source";
import type { Wc2026Match } from "@/lib/wc2026/types";

export interface HighlightSeed {
  id: string;
  matchId: string;
  /** 지휘할 팀(3-letter). 반드시 그 경기의 home/away 중 하나. */
  side: string;
  /** 지휘봉을 잡는 분. */
  takeoverMinute: number;
  titleKo: string;
  /** 왜 이 순간인가 — 실제 기록에 근거한 한 줄. */
  stakeKo: string;
  /** 카드 좌측 스트라이프 톤. */
  tone: "kor" | "final" | "drama" | "chance";
}

const SEEDS: HighlightSeed[] = [
  {
    id: "hl-kor-rsa",
    matchId: "760466",
    side: "KOR",
    takeoverMinute: 45,
    titleKo: "한국의 탈락을 막아라",
    stakeKo: "조별리그 최종전. 이기면 16강, 지면 탈락이었고 실제로는 후반 63분에 무너졌습니다.",
    tone: "kor",
  },
  {
    id: "hl-eng-arg-sf",
    matchId: "760515",
    side: "ENG",
    takeoverMinute: 80,
    titleKo: "결승까지 10분",
    stakeKo: "4강에서 1-0으로 앞선 잉글랜드. 실제로는 85분과 90분에 연달아 실점해 무너졌습니다.",
    tone: "drama",
  },
  {
    id: "hl-arg-egy",
    matchId: "760509",
    side: "EGY",
    takeoverMinute: 74,
    titleKo: "2-0 리드를 지켜라",
    stakeKo: "16강에서 아르헨티나에 두 골 앞섰던 이집트. 실제로는 11분 만에 세 골을 내줬습니다.",
    tone: "drama",
  },
  {
    id: "hl-final",
    matchId: "760517",
    side: "ARG",
    takeoverMinute: 45,
    titleKo: "결승, 0-0의 균형",
    stakeKo: "정규시간은 0-0이었습니다. 연장 106분에 갈린 우승을 90분 안에 가져오세요.",
    tone: "final",
  },
  {
    id: "hl-mex-eng",
    matchId: "760505",
    side: "MEX",
    takeoverMinute: 54,
    titleKo: "수적 우위를 살려라",
    stakeKo: "16강 54분, 잉글랜드가 퇴장으로 10명이 됐습니다. 그런데도 실제 멕시코는 2-3으로 졌습니다.",
    tone: "chance",
  },
  {
    id: "hl-bra-jpn",
    matchId: "760487",
    side: "JPN",
    takeoverMinute: 51,
    titleKo: "브라질을 잡기 직전",
    stakeKo: "32강에서 29분부터 브라질을 앞서던 일본. 실제로는 56분과 90분에 역전당했습니다.",
    tone: "chance",
  },
];

export interface Highlight extends HighlightSeed {
  round: Wc2026Match["round"];
  homeCode: string;
  awayCode: string;
  /** 지휘 시작 시점의 스코어(우리 기준). */
  scoreMe: number;
  scoreOpp: number;
  /** 상대 3-letter. */
  oppCode: string;
}

/** 인수 시점(그 분 포함)까지의 스코어를 실제 이벤트로 계산한다. */
function scoreAt(match: Wc2026Match, side: string, minute: number): { me: number; opp: number } {
  const opponent = side === match.home ? match.away : match.home;
  let me = 0;
  let opp = 0;
  for (const e of match.events) {
    if (e.minute > minute) continue;
    if (e.type === "goal" || e.type === "pen_goal") {
      if (e.teamCode === side) me += 1;
      else if (e.teamCode === opponent) opp += 1;
    } else if (e.type === "own_goal") {
      // 자책골: teamCode = 자기 골문에 넣은 팀 -> 득점은 상대에 가산.
      if (e.teamCode === side) opp += 1;
      else if (e.teamCode === opponent) me += 1;
    }
  }
  return { me, opp };
}

/** 실제 데이터와 대조해 유효한 명장면만 돌려준다. */
export function highlights(): Highlight[] {
  const out: Highlight[] = [];
  for (const seed of SEEDS) {
    const match = wc2026MatchById(seed.matchId);
    if (!match) continue;
    if (match.home !== seed.side && match.away !== seed.side) continue;
    const { me, opp } = scoreAt(match, seed.side, seed.takeoverMinute);
    out.push({
      ...seed,
      round: match.round,
      homeCode: match.home,
      awayCode: match.away,
      oppCode: seed.side === match.home ? match.away : match.home,
      scoreMe: me,
      scoreOpp: opp,
    });
  }
  return out;
}

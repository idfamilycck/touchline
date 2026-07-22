// lib/engine/balance-wc2026.test.ts
//
// balance.test.ts의 Monte Carlo sanity gate는 16개 가상 고정 팀(TEAMS)만 돈다.
// free 모드 매치업은 이제 registerWc2026()이 등록하는 48개 실제 2026 월드컵
// 출전국(생성된 능력치)도 대상이라, 여기서도 같은 종류의 gate(평균 득점/블로아웃
// 비율/무승부 비율/ELO 유리팀 승률)를 별도 파일로 검증한다.
//
// balance.test.ts처럼 "16×15 전순서쌍 × 20시드(4800회)"는 하지 않는다 — WC 48개
// 팀이면 48×47=2256 순서쌍이라 전수는 과하다(브리프가 "bounded sample" 지정).
// 대신 ELO 오름차순으로 정렬한 48개 팀에서 인덱스 i(3칸 간격, 16개) × 오프셋
// [4, 15, 29](= 근접/중간/큰 ELO 격차를 섞어 뽑기 위함, 48과이 서로소가 아니어도
// 샘플 목적엔 무방)로 48개 순서쌍을 고정 생성해 매치업 자체의 스프레드를 ELO
// 전 구간에 걸치게 한다. 순서쌍당 5시드 = 240회 runFullMatch — balance.test.ts가
// 4800회를 ~4~5초에 처리한 것에 비례하면 1초 미만이라 120s 타임아웃에 크게 여유.
import { describe, it, expect, beforeAll } from "vitest";
import { runFullMatch } from "./match";
import { autoPlace } from "./autoplace";
import { wc2026TeamList } from "@/lib/wc2026/data";
import type { SideSetup, SpecialInstructions, TeamInstructions } from "@/lib/types";

// balance.test.ts와 동일한 기본 전술 — "전술 차이"가 아니라 "팀/선수단 능력치+ELO
// 차이"만으로 벌어지는 결과 분포를 측정하려는 목적이 여기서도 같다.
const DEFAULT_INSTRUCTIONS: TeamInstructions = {
  formation: "4-3-3",
  pressing: 2,
  line: 2,
  attacking: 2,
  tempo: 2,
  buildup: "short",
  focus: "center",
  width: "wide",
  marking: "zonal",
  offsideTrap: false,
  lineSpacing: 2,
  possession: 2,
  transitionSpeed: 2,
};
const DEFAULT_SPECIAL: SpecialInstructions = { ckBigMenForward: false };

function autoSetup(teamId: string): SideSetup {
  const { lineup, roles } = autoPlace(teamId, "4-3-3");
  return {
    teamId,
    lineup,
    roles,
    instructions: { ...DEFAULT_INSTRUCTIONS },
    special: { ...DEFAULT_SPECIAL },
  };
}

// wc2026TeamList()는 registerWc2026()을 내부에서 호출(idempotent)해 teamById/
// playersOf/venueById를 채운 뒤, ELO 내림차순 48개 Team[]을 돌려준다.
const WC_TEAMS = wc2026TeamList();

// ELO 오름차순으로 다시 정렬해 인덱스 스프레드가 ELO 스프레드와 일치하게 한다.
const BY_ELO_ASC = [...WC_TEAMS].sort((a, b) => a.elo - b.elo);
const N = BY_ELO_ASC.length; // 48

// 오프셋 4/15/29 = 근접(작은 ELO차) / 중간 / 절반 가까운(큰 ELO차) 매치업을 섞어
// i를 3칸 간격(0,3,...,45 → 16개)으로 훑으면서 뽑는다 → 16×3 = 48쌍(중복 없음,
// j===i는 발생하지 않음: 오프셋이 모두 0이 아니고 N=48보다 작음).
const OFFSETS = [4, 15, 29];
const PAIRS: Array<[number, number]> = [];
for (let i = 0; i < N; i += 3) {
  for (const off of OFFSETS) {
    const j = (i + off) % N;
    if (j !== i) PAIRS.push([i, j]);
  }
}

const SEEDS_PER_MATCHUP = 5;

// WC 경기장 중 하나를 중립 구장으로 고정(balance.test.ts가 16개 가상팀에 대해
// "metlife"를 쓰는 것과 같은 역할). registerWc2026()이 등록하는 실제 16개 WC
// 경기장 중 하나인 wc_venue_metlife를 그대로 쓴다.
const NEUTRAL_VENUE = "wc_venue_metlife";

interface MatchResult {
  eloDiff: number; // me.elo - opp.elo
  scoreMe: number;
  scoreOpp: number;
}

let results: MatchResult[] = [];

beforeAll(() => {
  const setups = new Map<string, SideSetup>();
  const getSetup = (teamId: string) => {
    let s = setups.get(teamId);
    if (!s) {
      s = autoSetup(teamId);
      setups.set(teamId, s);
    }
    return s;
  };

  const collected: MatchResult[] = [];
  for (const [i, j] of PAIRS) {
    const a = BY_ELO_ASC[i];
    const b = BY_ELO_ASC[j];
    const me = getSetup(a.id);
    const opp = getSetup(b.id);
    for (let seed = 1; seed <= SEEDS_PER_MATCHUP; seed++) {
      const state = runFullMatch(me, opp, NEUTRAL_VENUE, seed);
      collected.push({
        eloDiff: a.elo - b.elo,
        scoreMe: state.scoreMe,
        scoreOpp: state.scoreOpp,
      });
    }
  }
  results = collected;
}, 120_000);

describe(
  "WC 2026 매치업 밸런스 sanity (Monte Carlo, 48개 실제 출전국)",
  () => {
    it(`${PAIRS.length}개 순서쌍 × ${SEEDS_PER_MATCHUP}시드 샘플이 생성된다`, () => {
      expect(PAIRS.length).toBeGreaterThanOrEqual(40);
      expect(PAIRS.length).toBeLessThanOrEqual(60);
      expect(results.length).toBe(PAIRS.length * SEEDS_PER_MATCHUP);
    });

    it("ELO 유리한 쪽(eloDiff>0)이 전체적으로 절반 넘게 이긴다", () => {
      const decided = results.filter((r) => r.scoreMe !== r.scoreOpp && r.eloDiff !== 0);
      expect(decided.length).toBeGreaterThan(0);
      const favoredWins = decided.filter(
        (r) => (r.eloDiff > 0 && r.scoreMe > r.scoreOpp) || (r.eloDiff < 0 && r.scoreOpp > r.scoreMe)
      ).length;
      const favoredWinRate = favoredWins / decided.length;
      expect(favoredWinRate).toBeGreaterThan(0.5);
    });

    it("전체 경기 평균 총득점이 1.8~3.6골", () => {
      expect(results.length).toBeGreaterThan(0);
      const avgGoals = results.reduce((sum, r) => sum + r.scoreMe + r.scoreOpp, 0) / results.length;
      expect(avgGoals).toBeGreaterThanOrEqual(1.8);
      expect(avgGoals).toBeLessThanOrEqual(3.6);
    });

    it("한 경기 5골차 이상 빈도 < 4%", () => {
      const blowouts = results.filter((r) => Math.abs(r.scoreMe - r.scoreOpp) >= 5).length;
      expect(blowouts / results.length).toBeLessThan(0.04);
    });

    it("무승부 비율 15%~35%", () => {
      const draws = results.filter((r) => r.scoreMe === r.scoreOpp).length / results.length;
      expect(draws).toBeGreaterThanOrEqual(0.15);
      expect(draws).toBeLessThanOrEqual(0.35);
    });
  },
  120_000
);

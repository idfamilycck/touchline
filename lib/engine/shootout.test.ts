import { describe, it, expect, vi } from "vitest";
import { simulateShootout, shootoutWinProb } from "./shootout";
import { makeSetup } from "./__testutils__";
import { FORMATIONS } from "@/lib/data/formations";
import { DEFAULT_ROLE } from "@/lib/data/roles";
import type { Player, RoleId, SideSetup, TeamInstructions } from "@/lib/types";

// PLAYERS는 "모듈 로드 후 불변"이 문서화된 계약이고 playersOf()의 캐시 공유 안전성이
// 여기에 기대고 있다(lib/data/players.ts 참고). 합성 테스트 스쿼드를 실제로 PLAYERS에
// push하면 그 불변식을 깨뜨리므로, 대신 playersOf만 모킹해 "test_pk_hi"/"test_pk_lo"
// 두 teamId에 한해 로컬 스쿼드를 반환하고 나머지는 원본 구현에 위임한다.
const testSquads = vi.hoisted(() => new Map<string, Player[]>());

vi.mock("@/lib/data/players", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/players")>();
  return {
    ...actual,
    playersOf: (teamId: string) => testSquads.get(teamId) ?? actual.playersOf(teamId),
  };
});

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

function makePlayer(id: string, teamId: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    teamId,
    name: id,
    age: 27,
    caps: 10,
    positions: ["ST"],
    attrs: {
      shooting: 60,
      passing: 60,
      dribbling: 60,
      defending: 60,
      pace: 60,
      physical: 60,
      goalkeeping: 10,
      stamina: 60,
    },
    setPiece: 60,
    aerial: 60,
    penalty: 60,
    mental: 60,
    ...overrides,
  };
}

// 골키퍼 기여도를 정확히 70으로 맞춰(goalkeeping=70, mental=70, age=31=피크나이) 두 테스트
// 팀 사이에서 GK 변수를 완전히 제거하고, 오직 키커의 pk/mental 차이만으로 승률 격차를
// 검증할 수 있게 한다.
function buildTestTeam(teamId: string, penalty: number, mental: number): SideSetup {
  const gk = makePlayer(`${teamId}_gk`, teamId, {
    positions: ["GK"],
    age: 31,
    attrs: {
      shooting: 10,
      passing: 40,
      dribbling: 20,
      defending: 30,
      pace: 40,
      physical: 60,
      goalkeeping: 70,
      stamina: 60,
    },
    penalty: 40,
    mental: 70,
  });
  const outfield = Array.from({ length: 10 }, (_, i) =>
    makePlayer(`${teamId}_p${i}`, teamId, { penalty, mental })
  );
  testSquads.set(teamId, [gk, ...outfield]);

  const slots = FORMATIONS["4-3-3"].slots;
  const lineup: Record<string, string> = {};
  const roles: Record<string, RoleId> = {};
  slots.forEach((slot, i) => {
    lineup[slot.id] = slot.position === "GK" ? gk.id : outfield[i - 1].id;
    roles[slot.id] = DEFAULT_ROLE[slot.position];
  });

  return {
    teamId,
    lineup,
    roles,
    instructions: DEFAULT_INSTRUCTIONS,
    special: { ckBigMenForward: false },
  };
}

describe("simulateShootout", () => {
  it("같은 시드 재현성, winner는 me/opp 중 하나, 라운드 수 >= 10", () => {
    const kor = makeSetup("kor", "4-3-3");
    const bra = makeSetup("bra", "4-3-3");
    const meKickers = [
      kor.lineup["wg_l"],
      kor.lineup["wg_r"],
      kor.lineup["st"],
      kor.lineup["cm_l"],
      kor.lineup["cm_r"],
    ];

    const a = simulateShootout(meKickers, kor, bra, 42);
    const b = simulateShootout(meKickers, kor, bra, 42);

    expect(a).toEqual(b);
    expect(["me", "opp"]).toContain(a.winner);
    expect(a.rounds.length).toBeGreaterThanOrEqual(10);
  });

  it("다른 시드는 대체로 다른 결과 로그를 만든다", () => {
    const kor = makeSetup("kor", "4-3-3");
    const bra = makeSetup("bra", "4-3-3");
    const meKickers = [
      kor.lineup["wg_l"],
      kor.lineup["wg_r"],
      kor.lineup["st"],
      kor.lineup["cm_l"],
      kor.lineup["cm_r"],
    ];
    const a = simulateShootout(meKickers, kor, bra, 1);
    const b = simulateShootout(meKickers, kor, bra, 2);
    expect(a.rounds.map((r) => r.scored)).not.toEqual(b.rounds.map((r) => r.scored));
  });

  it("PK 90 팀 vs PK 55 팀: 100회 시뮬 중 강팀 승수 > 60", () => {
    const strong = buildTestTeam("test_pk_hi", 90, 90);
    const weak = buildTestTeam("test_pk_lo", 55, 55);
    const meKickers = Object.values(strong.lineup).filter((id) => id !== strong.lineup["gk"]).slice(0, 5);

    let strongWins = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const result = simulateShootout(meKickers, strong, weak, seed);
      if (result.winner === "me") strongWins++;
    }
    expect(strongWins).toBeGreaterThan(60);
  });
});

describe("shootoutWinProb (분석적 승부차기 승률)", () => {
  it("양팀 대칭이면 정확히 50%", () => {
    const a = buildTestTeam("test_pk_hi", 75, 75);
    // 같은 수치의 다른 팀 id로 완전 대칭 매치업을 만든다.
    const b = buildTestTeam("test_pk_lo", 75, 75);
    expect(shootoutWinProb(a, b)).toBeCloseTo(0.5, 6);
  });

  it("확률은 항상 0~1이고 양쪽 관점의 합이 1이다", () => {
    const strong = buildTestTeam("test_pk_hi", 90, 90);
    const weak = buildTestTeam("test_pk_lo", 55, 55);
    const p = shootoutWinProb(strong, weak);
    const q = shootoutWinProb(weak, strong);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
    expect(p + q).toBeCloseTo(1, 6);
    expect(p).toBeGreaterThan(0.6);
  });

  it("분석적 승률이 시뮬레이션 실측 승률과 일치한다 (500회, ±6%p)", () => {
    // 같은 모델을 두 경로로 계산하므로 근접해야 한다. 어긋나면 successDistribution의
    // 키커 선정(autoKickers)이나 서든데스 근사가 시뮬과 갈렸다는 신호다.
    const strong = buildTestTeam("test_pk_hi", 88, 80);
    const weak = buildTestTeam("test_pk_lo", 62, 60);
    const analytic = shootoutWinProb(strong, weak);

    // 시뮬은 유저 지정 키커를 받으므로 autoKickers와 같은 규칙(pk 내림차순 5명)으로 맞춘다.
    const gkId = strong.lineup["gk"];
    const meKickers = Object.entries(strong.lineup)
      .filter(([slotId]) => slotId !== "gk")
      .map(([, id]) => id)
      .filter((id) => id !== gkId)
      .slice(0, 5);

    let wins = 0;
    const N = 500;
    for (let seed = 1; seed <= N; seed++) {
      if (simulateShootout(meKickers, strong, weak, seed).winner === "me") wins++;
    }
    expect(Math.abs(wins / N - analytic)).toBeLessThan(0.06);
  });
});

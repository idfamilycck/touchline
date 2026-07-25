import { createRng } from "./random";
import { playerContribution } from "./strength";
import { playersOf } from "@/lib/data/players";
import { FORMATIONS } from "@/lib/data/formations";
import { DEFAULT_ROLE } from "@/lib/data/roles";
import type { Player, SideSetup } from "@/lib/types";

export interface ShootoutResult {
  rounds: Array<{ side: "me" | "opp"; playerId: string; scored: boolean }>;
  winner: "me" | "opp";
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// 상대 GK 기여도: 항상 "기본 역할(gk_traditional) + 만체력(1.0)" 기준으로 계산한다
// (브리프 명세). 실제 경기 중 GK의 역할 배정이나 스태미나와 무관하게 승부차기는
// 별도 미니게임으로 취급한다.
function gkContribution(setup: SideSetup): number {
  const formation = FORMATIONS[setup.instructions.formation];
  const gkSlot = formation.slots.find((s) => s.position === "GK");
  const gkId = gkSlot ? setup.lineup[gkSlot.id] : undefined;
  const gk = playersOf(setup.teamId).find((p) => p.id === gkId);
  if (!gk) return 70; // GK를 찾지 못하면 가감 0(70)으로 중립 처리
  return playerContribution(gk, "GK", DEFAULT_ROLE.GK, 1);
}

function successProb(kicker: Player, oppGkContribution: number): number {
  return clamp(
    0.62 +
      (kicker.penalty - 70) * 0.004 +
      (kicker.mental - 70) * 0.002 -
      (oppGkContribution - 70) * 0.004,
    0.5,
    0.9
  );
}

// 상대 자동 키커: 온피치 필드 플레이어(GK 제외) 중 pk 내림차순 상위 5명.
function autoKickers(setup: SideSetup): string[] {
  const formation = FORMATIONS[setup.instructions.formation];
  const gkSlot = formation.slots.find((s) => s.position === "GK");
  const gkId = gkSlot ? setup.lineup[gkSlot.id] : undefined;
  const onPitchIds = new Set(Object.values(setup.lineup));
  return playersOf(setup.teamId)
    .filter((p) => onPitchIds.has(p.id) && p.id !== gkId)
    .sort((a, b) => b.penalty - a.penalty)
    .slice(0, 5)
    .map((p) => p.id);
}

// ---- 승부차기 승률(분석적) ---------------------------------------------------
// simulateShootout을 돌리지 않고 "이 매치업이 승부차기로 가면 우리가 이길 확률"을
// 계산한다. 정규시간 무승부의 가치를 매기려면 필요하다 — 녹아웃에서 무승부는 패배가
// 아니라 승부차기 진입이므로, 진출 확률 = 승 + 무 × (이 함수의 값)이다.
//
// 정확도: simulateShootout이 "조기 종료 없이 5라운드씩" 진행하므로 첫 10킥의 결과
// 분포는 각 팀 5명 키커의 포아송-이항 분포와 정확히 일치한다(아래 DP로 그대로 계산).
// 5-5 동률 이후의 서든데스만 평균 성공률 근사를 쓴다 — 서든데스는 6번째부터 키커
// 목록을 순환하므로 라운드마다 확률이 조금씩 달라지지만, 동률 상태에서만 쓰이는
// 조건부 확률이라 전체 값에 미치는 영향이 작다.
function successDistribution(probs: number[]): number[] {
  // dp[k] = 정확히 k골 성공할 확률
  let dp = [1];
  for (const p of probs) {
    const next = new Array(dp.length + 1).fill(0);
    for (let k = 0; k < dp.length; k++) {
      next[k] += dp[k] * (1 - p);
      next[k + 1] += dp[k] * p;
    }
    dp = next;
  }
  return dp;
}

function kickerProbs(setup: SideSetup, facingGkContribution: number): number[] {
  const squad = playersOf(setup.teamId);
  return autoKickers(setup)
    .map((id) => squad.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined)
    .map((p) => successProb(p, facingGkContribution));
}

export function shootoutWinProb(meSetup: SideSetup, oppSetup: SideSetup): number {
  const meGk = gkContribution(meSetup);
  const oppGk = gkContribution(oppSetup);
  const pMe = kickerProbs(meSetup, oppGk);
  const pOpp = kickerProbs(oppSetup, meGk);
  // 키커를 못 찾는 비정상 입력은 중립 처리한다.
  if (pMe.length === 0 || pOpp.length === 0) return 0.5;

  const distMe = successDistribution(pMe);
  const distOpp = successDistribution(pOpp);

  let win = 0;
  let tie = 0;
  for (let a = 0; a < distMe.length; a++) {
    for (let b = 0; b < distOpp.length; b++) {
      const prob = distMe[a] * distOpp[b];
      if (a > b) win += prob;
      else if (a === b) tie += prob;
    }
  }

  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const p = avg(pMe);
  const q = avg(pOpp);
  // 서든데스 한 라운드: 내가 넣고 상대가 실패하면 승, 반대면 패, 그 외엔 반복.
  const decisive = p * (1 - q) + q * (1 - p);
  const suddenDeathWin = decisive > 0 ? (p * (1 - q)) / decisive : 0.5;

  return win + tie * suddenDeathWin;
}

// 5라운드씩(조기 종료 없음, 최소 10킥) 번갈아 진행 후 동률이면 서든데스로 이어간다.
// 서든데스는 6번째 키커부터 meKickers/오토 리스트를 순환(cycling)하며 계속한다 —
// 브리프가 허용한 "가장 단순한 결정론적 규칙".
export function simulateShootout(
  meKickers: string[],
  meSetup: SideSetup,
  oppSetup: SideSetup,
  seed: number
): ShootoutResult {
  const rng = createRng(seed);
  const meSquad = playersOf(meSetup.teamId);
  const oppSquad = playersOf(oppSetup.teamId);
  const oppKickers = autoKickers(oppSetup);

  const meGk = gkContribution(meSetup);
  const oppGk = gkContribution(oppSetup);

  const rounds: ShootoutResult["rounds"] = [];
  let meScore = 0;
  let oppScore = 0;

  function kick(side: "me" | "opp", playerId: string): void {
    const squad = side === "me" ? meSquad : oppSquad;
    const facingGk = side === "me" ? oppGk : meGk;
    const player = squad.find((p) => p.id === playerId);
    // playerId가 squad에서 찾아지지 않으면(스쿼드에 없는/오프피치 id 등) RNG 뽑기를
    // 그냥 건너뛰고 scored=false로 조용히 처리한다 — 예외를 던지지 않는다. 따라서
    // 호출부는 반드시 온피치 선수 id만 넘겨야 하며, 그렇지 않으면 시드 재현성은
    // 유지되지만(같은 시드→같은 결과) RNG 소비 스트림이 "정상" 실행과 달라진다.
    let scored = false;
    if (player) {
      const p = successProb(player, facingGk);
      scored = rng.next() < p;
    }
    if (scored) {
      if (side === "me") meScore++;
      else oppScore++;
    }
    rounds.push({ side, playerId, scored });
  }

  for (let i = 0; i < 5; i++) {
    kick("me", meKickers[i % meKickers.length]);
    kick("opp", oppKickers[i % oppKickers.length]);
  }

  let idx = 5;
  while (meScore === oppScore) {
    kick("me", meKickers[idx % meKickers.length]);
    kick("opp", oppKickers[idx % oppKickers.length]);
    idx++;
  }

  return { rounds, winner: meScore > oppScore ? "me" : "opp" };
}

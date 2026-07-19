// lib/engine/rewrite.ts
//
// Adapter: turns a real WC2026 match's "T-5 minutes" state (a DecisiveMoment
// from lib/wc2026/moments.ts) into an engine MatchState, so the existing
// simulation loop (simulateMinute/applyIntervention in lib/engine/match.ts)
// can replay the remaining time from the user's intervention point.
//
// Pure function: no I/O beyond the passed match object + already-registered
// engine data (registerWc2026() must have run), no Math.random — all
// randomness downstream comes from the engine's own seeded RNG.

import type { Wc2026Match } from "@/lib/wc2026/types";
import type { DecisiveMoment } from "@/lib/wc2026/moments";
import { wc2026TeamId } from "@/lib/wc2026/data";
import { FORMATIONS } from "@/lib/data/formations";
import { DEFAULT_ROLE } from "@/lib/data/roles";
import { initMatch, winProbGivenScore } from "@/lib/engine/match";
import type { MatchState } from "@/lib/engine/match";
import { ENGINE_CONSTANTS } from "@/lib/engine/constants";
import type {
  Position,
  RoleId,
  SideSetup,
  SpecialInstructions,
  TeamInstructions,
} from "@/lib/types";

// lib/store.ts의 DEFAULT_INSTRUCTIONS/DEFAULT_SPECIAL(4-3-3 기본 전술)과 동일한
// 형태를 그대로 복제한다 — store.ts는 이 태스크의 수정 대상이 아니므로 별도로 둔다.
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
};
const DEFAULT_SPECIAL: SpecialInstructions = { ckBigMenForward: false };

// lib/wc2026/players.ts의 makeVirtualPlayer가 쓰는 normalizePosition과 동일한 매핑을
// 복제한다(그 함수는 export되지 않으므로 여기서 다시 구현한다. 목록/우선순위를 바꿀
// 경우 두 파일을 함께 갱신해야 한다).
function normalizePosition(raw: string): Position {
  const p = (raw ?? "").trim().toUpperCase();
  if (p === "GK" || p === "G") return "GK";
  if (p === "CB" || p === "SW" || p.startsWith("CD")) return "CB";
  if (p === "FB" || p === "LB" || p === "RB") return "FB";
  if (p === "DM") return "DM";
  if (p === "AM" || p.startsWith("AM")) return "AM";
  if (p === "CM" || p === "M" || p.startsWith("CM")) return "CM";
  if (p === "WG" || p === "LM" || p === "RM" || p === "LF" || p === "RF") return "WG";
  if (p === "ST" || p === "F" || p === "RCF" || p.startsWith("CF")) return "ST";
  return "CM"; // SUB, "", 또는 미인식 값 -> 유틸리티 폴백
}

interface RealStarter {
  playerId: string;
  name: string;
  position: string;
}

// 실제 선발 11명을 4-3-3 슬롯에 배치한다: 1차로 정규화된 포지션이 슬롯과 일치하는
// 선수를 슬롯 순서대로 배정하고, 아직 채워지지 않은 슬롯은 남은(아직 미배정) 선수를
// 순서대로 채워 11슬롯을 모두 채운다(autoPlace의 best-XI가 아니라 실제 선발이므로
// 교체가 의미를 갖는다).
function placeStartersInSlots(starters: RealStarter[]): Record<string, string> {
  const slots = FORMATIONS["4-3-3"].slots;
  const lineup: Record<string, string> = {};
  const assigned = new Set<string>();

  for (const slot of slots) {
    const starter = starters.find(
      (s) => !assigned.has(s.playerId) && normalizePosition(s.position) === slot.position
    );
    if (starter) {
      lineup[slot.id] = starter.playerId;
      assigned.add(starter.playerId);
    }
  }

  const leftovers = starters.filter((s) => !assigned.has(s.playerId));
  let li = 0;
  for (const slot of slots) {
    if (lineup[slot.id]) continue;
    const starter = leftovers[li++];
    if (starter) {
      lineup[slot.id] = starter.playerId;
      assigned.add(starter.playerId);
    }
  }

  return lineup;
}

function rolesForSlots(): Record<string, RoleId> {
  const roles: Record<string, RoleId> = {};
  for (const slot of FORMATIONS["4-3-3"].slots) {
    roles[slot.id] = DEFAULT_ROLE[slot.position];
  }
  return roles;
}

function baseSideSetup(teamCode: string, lineup: Record<string, string>): SideSetup {
  return {
    teamId: wc2026TeamId(teamCode),
    lineup,
    roles: rolesForSlots(),
    instructions: { ...DEFAULT_INSTRUCTIONS },
    special: { ...DEFAULT_SPECIAL },
  };
}

// side를 "me"로, 상대를 "opp"로 두고 moment.takeoverMinute 시점 상태를 만든다.
export function fromRealState(
  match: Wc2026Match,
  side: string,
  moment: DecisiveMoment,
  seed: number
): MatchState {
  const opponent = side === match.home ? match.away : match.home;
  const sideLineup = match.lineups.find((l) => l.teamCode === side);
  const oppLineup = match.lineups.find((l) => l.teamCode === opponent);
  if (!sideLineup || !oppLineup) {
    throw new Error(`fromRealState: lineup not found for ${side}/${opponent} in match ${match.id}`);
  }

  const oppSetup = baseSideSetup(opponent, placeStartersInSlots(oppLineup.starters));
  const meLineup = placeStartersInSlots(sideLineup.starters);

  const takeoverMinute = moment.takeoverMinute;
  const events = [...match.events]
    .filter((e) => e.minute <= takeoverMinute)
    .sort((a, b) => a.minute - b.minute);

  let scoreMe = 0;
  let scoreOpp = 0;
  let subsUsedMe = 0;

  for (const ev of events) {
    if (ev.type === "goal" || ev.type === "pen_goal") {
      if (ev.teamCode === side) scoreMe += 1;
      else if (ev.teamCode === opponent) scoreOpp += 1;
    } else if (ev.type === "own_goal") {
      // own_goal.teamCode = 자책골을 자기 골문에 넣은(가해) 팀 -> 득점은 상대에 가산.
      if (ev.teamCode === side) scoreOpp += 1;
      else if (ev.teamCode === opponent) scoreMe += 1;
    } else if (ev.type === "sub" && ev.teamCode === side) {
      // playerId = 투입(in) 선수, relatedPlayerId = 교체되어 나가는(out) 선수.
      // data/wc2026/matches.json의 실제 sub 이벤트(예: 매치 760415, RSA, 56분 —
      // playerId "301321"은 RSA bench에, relatedPlayerId "264751"은 RSA starters에
      // 있음을 확인)로 검증했으며, 이는 types.ts의 relatedPlayerId 주석("sub의 out
      // 선수")과도 일치한다.
      const outId = ev.relatedPlayerId;
      const inId = ev.playerId;
      if (outId) {
        const slotId = Object.keys(meLineup).find((k) => meLineup[k] === outId);
        if (slotId) meLineup[slotId] = inId;
        // out 선수가 현재 라인업에 없어도(데이터 이상 등) 교체 횟수는 그대로 센다.
      }
      subsUsedMe += 1;
    } else if (ev.type === "red" && ev.teamCode === side) {
      const slotId = Object.keys(meLineup).find((k) => meLineup[k] === ev.playerId);
      if (slotId) delete meLineup[slotId]; // 10인 체제 허용(엔진이 <11 라인업을 지원)
    }
  }

  const meSetup = baseSideSetup(side, meLineup);

  // initMatch로 기본 MatchState(캐시 필드 lambdaMe/lambdaOpp/lines/injuryTime/
  // initialMe/initialOpp 포함)를 얻는다 — meSetup은 이미 takeoverMinute까지의 실제
  // 교체/레드카드가 반영된 라인업이므로, initMatch가 계산하는 λ/lineStrengths도
  // 그 시점의 실제 라인업 기준으로 정확하다. 이후 시점 관련 필드만 덮어쓴다.
  const base = initMatch(meSetup, oppSetup, "wc_default", seed);

  // 스태미나: 전원 1로 초기화된 base.stamina에서, 온피치 22명만 경과분 기반 감쇠로
  // 덮어쓴다(브리프 근사식: 1 - minute/110, 0.3 하한).
  const decay = Math.max(0.3, 1 - takeoverMinute / 110);
  const stamina: Record<string, number> = { ...base.stamina };
  for (const pid of Object.values(meSetup.lineup)) stamina[pid] = decay;
  for (const pid of Object.values(oppSetup.lineup)) stamina[pid] = decay;

  const remainingFraction = Math.max(0, (90 - takeoverMinute) / 90);
  const win = winProbGivenScore(
    scoreMe,
    scoreOpp,
    base.lambdaMe * remainingFraction * ENGINE_CONSTANTS.REALIZED_GOAL_CALIBRATION,
    base.lambdaOpp * remainingFraction * ENGINE_CONSTANTS.REALIZED_GOAL_CALIBRATION
  );

  return {
    ...base,
    minute: takeoverMinute,
    scoreMe,
    scoreOpp,
    stamina,
    subsUsedMe,
    finished: false,
    probTimeline: [{ minute: takeoverMinute, win }],
  };
}

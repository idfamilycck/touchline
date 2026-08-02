// 세트피스(파울 → 직접 프리킥) 해결.
//
// 왜 필요한가: 이 엔진에서 "card"(경고)는 파울과 무관하게 pressing 기반 독립 확률로
// 발동하는 이벤트다 — 즉 파울이라는 개념 자체가 엔진에 없다. 코너킥은 setpiece.ts가
// 이미 해결했지만, 직접 프리킥으로 이어지는 파울 경로는 여전히 존재하지 않는다.
//
// 이 모듈은 pressing 기반으로 파울 발생 여부를 굴리고, 세로 3분할 존(수비/중원/공격,
// 파울을 저지른 팀 자기 진영 기준)을 근사해 위험 지역(수비/중원) 파울만 직접 프리킥
// 슈팅으로 잇는다. 공격 존(상대 진영 깊숙한 곳) 파울은 파울당하는 팀 골문에서 멀어
// 득점 위협이 없으므로 스킵한다. 좌우 9분할도 검토했으나 세로 3분할로 단순화했다.
//
// 신규 능력치(freeKick)를 만들지 않고 기존 setPiece를 재활용한다 — 새 스탯을 만들어도
// 저작권/실측 문제는 동일하다는 결론에 따른 선택이다(setpiece.ts의 코너킥과 동일 소스).

import { playersOf } from "@/lib/data/players";
import { FORMATIONS } from "@/lib/data/formations";
import type { Player, SideSetup, TeamInstructions } from "@/lib/types";

export type FoulZone = "def" | "mid" | "att";

// 존별 파울 분포. 낮은 압박(딥블록)일수록 최종 저지선인 자기 박스 근처에서 파울이
// 몰리고, 높은 압박일수록 상대 진영에서 끊어내려다 저지르는 파울이 늘어난다.
const FOUL_ZONE_WEIGHTS: Record<TeamInstructions["pressing"], { def: number; mid: number }> = {
  1: { def: 0.5, mid: 0.35 }, // att = 0.15
  2: { def: 0.35, mid: 0.4 }, // att = 0.25
  3: { def: 0.2, mid: 0.35 }, // att = 0.45
};

/** rand는 0~1 난수. 호출자가 자신의 시드 RNG에서 뽑아 넘긴다(순수 함수 유지). */
export function pickFoulZone(pressing: TeamInstructions["pressing"], rand: number): FoulZone {
  const { def, mid } = FOUL_ZONE_WEIGHTS[pressing];
  if (rand < def) return "def";
  if (rand < def + mid) return "mid";
  return "att";
}

// 존별로 "파울이 실제 직접 프리킥 슈팅까지 이어지는가"의 확률. 박스 바로 앞(def)은
// 대부분 직접 슈팅을 노리지만, 중거리(mid)는 크로스·간접 프리킥으로 흐르는 경우가
// 더 많다. att는 애초에 processFoul에서 스킵되므로 여기 없다.
export const FK_SHOT_PROB: Record<"def" | "mid", number> = { def: 0.28, mid: 0.12 };

/**
 * 이 직접 프리킥이 골이 될 확률.
 *
 * setPiece 50을 기준으로 가감한다. def(박스 바로 앞)는 실제 통계상 직접 프리킥
 * 득점률이 유의미하게 존재하는 구간이라 base를 더 높게, mid(장거리)는 극히
 * 희박하게 잡는다.
 */
export function freeKickGoalProb(zone: "def" | "mid", setPiece: number): number {
  if (zone === "def") {
    return Math.min(0.35, Math.max(0.02, 0.05 + (setPiece - 50) / 250));
  }
  return Math.min(0.15, Math.max(0.005, 0.02 + (setPiece - 50) / 400));
}

/**
 * 프리킥 키커. 작전실에서 지정한 special.fkTakerId가 온피치 필드 플레이어(GK 제외)를
 * 가리키면 그 선수, 없으면 온피치 필드 플레이어 중 setPiece가 가장 높은 선수가 찬다.
 */
export function freeKickTaker(setup: SideSetup): Player | undefined {
  const formation = FORMATIONS[setup.instructions.formation];
  const squad = playersOf(setup.teamId);
  const onPitch = formation.slots
    .filter((slot) => slot.position !== "GK")
    .map((slot) => squad.find((p) => p.id === setup.lineup[slot.id]))
    .filter((p): p is Player => Boolean(p));
  if (onPitch.length === 0) return undefined;

  const designatedId = setup.special?.fkTakerId;
  if (designatedId) {
    const designated = onPitch.find((p) => p.id === designatedId);
    if (designated) return designated;
  }
  return onPitch.reduce((best, cur) => (cur.setPiece > best.setPiece ? cur : best));
}

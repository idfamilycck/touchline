// 라이브 피치(가로형 300×180) 위 선수 점 좌표 계산.
// 포메이션 슬롯 좌표계는 세로형(자기 골문 기준: x=피치 폭 0~100, y=깊이 0~100)이므로,
// me(오른쪽 공격)는 깊이→X(왼쪽 골문에서 중앙선 방향), 폭→Y로 눕혀서 배치하고
// opp는 같은 변환의 점대칭(180°) 미러로 오른쪽 절반에 배치한다.

import { FORMATIONS } from "@/lib/data/formations";
import type { SideSetup } from "@/lib/types";

export const VB_W = 300;
export const VB_H = 180;

// 자기 골문(깊이 0) → X=14, 최대 깊이(100) → 중앙선 못 미친 X=144.
const DEPTH_X_MIN = 14;
const DEPTH_X_SPAN = 130;
// 피치 폭(0~100) → Y=14~166.
const WIDTH_Y_MIN = 14;
const WIDTH_Y_SPAN = VB_H - 2 * WIDTH_Y_MIN;

export interface PlayerDot {
  slotId: string;
  playerId: string;
  cx: number;
  cy: number;
}

// ── 공 따라가기: 모든 선수가 포메이션 기준점에서 공 방향으로 라인별 강도만큼 끌려간다 ──
// 실제 축구의 팀 전형 이동 느낌: GK 미세, 수비 소폭, 미드필더 최대, 공격수 중간.
const FOLLOW: Record<string, { k: number; cap: number }> = {
  gk: { k: 0.05, cap: 4 },
  cb: { k: 0.11, cap: 12 },
  fb: { k: 0.12, cap: 13 },
  dm: { k: 0.18, cap: 18 },
  cm: { k: 0.2, cap: 18 },
  am: { k: 0.2, cap: 18 },
  wg: { k: 0.15, cap: 16 },
  st: { k: 0.14, cap: 16 },
};
const FOLLOW_DEFAULT = { k: 0.15, cap: 15 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function followBall(dot: PlayerDot, ball: { cx: number; cy: number }): { tx: number; ty: number } {
  const prefix = dot.slotId.replace(/[_0-9].*$/, "");
  const { k, cap } = FOLLOW[prefix] ?? FOLLOW_DEFAULT;
  const dx = clamp((ball.cx - dot.cx) * k, -cap, cap);
  const dy = clamp((ball.cy - dot.cy) * k, -cap, cap);
  return {
    tx: clamp(dot.cx + dx, 10, VB_W - 10),
    ty: clamp(dot.cy + dy, 10, VB_H - 10),
  };
}

export function playerDots(setup: SideSetup, side: "me" | "opp"): PlayerDot[] {
  const formation = FORMATIONS[setup.instructions.formation];
  const dots: PlayerDot[] = [];
  for (const slot of formation.slots) {
    const playerId = setup.lineup[slot.id];
    if (!playerId) continue;
    const cx = DEPTH_X_MIN + (slot.y / 100) * DEPTH_X_SPAN;
    const cy = WIDTH_Y_MIN + (slot.x / 100) * WIDTH_Y_SPAN;
    dots.push(
      side === "me"
        ? { slotId: slot.id, playerId, cx, cy }
        : { slotId: slot.id, playerId, cx: VB_W - cx, cy: VB_H - cy }
    );
  }
  return dots;
}

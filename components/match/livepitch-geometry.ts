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

// ── 공 쪽으로 쏠림: 선수가 공 방향으로 살짝 이동하되 "라인은 유지"한다 ──
// 예전엔 깊이(cx)와 좌우(cy)를 같은 강도로 끌어당겨, 공이 골문 근처로 가면 전원이
// 그쪽으로 collapse하며 뭉쳐 다녔다(수비수가 공격 진영까지 딸려감). 실제 축구는
// 공 "쪽(좌우)"으로 블록이 시프트하되 각자 깊이 라인은 지킨다. 그래서 깊이(kx)는
// 아주 약하게(수비수는 뒤에, 공격수는 앞에 그대로), 좌우(ky)만 완만히 쏠리게 한다.
// 팀 전체의 전진/후퇴(하프라인 넘나듦)는 dynamicDots(tilt)가 이미 담당한다.
const FOLLOW: Record<string, { kx: number; ky: number; capx: number; capy: number }> = {
  gk: { kx: 0.03, ky: 0.05, capx: 3, capy: 6 },
  cb: { kx: 0.05, ky: 0.11, capx: 6, capy: 13 },
  fb: { kx: 0.06, ky: 0.13, capx: 7, capy: 15 },
  dm: { kx: 0.07, ky: 0.14, capx: 8, capy: 16 },
  cm: { kx: 0.08, ky: 0.15, capx: 9, capy: 16 },
  am: { kx: 0.09, ky: 0.15, capx: 10, capy: 16 },
  wg: { kx: 0.07, ky: 0.13, capx: 9, capy: 15 },
  st: { kx: 0.09, ky: 0.13, capx: 10, capy: 15 },
};
const FOLLOW_DEFAULT = { kx: 0.07, ky: 0.13, capx: 8, capy: 14 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function followBall(dot: PlayerDot, ball: { cx: number; cy: number }): { tx: number; ty: number } {
  const prefix = dot.slotId.replace(/[_0-9].*$/, "");
  const { kx, ky, capx, capy } = FOLLOW[prefix] ?? FOLLOW_DEFAULT;
  const dx = clamp((ball.cx - dot.cx) * kx, -capx, capx);
  const dy = clamp((ball.cy - dot.cy) * ky, -capy, capy);
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

// ── 동적 전형: 경기 국면(tilt)에 따라 팀 전체가 하프라인을 넘나든다 ──
// tilt: 0(우리 골문 앞 수세) ~ 1(상대 골문 앞 공세). me 기준이며 opp는 (1-tilt)를 쓴다.
// 실제 축구처럼 공세일 땐 수비수가 하프라인 부근, 공격수는 상대 박스 근처까지 올라가고
// 수세일 땐 전원이 자기 진영으로 내려앉는다. GK는 골문 근처에서 소폭만 움직인다.
export function dynamicDots(setup: SideSetup, side: "me" | "opp", tilt: number): PlayerDot[] {
  const t = Math.max(0, Math.min(1, side === "me" ? tilt : 1 - tilt));
  const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
  const formation = FORMATIONS[setup.instructions.formation];
  // 최후방/최전방 기준선. 공세(t=1)에도 최후방은 센터라인(150) 살짝 뒤에 머물러
  // 수비 라인을 남기고, 수세(t=0)에도 최전방은 센터 부근에 outlet으로 남긴다 —
  // 그래야 팀이 한 진영에 뭉치지 않고 세로로 늘 펼쳐진 모양을 유지한다.
  const defLine = lerp(22, 132, t); // 최후방 필드플레이어 기준선
  const attLine = lerp(116, 266, t); // 최전방 기준선
  const dots: PlayerDot[] = [];
  for (const slot of formation.slots) {
    const playerId = setup.lineup[slot.id];
    if (!playerId) continue;
    const cy = WIDTH_Y_MIN + (slot.x / 100) * WIDTH_Y_SPAN;
    let cx: number;
    if (slot.id === "gk") {
      cx = lerp(13, 42, t);
    } else {
      const f = Math.min(1, slot.y / 85); // 슬롯 깊이 0~1
      cx = defLine + f * (attLine - defLine);
    }
    cx = Math.max(10, Math.min(VB_W - 10, cx));
    dots.push(
      side === "me"
        ? { slotId: slot.id, playerId, cx, cy }
        : { slotId: slot.id, playerId, cx: VB_W - cx, cy: VB_H - cy }
    );
  }
  return dots;
}

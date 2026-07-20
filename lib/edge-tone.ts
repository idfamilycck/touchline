// 우세 표시의 공용 3-상태 판정.
//
// 이 앱에서 가장 크게 노출되는 숫자가 승률이라, 우세/열세 단언은 근거가 있어야 한다.
// 이전 구현은 `win >= loss` / `pct >= 50` 이분법이라 두 가지 문제가 있었다:
//   (1) 승률과 패률이 완전히 같아도 "우리가 유리해요"라고 단언했다.
//   (2) 반올림된 값을 비교해 37.6% vs 38.4%처럼 실제로 기운 매치업을 동률로 뭉갰다.
// 그래서 판정은 항상 "반올림 전 원본 값"으로 하고, DEADBAND 안쪽은 "팽팽"으로 부른다.
//
// 홈 하단 바(2-결과 ELO 기준선)와 작전실 WinGauge(승/무/패 3-결과)가 같은 규칙을
// 쓰도록 여기 한 곳에 둔다. 두 화면이 같은 매치업을 다르게 부르면 안 된다.

/** 우세로 인정하는 최소 격차(%p). 이 안쪽은 전부 "팽팽". */
export const EDGE_DEADBAND = 2;

export type EdgeTone = "favored" | "even" | "behind";

/** 승률/패률(%, 반올림 전)의 격차로 판정한다. 무승부 확률이 있는 3-결과용. */
export function edgeToneFromWinLoss(winPct: number, lossPct: number): EdgeTone {
  return toneFromEdge(winPct - lossPct);
}

/** 승률(%, 반올림 전)만 있을 때. 무승부가 없는 2-결과(ELO 기준선)용. */
export function edgeToneFromWinPct(winPct: number): EdgeTone {
  return toneFromEdge(winPct - 50);
}

function toneFromEdge(edge: number): EdgeTone {
  if (edge >= EDGE_DEADBAND) return "favored";
  if (edge <= -EDGE_DEADBAND) return "behind";
  return "even";
}

/** 게이지·바 색상. 팽팽은 초록/빨강 어느 쪽도 아닌 중립(액센트)으로 둔다. */
export const EDGE_COLOR: Record<EdgeTone, string> = {
  favored: "var(--color-gain)",
  even: "var(--color-accent)",
  behind: "var(--color-danger)",
};

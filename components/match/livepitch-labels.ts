// 라이브 피치 선수 이름 라벨 배치(순수 로직).
// 점(선수 마커) 좌표는 전술적으로 의미가 있어 절대 건드리지 않는다. 대신 이름 라벨만
// 점 아래/위로 뒤집거나, 그래도 자리가 없으면 숨겨서 글자끼리 겹치는 것을 막는다.
//
// 배치 규칙(우선순위 그리디):
//  1) 우선순위가 높은 라벨부터 자리를 잡는다 — 장면 주인공 > 장면 가담자/볼홀더 > GK > 나머지.
//  2) 각 라벨은 "점 아래"를 먼저 시도하고, 이미 놓인 라벨이나 남의 선수 점과 겹치면 "점 위"로 뒤집는다.
//  3) 둘 다 겹치면 이름을 숨긴다. 등번호는 점 안에 그대로 남으므로 식별은 유지된다.
// 결과적으로 한산한 구역은 전원 이름이 보이고, 중원 밀집·세트피스처럼 붙는 순간에만
// 장면에 관여하는 선수와 GK 위주로 이름이 남는다.

/** 이름 라벨 기본 글자 크기(SVG 사용자 단위) */
export const LABEL_FONT_SIZE = 3.6;
/** 점 중심 기준 "아래" 배치 baseline 오프셋 */
export const LABEL_DY_BELOW = 11.5;
/** 점 중심 기준 "위" 배치 baseline 오프셋 */
export const LABEL_DY_ABOVE = -8.4;

/** 라벨 우선순위 — 클수록 먼저 자리를 잡고, 밀려서 숨겨질 일이 없다. */
export const LABEL_PRIORITY = {
  /** 슈터·헤더 등 펄스 강조 대상 */
  star: 4,
  /** 장면 안무에 가담한 선수(패스 대상·코너 경합조·키커) 또는 평상시 볼홀더 */
  involved: 3,
  /** 골키퍼 */
  keeper: 2,
  /** 그 외 */
  normal: 1,
} as const;

export interface LabelCandidate {
  /** 렌더 키(`${side}-${slotId}`) — 고유해야 한다 */
  key: string;
  text: string;
  /** 라벨이 따라붙는 점의 화면 좌표 */
  cx: number;
  cy: number;
  priority: number;
}

export interface LabelPlacement {
  /** <text dy>에 그대로 넣는 baseline 오프셋 */
  dy: number;
  placement: "below" | "above";
}

/** 라벨이 피해야 할 선수 점(마커) */
export interface LabelObstacle {
  /** 대응하는 후보 key — 자기 자신의 점은 충돌에서 제외한다 */
  key: string;
  cx: number;
  cy: number;
}

export interface LayoutOptions {
  fontSize?: number;
  /** 충돌 판정 여유 — 미세 흔들림(jitter) 폭을 흡수한다 */
  padX?: number;
  padY?: number;
  /** 라벨이 벗어나면 안 되는 세로 범위 */
  minY?: number;
  maxY?: number;
  /** 라벨이 덮으면 안 되는 선수 점들(자기 점 제외) */
  obstacles?: LabelObstacle[];
  /** 점 하나가 차지하는 반지름(마커 반지름 + 테두리) */
  dotRadius?: number;
}

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const CJK = /[⺀-鿿豈-﫿！-｠]/;
const NARROW = /[iljtfrI.,:;'`!|]/;
const WIDE_LATIN = /[A-Z@%WM]/;

/**
 * 텍스트 폭 추정(SVG 사용자 단위). 한글·CJK 글자는 라틴 글자보다 훨씬 넓으므로
 * 전각 1.0em, 라틴은 글자 모양에 따라 0.3~0.7em으로 가중한다.
 */
export function estimateTextWidth(text: string, fontSize: number = LABEL_FONT_SIZE): number {
  let em = 0;
  for (const ch of text) {
    if (HANGUL.test(ch) || CJK.test(ch)) em += 1.0;
    else if (ch === " ") em += 0.28;
    else if (NARROW.test(ch)) em += 0.32;
    else if (WIDE_LATIN.test(ch)) em += 0.66;
    else em += 0.54;
  }
  return em * fontSize;
}

function rectFor(c: LabelCandidate, dy: number, fontSize: number, padX: number, padY: number): Rect {
  const half = estimateTextWidth(c.text, fontSize) / 2 + padX;
  const baseline = c.cy + dy;
  return {
    x0: c.cx - half,
    x1: c.cx + half,
    // baseline 위로 대문자 높이(~0.8em), 아래로 디센더(~0.22em)
    y0: baseline - fontSize * 0.8 - padY,
    y1: baseline + fontSize * 0.22 + padY,
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** 원(선수 점)과 사각형(라벨) 교차 — 사각형 위의 최근접점까지 거리로 판정 */
function circleHitsRect(cx: number, cy: number, r: number, rect: Rect): boolean {
  const nx = Math.max(rect.x0, Math.min(cx, rect.x1));
  const ny = Math.max(rect.y0, Math.min(cy, rect.y1));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

/**
 * 겹치지 않는 라벨 배치를 고른다. 반환 맵에 없는 key는 "이름 숨김"을 뜻한다.
 * 입력 순서와 무관하게 (priority desc, key asc)로 결정적이다.
 */
export function layoutLabels(
  candidates: LabelCandidate[],
  options: LayoutOptions = {}
): Map<string, LabelPlacement> {
  const fontSize = options.fontSize ?? LABEL_FONT_SIZE;
  const padX = options.padX ?? 1.4;
  const padY = options.padY ?? 1.1;
  const minY = options.minY ?? -Infinity;
  const maxY = options.maxY ?? Infinity;
  const obstacles = options.obstacles ?? [];
  const dotRadius = options.dotRadius ?? 6.5;

  const order = candidates
    .filter((c) => c.text.trim().length > 0)
    .slice()
    .sort((a, b) => b.priority - a.priority || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const placedRects: Rect[] = [];
  const result = new Map<string, LabelPlacement>();

  for (const c of order) {
    const options2: Array<{ dy: number; placement: "below" | "above" }> = [
      { dy: LABEL_DY_BELOW, placement: "below" },
      { dy: LABEL_DY_ABOVE, placement: "above" },
    ];
    for (const opt of options2) {
      const r = rectFor(c, opt.dy, fontSize, padX, padY);
      if (r.y0 < minY || r.y1 > maxY) continue;
      if (placedRects.some((p) => overlaps(p, r))) continue;
      if (obstacles.some((o) => o.key !== c.key && circleHitsRect(o.cx, o.cy, dotRadius, r))) continue;
      placedRects.push(r);
      result.set(c.key, { dy: opt.dy, placement: opt.placement });
      break;
    }
  }

  return result;
}

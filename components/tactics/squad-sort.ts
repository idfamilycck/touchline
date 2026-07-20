// 스쿼드 리스트 정렬(순수 로직, 스토어/DOM 비의존). SquadList가 이 함수로 표시 순서만
// 바꾼다 — 실제 lineup(슬롯 배치)에는 전혀 영향을 주지 않는다.

import type { Player, PlayerAttrs } from "@/lib/types";

export type SortKey =
  | "name"
  | "age"
  | "overall"
  | keyof PlayerAttrs
  | "setPiece"
  | "aerial"
  | "penalty"
  | "mental";

export type SortDir = "asc" | "desc";

/**
 * 종합(overall) 능력치 — 포지션과 무관하게 스쿼드를 한 번에 훑어보기 위한 근사 지표.
 * goalkeeping은 필드 플레이어에게는 사실상 의미 없는 값(대부분 한 자릿수)이라
 * 그대로 다른 7개 attrs와 평균 내면 종합 점수가 왜곡된다. 그래서:
 *  - GK 포지션을 보유한 선수 → goalkeeping을 핵심 능력치로 사용
 *  - 그 외 필드 플레이어 → shooting/passing/dribbling/defending/pace/physical
 *    6종의 평균을 핵심 능력치로 사용
 * 핵심 능력치(가중치 0.7) + 특수 능력치 setPiece/aerial/penalty/mental 평균(가중치 0.3)의
 * 가중합. 정렬 전용 값이라 반올림하지 않는다(표시용 반올림은 UI 쪽 책임).
 */
export function overallOf(player: Player): number {
  const isGK = player.positions.includes("GK");
  const core = isGK
    ? player.attrs.goalkeeping
    : (player.attrs.shooting +
        player.attrs.passing +
        player.attrs.dribbling +
        player.attrs.defending +
        player.attrs.pace +
        player.attrs.physical) /
      6;
  const extras = (player.setPiece + player.aerial + player.penalty + player.mental) / 4;
  return core * 0.7 + extras * 0.3;
}

const TOP_LEVEL_KEYS = new Set<SortKey>(["setPiece", "aerial", "penalty", "mental"]);

/** name/age를 제외한 SortKey(overall 포함)를 숫자 값으로 읽는다. 행 안의 스탯 셀 표시에 재사용. */
export function numericValueOf(player: Player, key: Exclude<SortKey, "name">): number {
  if (key === "age") return player.age;
  if (key === "overall") return overallOf(player);
  if (TOP_LEVEL_KEYS.has(key)) return player[key as "setPiece" | "aerial" | "penalty" | "mental"];
  return player.attrs[key as keyof PlayerAttrs];
}

function valueOf(player: Player, key: SortKey): number | string {
  if (key === "name") return player.name;
  return numericValueOf(player, key);
}

/**
 * players를 key/dir 기준으로 정렬한 새 배열을 반환한다(원본 미변경).
 * 동점(같은 정렬 값)일 때는 항상 원래 배열 순서를 유지하는 안정 정렬이다 — dir이
 * "desc"여도 동점 그룹 내부 순서는 뒤집히지 않는다(원본 인덱스로 타이브레이크).
 */
export function sortSquad(players: Player[], key: SortKey, dir: SortDir): Player[] {
  const mul = dir === "asc" ? 1 : -1;
  return players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const va = valueOf(a.p, key);
      const vb = valueOf(b.p, key);
      const cmp =
        typeof va === "string" || typeof vb === "string"
          ? String(va).localeCompare(String(vb), "ko")
          : (va as number) - (vb as number);
      if (cmp !== 0) return cmp * mul;
      return a.i - b.i;
    })
    .map((w) => w.p);
}

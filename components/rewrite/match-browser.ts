// components/rewrite/match-browser.ts
//
// Pure filter/sort helpers for the /rewrite match browser. No React, no I/O —
// keeps the KOR-first + round-filter logic unit-testable in isolation from
// the client component that renders it.

import type { Wc2026Match, Wc2026Round } from "@/lib/wc2026/types";

const ROUND_LABELS_KO: Record<Wc2026Round, string> = {
  group: "조별리그",
  r32: "32강",
  r16: "16강",
  qf: "8강",
  sf: "4강",
  third: "3·4위전",
  final: "결승",
};

export function roundLabelKo(round: Wc2026Round): string {
  return ROUND_LABELS_KO[round];
}

function isKorMatch(m: Wc2026Match): boolean {
  return m.home === "KOR" || m.away === "KOR";
}

// 조별리그에 존재하는 조 문자(A~L)를 정렬해 반환한다.
export function availableGroups(matches: Wc2026Match[]): string[] {
  const s = new Set<string>();
  for (const m of matches) {
    if (m.round === "group" && m.group) s.add(m.group);
  }
  return [...s].sort();
}

// 라운드 필터(선택) + 조 필터(선택) 적용 후, KOR 관련 경기를 최상단으로 올리고,
// 각 그룹 내부는 kickoffISO 오름차순으로 정렬한다.
export function sortForBrowser(
  matches: Wc2026Match[],
  roundFilter?: Wc2026Round,
  groupFilter?: string,
): Wc2026Match[] {
  let filtered = roundFilter ? matches.filter((m) => m.round === roundFilter) : matches;
  if (groupFilter) filtered = filtered.filter((m) => m.group === groupFilter);

  return [...filtered].sort((a, b) => {
    const aKor = isKorMatch(a);
    const bKor = isKorMatch(b);
    if (aKor !== bKor) return aKor ? -1 : 1;
    return a.kickoffISO < b.kickoffISO ? -1 : a.kickoffISO > b.kickoffISO ? 1 : 0;
  });
}

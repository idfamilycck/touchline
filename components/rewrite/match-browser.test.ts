// components/rewrite/match-browser.test.ts
import { describe, it, expect } from "vitest";
import { sortForBrowser, roundLabelKo, availableGroups } from "@/components/rewrite/match-browser";
import type { Wc2026Match } from "@/lib/wc2026/types";
// KOR 경기가 최상단으로 오는지, round/조 필터가 동작하는지 검증

function mk(
  id: string,
  home: string,
  away: string,
  round: Wc2026Match["round"],
  kickoffISO: string,
  group?: string,
): Wc2026Match {
  return {
    id,
    round,
    home,
    away,
    scoreHome: 1,
    scoreAway: 0,
    venueKo: "메트라이프",
    kickoffISO,
    events: [],
    lineups: [] as unknown as Wc2026Match["lineups"],
    ...(group ? { group } : {}),
  };
}

describe("sortForBrowser", () => {
  const matches: Wc2026Match[] = [
    mk("1", "BRA", "ESP", "group", "2026-06-11T12:00Z"),
    mk("2", "JPN", "KOR", "group", "2026-06-10T12:00Z"),
    mk("3", "FRA", "GER", "r16", "2026-06-09T12:00Z"),
    mk("4", "KOR", "USA", "r16", "2026-06-13T12:00Z"),
  ];

  it("KOR이 포함된 경기가 최상단으로 온다", () => {
    const sorted = sortForBrowser(matches);
    expect(sorted[0].id === "2" || sorted[0].id === "4").toBe(true);
    expect(sorted[1].id === "2" || sorted[1].id === "4").toBe(true);
  });

  it("KOR 경기 그룹 내부는 kickoffISO 오름차순", () => {
    const sorted = sortForBrowser(matches);
    const korMatches = sorted.filter((m) => m.home === "KOR" || m.away === "KOR");
    expect(korMatches.map((m) => m.id)).toEqual(["2", "4"]);
  });

  it("KOR이 없는 나머지도 kickoffISO 오름차순", () => {
    const sorted = sortForBrowser(matches);
    const rest = sorted.filter((m) => m.home !== "KOR" && m.away !== "KOR");
    expect(rest.map((m) => m.id)).toEqual(["3", "1"]);
  });

  it("round 필터가 주어지면 해당 라운드만 반환", () => {
    const sorted = sortForBrowser(matches, "r16");
    expect(sorted.map((m) => m.id).sort()).toEqual(["3", "4"]);
  });

  it("round 필터 없으면 전체 반환", () => {
    expect(sortForBrowser(matches)).toHaveLength(4);
  });
});

describe("조 필터", () => {
  const groupMatches: Wc2026Match[] = [
    mk("g1", "KOR", "GHA", "group", "2026-06-11T12:00Z", "A"),
    mk("g2", "URU", "POR", "group", "2026-06-12T12:00Z", "A"),
    mk("g3", "BRA", "SRB", "group", "2026-06-13T12:00Z", "B"),
    mk("k1", "FRA", "ENG", "r16", "2026-06-20T12:00Z"),
  ];

  it("availableGroups는 조별리그의 조 문자를 정렬해 반환한다", () => {
    expect(availableGroups(groupMatches)).toEqual(["A", "B"]);
  });

  it("조 필터가 주어지면 해당 조 경기만 반환", () => {
    const sorted = sortForBrowser(groupMatches, "group", "A");
    expect(sorted.map((m) => m.id).sort()).toEqual(["g1", "g2"]);
  });

  it("조 필터 없으면 라운드 내 전체 조 반환", () => {
    const sorted = sortForBrowser(groupMatches, "group");
    expect(sorted.map((m) => m.id).sort()).toEqual(["g1", "g2", "g3"]);
  });
});

describe("roundLabelKo", () => {
  it("각 라운드를 한국어 라벨로 매핑한다", () => {
    expect(roundLabelKo("group")).toBe("조별리그");
    expect(roundLabelKo("r32")).toBe("32강");
    expect(roundLabelKo("r16")).toBe("16강");
    expect(roundLabelKo("qf")).toBe("8강");
    expect(roundLabelKo("sf")).toBe("4강");
    expect(roundLabelKo("third")).toBe("3·4위전");
    expect(roundLabelKo("final")).toBe("결승");
  });
});

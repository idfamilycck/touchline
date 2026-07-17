import type { HeadToHead } from "@/lib/types";

// winA/draw/winB counts are relative to teamA/teamB as listed (order of the
// pair itself is arbitrary — h2hOf() normalizes lookups so a/b order never matters).
export const H2H: HeadToHead[] = [
  { teamA: "kor", teamB: "jpn", winA: 42, draw: 23, winB: 15 },
  { teamA: "kor", teamB: "ger", winA: 1, draw: 2, winB: 9 },
  { teamA: "bra", teamB: "arg", winA: 43, draw: 26, winB: 35 },
  { teamA: "esp", teamB: "por", winA: 24, draw: 13, winB: 11 },
  { teamA: "eng", teamB: "fra", winA: 13, draw: 8, winB: 12 },
  { teamA: "arg", teamB: "fra", winA: 7, draw: 4, winB: 6 },
  { teamA: "bra", teamB: "ger", winA: 14, draw: 6, winB: 6 },
  { teamA: "kor", teamB: "por", winA: 1, draw: 1, winB: 2 },
  { teamA: "jpn", teamB: "ger", winA: 2, draw: 2, winB: 6 },
  { teamA: "jpn", teamB: "esp", winA: 1, draw: 0, winB: 2 },
  { teamA: "usa", teamB: "mex", winA: 19, draw: 17, winB: 38 },
  { teamA: "mar", teamB: "esp", winA: 1, draw: 1, winB: 3 },
  { teamA: "mar", teamB: "por", winA: 1, draw: 1, winB: 2 },
  { teamA: "cro", teamB: "bra", winA: 1, draw: 1, winB: 3 },
  { teamA: "cro", teamB: "arg", winA: 1, draw: 0, winB: 2 },
  { teamA: "ned", teamB: "arg", winA: 6, draw: 3, winB: 7 },
  { teamA: "ned", teamB: "bra", winA: 3, draw: 2, winB: 4 },
  { teamA: "ita", teamB: "ger", winA: 9, draw: 9, winB: 6 },
  { teamA: "bel", teamB: "fra", winA: 8, draw: 8, winB: 13 },
  { teamA: "eng", teamB: "ger", winA: 15, draw: 8, winB: 17 },
  { teamA: "kor", teamB: "usa", winA: 1, draw: 2, winB: 1 },
  { teamA: "bra", teamB: "por", winA: 3, draw: 1, winB: 1 },
  { teamA: "esp", teamB: "ita", winA: 12, draw: 14, winB: 10 },
  { teamA: "ger", teamB: "fra", winA: 15, draw: 8, winB: 13 },
  { teamA: "eng", teamB: "esp", winA: 6, draw: 4, winB: 7 },
  { teamA: "jpn", teamB: "bra", winA: 1, draw: 1, winB: 4 },
];

export function h2hOf(a: string, b: string): HeadToHead | undefined {
  const stored = H2H.find(
    (h) => (h.teamA === a && h.teamB === b) || (h.teamA === b && h.teamB === a)
  );
  if (!stored) return undefined;
  // Always orient the result to the caller's (a, b) order so winA/winB
  // unambiguously correspond to the requested teams regardless of how the
  // record happens to be stored.
  if (stored.teamA === a) return stored;
  return { teamA: a, teamB: b, winA: stored.winB, draw: stored.draw, winB: stored.winA };
}

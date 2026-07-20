// lib/wc2026/moments.ts
//
// Pure function: extract "decisive moments" from a real WC2026 match, from
// the perspective of a chosen side. No I/O, no mutation, no Math.random.

import type { Wc2026Match, Wc2026Event } from "@/lib/wc2026/types";

export interface DecisiveMoment {
  id: string; // matchId+minute+kind
  kind: "concede" | "red" | "lead_lost" | "late_tie";
  eventMinute: number; // 실제 사건 분
  takeoverMinute: number; // max(eventMinute-5, 0)
  labelKo: string; // "88' 결승골 실점 — 83'로 돌아가기"
}

// Priority used when multiple kinds land on the same eventMinute.
const KIND_PRIORITY: Record<DecisiveMoment["kind"], number> = {
  lead_lost: 3,
  concede: 2,
  red: 1,
  late_tie: 0,
};

function labelFor(kind: DecisiveMoment["kind"], eventMinute: number, takeoverMinute: number): string {
  switch (kind) {
    case "lead_lost":
      return `${eventMinute}' 리드 상실, ${takeoverMinute}'로 돌아가기`;
    case "concede":
      return `${eventMinute}' 실점, ${takeoverMinute}'로 돌아가기`;
    case "red":
      return `${eventMinute}' 퇴장, ${takeoverMinute}'로 돌아가기`;
    case "late_tie":
      return `${eventMinute}' 동점 승부처, ${takeoverMinute}'로 돌아가기`;
  }
}

const SCORING_TYPES = new Set<Wc2026Event["type"]>(["goal", "pen_goal", "own_goal"]);

export function extractMoments(match: Wc2026Match, side: string): DecisiveMoment[] {
  const opponent = side === match.home ? match.away : match.home;

  // Walk events in minute order (defensive stable sort; dataset is documented
  // as already ascending by minute, but we don't want to depend on that).
  const events = [...match.events].sort((a, b) => a.minute - b.minute);

  type RawKind = { eventMinute: number; kind: DecisiveMoment["kind"] };
  const raw: RawKind[] = [];

  let sideScore = 0;
  let oppScore = 0;

  for (const ev of events) {
    if (ev.minute > 90) continue;

    const beforeSide = sideScore;
    const beforeOpp = oppScore;

    if (SCORING_TYPES.has(ev.type)) {
      if ((ev.type === "goal" || ev.type === "pen_goal") && ev.teamCode === side) {
        sideScore += 1;
      } else if ((ev.type === "goal" || ev.type === "pen_goal") && ev.teamCode === opponent) {
        oppScore += 1;
      } else if (ev.type === "own_goal" && ev.teamCode === side) {
        // side put it into their own net -> opponent's score goes up
        oppScore += 1;
      } else if (ev.type === "own_goal" && ev.teamCode === opponent) {
        // opponent put it into their own net -> side's score goes up
        sideScore += 1;
      }

      if (oppScore > beforeOpp) {
        raw.push({ eventMinute: ev.minute, kind: "concede" });
      }
      if (beforeSide > beforeOpp && sideScore <= oppScore) {
        raw.push({ eventMinute: ev.minute, kind: "lead_lost" });
      }
      if (ev.minute >= 75 && sideScore === oppScore && beforeSide !== beforeOpp) {
        raw.push({ eventMinute: ev.minute, kind: "late_tie" });
      }
    } else if (ev.type === "red" && ev.teamCode === side) {
      raw.push({ eventMinute: ev.minute, kind: "red" });
    }
  }

  // Collapse same eventMinute to one moment, keeping the highest-priority kind.
  const byMinute = new Map<number, DecisiveMoment["kind"]>();
  for (const r of raw) {
    const existing = byMinute.get(r.eventMinute);
    if (!existing || KIND_PRIORITY[r.kind] > KIND_PRIORITY[existing]) {
      byMinute.set(r.eventMinute, r.kind);
    }
  }

  const moments: DecisiveMoment[] = [...byMinute.entries()]
    .sort(([a], [b]) => a - b)
    .map(([eventMinute, kind]) => {
      const takeoverMinute = Math.max(eventMinute - 5, 0);
      return {
        id: `${match.id}-${eventMinute}-${kind}`,
        kind,
        eventMinute,
        takeoverMinute,
        labelKo: labelFor(kind, eventMinute, takeoverMinute),
      };
    });

  return moments;
}

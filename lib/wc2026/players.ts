// lib/wc2026/players.ts
//
// Deterministic virtual Player generator for the 2026 World Cup dataset.
// Real player attributes are never sourced/scraped — every stat is derived
// at runtime from (id, teamId, name, position, teamElo) via a seeded PRNG,
// so the same inputs always produce the exact same Player (required by
// lib/wc2026/players.test.ts).
//
// The `position` arg may be an engine Position ("GK","CM",...) OR one of the
// raw ESPN lineup abbreviations found in data/wc2026/matches.json
// (G, CD, CD-L, CD-R, SW, LB, RB, DM, CM, CM-L, CM-R, M, AM, AM-L, AM-R, LM,
// RM, LF, RF, CF-L, CF-R, RCF, F, SUB, ""). It is normalized to a single
// engine Position before generating attributes.

import type { Player, PlayerAttrs, Position } from "@/lib/types";
import { ENGINE_CONSTANTS } from "@/lib/engine/constants";

export function normalizePosition(raw: string): Position {
  const p = (raw ?? "").trim().toUpperCase();
  if (p === "GK" || p === "G") return "GK";
  if (p === "CB" || p === "SW" || p.startsWith("CD")) return "CB";
  if (p === "FB" || p === "LB" || p === "RB") return "FB";
  if (p === "DM") return "DM";
  if (p === "AM" || p.startsWith("AM")) return "AM";
  if (p === "CM" || p === "M" || p.startsWith("CM")) return "CM";
  if (p === "WG" || p === "LM" || p === "RM" || p === "LF" || p === "RF") return "WG";
  if (p === "ST" || p === "F" || p === "RCF" || p.startsWith("CF")) return "ST";
  return "CM"; // SUB, "", or anything unrecognized -> utility fallback
}

// --- Deterministic PRNG (FNV-1a seed -> mulberry32) -----------------------

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function createRng(seedStr: string): () => number {
  return mulberry32(fnv1a(seedStr));
}

function clampInt(v: number): number {
  return Math.max(1, Math.min(99, Math.round(v)));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// --- Position base profiles -------------------------------------------------
// Plausible baselines patterned after lib/data/players.ts (e.g. a GK sits
// ~85 goalkeeping / ~15 shooting; a striker sits ~88 shooting / ~44 defending).

type ExtraAttrs = { setPiece: number; aerial: number; penalty: number; mental: number };

const POSITION_PROFILES: Record<Position, PlayerAttrs> = {
  GK: { shooting: 15, passing: 50, dribbling: 25, defending: 35, pace: 48, physical: 68, goalkeeping: 85, stamina: 55 },
  CB: { shooting: 45, passing: 68, dribbling: 50, defending: 88, pace: 62, physical: 85, goalkeeping: 6, stamina: 75 },
  FB: { shooting: 48, passing: 72, dribbling: 68, defending: 75, pace: 85, physical: 68, goalkeeping: 6, stamina: 85 },
  DM: { shooting: 54, passing: 82, dribbling: 64, defending: 82, pace: 62, physical: 76, goalkeeping: 5, stamina: 85 },
  CM: { shooting: 60, passing: 82, dribbling: 74, defending: 65, pace: 68, physical: 70, goalkeeping: 5, stamina: 84 },
  AM: { shooting: 72, passing: 82, dribbling: 84, defending: 48, pace: 70, physical: 65, goalkeeping: 5, stamina: 75 },
  WG: { shooting: 72, passing: 72, dribbling: 86, defending: 48, pace: 90, physical: 66, goalkeeping: 5, stamina: 80 },
  ST: { shooting: 88, passing: 62, dribbling: 75, defending: 44, pace: 82, physical: 76, goalkeeping: 5, stamina: 70 },
};

const EXTRA_PROFILES: Record<Position, ExtraAttrs> = {
  GK: { setPiece: 30, aerial: 72, penalty: 42, mental: 62 },
  CB: { setPiece: 40, aerial: 63, penalty: 38, mental: 58 },
  FB: { setPiece: 40, aerial: 42, penalty: 36, mental: 56 },
  DM: { setPiece: 42, aerial: 44, penalty: 36, mental: 58 },
  CM: { setPiece: 42, aerial: 42, penalty: 48, mental: 56 },
  AM: { setPiece: 44, aerial: 42, penalty: 50, mental: 56 },
  WG: { setPiece: 42, aerial: 44, penalty: 42, mental: 58 },
  ST: { setPiece: 42, aerial: 62, penalty: 50, mental: 58 },
};

const ATTR_KEYS: (keyof PlayerAttrs)[] = [
  "shooting", "passing", "dribbling", "defending", "pace", "physical", "goalkeeping", "stamina",
];
const EXTRA_KEYS: (keyof ExtraAttrs)[] = ["setPiece", "aerial", "penalty", "mental"];

export function makeVirtualPlayer(args: {
  id: string;
  teamId: string;
  name: string;
  position: string;
  teamElo: number;
}): Player {
  const position = normalizePosition(args.position);
  const profile = POSITION_PROFILES[position];
  const extraProfile = EXTRA_PROFILES[position];

  // teamElo scales the whole profile up/down but is intentionally kept OUT
  // of the RNG seed: including it would make the ±variation shift
  // unpredictably with elo, and the "higher elo -> higher average" test
  // requires a monotonic relationship between elo and the resulting stats.
  const eloFactor = clamp01((args.teamElo - 1400) / 700);
  // 폭은 ENGINE_CONSTANTS.WC_ELO_ATTR_SPAN(기본 20 -> -10..+10). eloMult와 중복되는
  // 두 번째 ELO 경로라 두 값은 함께 조정해야 한다(constants.ts 주석 참고).
  const span = ENGINE_CONSTANTS.WC_ELO_ATTR_SPAN;
  const eloBonus = eloFactor * span - span / 2;

  const rng = createRng(`${args.id}|${args.teamId}|${args.name}|${position}`);

  const attrs = {} as PlayerAttrs;
  for (const key of ATTR_KEYS) {
    const variation = (rng() - 0.5) * 16; // -8 .. +8
    attrs[key] = clampInt(profile[key] + eloBonus + variation);
  }

  const extras = {} as ExtraAttrs;
  for (const key of EXTRA_KEYS) {
    const variation = (rng() - 0.5) * 16;
    extras[key] = clampInt(extraProfile[key] + eloBonus + variation);
  }

  const age = 18 + Math.floor(rng() * 18); // 18..35
  const caps = Math.floor(rng() * (age - 16) * 6); // plausible, grows with age

  return {
    id: args.id,
    teamId: args.teamId,
    name: args.name,
    age,
    caps,
    positions: [position],
    attrs,
    setPiece: extras.setPiece,
    aerial: extras.aerial,
    penalty: extras.penalty,
    mental: extras.mental,
  };
}

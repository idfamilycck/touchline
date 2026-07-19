#!/usr/bin/env node
// scripts/ingest-wc2026.mjs
//
// Ingests raw ESPN data for the 2026 FIFA World Cup so later pipeline steps
// (parsing/normalizing) can run entirely offline against cached JSON.
//
// Endpoints (confirmed working — see .superpowers/sdd/task-A1-brief.md Steps 1-2):
//   Scoreboard: https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=YYYYMMDD
//     -> { events: [ { id, name, status: { type: { state: "pre"|"in"|"post" } }, ... } ] }
//   Summary:    https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event={ID}
//     -> {
//          header: {...},
//          keyEvents: [
//            {
//              type: { type: "goal" | "own-goal" | "substitution" | "yellow-card" | "red-card" | ... , text },
//              clock: { displayValue: "11'" | "45'" | "90'+3'" },
//              team: { id, displayName },
//              participants: [ { athlete: { id, displayName } }, ... ],
//              scoringPlay: boolean,   // true for goals
//              shootout: boolean,
//              text: "USA 1, Australia 0",
//              // substitution: participants[0] = player IN, participants[1] = player OUT
//            },
//            ...
//          ],
//          rosters: [
//            {
//              team: {...},
//              roster: [
//                { athlete: { id, displayName }, position: { abbreviation }, starter: bool, subbedIn: bool },
//                ...
//              ]
//            },
//            ...
//          ]
//        }
//
// Usage: node scripts/ingest-wc2026.mjs
// Re-run safe: existing files under data/wc2026/raw/ are skipped.

import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LEAGUE = "fifa.world";
const START_DATE = "2026-06-11";
const END_DATE = "2026-07-19";
const REQUEST_DELAY_MS = 200;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, "..", "data", "wc2026", "raw");

const SCOREBOARD_URL = (dateStr) =>
  `https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUE}/scoreboard?dates=${dateStr}`;
const SUMMARY_URL = (eventId) =>
  `https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUE}/summary?event=${eventId}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toYyyymmdd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function* dateRange(startStr, endStr) {
  const cur = new Date(`${startStr}T00:00:00Z`);
  const end = new Date(`${endStr}T00:00:00Z`);
  while (cur.getTime() <= end.getTime()) {
    yield toYyyymmdd(cur);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });

  const eventIds = new Set();
  const failedDates = [];
  const failedEvents = [];

  for (const dateStr of dateRange(START_DATE, END_DATE)) {
    const scoreboardPath = path.join(RAW_DIR, `scoreboard-${dateStr}.json`);
    let scoreboard;

    if (await fileExists(scoreboardPath)) {
      const raw = await import("node:fs/promises").then((fs) =>
        fs.readFile(scoreboardPath, "utf-8")
      );
      scoreboard = JSON.parse(raw);
    } else {
      try {
        scoreboard = await fetchJson(SCOREBOARD_URL(dateStr));
        await writeFile(scoreboardPath, JSON.stringify(scoreboard, null, 2), "utf-8");
        await sleep(REQUEST_DELAY_MS);
      } catch (err) {
        console.error(`[scoreboard] ${dateStr} failed: ${err.message}`);
        failedDates.push(dateStr);
        continue;
      }
    }

    const events = scoreboard?.events ?? [];
    for (const ev of events) {
      if (ev?.id) eventIds.add(String(ev.id));
    }
  }

  console.log(`Found ${eventIds.size} unique event ids across ${START_DATE}..${END_DATE}`);

  let collected = 0;
  for (const eventId of eventIds) {
    const summaryPath = path.join(RAW_DIR, `summary-${eventId}.json`);

    if (await fileExists(summaryPath)) {
      collected += 1;
      continue;
    }

    try {
      const summary = await fetchJson(SUMMARY_URL(eventId));
      await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
      collected += 1;
      await sleep(REQUEST_DELAY_MS);
    } catch (err) {
      console.error(`[summary] event ${eventId} failed: ${err.message}`);
      failedEvents.push(eventId);
    }
  }

  console.log(`collected ${collected} events`);

  if (failedDates.length > 0) {
    console.log(`Failed scoreboard dates (${failedDates.length}): ${failedDates.join(", ")}`);
  }
  if (failedEvents.length > 0) {
    console.log(`Failed summary events (${failedEvents.length}): ${failedEvents.join(", ")}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});

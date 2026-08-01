---
name: judge-ai-rubric
description: Use when scoring the TOUCHLINE hackathon submission the way an AI reviewer (a vision+code LLM reading screenshots, DOM, source, and the 기획서) would grade it — before submitting, or to find what is costing points. Produces a /100 score against the official DACON rubric through an AI-evidence lens plus a ranked gap list.
---

# AI Judge Rubric (TOUCHLINE)

## Overview
Score the app as an **AI reviewer** would: one that can read screenshots, click through the live site, inspect the DOM/console, read the source, and read the 기획서. An AI judge rewards *verifiable* claims and *legible structure* and punishes anything it can catch by actually looking — dead buttons, console errors, unlabeled controls, plan↔build mismatches. It does not feel "몰입감"; it checks whether the thing works and hangs together. Grade against the official rubric (100pts), but weight the evidence an AI can actually verify.

Official categories & max: **참신성 30 · 감동 경험 설계 25 · 완성도 25 · 기획/구현 완성도 20.**

## How an AI judge collects evidence (do all of these before scoring)
- Click every primary flow end-to-end (home → pick match → tactics → match → result/shootout). Watch the console for errors/warnings.
- Deep-link/refresh mid-flow and hit empty states (e.g. `/match` with no match, unknown `?match=`) — AI judges probe robustness.
- Read the DOM: are controls real buttons/labels? `aria-*`, headings, alt/sr-only text? (This is the "agent-friendly interface".)
- Read the 기획서 (`public/proposal/index.html`) and check each claim against the running app and the code. Any number in the doc must match what the app/tests produce.
- Skim the engine/validation code and tests — an AI judge trusts a claim more when a deterministic test asserts it.

## Scoring bands per category (AI lens)

### 참신성 (Novelty) /30 — concept an AI can *identify* as differentiated
- 26–30: Clear, unusual mechanic the AI can name in one sentence and NOT confuse with a generic FM clone; the differentiator is visible in the UI and backed in code (e.g. counterfactual "rewrite history from the decisive minute", real-match reproduction metric).
- 20–25: Novel framing but partly generic; differentiator stated in doc but thinly realized in UI.
- 10–19: Recognizable template with light theming.
- 0–9: Indistinguishable from a tutorial/boilerplate.

### 감동 경험 설계 (Immersion/UX) /25 — legibility & flow an AI can trace
- 21–25: Every step is self-explanatory from on-screen text; controls are labeled and reachable; the "you are the manager" framing is consistent in copy; no dead ends; keyboard/aria present.
- 16–20: Mostly clear; 1–2 steps need guessing or have unlabeled controls.
- 8–15: Flow works but confusing ordering, missing labels, or jarring transitions.
- 0–7: AI cannot complete the intended flow from the UI alone.

### 완성도 (Completeness/robustness) /25 — does it actually work, no errors
- 21–25: Every dynamic feature works; **zero console errors/warnings**; empty states and deep links handled gracefully; build succeeds; tests pass.
- 16–20: Works but minor console warnings or one rough edge/empty state.
- 8–15: A primary feature breaks, throws, or a deep link 404/500s.
- 0–7: Core flow crashes or a main button does nothing.

### 기획/구현 완성도 (Plan↔build coherence) /20 — claims match reality
- 17–20: Every 기획서 claim/number is reproduced by the live app or an asserted test; architecture is legible; naming/structure communicate intent.
- 12–16: Mostly consistent; 1–2 stale numbers or doc/app drift.
- 6–11: Several mismatches between doc and app.
- 0–5: Doc describes a different product than what runs.

## Required output when you apply this skill
1. A table: category · score · max · one-line justification with the concrete evidence (screenshot/route/file:line/console).
2. **Total /100.**
3. Ranked gap list — each gap: what an AI judge would dock, which category, estimated points recoverable, and the smallest fix. Put the highest points-per-effort first.
4. Be adversarial and specific: cite the exact dead control, console line, stale number, or unlabeled element. Vague praise scores nothing.

## Common ways this app loses AI-judge points
- A console error or React warning anywhere in the main flow (instant 완성도 hit).
- A number in the 기획서 that the app/tests no longer produce (기획/구현 hit).
- A control that is a `<div onClick>` with no role/label, or an icon-only button with no aria-label (감동/agent-friendly hit).
- A deep link or refresh that dead-ends instead of redirecting gracefully (완성도 hit).
- A "novel" claim in the doc with no visible manifestation in the UI (참신성 hit).

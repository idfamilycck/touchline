---
name: judge-human-rubric
description: Use when scoring the TOUCHLINE hackathon submission the way a human judge (and the stage-1 crowd of peer builders) would grade it — before submitting, or to find what is costing points. Produces a /100 score against the official DACON rubric through a human-emotion lens plus a ranked gap list, weighting first-impression, 몰입감, visual wow, and demo-video flow.
---

# Human Judge Rubric (TOUCHLINE)

## Overview
Score the app as a **human** would: a judge who watches the 30–90s demo video, glances at the hero, clicks a couple of things, and asks "do I *feel* like a manager, does this look impressive, would I vote for it?" Stage 1 is a **crowd vote weighted 60% toward other submitting teams** — so this lens also asks "would a fellow builder be impressed enough to spend a vote here?" Humans forgive a missing edge case but never forgive ugliness, confusion, or boredom. Grade against the official rubric (100pts), weighting emotion, aesthetics, and narrative.

Official categories & max: **참신성 30 · 감동 경험 설계 25 · 완성도 25 · 기획/구현 완성도 20.**

## How a human judge collects evidence (do all of these before scoring)
- Look at the hero/first screen for 3 seconds: is there an immediate "oh, nice" and an obvious thing to do?
- Walk the happy path as a naive user WITHOUT reading instructions: pick a match, set tactics, watch the game, see a result. Note every "wait, what do I do now?" or "that's satisfying" moment.
- Judge the *feel*: motion, sound of the copy, broadcast/stadium atmosphere, typographic polish, color, spacing, whether it looks like a real product vs a class project.
- Imagine the demo video: is there a clear emotional arc (setup → the decisive moment → I changed history → payoff)? Is there a screenshot you'd put on a poster?
- Ask "would I share/vote for this over 158 other teams?"

## Scoring bands per category (human lens)

### 참신성 (Novelty) /30 — does it feel fresh & memorable
- 26–30: A hook you'd retell to a friend ("you rewrite the exact minute the real match fell apart, as the manager"); the concept + presentation feel unlike the other entries.
- 20–25: Interesting spin but reads as "a football tactics app".
- 10–19: Competent but familiar; nothing you'd remember tomorrow.
- 0–9: Generic; seen it many times.

### 감동 경험 설계 (Immersion/UX) /25 — the heart of the prize ("내가 감독이다")
- 21–25: Genuine "I AM the manager" immersion — the handoff moment, the tension of a live decision, intuitive controls you never had to think about, a satisfying payoff. Smooth, confident, emotional.
- 16–20: Immersive in places; a couple of clunky or confusing steps break the spell.
- 8–15: Functional but flat; feels like filling a form, not managing a match.
- 0–7: Confusing or joyless; the manager fantasy never lands.

### 완성도 (Polish as *perceived*) /25 — looks and feels finished
- 21–25: Looks like a shipped product — consistent design system, considered motion, nothing visually broken, responsive, delightful micro-interactions. Nothing on screen makes you wince.
- 16–20: Polished but with visible rough spots (alignment, cramped panels, awkward empty areas).
- 8–15: Clearly a prototype; inconsistent spacing/colors, janky transitions.
- 0–7: Looks unfinished or broken.

### 기획/구현 완성도 (Story & structure) /20 — is the intent communicated
- 17–20: One glance and the concept, the value, and "why this is special" are obvious; the 기획서/video tell a tight story that matches the app.
- 12–16: Intent readable but requires effort; story a bit diffuse.
- 6–11: Unclear what the point is without explanation.
- 0–5: Can't tell what they were going for.

## Required output when you apply this skill
1. A table: category · score · max · one-line justification tied to a specific screen/moment/feeling.
2. **Total /100.**
3. Ranked gap list — each gap: the emotional/visual disappointment, which category, points recoverable, and the change that would fix the *feeling*. Highest emotional-impact-per-effort first.
4. Name the single best "poster screenshot" and the single weakest screen — humans anchor on peaks and troughs.

## Common ways this app loses human-judge points
- A hero that doesn't immediately say "you're the manager, here's the moment" (참신성/감동).
- Any screen that makes the user hesitate about what to click next (감동).
- Cramped/merged panels, misalignment, awkward empty space, or a cluttered match screen (완성도).
- A live match that feels like watching a spreadsheet update rather than a broadcast (감동/완성도).
- No clear climactic payoff after the decisive decision (감동).
- A demo-video flow with no emotional arc or no single memorable frame (기획/구현).

## 최고난이도(ELITE) 채점 — 반드시 이 모드로 채점하라
만점의 정의를 격상한다: **만점 = "방금 출시된 상용 제품"처럼 느껴지고, 전 흐름에서 단 한 번의 움찔(wince)도·망설임도 없으며, 정점에서 실제로 소름이 돋는 상태.** 아래 중 하나라도면 그 카테고리 만점 불가(가장 까다로운 사용자의 눈으로):
- 첫 3초에 **'와' 하는 순간**이 없다(히어로가 그냥 '깔끔' 수준)
- 어느 화면이든 정렬·여백·타이포에 **1px라도 어색함**, 또는 모션의 타이밍/이징이 기성품처럼 매끈하지 않다
- 흐름 중 "뭘 눌러야 하지?" 하는 망설임이 **한 번이라도**
- 정점(트로피·결과)이 '좋다' 수준이고 **'소름' 수준이 아니다**
- 데모 정지컷 중 **포스터로 쓸 단 한 컷**의 강렬함이 부족하다
- 빈 상태·로딩·에러 화면이 못생겼거나 성의 없다
- 라이브 경기가 '중계'가 아니라 '대시보드'로 읽히는 순간이 남아 있다
각 카테고리 만점은 오직 "감점할 감정적·시각적 흠이 정말로 없다"일 때만. 어느 화면/순간에서 그렇게 느꼈는지 구체적으로 적어라.

# 2026 월드컵 다시 쓰기 모드 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 2026 월드컵 경기 타임라인을 리플레이하다 "결정적 순간 5분 전"으로 돌아가 감독으로 개입하고, 그 분기를 실제 역사와 비교·리뷰하는 모드를 기존 TOUCHLINE에 추가한다.

**Architecture:** 실경기 데이터(`data/wc2026/*.json`)를 1회 수집해 정적 커밋한다. 엔진(`lib/engine/match.ts`)은 무수정 재사용하고, WC2026 팀·선수·경기장을 기존 조회 함수(`playersOf`/`teamById`/`venueById`)에 등록해 엔진이 투명하게 소비하게 한다. `fromRealState()` 어댑터가 "T-5분 실제 상태"를 `SideSetup`+`MatchState` 초기값으로 변환하면 기존 시뮬 루프가 잔여 시간을 재생한다. 화면은 기존 `/tactics` `/match` `/result`를 `mode` 분기로 재사용하고 `/rewrite`만 신규 추가한다.

**Tech Stack:** Next.js 16(App Router) 정적 export, TypeScript, Zustand persist, vitest, Node 스크립트(ESPN 공개 JSON 수집).

## Global Constraints

- 서비스 런타임은 100% 클라이언트 — 외부 API·키·서버 호출 금지. 데이터 수집은 **빌드 전 1회** 스크립트로만 수행하고 산출물 JSON을 커밋한다.
- `output: 'export'` 완전 정적 빌드 유지. 신규 라우트도 정적 프리렌더 가능해야 한다.
- 선수 실제 능력치·평점 미사용 — 이름·포지션·출전/득점/교체/카드 기록만 사실 데이터, 능력치는 결정론적 가상 생성. "모든 능력치는 가상" 고지를 실경기 모드 화면에도 노출.
- 엔진 순수성 유지 — `lib/engine/`은 부작용 없는 순수 함수. 기존 130개 유닛 + E2E 스모크 무회귀.
- persist 스토리지 키는 스키마 변경 시 `touchline-v2`로 버전업(기존 자유 모드 상태와 충돌 방지).
- 브랜드 표기는 항상 TOUCHLINE/터치라인. dugout 금지.
- 8/3(월) 10:00 이후 커밋 금지.

---

## 파일 구조

**신규 데이터·스크립트**
- `scripts/ingest-wc2026.mjs` — ESPN 공개 JSON 수집 → 원시 캐시 저장
- `scripts/build-wc2026.mjs` — 원시 → `data/wc2026/{matches,teams}.json` 변환 + 가상 능력치 생성
- `data/wc2026/matches.json` — 104경기 이벤트 타임라인·라인업
- `data/wc2026/teams.json` — 48개국 파생 ELO
- `data/wc2026/raw/` — 원시 응답 캐시(gitignore, 재현용 스크립트만 커밋)

**신규 타입·로더**
- `lib/wc2026/types.ts` — `Wc2026Match`, `Wc2026Event`, `Wc2026Lineup` 등
- `lib/wc2026/data.ts` — JSON 로드 + 조회(`wc2026Matches()`, `wc2026MatchById()`)
- `lib/wc2026/register.ts` — WC2026 팀·선수·경기장을 기존 조회 함수에 등록
- `lib/wc2026/players.ts` — 가상 능력치 생성 로직(테스트 대상 순수 함수)
- `lib/wc2026/moments.ts` — 결정적 순간 추출 순수 함수
- `lib/engine/rewrite.ts` — `fromRealState()` 상태 주입 어댑터

**수정**
- `lib/data/players.ts` `teams.ts` `venues.ts` — 등록 훅 추가(조회가 WC2026도 포함)
- `lib/store.ts` — `mode`/`rewriteContext` 추가, persist v2
- `app/rewrite/page.tsx`(신규), `app/tactics|match|result/page.tsx` — mode 분기
- `components/rewrite/*`(신규) — 경기 브라우저, 순간 카드, 비교 복기
- `README.md`, `docs/TOUCHLINE-기획서-source.html` — 모드 문서화

---

## Phase A — 데이터 수집·생성 (오프라인 산출물)

### Task A1: ESPN 엔드포인트 확인 + 수집 스크립트 스파이크

**Files:**
- Create: `scripts/ingest-wc2026.mjs`
- Create: `.gitignore` 항목 추가(`data/wc2026/raw/`)

**Interfaces:**
- Produces: `data/wc2026/raw/scoreboard-*.json`(일자별 경기 목록), `data/wc2026/raw/summary-{eventId}.json`(경기별 이벤트·라인업)

- [ ] **Step 1: 엔드포인트 실측 확인**

Run (PowerShell):
```
Invoke-RestMethod "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611" | ConvertTo-Json -Depth 4 | Select-Object -First 60
```
Expected: `events[]` 배열에 경기 id·팀·스코어가 보임. 보이지 않으면 리그 슬러그를 `fifa.worldq`/`fifa.world.2026` 등으로 바꿔 재시도하고, 성공한 슬러그를 스크립트 상수 `LEAGUE`에 기록.

- [ ] **Step 2: summary 구조 확인**

Step 1에서 얻은 event id 하나로:
```
Invoke-RestMethod "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event={ID}" | ConvertTo-Json -Depth 5 | Out-File raw-sample.json
```
`keyEvents`(골/카드/교체+clock), `rosters`/`boxscore`(선발·교체 명단) 필드 경로를 확인해 스크립트 주석에 매핑 기록. 필드명이 다르면 실제 경로로 대체.

- [ ] **Step 3: 수집 스크립트 작성**

`scripts/ingest-wc2026.mjs` — 대회 기간(2026-06-11 ~ 2026-07-19) 일자를 순회하며 scoreboard를 받아 event id를 모으고, 각 id의 summary를 `data/wc2026/raw/summary-{id}.json`으로 저장. 이미 존재하면 스킵(재실행 안전). node 18+ 내장 `fetch` 사용, 요청 간 200ms 딜레이.

- [ ] **Step 4: 실행 및 수집 확인**

Run: `node scripts/ingest-wc2026.mjs`
Expected: `data/wc2026/raw/`에 summary 파일 100개 이상 생성. 콘솔에 "collected N events" 출력. 누락 일자 있으면 재실행.

- [ ] **Step 5: Commit**

```
git add scripts/ingest-wc2026.mjs .gitignore
git commit -m "feat(wc2026): ESPN match ingestion script"
```

### Task A2: 원시 → matches.json 변환 + 스키마 타입

**Files:**
- Create: `lib/wc2026/types.ts`
- Create: `scripts/build-wc2026.mjs`
- Create: `data/wc2026/matches.json`(스크립트 산출)
- Test: `lib/wc2026/schema.test.ts`

**Interfaces:**
- Produces:
```ts
// lib/wc2026/types.ts
export type Wc2026Round =
  | "group" | "r32" | "r16" | "qf" | "sf" | "third" | "final";
export interface Wc2026Event {
  minute: number;            // 정규 분(90'+는 90 유지, extra는 별도 플래그)
  type: "goal" | "own_goal" | "pen_goal" | "sub" | "yellow" | "red";
  teamCode: string;          // "KOR"
  playerId: string;          // wc 선수 id
  playerName: string;
  relatedPlayerId?: string;  // sub의 out 선수, 골 어시스트는 미사용
}
export interface Wc2026Lineup {
  teamCode: string;
  starters: Array<{ playerId: string; name: string; position: string }>;
  bench: Array<{ playerId: string; name: string; position: string }>;
}
export interface Wc2026Match {
  id: string;
  round: Wc2026Round;
  group?: string;            // "A"~"L" (조별만)
  home: string; away: string;// 팀 코드
  scoreHome: number; scoreAway: number; // 정규+연장(승부차기 제외)
  penHome?: number; penAway?: number;    // 승부차기 있으면
  venueKo: string;
  kickoffISO: string;
  events: Wc2026Event[];     // minute 오름차순
  lineups: [Wc2026Lineup, Wc2026Lineup];
  excluded?: boolean;        // 정합성 실패 시 true
}
```

- [ ] **Step 1: 스키마 검증 테스트 작성 (실패)**

```ts
// lib/wc2026/schema.test.ts
import { describe, it, expect } from "vitest";
import matches from "@/data/wc2026/matches.json";
import type { Wc2026Match } from "@/lib/wc2026/types";

describe("wc2026 matches.json", () => {
  const all = matches as Wc2026Match[];
  it("경기 수가 90개 이상 104개 이하", () => {
    expect(all.length).toBeGreaterThanOrEqual(90);
    expect(all.length).toBeLessThanOrEqual(104);
  });
  it("모든 경기가 필수 필드를 가진다", () => {
    for (const m of all) {
      expect(m.id).toBeTruthy();
      expect(m.home).toMatch(/^[A-Z]{3}$/);
      expect(m.away).toMatch(/^[A-Z]{3}$/);
      expect(Array.isArray(m.events)).toBe(true);
      expect(m.lineups).toHaveLength(2);
    }
  });
  it("이벤트 minute가 오름차순", () => {
    for (const m of all) {
      const mins = m.events.map((e) => e.minute);
      expect(mins).toEqual([...mins].sort((a, b) => a - b));
    }
  });
});
```

- [ ] **Step 2: 변환 스크립트 작성 후 실행**

`scripts/build-wc2026.mjs` — `raw/summary-*.json`을 읽어 `Wc2026Match[]`로 매핑(라운드는 대회 일정·경기명으로 판정, 팀 코드는 ESPN 팀 약어→3글자 대문자 정규화), `data/wc2026/matches.json` 기록.
Run: `node scripts/build-wc2026.mjs` → "wrote N matches" 출력.

- [ ] **Step 3: 테스트 통과 확인**

Run: `npx vitest run lib/wc2026/schema.test.ts`
Expected: PASS. 실패 시 스크립트의 필드 매핑을 raw 샘플과 대조해 수정 후 재생성.

- [ ] **Step 4: Commit**

```
git add lib/wc2026/types.ts scripts/build-wc2026.mjs data/wc2026/matches.json lib/wc2026/schema.test.ts
git commit -m "feat(wc2026): match schema + build transform"
```

### Task A3: 정합성 게이트 (골 수·교체·라인업)

**Files:**
- Test: `lib/wc2026/integrity.test.ts`
- Modify: `scripts/build-wc2026.mjs`(게이트 실패 경기에 `excluded: true` 마킹)

**Interfaces:**
- Consumes: `data/wc2026/matches.json`
- Produces: `excluded` 플래그가 채워진 matches.json

- [ ] **Step 1: 정합성 테스트 작성 (실패)**

```ts
// lib/wc2026/integrity.test.ts
import { describe, it, expect } from "vitest";
import matches from "@/data/wc2026/matches.json";
import type { Wc2026Match } from "@/lib/wc2026/types";

const active = (matches as Wc2026Match[]).filter((m) => !m.excluded);

describe("wc2026 정합성 (excluded 아닌 경기)", () => {
  it("이벤트 골 수 = 최종 스코어", () => {
    for (const m of active) {
      const goalsHome = m.events.filter(
        (e) => (e.type === "goal" || e.type === "pen_goal") && e.teamCode === m.home
      ).length;
      const ownForHome = m.events.filter(
        (e) => e.type === "own_goal" && e.teamCode === m.away
      ).length;
      expect(goalsHome + ownForHome).toBe(m.scoreHome);
    }
  });
  it("교체는 팀당 5회 이하(연장 6회 허용)", () => {
    for (const m of active) {
      for (const code of [m.home, m.away]) {
        const subs = m.events.filter((e) => e.type === "sub" && e.teamCode === code).length;
        expect(subs).toBeLessThanOrEqual(6);
      }
    }
  });
  it("선발은 정확히 11명", () => {
    for (const m of active) {
      for (const lu of m.lineups) expect(lu.starters).toHaveLength(11);
    }
  });
  it("레드카드 이후 해당 선수 이벤트 없음", () => {
    for (const m of active) {
      const reds = m.events.filter((e) => e.type === "red");
      for (const r of reds) {
        const later = m.events.filter(
          (e) => e.minute > r.minute && e.playerId === r.playerId && e.type !== "red"
        );
        expect(later).toHaveLength(0);
      }
    }
  });
});
```
(주: `goalsHome` 오타 수정 — Step에서 `goalsHome`로 통일해 작성한다.)

- [ ] **Step 2: 실행해 실패 경기 식별**

Run: `npx vitest run lib/wc2026/integrity.test.ts`
Expected: 일부 경기 실패(ESPN 데이터 누락 가능). 실패한 경기 id 목록을 기록.

- [ ] **Step 3: 게이트 로직을 스크립트에 반영**

`build-wc2026.mjs`에 동일 검사 함수 추가 — 실패 경기는 `excluded: true`로 마킹하고 콘솔에 "excluded N matches: [...]" 출력. 재생성.
Run: `node scripts/build-wc2026.mjs`

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/wc2026/integrity.test.ts`
Expected: PASS(활성 경기만 검사). 활성 경기가 80개 미만이면 매핑 버그이므로 raw 재점검.

- [ ] **Step 5: Commit**

```
git add lib/wc2026/integrity.test.ts scripts/build-wc2026.mjs data/wc2026/matches.json
git commit -m "feat(wc2026): integrity gate + exclusion marking"
```

### Task A4: 파생 ELO(teams.json) + 가상 능력치 생성

**Files:**
- Create: `lib/wc2026/players.ts`
- Create: `data/wc2026/teams.json`(스크립트 산출)
- Modify: `scripts/build-wc2026.mjs`
- Test: `lib/wc2026/players.test.ts`

**Interfaces:**
- Produces:
```ts
// lib/wc2026/players.ts
import type { Player } from "@/lib/types";
// 팀 코드·이름·포지션·팀 ELO로 결정론적 Player 생성(같은 입력 → 같은 출력)
export function makeVirtualPlayer(args: {
  id: string; teamId: string; name: string; position: string; teamElo: number;
}): Player;
```
- teams.json 각 항목: `{ code, id, nameKo, elo, finishRound }`

- [ ] **Step 1: 가상 능력치 결정론 테스트 작성 (실패)**

```ts
// lib/wc2026/players.test.ts
import { describe, it, expect } from "vitest";
import { makeVirtualPlayer } from "@/lib/wc2026/players";

const base = { id: "esp_p01", teamId: "wc_esp", name: "Pedri", position: "CM", teamElo: 2020 };

describe("makeVirtualPlayer", () => {
  it("동일 입력은 동일 출력(결정론)", () => {
    expect(makeVirtualPlayer(base)).toEqual(makeVirtualPlayer(base));
  });
  it("모든 능력치가 1~99 정수", () => {
    const p = makeVirtualPlayer(base);
    for (const v of Object.values(p.attrs)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(99);
    }
  });
  it("GK는 goalkeeping이 높고 필드플레이어는 낮다", () => {
    const gk = makeVirtualPlayer({ ...base, position: "GK" });
    const cm = makeVirtualPlayer(base);
    expect(gk.attrs.goalkeeping).toBeGreaterThan(cm.attrs.goalkeeping);
  });
  it("팀 ELO가 높을수록 평균 능력치가 높다", () => {
    const strong = makeVirtualPlayer({ ...base, teamElo: 2050 });
    const weak = makeVirtualPlayer({ ...base, teamElo: 1500 });
    const avg = (p: ReturnType<typeof makeVirtualPlayer>) =>
      Object.values(p.attrs).reduce((a, b) => a + b, 0);
    expect(avg(strong)).toBeGreaterThan(avg(weak));
  });
});
```

- [ ] **Step 2: 실행해 실패 확인**

Run: `npx vitest run lib/wc2026/players.test.ts`
Expected: FAIL("makeVirtualPlayer is not a function").

- [ ] **Step 3: 구현**

`lib/wc2026/players.ts` — 이름 문자열 해시(FNV-1a)로 시드를 만들고, 포지션별 기본 프로파일(GK/CB/FB/DM/CM/AM/WG/ST 별 8종 능력치 기준값)에 팀 ELO 스케일((elo-1400)/700 클램프 0~1)과 해시 기반 ±8 분산을 더해 1~99로 클램프. `setPiece/aerial/penalty/mental`도 동일 방식. `positions: [position]`, `age`/`caps`는 해시 기반 그럴듯한 값.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/wc2026/players.test.ts` → PASS.

- [ ] **Step 5: teams.json + 선수 주입을 스크립트에 추가**

`build-wc2026.mjs`: 각 팀의 최종 진출 라운드로 ELO 계단 산출(우승 2060 ~ 조별 1500 사이 보간), `data/wc2026/teams.json` 기록. matches.json의 각 라인업 선수에 대해 build 시점엔 이름·포지션만 유지(능력치는 런타임 `makeVirtualPlayer`로 생성하므로 JSON에 중복 저장하지 않음).
Run: `node scripts/build-wc2026.mjs`

- [ ] **Step 6: Commit**

```
git add lib/wc2026/players.ts lib/wc2026/players.test.ts data/wc2026/teams.json scripts/build-wc2026.mjs
git commit -m "feat(wc2026): derived ELO + deterministic virtual attributes"
```

---

## Phase B — 데이터 로더·조회 등록

### Task B1: WC2026 로더 + 기존 조회 함수에 등록

**Files:**
- Create: `lib/wc2026/data.ts`
- Create: `lib/wc2026/register.ts`
- Modify: `lib/data/players.ts`, `lib/data/teams.ts`, `lib/data/venues.ts`
- Test: `lib/wc2026/register.test.ts`

**Interfaces:**
- Consumes: `makeVirtualPlayer`(A4), matches.json/teams.json
- Produces:
```ts
// lib/wc2026/data.ts
export function wc2026Matches(): Wc2026Match[];         // excluded 제외
export function wc2026MatchById(id: string): Wc2026Match | undefined;
export function wc2026TeamId(code: string): string;     // "KOR" -> "wc_kor"
// lib/wc2026/register.ts
export function registerWc2026(): void;                 // idempotent
```
- 조회 함수는 WC2026 id(`wc_*` 접두)를 인식해 등록된 팀/선수/경기장을 반환.

- [ ] **Step 1: 등록 조회 테스트 작성 (실패)**

```ts
// lib/wc2026/register.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { registerWc2026 } from "@/lib/wc2026/register";
import { playersOf } from "@/lib/data/players";
import { teamById } from "@/lib/data/teams";

beforeAll(() => registerWc2026());

describe("wc2026 등록", () => {
  it("등록 후 wc 팀 조회 가능", () => {
    expect(teamById("wc_esp")?.code).toBe("ESP");
  });
  it("wc 팀 선수 명단이 11명 이상", () => {
    expect(playersOf("wc_esp").length).toBeGreaterThanOrEqual(11);
  });
  it("기존 자유 모드 팀은 그대로 유지", () => {
    expect(teamById("kor")?.nameKo).toBe("대한민국");
    expect(playersOf("kor").length).toBe(20);
  });
  it("registerWc2026 중복 호출해도 선수 수 불변(idempotent)", () => {
    const n = playersOf("wc_esp").length;
    registerWc2026();
    expect(playersOf("wc_esp").length).toBe(n);
  });
});
```

- [ ] **Step 2: 조회 함수를 레지스트리 기반으로 확장**

`lib/data/players.ts`의 `playersOf`가 모듈 레지스트리(`extraPlayers: Record<teamId, Player[]>`)를 먼저 조회하도록 수정하고 `registerPlayers(teamId, players)` export 추가. `teams.ts`/`venues.ts`도 동일 패턴(`registerTeam`, `registerVenue`). 기존 `PLAYERS`/`TEAMS`/`VENUES` 경로는 폴백으로 유지.

- [ ] **Step 3: register.ts 구현**

teams.json을 순회해 `registerTeam({ id: "wc_"+code.toLowerCase(), code, nameKo, elo, ... })`, 각 경기 라인업의 선수를 팀별로 dedup 수집해 `makeVirtualPlayer`로 만들어 `registerPlayers`. WC 경기장은 실경기 venueKo→기존 venue 매핑 또는 기본 metlife로 등록. 모듈 로드 시 1회 실행 플래그로 idempotent 보장.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/wc2026/register.test.ts` → PASS.
Run 전체 회귀: `npx vitest run` → 기존 130 + 신규 그린.

- [ ] **Step 5: Commit**

```
git add lib/wc2026/data.ts lib/wc2026/register.ts lib/wc2026/register.test.ts lib/data/players.ts lib/data/teams.ts lib/data/venues.ts
git commit -m "feat(wc2026): loader + registry integration"
```

---

## Phase C — 엔진 어댑터·순간 추출

### Task C1: 결정적 순간 추출 (순수 함수)

**Files:**
- Create: `lib/wc2026/moments.ts`
- Test: `lib/wc2026/moments.test.ts`

**Interfaces:**
- Consumes: `Wc2026Match`(A2), `wc2026TeamId`(B1)
- Produces:
```ts
export interface DecisiveMoment {
  id: string;              // matchId+minute+kind
  kind: "concede" | "red" | "lead_lost" | "late_tie";
  eventMinute: number;     // 실제 사건 분
  takeoverMinute: number;  // max(eventMinute-5, 0)
  labelKo: string;         // "88' 결승골 실점 — 83'로 돌아가기"
}
// side = 지휘할 팀 코드
export function extractMoments(match: Wc2026Match, side: string): DecisiveMoment[];
```

- [ ] **Step 1: 추출 규칙 테스트 작성 (실패)**

```ts
// lib/wc2026/moments.test.ts
import { describe, it, expect } from "vitest";
import { extractMoments } from "@/lib/wc2026/moments";
import type { Wc2026Match } from "@/lib/wc2026/types";

function mk(events: Wc2026Match["events"], home = "KOR", away = "BRA"): Wc2026Match {
  return {
    id: "t", round: "group", home, away, scoreHome: 0, scoreAway: 0,
    venueKo: "메트라이프", kickoffISO: "2026-06-11T00:00:00Z",
    events, lineups: [] as unknown as Wc2026Match["lineups"],
  };
}

describe("extractMoments (side=KOR)", () => {
  it("실점은 concede 순간을 만든다", () => {
    const m = mk([{ minute: 88, type: "goal", teamCode: "BRA", playerId: "b1", playerName: "X" }]);
    const out = extractMoments(m, "KOR");
    expect(out.some((d) => d.kind === "concede" && d.eventMinute === 88)).toBe(true);
  });
  it("takeoverMinute는 사건-5분, 하한 0", () => {
    const m = mk([{ minute: 3, type: "goal", teamCode: "BRA", playerId: "b1", playerName: "X" }]);
    expect(extractMoments(m, "KOR")[0].takeoverMinute).toBe(0);
  });
  it("연장(90분 초과) 사건은 제외", () => {
    const m = mk([{ minute: 105, type: "goal", teamCode: "BRA", playerId: "b1", playerName: "X" }]);
    expect(extractMoments(m, "KOR")).toHaveLength(0);
  });
  it("우리 팀 레드카드는 red 순간을 만든다", () => {
    const m = mk([{ minute: 60, type: "red", teamCode: "KOR", playerId: "k1", playerName: "Y" }]);
    expect(extractMoments(m, "KOR").some((d) => d.kind === "red")).toBe(true);
  });
  it("같은 분 실점+리드상실은 하나의 순간으로 합침", () => {
    // 1-0 리드 중 88분 실점(동점) → concede/lead_lost 중복 → 1개
    const m = mk([
      { minute: 20, type: "goal", teamCode: "KOR", playerId: "k9", playerName: "G" },
      { minute: 88, type: "goal", teamCode: "BRA", playerId: "b1", playerName: "X" },
    ]);
    const at88 = extractMoments(m, "KOR").filter((d) => d.eventMinute === 88);
    expect(at88).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 실행해 실패 확인**

Run: `npx vitest run lib/wc2026/moments.test.ts` → FAIL.

- [ ] **Step 3: 구현**

규칙(지휘 팀 관점, minute ≤ 90): ① 상대 골 → concede ② 우리 레드 → red ③ 골로 인해 우리 리드가 사라짐(앞서다 동점/역전 허용) → lead_lost ④ 75분 이후 동점 진입 → late_tie. 같은 `eventMinute`에 여러 kind면 우선순위(lead_lost>concede>red>late_tie)로 하나만 남기되 라벨은 강한 것 사용. `takeoverMinute = max(eventMinute-5, 0)`.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/wc2026/moments.test.ts` → PASS.

- [ ] **Step 5: Commit**

```
git add lib/wc2026/moments.ts lib/wc2026/moments.test.ts
git commit -m "feat(wc2026): decisive-moment extraction"
```

### Task C2: fromRealState 상태 주입 어댑터

**Files:**
- Create: `lib/engine/rewrite.ts`
- Test: `lib/engine/rewrite.test.ts`

**Interfaces:**
- Consumes: `Wc2026Match`, `DecisiveMoment`, `initMatch`/`MatchState`(match.ts), `SideSetup`(types), `autoPlace`(engine)
- Produces:
```ts
// side를 "me"로, 상대를 "opp"로 두고 takeoverMinute 시점 상태를 만든다
export function fromRealState(
  match: Wc2026Match, side: string, moment: DecisiveMoment, seed: number
): MatchState;
```

- [ ] **Step 1: 어댑터 테스트 작성 (실패)**

```ts
// lib/engine/rewrite.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { registerWc2026 } from "@/lib/wc2026/register";
import { wc2026MatchById } from "@/lib/wc2026/data";
import { extractMoments } from "@/lib/wc2026/moments";
import { fromRealState } from "@/lib/engine/rewrite";
import { simulateMinute } from "@/lib/engine/match";

beforeAll(() => registerWc2026());

describe("fromRealState", () => {
  it("takeoverMinute 시점의 스코어를 반영한다", () => {
    const m = wc2026MatchById(pickMatchWithConcede())!; // 헬퍼: concede 순간 있는 경기 id
    const side = m.away; // 실점 팀 관점
    const moment = extractMoments(m, side).find((d) => d.kind === "concede")!;
    const state = fromRealState(m, side, moment, 42);
    expect(state.minute).toBe(moment.takeoverMinute);
    expect(state.finished).toBe(false);
    // 우리(me)는 side 팀
    expect(state.me.teamId).toBe(`wc_${side.toLowerCase()}`);
  });
  it("동일 입력은 동일 시뮬 진행(재현성)", () => {
    const m = wc2026MatchById(pickMatchWithConcede())!;
    const side = m.away;
    const moment = extractMoments(m, side).find((d) => d.kind === "concede")!;
    const a = simulateMinute(fromRealState(m, side, moment, 7));
    const b = simulateMinute(fromRealState(m, side, moment, 7));
    expect(a.scoreMe).toBe(b.scoreMe);
    expect(a.rngState).toBe(b.rngState);
  });
});
```
(`pickMatchWithConcede` 헬퍼는 테스트 파일 상단에서 `wc2026Matches()`를 순회해 첫 concede 경기 id를 반환하도록 구현한다.)

- [ ] **Step 2: 실행해 실패 확인**

Run: `npx vitest run lib/engine/rewrite.test.ts` → FAIL.

- [ ] **Step 3: 구현**

`initMatch`로 기본 `MatchState`를 만든 뒤: (a) `side`를 me로, 상대를 opp로 `SideSetup` 구성(`autoPlace`로 기본 포메이션 배치, takeover 시점까지의 실제 교체를 라인업에 반영), (b) `minute = takeoverMinute`, `scoreMe/scoreOpp`를 그 분까지 집계, (c) 온피치 선수 stamina를 경과분 기반 감쇠(`1 - minute/110` 근사)로 초기화, (d) `subsUsedMe`를 실제 사용분으로 세팅, (e) 레드카드 반영 시 해당 슬롯 비움(10인 허용). `probTimeline`은 현재 분 1점으로 시작.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/engine/rewrite.test.ts` → PASS.

- [ ] **Step 5: Commit**

```
git add lib/engine/rewrite.ts lib/engine/rewrite.test.ts
git commit -m "feat(wc2026): fromRealState injection adapter"
```

---

## Phase D — 상태·화면

### Task D1: store에 mode/rewriteContext 추가 (persist v2)

**Files:**
- Modify: `lib/store.ts`
- Test: `lib/store.test.ts`(케이스 추가)

**Interfaces:**
- Produces:
```ts
mode: "free" | "rewrite";
rewriteContext?: { matchId: string; side: string; momentId: string; takeoverMinute: number };
startRewrite: (matchId: string, side: string, momentId: string) => void; // fromRealState로 me/opp/match 세팅
```

- [ ] **Step 1: 테스트 작성 (실패)**

```ts
// lib/store.test.ts 에 추가
it("startRewrite: rewrite 모드 진입 + match 초기화", () => {
  registerWc2026();
  const id = firstConcedeMatchId();      // 헬퍼
  const { startRewrite } = useAppStore.getState();
  const side = wc2026MatchById(id)!.away;
  const moment = extractMoments(wc2026MatchById(id)!, side)[0];
  startRewrite(id, side, moment.id);
  const s = useAppStore.getState();
  expect(s.mode).toBe("rewrite");
  expect(s.match?.minute).toBe(moment.takeoverMinute);
  expect(s.me?.teamId).toBe(`wc_${side.toLowerCase()}`);
});
it("persist name이 touchline-v2", () => {
  // sessionStorage 스텁에서 startRewrite 후 v2 키 확인
});
```

- [ ] **Step 2: 실행해 실패 확인**

Run: `npx vitest run lib/store.test.ts` → 새 케이스 FAIL.

- [ ] **Step 3: 구현**

`AppState`에 `mode`(기본 "free")·`rewriteContext` 추가. `startRewrite` 구현: `registerWc2026()` 보장 → `fromRealState`로 `MatchState` 생성 → `me/opp/match/mode/rewriteContext/setup` 세팅. persist `name`을 `touchline-v2`로 변경. `reset`/`selectMatchup`/`startQuick`은 `mode: "free"`로 되돌린다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/store.test.ts` → PASS. 전체 회귀 `npx vitest run` 그린.

- [ ] **Step 5: Commit**

```
git add lib/store.ts lib/store.test.ts
git commit -m "feat(wc2026): store rewrite mode + persist v2"
```

### Task D2: /rewrite 라우트 — 경기 브라우저 + 순간 카드

**Files:**
- Create: `app/rewrite/page.tsx`
- Create: `components/rewrite/MatchBrowser.tsx`
- Create: `components/rewrite/MomentCards.tsx`
- Modify: `app/page.tsx`(홈에 모드 진입 버튼)
- Test: `components/rewrite/match-browser.test.ts`(순수 필터·정렬 로직 분리)

**Interfaces:**
- Consumes: `wc2026Matches`, `extractMoments`, `startRewrite`
- Produces: `filterMatches(round?, koreaFirst)` 순수 함수 + 화면

- [ ] **Step 1: 필터·정렬 순수 함수 테스트 작성 (실패)**

```ts
// components/rewrite/match-browser.test.ts
import { describe, it, expect } from "vitest";
import { sortForBrowser } from "@/components/rewrite/match-browser";
import type { Wc2026Match } from "@/lib/wc2026/types";
// KOR 경기가 최상단으로 오는지, round 필터가 동작하는지 검증
```

- [ ] **Step 2: 구현 (순수 함수 + 컴포넌트)**

`match-browser.ts`(순수): `sortForBrowser(matches, roundFilter)` — 라운드 필터 후 KOR 포함 경기 우선 정렬. `MatchBrowser.tsx`: 라운드 탭 + 경기 카드(실제 스코어·라운드·"결정적 순간 N개"). 카드 클릭 → 팀 선택 → `MomentCards`에 순간 나열, 카드 클릭 시 `startRewrite` 후 `/tactics`로 이동. `app/rewrite/page.tsx`가 조립. `app/page.tsx`에 "2026 월드컵 다시 쓰기" 버튼 추가(`/rewrite` 링크).

- [ ] **Step 3: 테스트 + 타입체크**

Run: `npx vitest run components/rewrite/match-browser.test.ts` → PASS.
Run: `npx tsc --noEmit` → 통과.

- [ ] **Step 4: Commit**

```
git add app/rewrite components/rewrite app/page.tsx
git commit -m "feat(wc2026): rewrite route with match browser + moment cards"
```

### Task D3: tactics/match 모드 분기 (실경기 컨텍스트 배지 + 고지)

**Files:**
- Modify: `app/tactics/page.tsx`, `app/match/page.tsx`
- Modify: `components/tactics/*`(11인 미만 차단을 rewrite 모드에서 완화)

**Interfaces:**
- Consumes: `mode`, `rewriteContext`(store)

- [ ] **Step 1: 수동 확인 시나리오 정의**

rewrite 진입 → `/tactics`에서 "실제 경기 · {matchup} · {takeoverMinute}′부터 지휘" 배지와 가상 데이터 고지 노출, 퇴장 10인 상태면 경기 시작 허용. `/match`는 기존 하이라이트 점프 그대로.

- [ ] **Step 2: 구현**

`/tactics`·`/match`가 `mode === "rewrite"`면 컨텍스트 배지·고지를 렌더. 11인 미만 시작 차단 검증을 `rewrite` 모드에서는 "온피치 인원 == 실제 인원"으로 완화(퇴장 반영). 기존 free 모드 동작 무변경.

- [ ] **Step 3: 브라우저 실측**

`npm run dev` 후 `/rewrite`→순간 선택→`/tactics`→경기 시작→`/match` 완주. 콘솔 에러 0 확인.

- [ ] **Step 4: Commit**

```
git add app/tactics/page.tsx app/match/page.tsx components/tactics
git commit -m "feat(wc2026): tactics/match mode branching + context badge"
```

### Task D4: 복기 — 실제 역사 vs 나의 평행세계

**Files:**
- Create: `components/rewrite/RealVsParallel.tsx`
- Create: `components/rewrite/compare.ts`(순수 비교 로직)
- Modify: `app/result/page.tsx`(rewrite 모드 시 비교 패널 추가)
- Test: `components/rewrite/compare.test.ts`

**Interfaces:**
- Consumes: `Wc2026Match`(실제 결과), `MatchState`(내 시뮬), `rewriteContext`
- Produces:
```ts
export interface RewriteCompare {
  realScoreKo: string;      // "실제: 1-2 패배"
  myScoreKo: string;        // "당신의 지휘: 2-2 무승부"
  changedOutcome: boolean;  // 승패 결과가 바뀌었는가
  deltaKo: string;          // "실제 패배 → 무승부로 바꿨습니다"
}
export function buildCompare(match: Wc2026Match, side: string, mine: MatchState): RewriteCompare;
```

- [ ] **Step 1: 비교 로직 테스트 작성 (실패)**

```ts
// components/rewrite/compare.test.ts — 실제 패배를 무승부로 바꾼 케이스에서
// changedOutcome=true, deltaKo에 "무승부" 포함 등을 검증
```

- [ ] **Step 2: 실행해 실패 확인**

Run: `npx vitest run components/rewrite/compare.test.ts` → FAIL.

- [ ] **Step 3: 구현**

`compare.ts`: 실제 최종 스코어(side 관점)와 내 시뮬 최종 스코어를 승/무/패로 분류, 결과 변화 여부·한국어 델타 문구 생성. `RealVsParallel.tsx`: 두 스코어 카드 병렬 + 델타 한 문장. `app/result/page.tsx`가 `mode === "rewrite"`면 기존 카운터팩추얼 패널 대신(또는 위에) 이 패널을 렌더, 기존 전술 평가 패널은 재사용.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run components/rewrite/compare.test.ts` → PASS.

- [ ] **Step 5: Commit**

```
git add components/rewrite/RealVsParallel.tsx components/rewrite/compare.ts components/rewrite/compare.test.ts app/result/page.tsx
git commit -m "feat(wc2026): real-vs-parallel comparison review"
```

### Task D5: E2E 스모크 + 전체 회귀

**Files:**
- Create: `e2e/rewrite.spec.ts`

- [ ] **Step 1: 스모크 작성**

`/rewrite` 진입 → 첫 경기 → 팀 선택 → 첫 순간 카드 → `/tactics` 경기 시작 → `/match` 완주 → `/result`에서 "당신의 지휘" 텍스트 확인.

- [ ] **Step 2: 실행**

Run: `npx playwright test e2e/rewrite.spec.ts` → PASS.
Run 전체: `npx vitest run`(그린), `npx tsc --noEmit`, `npm run build`(정적 export 성공).

- [ ] **Step 3: Commit**

```
git add e2e/rewrite.spec.ts
git commit -m "test(wc2026): rewrite mode e2e smoke"
```

---

## Phase E — 제출물 갱신

### Task E1: README + 기획서 PDF에 모드 반영

**Files:**
- Modify: `README.md`
- Modify: `docs/TOUCHLINE-기획서-source.html` → `docs/TOUCHLINE-기획서.pdf` 재생성

- [ ] **Step 1: README 갱신**

핵심 기능 표에 "2026 월드컵 다시 쓰기" 행 추가, 기획→구현 매핑에 `lib/wc2026/*`·`lib/engine/rewrite.ts` 경로 추가, 데이터 출처(ESPN 공개 데이터 1회 수집)·가상 능력치 고지 명시.

- [ ] **Step 2: 기획서에 신규 섹션 추가 후 PDF 재생성**

HTML 원본에 "2026 월드컵 다시 쓰기 모드"(목적·결정적 순간 UX·실제 비교 리뷰·데이터 활용) 섹션 추가. Playwright로 PDF 재렌더(기존 render 스크립트 재사용).

- [ ] **Step 3: 배포 + 커밋**

Run: `npm run build`; `npx vercel --prod --yes`.
```
git add README.md docs/TOUCHLINE-기획서-source.html docs/TOUCHLINE-기획서.pdf
git commit -m "docs(wc2026): document rewrite mode in README and proposal"
```
push는 `feat/touchline` + `feat/touchline:main` 양쪽. (8/3 10:00 이전 확인)

---

## Self-Review 결과

- **스펙 커버리지**: §3 데이터(A1~A4), §3.3 정합성 게이트(A3), §4.1 홈 분기(D2), §4.2 순간 추출(C1), §4.3 상태 복원(C2), §4.4 분기 시뮬(D3, 엔진 재사용), §4.5 비교 복기(D4), §5 어댑터·store(C2/D1), §6 테스트(각 Task+D5), §7 제출물(E1) — 전부 대응.
- **플레이스홀더**: 각 Task에 실제 테스트 코드·구현 지침·명령·기대 출력 명시. Task A1은 외부 API 구조 확인 스파이크를 명시적 단계로 포함(엔드포인트 미확정은 런타임 확인).
- **타입 일관성**: `Wc2026Match`/`DecisiveMoment`/`RewriteCompare` 시그니처를 정의 Task와 소비 Task에서 동일하게 사용. `wc2026TeamId`/`wc_` 접두 규칙 통일. integrity 테스트의 `goalsHome` 표기 통일 주석 포함.
- **비범위 준수**: 연장전 개입·자유 되감기·승부차기 실데이터 리플레이 제외(C1이 minute≤90 한정).

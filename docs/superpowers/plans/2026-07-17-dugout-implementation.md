# DUGOUT (더그아웃) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상대팀·경기장을 고르고 선수를 드래그 배치하면 통계 엔진이 실시간 승률·추천 전술을 제시하고, 경기를 시뮬레이션해 감독 개입의 가치를 카운터팩추얼로 복기하는 웹서비스 (데이콘 해커톤 제출작).

**Architecture:** Next.js 15(App Router) 완전 정적 빌드(`output: 'export'`) + 100% 클라이언트 사이드 순수 TS 통계 엔진(`lib/engine/`, UI 무의존) + Zustand persist(sessionStorage). 엔진은 순수 함수만으로 구성하고 vitest로 TDD, UI는 4+1 화면(홈/작전실/경기/승부차기·복기).

**Tech Stack:** Next.js 15, TypeScript(strict), Tailwind CSS, Zustand, @dnd-kit/core, Framer Motion, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-17-dugout-tactics-simulator-design.md` (모든 태스크의 상위 문서)

## Global Constraints

- `next.config.ts`: `output: 'export'`, `images: { unoptimized: true }` — 서버 기능 사용 금지 (API 라우트·미들웨어·동적 OG 금지)
- 외부 API·외부 폰트 CDN·API 키 사용 금지. 모든 데이터는 리포 내 정적 JSON/TS
- UI 문구는 전부 한국어, 비축구팬 기준 용어 (전문 용어는 툴팁 보조)
- 선수 사진·실제 구단/FIFA 엠블럼 사용 금지 — 이니셜 아바타·자체 제작 국기 배지만
- 모든 화면에 가상 데이터 고지 문구 노출: "본 서비스의 모든 선수·팀 능력치는 가상으로 구성된 데이터입니다"
- 유리 = emerald(초록)·↑, 불리 = red(빨강)·↓ — 항상 색+방향+수치 3중 표기
- 접근성: 시맨틱 태그, aria-label, 드래그의 탭-투-배치 대체 수단
- 브라우저 콘솔 에러 제로 유지, 375px 폭에서 모든 화면 동작
- 엔진(`lib/engine/`, `lib/data/`)에서 React/DOM import 금지 (순수 TS)
- 커밋 메시지 끝: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 테스트 실행 명령: `npx vitest run <파일>` (watch 금지)

---

### Task 1: 프로젝트 스캐폴드 + 정적 빌드 구성

**Files:**
- Create: Next.js 프로젝트 루트 (기존 `docs/`, `.git` 보존), `next.config.ts`, `vitest.config.ts`, `app/globals.css`, `.gitignore`
- Test: 빌드/테스트 러너 자체가 검증

**Interfaces:**
- Produces: 이후 모든 태스크가 사용하는 프로젝트 뼈대. path alias `@/*` → 프로젝트 루트

- [ ] **Step 1: create-next-app 스캐폴드** — 현재 디렉토리가 비어있지 않으므로(docs, .git) 임시 폴더에 생성 후 이동

```powershell
npx --yes create-next-app@latest dugout-tmp --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes
Get-ChildItem dugout-tmp -Force | Where-Object { $_.Name -notin '.git','node_modules' } | Move-Item -Destination .
Remove-Item -Recurse -Force dugout-tmp
npm install
```

- [ ] **Step 2: 의존성 설치**

```powershell
npm install zustand @dnd-kit/core @dnd-kit/utilities framer-motion
npm install -D vitest @vitest/coverage-v8 @playwright/test
```

- [ ] **Step 3: `next.config.ts`를 정적 export로 교체**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
```

- [ ] **Step 4: `vitest.config.ts` 생성**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: { include: ["lib/**/*.test.ts"], environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
```

- [ ] **Step 5: 검증** — `npm run build` 성공(out/ 생성), `npx vitest run` 이 "no test files found"로 정상 종료, `npm run dev` 후 http://localhost:3000 응답 확인

- [ ] **Step 6: Commit** — `chore: scaffold next.js static-export project with vitest`

---

### Task 2: 도메인 타입 + 포메이션/역할/지시 정적 정의

**Files:**
- Create: `lib/types.ts`, `lib/data/formations.ts`, `lib/data/roles.ts`
- Test: `lib/data/formations.test.ts`

**Interfaces:**
- Produces (이후 전 태스크가 사용하는 핵심 타입 — 시그니처 고정):

```ts
// lib/types.ts — 전체 내용
export type Position = "GK" | "CB" | "FB" | "DM" | "CM" | "AM" | "WG" | "ST";
export type FormationId = "4-3-3" | "4-4-2" | "4-2-3-1" | "3-5-2" | "3-4-3" | "5-4-1";
export type RoleId =
  | "gk_sweeper" | "gk_traditional"
  | "cb_stopper" | "cb_cover"
  | "fb_overlap" | "fb_defensive"
  | "dm_anchor" | "dm_regista"
  | "cm_b2b" | "cm_deeplying" | "cm_holding"
  | "am_playmaker" | "am_shadow"
  | "wg_inverted" | "wg_classic"
  | "st_target" | "st_false9" | "st_poacher";

export interface PlayerAttrs {
  shooting: number; passing: number; dribbling: number; defending: number;
  pace: number; physical: number; goalkeeping: number; stamina: number;
} // 전부 정수 1~99

export interface Player {
  id: string; teamId: string; name: string; age: number; caps: number;
  positions: Position[];            // [0]이 주포지션
  attrs: PlayerAttrs;
  setPiece: number; aerial: number; penalty: number; mental: number; // 1~99
}

export interface Team {
  id: string; nameKo: string; code: string;     // code: "KOR" 등 3글자
  elo: number; fifaRank: number; form: number;   // form 1~10
  styleTags: string[]; color1: string; color2: string; // hex
}

export interface Venue {
  id: string; nameKo: string; cityKo: string;
  altitude: number; avgTempC: number; dome: boolean; capacity: number;
}

export interface HeadToHead { teamA: string; teamB: string; winA: number; draw: number; winB: number; }

export interface FormationSlot { id: string; position: Position; x: number; y: number; } // x,y: 0~100 (자기 진영 기준, y=0 골라인)
export interface Formation { id: FormationId; nameKo: string; slots: FormationSlot[]; } // slots.length === 11

export interface TeamInstructions {
  formation: FormationId;
  pressing: 1 | 2 | 3; line: 1 | 2 | 3; attacking: 1 | 2 | 3; tempo: 1 | 2 | 3;
  buildup: "short" | "direct"; focus: "left" | "center" | "right";
  width: "wide" | "narrow"; marking: "zonal" | "man"; offsideTrap: boolean;
}

export interface SpecialInstructions {
  captainId?: string; fkTakerId?: string; ckTakerId?: string;
  manMark?: { markerId: string; targetId: string };
  ckBigMenForward: boolean;
}

export interface SideSetup {
  teamId: string;
  lineup: Record<string, string>;   // slotId -> playerId (11개)
  roles: Record<string, RoleId>;    // slotId -> role
  instructions: TeamInstructions;
  special: SpecialInstructions;
}

export interface RoleDef {
  id: RoleId; position: Position; nameKo: string; descKo: string;
  weights: Partial<Record<keyof PlayerAttrs | "aerial" | "setPiece" | "mental", number>>; // 합=1
  attackBias: number; // -0.1~+0.1 (라인 기여 배분: +면 공격 기여↑ 수비 기여↓)
}
```

- `lib/data/formations.ts`: `export const FORMATIONS: Record<FormationId, Formation>` — 6종 전부, 슬롯 좌표 포함. 예: 4-3-3 = GK(50,4), CB(38,18), CB(62,18), FB(15,22), FB(85,22), DM(50,36), CM(35,48), CM(65,48), WG(15,68), WG(85,68), ST(50,80). 나머지 5종도 같은 방식으로 포지션 구성에 맞게 전부 작성 (4-4-2: GK,CB×2,FB×2,CM×2,WG×2,ST×2 / 4-2-3-1: GK,CB×2,FB×2,DM×2,AM,WG×2,ST / 3-5-2: GK,CB×3,FB×2(윙백),DM,CM×2,ST×2 / 3-4-3: GK,CB×3,FB×2,CM×2,WG×2,ST / 5-4-1: GK,CB×3,FB×2,CM×2,WG×2,ST)
- `lib/data/roles.ts`: `export const ROLES: Record<RoleId, RoleDef>`, `export const ROLES_BY_POSITION: Record<Position, RoleId[]>`, `export const DEFAULT_ROLE: Record<Position, RoleId>`. 가중 프로파일 예시(전 역할 이 패턴으로 작성): `st_target: { weights: { aerial: .30, physical: .25, shooting: .25, mental: .10, pace: .10 }, attackBias: .05 }`, `st_poacher: { weights: { shooting: .35, pace: .30, dribbling: .15, mental: .20 } }`, `cm_b2b: { weights: { stamina: .25, passing: .25, defending: .20, dribbling: .15, physical: .15 } }`, `gk_traditional: { weights: { goalkeeping: .85, mental: .15 } }`

- [ ] **Step 1: 실패 테스트 작성** (`lib/data/formations.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { FORMATIONS } from "./formations";
import { ROLES, ROLES_BY_POSITION, DEFAULT_ROLE } from "./roles";

describe("formations", () => {
  it("6종 포메이션 모두 슬롯 11개, GK 정확히 1개", () => {
    const ids = Object.keys(FORMATIONS);
    expect(ids).toHaveLength(6);
    for (const f of Object.values(FORMATIONS)) {
      expect(f.slots).toHaveLength(11);
      expect(f.slots.filter((s) => s.position === "GK")).toHaveLength(1);
      for (const s of f.slots) {
        expect(s.x).toBeGreaterThanOrEqual(0); expect(s.x).toBeLessThanOrEqual(100);
        expect(s.y).toBeGreaterThanOrEqual(0); expect(s.y).toBeLessThanOrEqual(100);
      }
    }
  });
  it("슬롯 id는 포메이션 내 유일", () => {
    for (const f of Object.values(FORMATIONS)) {
      expect(new Set(f.slots.map((s) => s.id)).size).toBe(11);
    }
  });
});

describe("roles", () => {
  it("모든 역할의 weights 합은 1(±0.001)", () => {
    for (const r of Object.values(ROLES)) {
      const sum = Object.values(r.weights).reduce((a, b) => a + (b ?? 0), 0);
      expect(Math.abs(sum - 1)).toBeLessThan(0.001);
    }
  });
  it("포지션 8종 모두 기본 역할이 있고 해당 포지션 소속", () => {
    const positions = ["GK","CB","FB","DM","CM","AM","WG","ST"] as const;
    for (const p of positions) {
      expect(ROLES_BY_POSITION[p].length).toBeGreaterThanOrEqual(2);
      expect(ROLES[DEFAULT_ROLE[p]].position).toBe(p);
    }
  });
});
```

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run lib/data/formations.test.ts` → FAIL (모듈 없음)
- [ ] **Step 3: `lib/types.ts`, `lib/data/formations.ts`, `lib/data/roles.ts` 구현** (위 명세 그대로, 18개 역할 전부)
- [ ] **Step 4: 테스트 통과 확인** — 같은 명령 PASS
- [ ] **Step 5: Commit** — `feat: domain types, 6 formations, 18 player roles`

---

### Task 3: 팀·선수·경기장·상대전적 데이터 + 스키마 검증

**Files:**
- Create: `lib/data/teams.ts`, `lib/data/players.ts`, `lib/data/venues.ts`, `lib/data/h2h.ts`
- Test: `lib/data/dataset.test.ts`

**Interfaces:**
- Produces: `TEAMS: Team[]`(16), `PLAYERS: Player[]`, `VENUES: Venue[]`(8), `H2H: HeadToHead[]`, `playersOf(teamId): Player[]`, `teamById(id): Team`, `venueById(id): Venue`, `h2hOf(a, b): HeadToHead | undefined`

**데이터 명세 (더미 데이터 — 실제 선수 이름·포지션·국가 참고해 직접 구성, 능력치는 가상):**
- 팀 16: kor(한국), jpn(일본), bra(브라질), arg(아르헨티나), fra(프랑스), eng(잉글랜드), esp(스페인), ger(독일), por(포르투갈), ned(네덜란드), ita(이탈리아), bel(벨기에), cro(크로아티아), mar(모로코), usa(미국), mex(멕시코). ELO는 실제 감각 반영: bra/arg/fra/esp 1980~2060, eng/por/ger/ned 1900~1970, kor/jpn 1730~1790, usa/mex 1680~1750 등
- 선수: 팀당 정확히 20명 (GK 2, CB 4, FB 3, DM/CM/AM 합 6, WG 3, ST 2). 실명 참고 (예: kor — 손흥민 WG/ST, 이강인 AM, 김민재 CB...). 에이스 선수의 최고 능력치는 88~93, 평균 선수 65~78, ELO 낮은 팀일수록 전반적으로 낮게
- 경기장 8 (2026 실제 개최지 기반): azteca(멕시코시티, 고도 2240, 24°C), monterrey(몬테레이 540, 33°C), dallas(댈러스 190, 35°C, dome), miami(마이애미 2, 32°C), metlife(뉴저지 7, 27°C), sofi(LA 30, 24°C, dome), seattle(시애틀 50, 22°C), atlanta(애틀랜타 320, 31°C, dome)
- h2h: 서사성 있는 쌍 20개 이상 (kor-jpn, kor-ger, bra-arg, esp-por, eng-fra 등), 나머지 쌍은 undefined 허용

- [ ] **Step 1: 실패 테스트 작성** (`lib/data/dataset.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { TEAMS, teamById } from "./teams";
import { PLAYERS, playersOf } from "./players";
import { VENUES } from "./venues";
import { H2H, h2hOf } from "./h2h";

describe("dataset integrity", () => {
  it("팀 16개, id 유일, elo 1500~2200", () => {
    expect(TEAMS).toHaveLength(16);
    expect(new Set(TEAMS.map((t) => t.id)).size).toBe(16);
    for (const t of TEAMS) { expect(t.elo).toBeGreaterThan(1500); expect(t.elo).toBeLessThan(2200); }
  });
  it("모든 팀 선수 정확히 20명, 포지션 구성 충족", () => {
    for (const t of TEAMS) {
      const squad = playersOf(t.id);
      expect(squad).toHaveLength(20);
      const primary = (p: string) => squad.filter((x) => x.positions[0] === p).length;
      expect(primary("GK")).toBe(2);
      expect(primary("CB")).toBeGreaterThanOrEqual(3);
      expect(primary("ST") + primary("WG")).toBeGreaterThanOrEqual(4);
    }
  });
  it("능력치·보조 스탯 전부 1~99 정수, 나이 17~40", () => {
    for (const p of PLAYERS) {
      for (const v of [...Object.values(p.attrs), p.setPiece, p.aerial, p.penalty, p.mental]) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(99);
      }
      expect(p.age).toBeGreaterThanOrEqual(17); expect(p.age).toBeLessThanOrEqual(40);
      expect(teamById(p.teamId)).toBeDefined();
    }
  });
  it("경기장 8개 — 고도 1500m 초과 1곳 이상, 돔 2곳 이상, 30도 이상 폭염 2곳 이상", () => {
    expect(VENUES).toHaveLength(8);
    expect(VENUES.filter((v) => v.altitude > 1500).length).toBeGreaterThanOrEqual(1);
    expect(VENUES.filter((v) => v.dome).length).toBeGreaterThanOrEqual(2);
    expect(VENUES.filter((v) => v.avgTempC >= 30 && !v.dome).length).toBeGreaterThanOrEqual(2);
  });
  it("h2h 20쌍 이상, 조회는 순서 무관 동일 결과", () => {
    expect(H2H.length).toBeGreaterThanOrEqual(20);
    const r1 = h2hOf("kor", "jpn"); const r2 = h2hOf("jpn", "kor");
    expect(r1).toBeDefined(); expect(r1).toEqual(r2);
  });
});
```

- [ ] **Step 2: 실행해 실패 확인** → FAIL
- [ ] **Step 3: 데이터 파일 4종 구현** (명세 준수, 총 320명. 조회 함수 포함)
- [ ] **Step 4: 테스트 통과 확인**
- [ ] **Step 5: Commit** — `feat: 16-team dummy dataset (players, venues, h2h)`

---

### Task 4: 시드 RNG + 포아송 유틸

**Files:**
- Create: `lib/engine/random.ts`, `lib/engine/poisson.ts`
- Test: `lib/engine/random.test.ts`

**Interfaces:**
- Produces:
  - `createRng(seed: number): Rng` — `interface Rng { next(): number; state(): number }`, mulberry32. `next()`는 [0,1). `createRngFrom(state)`로 복원 가능
  - `poissonPmf(lambda: number, k: number): number`
  - `outcomeProbs(lambdaA: number, lambdaB: number): { win: number; draw: number; loss: number }` — k=0..10 이중합, A 관점

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, it, expect } from "vitest";
import { createRng, createRngFrom } from "./random";
import { outcomeProbs, poissonPmf } from "./poisson";

describe("rng", () => {
  it("같은 시드 → 같은 수열", () => {
    const a = createRng(42), b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it("state로 중단 지점 복원 가능", () => {
    const a = createRng(7); a.next(); a.next();
    const b = createRngFrom(a.state());
    expect(b.next()).toBe(a.next());
  });
});

describe("poisson", () => {
  it("pmf 합 ≈ 1", () => {
    let s = 0; for (let k = 0; k <= 30; k++) s += poissonPmf(1.5, k);
    expect(Math.abs(s - 1)).toBeLessThan(1e-6);
  });
  it("승+무+패 = 1, λ 우위 팀의 승률이 더 높다", () => {
    const p = outcomeProbs(2.0, 1.0);
    expect(Math.abs(p.win + p.draw + p.loss - 1)).toBeLessThan(1e-6);
    expect(p.win).toBeGreaterThan(p.loss);
  });
  it("λ 동일이면 win ≈ loss", () => {
    const p = outcomeProbs(1.3, 1.3);
    expect(Math.abs(p.win - p.loss)).toBeLessThan(1e-9);
  });
});
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — mulberry32 표준 구현, `poissonPmf = e^-λ λ^k / k!` (로그 누적으로 계산), `outcomeProbs`는 0..10 이중 루프
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: Commit** — `feat: seeded rng and poisson outcome math`

---

### Task 5: 선수 기여도 + 라인 전력 (역할·적합도·나이·맨마킹)

**Files:**
- Create: `lib/engine/strength.ts`
- Test: `lib/engine/strength.test.ts`

**Interfaces:**
- Consumes: Task 2 타입·ROLES·FORMATIONS, Task 3 데이터
- Produces:
  - `positionFitness(player: Player, slotPos: Position): number` — 주포지션 1.0 / positions에 포함 0.9 / 인접(표 아래) 0.75 / 그 외 0.5 / GK 불일치(비GK가 GK슬롯 or GK가 필드) 0.25. 인접표: CB↔FB, CB↔DM, FB↔WG, DM↔CM, CM↔AM, AM↔WG, AM↔ST, WG↔ST
  - `ageMultiplier(age: number, pos: Position): number` — 피크 GK 31, CB 29, FB/DM/CM/AM 27, WG/ST 26. `max(0.78, 1 - 0.006 * |age-peak|^1.35)`
  - `playerContribution(player, slotPos, role: RoleId, staminaPct = 1): number` — Σ(weights × 해당 스탯) × fitness × ageMult × (0.6 + 0.4 × staminaPct). aerial/setPiece/mental은 attrs 밖 필드에서 조회
  - `lineStrengths(side: SideSetup, opp?: SideSetup): LineStrengths` — `{ gk, def, mid, att }` 각 라인 소속 슬롯 기여도 평균. 라인 매핑: GK→gk / CB,FB→def / DM,CM,AM→mid / WG,ST→att. role.attackBias>0이면 기여의 bias만큼 att로 이월. **맨마킹**: side.special.manMark 지정 시 마커의 공격 기여 ×0.92, (opp의 라인 계산 시) 타깃 선수 기여 ×0.69

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, it, expect } from "vitest";
import { positionFitness, ageMultiplier, playerContribution, lineStrengths } from "./strength";
import { playersOf } from "@/lib/data/players";
// 헬퍼: 테스트 상단에 makeSetup(teamId, formationId) — DEFAULT_ROLE·능력치순 그리디로 SideSetup 구성 (Task 7의 autoPlace 이전 버전을 테스트 내 구현)

describe("positionFitness", () => {
  it("주포지션 1.0, 등록 부포지션 0.9, GK 불일치 0.25", () => {
    const squad = playersOf("kor");
    const st = squad.find((p) => p.positions[0] === "ST")!;
    expect(positionFitness(st, "ST")).toBe(1.0);
    expect(positionFitness(st, "GK")).toBe(0.25);
  });
});

describe("ageMultiplier", () => {
  it("피크 나이에서 1.0, 36세 WG는 0.9 미만, 하한 0.78", () => {
    expect(ageMultiplier(26, "WG")).toBe(1.0);
    expect(ageMultiplier(36, "WG")).toBeLessThan(0.9);
    expect(ageMultiplier(40, "WG")).toBeGreaterThanOrEqual(0.78);
  });
});

describe("playerContribution", () => {
  it("체력 0%면 기여도는 만체력의 60%", () => {
    const p = playersOf("kor")[0];
    const full = playerContribution(p, p.positions[0], /*role*/ undefined as never, 1);
    const empty = playerContribution(p, p.positions[0], undefined as never, 0);
    expect(empty / full).toBeCloseTo(0.6, 5);
  });
});

describe("lineStrengths + 맨마킹", () => {
  it("브라질 공격 라인 > 한국 공격 라인 (더미 데이터 전제)", () => {
    const bra = makeSetup("bra", "4-3-3"), kor = makeSetup("kor", "4-3-3");
    expect(lineStrengths(bra).att).toBeGreaterThan(lineStrengths(kor).att);
  });
  it("맨마킹 지정 시 상대 타깃 기여 감소 + 우리 마커 공격 기여 감소", () => {
    const kor = makeSetup("kor", "4-3-3"), bra = makeSetup("bra", "4-3-3");
    const braNoMark = lineStrengths(bra, kor);
    const target = Object.values(bra.lineup).map((id) => playersOf("bra").find((p) => p.id === id)!)
      .sort((a, b) => b.attrs.shooting - a.attrs.shooting)[0];
    const marker = Object.values(kor.lineup)[5];
    const korMarking = { ...kor, special: { ...kor.special, manMark: { markerId: marker, targetId: target.id } } };
    const braMarked = lineStrengths(bra, korMarking);
    expect(braMarked.att).toBeLessThan(braNoMark.att);
  });
});
```

(참고: `playerContribution`의 role 인자가 undefined면 `DEFAULT_ROLE[slotPos]` 사용 — 구현에 기본값 처리 포함)

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** (명세 수치 그대로)
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: Commit** — `feat: player contribution and line strength engine`

---

### Task 6: 보정 규칙 엔진 + λ + 승률 (근거 카드의 원천)

**Files:**
- Create: `lib/engine/modifiers.ts`, `lib/engine/winprob.ts`
- Test: `lib/engine/winprob.test.ts`

**Interfaces:**
- Consumes: Task 4 `outcomeProbs`, Task 5 `lineStrengths`
- Produces:
  - `interface AppliedRule { id: string; textKo: string; deltaAttack: number; deltaDefense: number; icon: string }` — delta는 λ 곱셈 보정치-1 (예: +0.06)
  - `applyModifiers(me: SideSetup, opp: SideSetup, venue: Venue, meTeam: Team, oppTeam: Team, h2h?: HeadToHead): { rules: AppliedRule[]; attackMult: number; defenseMult: number }`
  - `computeLambdas(me, opp, venue): { lambdaMe, lambdaOpp, rulesMe, rulesOpp, lines: {me, opp} }` — 산식: `λ = 1.35 × (myAtt/oppDef)^1.6 × attackMult / oppDefenseMult × eloMult`, clamp [0.2, 4.0]. `eloMult = 1 + clamp(eloDiff, -400, 400)/400 × 0.10`. myAtt = 0.55×att + 0.35×mid + 0.10×def, oppDef = 0.50×def + 0.30×mid + 0.20×gk (att/def/mid는 55~90 스케일이므로 비율로 사용)
  - `winProbability(me, opp, venue): { win, draw, loss, lambdaMe, lambdaOpp, rules: AppliedRule[] }`
- **보정 규칙 목록 (전부 구현, id/조건/효과/문구):**
  1. `high_line_vs_pace`: 내 line=3 && 상대 att라인 pace 평균>80 → deltaDefense -0.08, "⚠ 높은 라인, 상대 스피드에 배후가 뚫릴 수 있어요 −8%"
  2. `direct_targetman`: buildup=direct && ST 역할에 st_target 존재 → deltaAttack +0.06, "🎯 롱볼과 타겟맨 조합, 상대 배후를 노립니다 +6%"
  3. `short_vs_press`: buildup=short && 상대 pressing=3 → deltaAttack -0.05
  4. `focus_vs_weakflank`: focus=left/right && 해당 측 상대 FB 기여 < 상대 def 평균×0.93 → deltaAttack +0.07, "🎯 상대 왼쪽/오른쪽 측면이 약점입니다 +7%"
  5. `wide_vs_narrow`: width=wide && 상대 width=narrow → deltaAttack +0.03 / 반대 → -0.03
  6. `counter_style`: attacking=1 && 상대 line=3 → deltaAttack +0.06 ("역습 기회")
  7. `offside_trap`: trap=true → 상대 deltaAttack -0.04, 단 상대 att pace 평균>82면 오히려 내 deltaDefense -0.05
  8. `man_marking_fatigue`: manMark 지정 → deltaDefense +0.05 (타깃 봉쇄는 strength에서 반영, 여기선 수비 조직 보너스), 마커 체력 소모는 시뮬에서
  9. `altitude`: venue.altitude>1500 → 양팀 스태미나 감쇠 가속(시뮬용 플래그) + pressing=3인 팀 deltaAttack -0.04, "🏔 고지대, 강한 압박은 후반에 지칩니다 −4%"
  10. `heat`: avgTempC≥30 && !dome → 동일 구조 -0.03, "🥵 폭염, 체력 소모가 큽니다"
  11. `form`: form≥8 → +0.03 / form≤3 → -0.03
  12. `h2h_edge`: h2h 존재 && 한쪽 승수가 2배 이상 → 우세 측 +0.02 (상한 캡)
  13. `captain_mental`: 주장 mental≥85 → deltaDefense +0.02
  14. `tempo_stamina`: tempo=3 → deltaAttack +0.03 & 스태미나 감쇠 가속 플래그

- [ ] **Step 1: 실패 테스트 작성** — 각 규칙의 방향성 테스트. 핵심 케이스:

```ts
describe("winProbability", () => {
  it("승+무+패=1", () => { /* kor vs jpn, metlife */ });
  it("ELO 최상위 bra vs 최하위 팀 승률 ≥ 60%", () => { /* bra vs usa */ });
  it("고지대(azteca)에서 pressing=3 팀의 λ가 평지 대비 감소", () => {
    // 같은 매치업을 azteca / metlife 두 venue로 계산해 λ 비교
  });
  it("직접 빌드업+타겟맨이 숏패스+포처보다 규칙 direct_targetman을 발동", () => {
    // rules 배열에 id 존재 여부로 검증
  });
  it("모든 AppliedRule의 textKo는 비어있지 않고 delta는 ±0.15 이내", () => {});
});
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — 규칙은 `RULE_DEFS: Array<{id, when(ctx): boolean, effect(ctx): {da, dd}, textKo(ctx): string, icon}>` 배열로, `applyModifiers`가 순회 평가. λ·승률 산식은 명세 그대로
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: Commit** — `feat: modifier rule engine, lambda and win probability`

---

### Task 7: 자동 배치 + 추천 탐색

**Files:**
- Create: `lib/engine/autoplace.ts`, `lib/engine/recommend.ts`
- Test: `lib/engine/recommend.test.ts`

**Interfaces:**
- Consumes: Task 5·6 전체
- Produces:
  - `autoPlace(teamId: string, formation: FormationId): { lineup, roles, bench: string[] }` — 슬롯 순회하며 `playerContribution` 최대 선수를 그리디 배정(중복 배정 금지), 역할은 후보 역할 중 기여도 최대인 것
  - `recommend(me: SideSetup, opp: SideSetup, venue: Venue): Recommendation` — `interface Recommendation { instructions: TeamInstructions; lineup; roles; winDelta: number; topFactors: AppliedRule[]; evaluated: number; elapsedMs: number }`. 탐색: 포메이션 6종별 autoPlace 1회 캐시 → TeamInstructions 전 조합(3^4 × 2 × 3 × 2 × 2 × 2 = 23,328) 전수 평가(마킹/트랩/빌드업 포함), 승률 최대 조합 반환. topFactors는 추천 조합에서 발동한 rules 중 |delta| 상위 3개

- [ ] **Step 1: 실패 테스트 작성**

```ts
describe("autoPlace", () => {
  it("11슬롯 전부 채움, 선수 중복 없음, GK 슬롯에 GK 배치", () => {});
  it("벤치 9명", () => {});
});
describe("recommend", () => {
  it("추천 승률 ≥ 현재 승률 (같은 입력 기준 개선 보장)", () => {
    // kor(기본 4-3-3 autoPlace) vs bra, metlife 기준
  });
  it("전수 평가 규모 20000 이상, elapsedMs < 500 (CI 여유 기준)", () => {});
  it("topFactors 최대 3개, 전부 textKo 보유", () => {});
});
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — 성능 최적화: lineStrengths는 포메이션별 1회 계산 후 지시 조합 루프에서는 modifiers+λ만 재계산
- [ ] **Step 4: 통과 확인** (elapsedMs 로그 출력 확인)
- [ ] **Step 5: Commit** — `feat: greedy auto-placement and exhaustive tactic recommendation`

---

### Task 8: 경기 시뮬레이션 (분 단위, 개입, 위기 감지)

**Files:**
- Create: `lib/engine/match.ts`
- Test: `lib/engine/match.test.ts`

**Interfaces:**
- Consumes: Task 4 Rng, Task 5·6
- Produces:

```ts
export type MatchEventType = "kickoff" | "chance" | "shot" | "goal" | "save" | "corner" | "card" | "crisis" | "sub" | "tactic_change" | "halftime" | "fulltime";
export interface MatchEvent { minute: number; type: MatchEventType; side: "me" | "opp"; playerId?: string; textKo: string; }
export interface Intervention { minute: number; side: "me"; subs?: Array<{ out: string; in: string }>; instructions?: TeamInstructions; roles?: Record<string, RoleId>; special?: SpecialInstructions; }
export interface MatchState {
  minute: number; scoreMe: number; scoreOpp: number;
  stamina: Record<string, number>;      // playerId -> 0~1, 양팀 전원
  rngState: number; events: MatchEvent[]; interventions: Intervention[];
  me: SideSetup; opp: SideSetup; venueId: string; seed: number;
  subsUsedMe: number; finished: boolean;
  probTimeline: Array<{ minute: number; win: number }>;
}
export function initMatch(me: SideSetup, opp: SideSetup, venueId: string, seed: number): MatchState;
export function simulateMinute(state: MatchState): MatchState;           // 순수 — 새 state 반환
export function applyIntervention(state: MatchState, iv: Intervention): MatchState; // RNG 미소비
export function runFullMatch(me, opp, venueId, seed, interventions?: Intervention[]): MatchState; // 지정 분에 자동 적용하며 완주
```

- **시뮬 규칙:** 분당 이벤트 확률 = `λ/90 × 페이스보정`. chance 발생 → 0.55 확률로 shot → shot의 `0.30 + (슈터 기여-라인평균)/300` 확률로 goal, 아니면 save/corner(0.3). 카드: 분당 0.008 × pressing/2. 스태미나: 분당 기본 -1/110, tempo=3·pressing=3·altitude·heat 플래그마다 ×1.15~1.35, 맨마킹 마커 ×1.2. 5분마다 & 개입 직후 lineStrengths(스태미나 반영) → λ 재계산. 위기 감지: 실점 직후 또는 최근 10분 상대 chance≥3 → crisis 이벤트. probTimeline은 매분 `outcomeProbs` win 기록. 90분 + 추가시간(rng 1~5분)에 fulltime. **RNG 소비는 simulateMinute 안에서만** (applyIntervention은 소비 금지 — 카운터팩추얼 불변식의 근거)
- 중계 문구: `lib/engine/commentary.ts` 없이 match.ts 내 템플릿 함수로 — 타입별 3가지 변형 배열에서 rng로 선택, 선수 이름 삽입 (예: "⚽ {name}, 골망을 흔듭니다!!")

- [ ] **Step 1: 실패 테스트 작성**

```ts
describe("match simulation", () => {
  it("같은 시드+같은 개입 → 이벤트 로그 완전 동일 (재현성)", () => {
    const a = runFullMatch(kor, bra, "metlife", 123);
    const b = runFullMatch(kor, bra, "metlife", 123);
    expect(a.events).toEqual(b.events);
    expect(a.scoreMe).toBe(b.scoreMe);
  });
  it("다른 시드 → 대체로 다른 전개 (10개 시드 중 8개 이상 이벤트 수 상이)", () => {});
  it("90분 이상 진행 후 finished=true, 이벤트에 fulltime 존재", () => {});
  it("교체 개입이 라인업에 반영되고 subsUsedMe 증가, 5명 초과 교체는 무시", () => {});
  it("후반 평균 스태미나 < 전반 평균 스태미나", () => {});
  it("고지대 경기의 80분 시점 평균 스태미나 < 평지 경기 (같은 시드·매치업)", () => {});
});
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: Commit** — `feat: minute-based match simulation with interventions`

---

### Task 9: 승부차기 + 카운터팩추얼 (+불변식 테스트)

**Files:**
- Create: `lib/engine/shootout.ts`, `lib/engine/counterfactual.ts`
- Test: `lib/engine/counterfactual.test.ts`

**Interfaces:**
- Consumes: Task 8 전체
- Produces:
  - `simulateShootout(meKickers: string[], meSetup: SideSetup, oppSetup: SideSetup, seed: number): ShootoutResult` — `{ rounds: Array<{ side; playerId; scored: boolean }>; winner: "me" | "opp" }`. 성공률 = `clamp(0.62 + (pk-70)*0.004 + (mental-70)*0.002 - (상대GK gk기여-70)*0.004, 0.50, 0.90)`. 5라운드 후 동률이면 서든데스. 상대 키커는 pk 내림차순 자동 5명
  - `counterfactual(original: MatchState): CfResult` — `{ baseline: MatchState; deltas: Array<{ intervention: Intervention; probDelta: number }>; scoreDiffText: string }`. baseline = `runFullMatch(초기 setup, seed, [])`. probDelta = 개입 직전 분의 원경기 win − baseline 동일 분 win 의 이후 구간 평균 차

- [ ] **Step 1: 실패 테스트 작성 (스펙 §5.3 불변식 3종 그대로)**

```ts
describe("counterfactual invariants", () => {
  it("① 무개입 baseline은 원 경기의 개입 이전 구간과 이벤트 완전 동일", () => {
    const iv: Intervention = { minute: 60, side: "me", instructions: aggressive };
    const orig = runFullMatch(kor, bra, "metlife", 55, [iv]);
    const base = counterfactual(orig).baseline;
    const before = (e: MatchEvent) => e.minute < 60 && e.type !== "tactic_change";
    expect(orig.events.filter(before)).toEqual(base.events.filter(before));
  });
  it("② 원 경기의 개입 로그 재적용 → 원 경기 100% 재현", () => {
    const orig = runFullMatch(kor, bra, "metlife", 55, [iv]);
    const replay = runFullMatch(kor, bra, "metlife", 55, orig.interventions);
    expect(replay.events).toEqual(orig.events);
  });
  it("③ 개입 없는 경기의 카운터팩추얼 델타 = 0", () => {
    const orig = runFullMatch(kor, bra, "metlife", 55, []);
    const cf = counterfactual(orig);
    expect(cf.deltas).toHaveLength(0);
    expect(cf.baseline.events).toEqual(orig.events);
  });
});
describe("shootout", () => {
  it("같은 시드 재현성, winner는 me/opp 중 하나, 라운드 ≥ 10", () => {});
  it("PK 90 팀 vs PK 55 팀 100회 시뮬 시 강팀 승수 > 60", () => {});
});
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: Commit** — `feat: penalty shootout and counterfactual replay with invariant tests`

---

### Task 10: 밸런싱 몬테카를로 검증 (납득감 방어선)

**Files:**
- Test: `lib/engine/balance.test.ts` (테스트 전용 태스크 — 실패 시 Task 5~8의 계수를 조정해 통과시키는 것까지가 이 태스크)

- [ ] **Step 1: 테스트 작성**

```ts
describe("balance sanity (Monte Carlo)", () => {
  // 전 매치업 16×15, 각 20회 runFullMatch (autoPlace 기본 전술, metlife, 시드 i)
  it("ELO 150+ 우위 매치업의 평균 승률(승부차기 제외 승/전체)이 55%~90%", () => {});
  it("전체 경기 평균 총득점이 1.8~3.6골", () => {});
  it("한 경기 5골차 이상 빈도 < 4%", () => {});
  it("무승부 비율 15%~35%", () => {});
}, 120_000); // 타임아웃 여유
```

- [ ] **Step 2: 실행** — 실패하면 λ 상수(1.35), 탄력지수(1.6), 이벤트 확률 계수를 조정 (엔진 코드의 명명된 상수 `ENGINE_CONSTANTS` 객체로 추출해 조정 지점 명확화)
- [ ] **Step 3: 통과 확인 후 Commit** — `test: monte-carlo balance verification across all matchups`

---

### Task 11: Zustand 스토어 + sessionStorage persist

**Files:**
- Create: `lib/store.ts`
- Test: `lib/store.test.ts`

**Interfaces:**
- Consumes: 엔진 전체
- Produces (UI 태스크 전체가 사용):

```ts
interface AppState {
  setup: { myTeamId?: string; oppTeamId?: string; venueId?: string; seed: number };
  me?: SideSetup; opp?: SideSetup;
  match?: MatchState; shootout?: ShootoutResult;
  onboardingDone: boolean;
  // actions
  startQuick(): void;                                    // kor vs bra, metlife, autoPlace 양팀
  selectMatchup(my: string, opp: string, venue: string): void;  // autoPlace로 초기화, seed = Date.now()%1e9
  movePlayer(slotId: string, playerId: string): void;    // 스왑 처리 포함
  setInstructions(i: Partial<TeamInstructions>): void;   // 포메이션 변경 시 autoPlace 재배치
  setRole(slotId: string, role: RoleId): void;
  setSpecial(s: Partial<SpecialInstructions>): void;
  beginMatch(): void; tickMinute(): void; intervene(iv: Omit<Intervention,"minute">): void;
  reset(): void;
}
```

- persist: `zustand/middleware`의 `persist` + `createJSONStorage(() => sessionStorage)`, name `dugout-v1`. SSR 안전(스토리지 접근은 클라이언트에서만)
- 파생 셀렉터: `useWinProb()` — me/opp/venue에서 `winProbability` 메모이즈 계산

- [ ] **Step 1: 실패 테스트 작성** (vitest 환경에서 sessionStorage 모킹)

```ts
describe("store", () => {
  it("startQuick 후 me/opp 라인업 11개 채워짐", () => {});
  it("movePlayer로 배치된 슬롯 선수 교환", () => {});
  it("setInstructions(formation 변경) 시 라인업 재배치", () => {});
  it("persist: 스토어 조작 후 sessionStorage 'dugout-v1'에 상태 존재", () => {});
});
```

- [ ] **Step 2~4: 실패 확인 → 구현 → 통과**
- [ ] **Step 5: Commit** — `feat: zustand store with sessionStorage persistence`

---

### Task 12: 디자인 토큰 + 공용 컴포넌트 + 홈 화면

**Files:**
- Create: `app/layout.tsx`(수정), `app/page.tsx`, `app/globals.css`(수정), `components/ui/FlagBadge.tsx`, `components/ui/PlayerAvatar.tsx`, `components/ui/Disclaimer.tsx`, `components/home/TeamGrid.tsx`, `components/home/VenuePicker.tsx`, `components/home/QuickStart.tsx`

**구현 지침:**
- **구현 시작 전 `frontend-design` 스킬과 `ui-ux-pro-max` 스킬을 로드해 디자인 방향(다크 피치 그린 + 방송 그래픽, 큰 타이포) 확정 후 진행**
- 디자인 토큰(globals.css CSS 변수): `--pitch`(짙은 그린), `--surface`, `--accent`(형광 라임), `--danger`, `--ink`. 폰트는 시스템 스택 + next/font 로컬 가능 범위
- `FlagBadge`: 국가 코드 → 자체 SVG 3색 조합 배지 (실제 국기 모사 아님 — team.color1/2 + 코드 텍스트)
- `PlayerAvatar`: 이니셜 + 등번호 원형, `C`/`FK`/`CK` 미니 배지 prop
- 홈: 히어로("당신이 감독이라면") + **퀵스타트 버튼(최상단, "🇰🇷 한국 vs 브라질 바로 지휘하기")** → `startQuick()` 후 `/tactics` 라우팅. 팀 그리드(내 팀→상대 순차 선택, 선택 상태 표시, ELO·폼·상대전적 요약), 경기장 카드(고도🏔/폭염🥵/돔🏟 아이콘), 하단 Disclaimer
- 시맨틱: `<main>`, `<section aria-label>`, 버튼은 전부 `<button>`

- [ ] **Step 1: 디자인 스킬 로드 후 토큰·공용 컴포넌트 구현**
- [ ] **Step 2: 홈 화면 구현** (퀵스타트 → 작전실 라우팅까지)
- [ ] **Step 3: 검증** — dev 서버에서 퀵스타트 클릭 시 /tactics 이동(빈 페이지 허용), 팀 2개+경기장 선택 시 "작전실 입장" 활성화, 콘솔 에러 0, 375px에서 레이아웃 정상 (Playwright MCP 브라우저로 확인)
- [ ] **Step 4: Commit** — `feat: design tokens, shared components, home screen with quickstart`

---

### Task 13: 작전실 — 피치 보드 + 드래그 배치 + 스쿼드

**Files:**
- Create: `app/tactics/page.tsx`, `components/tactics/PitchBoard.tsx`, `components/tactics/SquadList.tsx`, `components/tactics/ManMarkLine.tsx`

**구현 지침:**
- `PitchBoard`: SVG 피치(세로형, 라인·서클) 위에 `FORMATIONS[formation].slots` 좌표로 슬롯 렌더. dnd-kit `DndContext` — 스쿼드 리스트의 선수 → 슬롯 드롭, 슬롯 ↔ 슬롯 스왑. **터치 센서 + 탭-투-배치**(선수 탭 → 배치 가능 슬롯 하이라이트 → 슬롯 탭) 병행
- 포지션 부적합 경고: `positionFitness < 0.75`면 슬롯 링 색 danger + 툴팁
- `ManMarkLine`: manMark 설정 시 마커 슬롯 → 피치 상단(상대 방향) 타깃 표시로 향하는 점선 SVG + Framer Motion 펄스
- 아바타에 C/FK/CK 배지 표시 (special 상태 연동)
- `SquadList`: 선발 11 하이라이트, 벤치, 능력치 요약(포지션별 관련 스탯 2개만 — 정보 3계층 원칙)

- [ ] **Step 1: PitchBoard + 슬롯 렌더 + 드래그/탭 배치 구현**
- [ ] **Step 2: 검증** — 드래그로 스왑 동작, 탭-투-배치 동작, 새로고침 후 배치 보존(persist), 부적합 경고 표시. Playwright MCP로 확인 + 콘솔 에러 0
- [ ] **Step 3: Commit** — `feat: tactics pitch board with drag/tap placement`

---

### Task 14: 작전실 — 전술 패널(3계층) + 실시간 승률 + 추천 + 온보딩

**Files:**
- Create: `components/tactics/InstructionsPanel.tsx`, `components/tactics/RolePicker.tsx`, `components/tactics/SpecialPanel.tsx`, `components/tactics/WinGauge.tsx`, `components/tactics/FactorCards.tsx`, `components/tactics/RecommendPanel.tsx`, `components/tactics/Coachmarks.tsx`
- Modify: `app/tactics/page.tsx`

**구현 지침 (정보 3계층 원칙 §4.6 준수):**
- 우측(모바일: "분석" 탭) 1층: `WinGauge` — 승률 대형 숫자 + 반원 게이지, 변경 시 카운트업 애니메이션(Framer Motion), 직전 대비 델타(+2.4%p 초록↑/빨강↓). 라인별 전력 3쌍 막대 대결
- 2층: `FactorCards` — `winProbability().rules`를 아이콘+한 문장+델타 카드로. **마지막 조작으로 추가/변경된 규칙 카드에 하이라이트 펄스** (이전 rules 배열과 diff)
- 3층: "상세 보기" 아코디언 — λ값, 라인 수치 표, 산식 한 줄 설명
- 전술 패널 탭 3개: 팀 지시(포메이션 선택 + 슬라이더 4종 + 빌드업/방향/폭/수비방식/트랩 토글) / 선수 역할(슬롯 선택 → RolePicker) / 특수 지시(주장·FK·CK 셀렉트, 맨마킹: 우리 선수+상대 선수 선택, 코너 장신 전진 토글)
- `RecommendPanel`: "추천 전술 보기" 버튼 → `recommend()` 온디맨드 실행(로딩 스피너) → 추천 승률·현재 대비 델타·topFactors 3개 → "적용" 버튼으로 일괄 반영
- `Coachmarks`: 첫 진입 시 3단계(① 선수를 끌어 배치 ② 승률 변동 확인 ③ 경기 시작) — localStorage `dugout-onboarding` 1회, 건너뛰기 버튼
- 하단 고정 "경기 시작" CTA (11명 미배치 시 비활성 + 사유 문구)

- [ ] **Step 1: WinGauge + FactorCards 구현** (조작→즉시 갱신 확인)
- [ ] **Step 2: 3계층 전술 패널 + RecommendPanel + Coachmarks 구현**
- [ ] **Step 3: 검증** — 슬라이더 조작 시 승률·카드 즉시 반영, 추천 적용 시 승률 상승, 온보딩 1회만 표시, 콘솔 에러 0, 375px 탭 레이아웃
- [ ] **Step 4: Commit** — `feat: three-tier tactics panel, live win gauge, recommendation`

---

### Task 15: 경기 화면 — 재생 루프 + 개입

**Files:**
- Create: `app/match/page.tsx`, `components/match/Scoreboard.tsx`, `components/match/LivePitch.tsx`, `components/match/CommentaryFeed.tsx`, `components/match/ProbTimeline.tsx`, `components/match/InterventionSheet.tsx`, `components/match/CrisisBanner.tsx`

**구현 지침:**
- 재생 루프: `useEffect` + `setInterval(tickMinute, 600/speed)` (speed 1/2/4 토글). `match.finished`면 정지 → 무승부 시 승부차기 제안 모달("무승부입니다. 승부차기로 결판내시겠습니까?") → 수락 시 `/shootout`, 거절·승부 결정 시 `/result`
- `LivePitch`: 가로형 미니 피치 SVG. chance/shot/goal 이벤트 발생 분에 해당 진영에서 점(선수)·공이 움직이는 1.5초 Framer Motion 시퀀스 + 골이면 플래시. 이벤트 없으면 중원 점유 애니메이션 루프
- `CommentaryFeed`: 최신 위, 이벤트 타입별 아이콘, 골은 강조 스타일. `aria-live="polite"`
- `ProbTimeline`: 자체 SVG 라인차트 — x=분, y=승률, 골⚽·개입🧠 마커. 단순 라인 1개(§4.6)
- 일시정지 → `InterventionSheet`(작전실 축약판: 교체 out/in 선택, 슬라이더·포메이션, 역할, 맨마킹) → "지시 전달" 시 `intervene()` 호출, tactic_change/sub 이벤트가 중계에 찍힘
- `CrisisBanner`: crisis 이벤트 발생 시 자동 일시정지 없이 상단 배너 "🚨 감독님, 지시가 필요합니다" + [작전 변경] 버튼(=일시정지+시트 오픈), 10초 후 자동 소멸

- [ ] **Step 1: 재생 루프 + Scoreboard + CommentaryFeed + ProbTimeline 구현**
- [ ] **Step 2: LivePitch 애니메이션 + InterventionSheet + CrisisBanner 구현**
- [ ] **Step 3: 검증** — 풀경기 완주(4배속), 일시정지→교체→재개 동작, 승률 그래프에 개입 마커, 무승부 시 승부차기 모달, 새로고침 후 이어보기 가능(persist), 콘솔 에러 0
- [ ] **Step 4: Commit** — `feat: match playback with live pitch, commentary, interventions`

---

### Task 16: 승부차기 화면 + 복기 화면 (카운터팩추얼 UI + 공유)

**Files:**
- Create: `app/shootout/page.tsx`, `components/shootout/KickerOrder.tsx`, `components/shootout/ShootoutStage.tsx`, `app/result/page.tsx`, `components/result/CfCompare.tsx`, `components/result/FinalTimeline.tsx`, `components/result/ShareCard.tsx`

**구현 지침:**
- 승부차기: `KickerOrder` — 필드 11명 중 5명을 드래그(또는 탭)로 순서 지정, PK·멘탈 노출. `ShootoutStage` — "차기" 버튼 1회씩 진행, 골/실축 연출, 결과 확정 후 `/result`
- 복기: 헤드라인 = 결론 한 문장 ("당신의 63' 교체가 승률을 +14%p 바꿨습니다" — cf.deltas 최대값 기준. 개입 없으면 "무개입 완주 — 데이터를 믿으셨군요"). `FinalTimeline` = ProbTimeline 재사용 + 개입 마커 라벨. `CfCompare` = 실제 스코어 vs 평행세계(baseline) 스코어 카드 나란히 + 델타 목록. 상세 스탯 아코디언(3계층)
- `ShareCard`: 매치 결과 카드 DOM을 `<canvas>` 직접 드로잉(외부 라이브러리 금지 — 팀명·스코어·승률델타·서비스명)으로 PNG 저장 + URL 복사 버튼. "다시 도전"(같은 매치업 seed+1) / "새 매치업"(reset→홈)
- [ ] **Step 1: 승부차기 화면 구현 → 검증** (무승부 경기 만들어 진입 확인 — 시드 탐색 스크립트로 무승부 시드 하나 README 메모)
- [ ] **Step 2: 복기 화면 구현 → 검증** — 개입 있는 경기와 없는 경기 각각 문구 확인, PNG 저장 동작
- [ ] **Step 3: Commit** — `feat: shootout and result screens with counterfactual compare`

---

### Task 17: 반응형·접근성·메타 마감

**Files:**
- Modify: 전 화면 컴포넌트, `app/layout.tsx`

**체크리스트 (각 항목 Playwright MCP 브라우저로 375px/1280px 실측):**
- [ ] 작전실 모바일: 스쿼드/피치/분석 3탭 전환 레이아웃, 터치 배치 동작
- [ ] 경기·복기·홈 모바일 세로 스택 정상, 가로 스크롤 없음
- [ ] 전 화면 heading 구조(h1 1개), 모든 인터랙티브 요소 aria-label/키보드 포커스 링
- [ ] `app/layout.tsx` 메타: title "더그아웃 — 당신이 감독이라면", description, 정적 OG 이미지(`public/og.png` — 서비스 대표 카드 1장 제작), lang="ko"
- [ ] 전 화면 콘솔 에러·경고 0 확인
- [ ] Commit — `polish: responsive tabs, a11y, static OG metadata`

---

### Task 18: Playwright 스모크 E2E

**Files:**
- Create: `e2e/smoke.spec.ts`, `playwright.config.ts`

- [ ] **Step 1: 설정** — `playwright.config.ts`: baseURL localhost:3000, webServer `npm run dev`, 프로젝트 chromium 1개
- [ ] **Step 2: 스모크 시나리오 작성**

```ts
test("퀵스타트 → 배치 확인 → 경기 완주 → 복기 도달", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /바로 지휘하기/ }).click();
  await expect(page).toHaveURL(/tactics/);
  await expect(page.getByText(/%/)).toBeVisible();          // 승률 게이지
  await page.getByRole("button", { name: /경기 시작/ }).click();
  await page.getByRole("button", { name: /4x|4배속/ }).click();
  await expect(page.getByText(/경기 종료|승부차기/)).toBeVisible({ timeout: 60_000 });
  // 승부차기 분기 처리 후 /result 도달 확인
  await expect(page.getByText(/당신의|무개입/)).toBeVisible({ timeout: 30_000 });
});
```

- [ ] **Step 3: 통과 확인** — `npx playwright test` PASS
- [ ] **Step 4: Commit** — `test: e2e smoke covering full user journey`

---

### Task 19: README + 배포 + 최종 점검

**Files:**
- Create: `README.md`
- Modify: 필요 시 잔여 버그 수정

- [ ] **Step 1: README 작성** (AI 채점 대비 — 스펙 §2 그대로):
  - 서비스 소개 + 스크린샷, **기획 의도 → 구현 매핑표**(스펙 §2 표를 실제 파일 경로와 연결), 통계 엔진 산식 설명(λ 공식, 보정 규칙 목록, 카운터팩추얼 원리), 실행 방법(`npm install && npm run dev`), 기술 스택, 테스트 방법, 가상 데이터 고지
- [ ] **Step 2: 품질 게이트 일괄 실행** — `npx vitest run` 전체 PASS, `npx playwright test` PASS, `npm run build` 성공
- [ ] **Step 3: 배포** — `vercel:deploy` 스킬로 프리뷰 배포 → 배포 URL 전 화면 실기기·모바일 확인 → 이상 없으면 production 배포
- [ ] **Step 4: `delivery-checklist` 스킬 실행** (시크릿·디버그 잔여물·반응형·에러 처리 최종 점검)
- [ ] **Step 5: Commit + GitHub 리포 생성·푸시** (제출용 public 리포)

---

## 이후 별도 트랙 (코드 외 제출물 — 본 플랜 완료 후)

- 기획서 PDF (~7/27 10:00): 스펙 §4·§5를 기반으로 `pdf`/`docx` 스킬로 제작
- 시연 영상 (~8/3 10:00): 스펙 §8 스토리보드대로 촬영, 유튜브 업로드
- **참가 신청은 7/27 10:00 마감 — 코드와 무관하게 즉시 완료할 것**

## Self-Review 결과

- 스펙 커버리지: §4.1~4.6(Task 12~17), §5 엔진 전체(Task 2~10), §6(Task 1·11·17·18), §2 AI 채점 대비(Task 17·19) — 누락 없음
- 플레이스홀더: UI 태스크는 코드 대신 구현 지침+검증 기준으로 명세(디자인 스킬 로드가 선행되는 구조상 의도적) — 엔진·테스트는 전부 실코드/실수치
- 타입 일관성: `SideSetup`/`MatchState`/`Intervention` 시그니처가 Task 5~16에서 동일하게 참조됨을 확인

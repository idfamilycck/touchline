import { createRngFrom, type Rng } from "./random";
import { computeLambdas } from "./winprob";
import { ENGINE_CONSTANTS } from "./constants";
import { playerContribution, type LineStrengths } from "./strength";
import { poissonPmf } from "./poisson";
import { playersOf } from "@/lib/data/players";
import { FORMATIONS } from "@/lib/data/formations";
import { DEFAULT_ROLE } from "@/lib/data/roles";
import { venueById } from "@/lib/data/venues";
import type {
  Formation,
  FormationSlot,
  Player,
  Position,
  RoleId,
  SideSetup,
  TeamInstructions,
  Venue,
} from "@/lib/types";

export type MatchEventType =
  | "kickoff"
  | "chance"
  | "shot"
  | "goal"
  | "save"
  | "corner"
  | "card"
  | "crisis"
  | "sub"
  | "tactic_change"
  | "halftime"
  | "fulltime";

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  side: "me" | "opp";
  playerId?: string;
  textKo: string;
}

export interface Intervention {
  minute: number;
  side: "me";
  subs?: Array<{ out: string; in: string }>;
  instructions?: TeamInstructions;
  roles?: Record<string, RoleId>;
  special?: SideSetup["special"];
}

// MatchState: 브리프 명세의 14개 필드(minute…probTimeline)는 그대로 유지한다.
// 아래 4개(lambdaMe/lambdaOpp/lines/injuryTime)는 이 엔진 구현에 필요한 내부 캐시
// 확장 필드다. simulateMinute는 모듈 전역 캐시나 클로저를 쓸 수 없는 순수 함수여야
// 하므로(카운터팩추얼 재생 시 임의의 상태에서 재현 가능해야 함), "5분마다 & 개입
// 직후에만 λ/lineStrengths 재계산"이라는 캐시 정책을 지키려면 그 결과를 state 자체에
// 들고 다니는 수밖에 없다. UI/카운터팩추얼 소비자는 이 필드들을 무시해도 동작한다.
export interface MatchState {
  minute: number;
  scoreMe: number;
  scoreOpp: number;
  stamina: Record<string, number>; // playerId -> 0~1, 양팀 전원
  rngState: number;
  events: MatchEvent[];
  interventions: Intervention[];
  me: SideSetup;
  opp: SideSetup;
  venueId: string;
  seed: number;
  subsUsedMe: number;
  finished: boolean;
  probTimeline: Array<{ minute: number; win: number }>;
  // --- 내부 캐시 확장 필드 (브리프 명세 외) ---
  lambdaMe: number;
  lambdaOpp: number;
  lines: { me: LineStrengths; opp: LineStrengths };
  injuryTime: number; // 0 = 아직 미계산, 계산 후 1~5
  // --- Task 9 확장 필드 (브리프 명세 외, 추가적 변경) ---
  // me/opp는 개입(교체·전술 변경) 적용 후의 "현재" 라인업/전술이라 카운터팩추얼
  // (lib/engine/counterfactual.ts)이 "개입이 없었다면?"을 재현하려는 baseline
  // 시뮬레이션의 입력으로 쓸 수 없다. 특히 교체는 비가역적이라 me/opp만 보고는
  // initMatch 시점의 원본 라인업을 복원할 수 없으므로, initMatch가 채운 뒤
  // simulateMinute/applyIntervention 어느 쪽도 갱신하지 않는 불변 스냅샷을
  // 별도 필드로 들고 다닌다. UI 등 다른 소비자는 이 필드를 무시해도 동작한다.
  initialMe: SideSetup;
  initialOpp: SideSetup;
}

const MAX_SUBS = 5;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function average(nums: number[]): number {
  if (nums.length === 0) return 1;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function tempoFactor(tempo: TeamInstructions["tempo"]): number {
  if (tempo === 3) return 1.15;
  if (tempo === 1) return 0.9;
  return 1.0;
}

function computeStaminaFlags(
  instructions: TeamInstructions,
  venue: Venue
): { altitude: boolean; heat: boolean; highTempo: boolean; highPress: boolean } {
  return {
    altitude: venue.altitude > 1500,
    heat: venue.avgTempC >= 30 && !venue.dome,
    highTempo: instructions.tempo === 3,
    highPress: instructions.pressing === 3,
  };
}

// ---- λ 재계산 (5분마다 / 개입 직후) ----------------------------------------
// 스태미나 반영 방식: 브리프가 허용하는 두 방식(팀 평균 스태미나^0.5 승수 vs
// playerContribution에 staminaPct 전달) 중 전자를 택했다 — computeLambdas는
// SideSetup만 받아 lineStrengths를 항상 staminaPct=1로 계산하므로, 매 5분마다
// 라인업별 개별 스태미나를 주입하려면 lineStrengths를 이 파일에서 다시 구현해야
// 한다. 대신 computeLambdas가 반환한 "만체력 기준" λ에 온피치 11명 평균 스태미나의
// 제곱근을 곱해 팀 전체의 체력 저하를 근사한다. 일관되게 이 방식만 사용한다.
function recomputeLambdas(state: MatchState): {
  lambdaMe: number;
  lambdaOpp: number;
  lines: { me: LineStrengths; opp: LineStrengths };
} {
  const base = computeLambdas(state.me, state.opp, state.venueId);
  const meStaminaAvg = average(Object.values(state.me.lineup).map((id) => state.stamina[id] ?? 1));
  const oppStaminaAvg = average(Object.values(state.opp.lineup).map((id) => state.stamina[id] ?? 1));
  return {
    lambdaMe: base.lambdaMe * Math.sqrt(Math.max(0, meStaminaAvg)),
    lambdaOpp: base.lambdaOpp * Math.sqrt(Math.max(0, oppStaminaAvg)),
    lines: base.lines,
  };
}

// ---- 스태미나 분당 감소 -----------------------------------------------------
function decayOnPitch(
  stamina: Record<string, number>,
  setup: SideSetup,
  flags: ReturnType<typeof computeStaminaFlags>
): void {
  const marker = setup.special?.manMark?.markerId;
  for (const playerId of Object.values(setup.lineup)) {
    let rate = 1 / 110;
    if (flags.altitude) rate *= 1.3;
    if (flags.heat) rate *= 1.25;
    if (flags.highTempo) rate *= 1.15;
    if (flags.highPress) rate *= 1.15;
    if (marker && marker === playerId) rate *= 1.2;
    const current = stamina[playerId] ?? 1;
    stamina[playerId] = Math.max(0, current - rate);
  }
}

// ---- 선수 선택 --------------------------------------------------------------
function onPitchPlayers(
  setup: SideSetup,
  formation: Formation,
  squad: Player[]
): Array<{ slot: FormationSlot; player: Player }> {
  const out: Array<{ slot: FormationSlot; player: Player }> = [];
  for (const slot of formation.slots) {
    const player = squad.find((p) => p.id === setup.lineup[slot.id]);
    if (player) out.push({ slot, player });
  }
  return out;
}

// 슈터/찬스메이커 선택: att라인(WG/ST) 70% 확률, mid라인(DM/CM/AM) 30% 확률로
// 풀을 정하고, 그 풀 안에서 rng로 균등 선택한다.
function selectShooter(
  rng: Rng,
  setup: SideSetup,
  formation: Formation,
  squad: Player[]
): Player | undefined {
  const onPitch = onPitchPlayers(setup, formation, squad);
  const attPool = onPitch.filter((x) => x.slot.position === "WG" || x.slot.position === "ST");
  const midPool = onPitch.filter(
    (x) => x.slot.position === "DM" || x.slot.position === "CM" || x.slot.position === "AM"
  );
  const useAtt = rng.next() < 0.7;
  let pool = useAtt ? attPool : midPool;
  if (pool.length === 0) pool = useAtt ? midPool : attPool;
  if (pool.length === 0) pool = onPitch;
  if (pool.length === 0) return undefined;
  const idx = Math.min(pool.length - 1, Math.floor(rng.next() * pool.length));
  return pool[idx].player;
}

function selectRandomOnPitch(
  rng: Rng,
  setup: SideSetup,
  formation: Formation,
  squad: Player[]
): Player | undefined {
  const onPitch = onPitchPlayers(setup, formation, squad);
  if (onPitch.length === 0) return undefined;
  const idx = Math.min(onPitch.length - 1, Math.floor(rng.next() * onPitch.length));
  return onPitch[idx].player;
}

function slotFor(
  setup: SideSetup,
  formation: Formation,
  playerId: string
): { position: Position; role: RoleId } | undefined {
  for (const slot of formation.slots) {
    if (setup.lineup[slot.id] === playerId) {
      return { position: slot.position, role: setup.roles[slot.id] ?? DEFAULT_ROLE[slot.position] };
    }
  }
  return undefined;
}

// ---- 중계 문구 템플릿 (타입별 3가지 변형, rng로 선택) -----------------------
function pickVariant(rng: Rng, variants: string[]): string {
  const idx = Math.min(variants.length - 1, Math.floor(rng.next() * variants.length));
  return variants[idx];
}

const TEXT_TEMPLATES: Record<"chance" | "shot" | "goal" | "save" | "corner" | "card", (name: string) => string[]> = {
  chance: (name) => [
    `${name}, 공간을 파고들며 찬스를 만듭니다!`,
    `${name}에게 좋은 기회가 열립니다!`,
    `${name}, 위협적인 장면을 만들어냅니다.`,
  ],
  shot: (name) => [
    `${name}, 강력한 슈팅을 시도합니다!`,
    `${name}이(가) 골문을 향해 슈팅을 날립니다!`,
    `${name}, 과감하게 슈팅을 시도합니다!`,
  ],
  goal: (name) => [
    `⚽ ${name}, 골망을 흔듭니다!!`,
    `⚽ ${name}의 환상적인 골!`,
    `⚽ ${name}, 결국 골을 만들어냅니다!`,
  ],
  save: (name) => [
    `${name}의 슈팅, 골키퍼 선방에 막힙니다.`,
    `아쉽다! ${name}의 슈팅이 골키퍼 손에 걸립니다.`,
    `${name}의 시도, 훌륭한 선방에 무산됩니다.`,
  ],
  corner: (name) => [
    `${name}의 슈팅, 코너킥으로 연결됩니다.`,
    `${name}의 시도가 코너로 흘러갑니다.`,
    `코너킥! ${name}의 슈팅이 수비에 걸립니다.`,
  ],
  card: (name) => [
    `🟨 ${name}, 경고를 받습니다.`,
    `🟨 심판이 ${name}에게 카드를 꺼냅니다.`,
    `🟨 거친 파울로 ${name}, 옐로카드!`,
  ],
};

function eventText(type: keyof typeof TEXT_TEMPLATES, rng: Rng, name: string): string {
  return pickVariant(rng, TEXT_TEMPLATES[type](name));
}

function crisisText(rng: Rng, conceded: boolean): string {
  const variants = conceded
    ? [
        "🚨 위기! 실점 직후 흔들리는 수비진입니다.",
        "🚨 위기! 실점으로 분위기가 넘어갑니다.",
        "🚨 위기! 골을 내주며 위태로운 상황입니다.",
      ]
    : [
        "🚨 위기! 상대의 연속된 공세에 수비가 흔들립니다.",
        "🚨 위기! 상대에게 계속 기회를 내주고 있습니다.",
        "🚨 위기! 위험한 장면이 반복되고 있습니다.",
      ];
  return pickVariant(rng, variants);
}

// sub/tactic_change 이벤트는 applyIntervention에서 생성되는데, applyIntervention은
// RNG를 소비할 수 없다(카운터팩추얼 불변식). 따라서 이 두 타입은 rng 없이 항상
// 0번째 변형을 사용한다.
function subText(outName: string, inName: string): string {
  return `🔄 선수 교체: ${outName} → ${inName} 투입`;
}
function tacticChangeText(): string {
  return "📋 전술이 변경되었습니다.";
}

// ---- 위기 감지 ---------------------------------------------------------------
function countRecentOppChances(events: MatchEvent[], additions: MatchEvent[], newMinute: number): number {
  const windowStart = newMinute - 9;
  let count = 0;
  for (const e of events) {
    if (e.type === "chance" && e.side === "opp" && e.minute >= windowStart) count++;
  }
  for (const e of additions) {
    if (e.type === "chance" && e.side === "opp" && e.minute >= windowStart) count++;
  }
  return count;
}

function hasRecentCrisis(events: MatchEvent[], newMinute: number): boolean {
  const windowStart = newMinute - 9;
  return events.some((e) => e.type === "crisis" && e.minute >= windowStart);
}

// ---- 잔여시간 기준 승리확률 ---------------------------------------------------
// outcomeProbs(poisson.ts)는 "현재 스코어가 0:0"인 경우만 계산하므로, 경기 중간의
// 스코어를 반영하려면 poissonPmf를 재사용해 스코어 오프셋을 더한 이중 루프를
// 직접 돌려야 한다. k=0..10이면 tail 누락 확률은 무시 가능한 수준(λ<=4)이다.
function safePoissonPmf(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return poissonPmf(lambda, k);
}

export function winProbGivenScore(
  scoreMe: number,
  scoreOpp: number,
  remLambdaMe: number,
  remLambdaOpp: number
): number {
  const pMe: number[] = [];
  const pOpp: number[] = [];
  for (let k = 0; k <= 10; k++) {
    pMe.push(safePoissonPmf(remLambdaMe, k));
    pOpp.push(safePoissonPmf(remLambdaOpp, k));
  }
  let win = 0;
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      if (scoreMe + i > scoreOpp + j) win += pMe[i] * pOpp[j];
    }
  }
  return win;
}

// =============================================================================
export function initMatch(me: SideSetup, opp: SideSetup, venueId: string, seed: number): MatchState {
  const stamina: Record<string, number> = {};
  for (const p of playersOf(me.teamId)) stamina[p.id] = 1;
  for (const p of playersOf(opp.teamId)) stamina[p.id] = 1;

  const base = computeLambdas(me, opp, venueId);
  const win = winProbGivenScore(0, 0, base.lambdaMe, base.lambdaOpp);

  return {
    minute: 0,
    scoreMe: 0,
    scoreOpp: 0,
    stamina,
    rngState: seed,
    events: [{ minute: 0, type: "kickoff", side: "me", textKo: "🏟 경기가 시작되었습니다!" }],
    interventions: [],
    me,
    opp,
    venueId,
    seed,
    subsUsedMe: 0,
    finished: false,
    probTimeline: [{ minute: 0, win }],
    lambdaMe: base.lambdaMe,
    lambdaOpp: base.lambdaOpp,
    lines: base.lines,
    injuryTime: 0,
    initialMe: me,
    initialOpp: opp,
  };
}

// 순수 함수: state를 변형하지 않고 새 MatchState를 반환한다. RNG는 state.rngState로부터
// 복원해 이 함수 안에서만 소비하고, 소비된 결과 상태를 반환값의 rngState에 저장한다.
export function simulateMinute(state: MatchState): MatchState {
  if (state.finished) return state;

  const venue = venueById(state.venueId);
  if (!venue) throw new Error(`unknown venue: ${state.venueId}`);

  const rng = createRngFrom(state.rngState);
  const newMinute = state.minute + 1;
  const additions: MatchEvent[] = [];

  let scoreMe = state.scoreMe;
  let scoreOpp = state.scoreOpp;

  // λ/lineStrengths 재계산: 5분마다 또는 이번 상태가 만들어지기 직전(현재 minute)에
  // 개입이 적용됐을 때만. interventions 배열은 이미 MatchState 계약에 있는 필드이므로
  // 별도 플래그 없이 "state.minute와 같은 minute의 개입이 있었는가"로 판정한다.
  const justIntervened = state.interventions.some((iv) => iv.minute === state.minute);
  let lambdaMe = state.lambdaMe;
  let lambdaOpp = state.lambdaOpp;
  let lines = state.lines;
  if (justIntervened || newMinute % 5 === 0) {
    const rec = recomputeLambdas(state);
    lambdaMe = rec.lambdaMe;
    lambdaOpp = rec.lambdaOpp;
    lines = rec.lines;
  }

  const staminaFlagsMe = computeStaminaFlags(state.me.instructions, venue);
  const staminaFlagsOpp = computeStaminaFlags(state.opp.instructions, venue);

  function processChance(side: "me" | "opp"): void {
    const setup = side === "me" ? state.me : state.opp;
    const lambda = side === "me" ? lambdaMe : lambdaOpp;
    const p = clamp(
      (lambda / 90) * tempoFactor(setup.instructions.tempo) * ENGINE_CONSTANTS.CHANCE_RATE_SCALE,
      0,
      1
    );
    if (rng.next() >= p) return;

    const formation = FORMATIONS[setup.instructions.formation];
    const squad = playersOf(setup.teamId);
    const player = selectShooter(rng, setup, formation, squad);
    if (!player) return;

    additions.push({
      minute: newMinute,
      type: "chance",
      side,
      playerId: player.id,
      textKo: eventText("chance", rng, player.name),
    });

    if (rng.next() < ENGINE_CONSTANTS.SHOT_CONVERSION_PROB) {
      additions.push({
        minute: newMinute,
        type: "shot",
        side,
        playerId: player.id,
        textKo: eventText("shot", rng, player.name),
      });

      const slot = slotFor(setup, formation, player.id);
      const contribution = slot
        ? playerContribution(player, slot.position, slot.role, state.stamina[player.id] ?? 1)
        : 0;
      // 라인평균 기준선은 슈터의 실제 소속 라인(mid 풀에서 뽑힌 슈터라도)과 무관하게
      // 항상 ATT 라인 평균을 사용한다 — mid 풀 슈터는 구조적으로 더 낮은 골 확률을
      // 갖게 되는 의도적인 설계 선택이다. 밸런스 튜닝(Task 10)에서 재검토 대상.
      const attAvg = side === "me" ? lines.me.att : lines.opp.att;
      const goalProb = clamp(
        ENGINE_CONSTANTS.GOAL_PROB_BASE + (contribution - attAvg) / ENGINE_CONSTANTS.GOAL_PROB_DIVISOR,
        ENGINE_CONSTANTS.GOAL_PROB_MIN,
        ENGINE_CONSTANTS.GOAL_PROB_MAX
      );

      if (rng.next() < goalProb) {
        if (side === "me") scoreMe++;
        else scoreOpp++;
        additions.push({
          minute: newMinute,
          type: "goal",
          side,
          playerId: player.id,
          textKo: eventText("goal", rng, player.name),
        });
      } else if (rng.next() < 0.7) {
        additions.push({
          minute: newMinute,
          type: "save",
          side,
          playerId: player.id,
          textKo: eventText("save", rng, player.name),
        });
      } else {
        additions.push({
          minute: newMinute,
          type: "corner",
          side,
          playerId: player.id,
          textKo: eventText("corner", rng, player.name),
        });
      }
    }
  }

  processChance("me");
  processChance("opp");

  function processCard(side: "me" | "opp"): void {
    const setup = side === "me" ? state.me : state.opp;
    const p = 0.008 * (setup.instructions.pressing / 2);
    if (rng.next() >= p) return;
    const formation = FORMATIONS[setup.instructions.formation];
    const squad = playersOf(setup.teamId);
    const player = selectRandomOnPitch(rng, setup, formation, squad);
    if (!player) return;
    additions.push({
      minute: newMinute,
      type: "card",
      side,
      playerId: player.id,
      textKo: eventText("card", rng, player.name),
    });
  }

  processCard("me");
  processCard("opp");

  // 위기 감지 (me 시점): 실점 직후 또는 최근 10분 상대 chance>=3. 10분 창 안에 이미
  // crisis가 있으면 스팸 방지를 위해 재발동하지 않는다.
  const concededThisMinute = additions.some((e) => e.type === "goal" && e.side === "opp");
  const oppChanceCount = countRecentOppChances(state.events, additions, newMinute);
  if (!hasRecentCrisis(state.events, newMinute) && (concededThisMinute || oppChanceCount >= 3)) {
    additions.push({
      minute: newMinute,
      type: "crisis",
      side: "me",
      textKo: crisisText(rng, concededThisMinute),
    });
  }

  // 스태미나 감소: 온피치 선수만, 벤치는 감소하지 않는다.
  const stamina: Record<string, number> = { ...state.stamina };
  decayOnPitch(stamina, state.me, staminaFlagsMe);
  decayOnPitch(stamina, state.opp, staminaFlagsOpp);

  if (newMinute === 45) {
    additions.push({ minute: 45, type: "halftime", side: "me", textKo: "⏱ 전반전이 종료되었습니다." });
  }

  let injuryTime = state.injuryTime;
  if (newMinute === 90 && injuryTime === 0) {
    injuryTime = 1 + Math.floor(rng.next() * 5);
  }

  let finished = false;
  if (injuryTime > 0 && newMinute === 90 + injuryTime) {
    additions.push({ minute: newMinute, type: "fulltime", side: "me", textKo: "🏁 경기 종료!" });
    finished = true;
  }

  const remainingFraction = Math.max(0, (90 - newMinute) / 90);
  const win = winProbGivenScore(scoreMe, scoreOpp, lambdaMe * remainingFraction, lambdaOpp * remainingFraction);

  return {
    ...state,
    minute: newMinute,
    scoreMe,
    scoreOpp,
    stamina,
    rngState: rng.state(),
    events: [...state.events, ...additions],
    finished,
    probTimeline: [...state.probTimeline, { minute: newMinute, win }],
    lambdaMe,
    lambdaOpp,
    lines,
    injuryTime,
  };
}

// applyIntervention: RNG를 소비하지 않는다 (카운터팩추얼 재생 불변식의 근거).
// 라인업/역할/지시/스페셜을 교체하고, sub/tactic_change 이벤트를 minute=state.minute로
// 남기고, interventions 이력에 추가해 다음 simulateMinute 호출이 λ를 즉시 재계산하도록
// 한다.
export function applyIntervention(state: MatchState, iv: Intervention): MatchState {
  const me: SideSetup = {
    ...state.me,
    lineup: { ...state.me.lineup },
    roles: { ...state.me.roles },
  };
  let subsUsedMe = state.subsUsedMe;
  const additions: MatchEvent[] = [];
  const squad = playersOf(me.teamId);
  const nameOf = (id: string) => squad.find((p) => p.id === id)?.name ?? id;

  if (iv.subs) {
    for (const { out, in: inId } of iv.subs) {
      if (subsUsedMe >= MAX_SUBS) continue; // 5명 초과 교체는 무시
      const slotId = Object.keys(me.lineup).find((k) => me.lineup[k] === out);
      if (!slotId) continue; // out 선수가 현재 라인업에 없으면 무시
      if (Object.values(me.lineup).includes(inId)) continue; // in 선수가 이미 라인업에 있으면 무시(중복 배치 방지)
      me.lineup[slotId] = inId;
      subsUsedMe += 1;
      additions.push({
        minute: state.minute,
        type: "sub",
        side: "me",
        playerId: inId,
        textKo: subText(nameOf(out), nameOf(inId)),
      });
    }
  }

  if (iv.roles) {
    me.roles = { ...me.roles, ...iv.roles };
  }
  if (iv.instructions) {
    me.instructions = iv.instructions;
  }
  if (iv.special) {
    me.special = iv.special;
  }
  if (iv.roles || iv.instructions || iv.special) {
    additions.push({ minute: state.minute, type: "tactic_change", side: "me", textKo: tacticChangeText() });
  }

  return {
    ...state,
    me,
    subsUsedMe,
    events: [...state.events, ...additions],
    interventions: [...state.interventions, iv],
  };
}

export function runFullMatch(
  me: SideSetup,
  opp: SideSetup,
  venueId: string,
  seed: number,
  interventions: Intervention[] = []
): MatchState {
  let state = initMatch(me, opp, venueId, seed);
  let guard = 0;
  while (!state.finished && guard < 500) {
    for (const iv of interventions) {
      if (iv.minute === state.minute) {
        state = applyIntervention(state, iv);
      }
    }
    state = simulateMinute(state);
    guard++;
  }
  return state;
}

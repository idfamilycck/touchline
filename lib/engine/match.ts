import { createRngFrom, type Rng } from "./random";
import { computeLambdas } from "./winprob";
import { ENGINE_CONSTANTS } from "./constants";
import { playerContribution, type LineStrengths } from "./strength";
import { possessionShare } from "./possession";
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
  | "red"
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
  // 분당 승/무/패 확률. draw가 있어야 결과 화면·중계에서 "무승부면 승부차기"라는
  // 녹아웃 맥락을 표현할 수 있다(advanceProb). 예전엔 win만 들고 있었다.
  probTimeline: Array<{ minute: number; win: number; draw: number }>;
  // --- 내부 캐시 확장 필드 (브리프 명세 외) ---
  lambdaMe: number;
  lambdaOpp: number;
  lines: { me: LineStrengths; opp: LineStrengths };
  // 볼 점유 누적. possMeAccum은 "매 분 me의 점유 비율(0~1)"의 합이고, possMinutes는
  // 누적된 분 수다. 실제 점유율 = possMeAccum / possMinutes. 매 분 결정론적으로
  // 더하며(RNG 미사용), 개입으로 lines가 바뀌면 그 이후 분부터 자연히 반영된다.
  possMeAccum: number;
  possMinutes: number;
  injuryTime: number; // 0 = 아직 미계산, 계산 후 1~5
  // 경고 보유 선수(팀별 playerId). 두 번째 경고를 받으면 퇴장하므로 이 목록이
  // "다음 파울에 퇴장당할 수 있는 선수"이기도 하다. 경고 자체도 페널티가 있다:
  // 조심스러운 태클로 수비 기여가 떨어진다(recomputeLambdas의 BOOKED_LAMBDA_PENALTY).
  booked: { me: string[]; opp: string[] };
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
// 경고 1장당 상대 λ에 붙는 가산. 경고를 받은 선수는 두 번째 카드를 피하려 태클을
// 자제하므로 그 팀의 수비가 실질적으로 약해진다 — 이 페널티가 없으면 pressing을
// 최대로 올리는 데 아무 대가가 없다(카드 발생률만 오르고 카드는 무해했다).
const BOOKED_LAMBDA_PENALTY = 0.03;

function recomputeLambdas(state: MatchState): {
  lambdaMe: number;
  lambdaOpp: number;
  lines: { me: LineStrengths; opp: LineStrengths };
} {
  const base = computeLambdas(state.me, state.opp, state.venueId);
  const meStaminaAvg = average(Object.values(state.me.lineup).map((id) => state.stamina[id] ?? 1));
  const oppStaminaAvg = average(Object.values(state.opp.lineup).map((id) => state.stamina[id] ?? 1));
  // 경고 보유자는 아직 그라운드에 있는 선수만 센다(교체로 빠졌으면 페널티 소멸).
  const onPitchBooked = (side: SideSetup, booked: string[]): number => {
    const ids = new Set(Object.values(side.lineup));
    return booked.filter((id) => ids.has(id)).length;
  };
  const bookedMe = onPitchBooked(state.me, state.booked?.me ?? []);
  const bookedOpp = onPitchBooked(state.opp, state.booked?.opp ?? []);
  return {
    // 내 경고 보유자 수는 "상대의" λ를 올린다(내 수비가 무른다).
    lambdaMe:
      base.lambdaMe * Math.sqrt(Math.max(0, meStaminaAvg)) * (1 + BOOKED_LAMBDA_PENALTY * bookedOpp),
    lambdaOpp:
      base.lambdaOpp * Math.sqrt(Math.max(0, oppStaminaAvg)) * (1 + BOOKED_LAMBDA_PENALTY * bookedMe),
    lines: base.lines,
  };
}

// ---- 스태미나 분당 감소 -----------------------------------------------------
// 포지션별 활동량 계수 — 중원·윙어가 가장 많이 뛰고, 센터백·GK가 적게 뛴다.
// 실측 GPS 데이터의 포지션별 커버 거리 경향(미드필더 > 풀백/윙어 > 스트라이커 >
// 센터백 > GK)을 단순화한 값이다.
const POSITION_EXERTION: Record<string, number> = {
  gk: 0.55,
  cb: 0.85,
  fb: 1.1,
  dm: 1.1,
  cm: 1.2,
  am: 1.15,
  wg: 1.2,
  st: 1.0,
};

function decayOnPitch(
  stamina: Record<string, number>,
  setup: SideSetup,
  flags: ReturnType<typeof computeStaminaFlags>
): void {
  const marker = setup.special?.manMark?.markerId;
  const formation = FORMATIONS[setup.instructions.formation];
  const squad = playersOf(setup.teamId);
  // 슬롯을 순회해야 포지션별 활동량을 반영할 수 있다(예전엔 lineup의 playerId만 돌아
  // 전원이 같은 rate로 균일하게 닳았다 — "체력이 다 똑같이 준다"는 문제의 원인).
  for (const slot of formation.slots) {
    const playerId = setup.lineup[slot.id];
    if (!playerId) continue;
    const prefix = slot.id.replace(/[_0-9].*$/, ""); // "cb2" -> "cb"
    let rate = 1 / 110;
    // ① 포지션 활동량
    rate *= POSITION_EXERTION[prefix] ?? 1;
    // ② 개인 스태미나 능력치: 높을수록 덜 지친다(99 → 0.8×, 1 → 1.2×). 개인차를 만든다.
    const sta = squad.find((p) => p.id === playerId)?.attrs.stamina ?? 50;
    rate *= 1.2 - (sta / 99) * 0.4;
    // ③ 팀 전체 환경·전술
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
    `${name}, 골망을 흔듭니다!!`,
    `${name}의 환상적인 골!`,
    `${name}, 결국 골을 만들어냅니다!`,
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
    `${name}, 경고를 받습니다.`,
    `심판이 ${name}에게 카드를 꺼냅니다.`,
    `거친 파울로 ${name}, 옐로카드!`,
  ],
};

function eventText(type: keyof typeof TEXT_TEMPLATES, rng: Rng, name: string): string {
  return pickVariant(rng, TEXT_TEMPLATES[type](name));
}

// 퇴장 문구는 RNG를 소비하지 않는다 — 퇴장은 이미 카드 판정에서 RNG를 쓴 뒤의
// 결정론적 귀결이고, 변형을 뽑느라 RNG를 한 번 더 소비하면 같은 시드의 이후 전개가
// "퇴장이 있었는지"에 따라 갈라져 카운터팩추얼 재현이 어려워진다.
function redText(name: string): string {
  return `${name}, 두 번째 경고로 퇴장당합니다! 수적 열세에 놓입니다.`;
}

function crisisText(rng: Rng, conceded: boolean): string {
  const variants = conceded
    ? [
        "위기! 실점 직후 흔들리는 수비진입니다.",
        "위기! 실점으로 분위기가 넘어갑니다.",
        "위기! 골을 내주며 위태로운 상황입니다.",
      ]
    : [
        "위기! 상대의 연속된 공세에 수비가 흔들립니다.",
        "위기! 상대에게 계속 기회를 내주고 있습니다.",
        "위기! 위험한 장면이 반복되고 있습니다.",
      ];
  return pickVariant(rng, variants);
}

// sub/tactic_change 이벤트는 applyIntervention에서 생성되는데, applyIntervention은
// RNG를 소비할 수 없다(카운터팩추얼 불변식). 따라서 이 두 타입은 rng 없이 항상
// 0번째 변형을 사용한다.
function subText(outName: string, inName: string): string {
  return `선수 교체: ${outName} → ${inName} 투입`;
}
function tacticChangeText(): string {
  return "전술이 변경되었습니다.";
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

// 승/무/패를 모두 돌려준다.
//
// 예전에는 승리 확률 하나만 반환했다. 그러면 무승부가 패배 쪽에 흡수돼 0:0 상황에서도
// 화면 숫자가 항상 50% 밑에 깔렸고, 무엇보다 **녹아웃에서 무승부는 패배가 아니다** —
// 승부차기 진입이다. 진출 확률을 계산하려면 무승부 확률이 따로 있어야 한다
// (advanceProb 참고).
export function winProbGivenScore(
  scoreMe: number,
  scoreOpp: number,
  remLambdaMe: number,
  remLambdaOpp: number
): { win: number; draw: number; loss: number } {
  const pMe: number[] = [];
  const pOpp: number[] = [];
  for (let k = 0; k <= 10; k++) {
    pMe.push(safePoissonPmf(remLambdaMe, k));
    pOpp.push(safePoissonPmf(remLambdaOpp, k));
  }
  let win = 0;
  let draw = 0;
  let loss = 0;
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const prob = pMe[i] * pOpp[j];
      const a = scoreMe + i;
      const b = scoreOpp + j;
      if (a > b) win += prob;
      else if (a === b) draw += prob;
      else loss += prob;
    }
  }
  return { win, draw, loss };
}

/**
 * 녹아웃 진출 확률. 무승부는 연장·승부차기로 이어지므로 패배가 아니라
 * "승부차기 승률만큼의 승리"로 환산한다.
 *
 * 연장전(B-2)이 있어도 이 식은 그대로다 — 연장에서 승부가 나면 그건 win/loss로
 * 잡히고, 연장까지 무승부면 승부차기로 가므로 draw × pk가 정확히 그 몫이다.
 */
export function advanceProb(
  outcome: { win: number; draw: number },
  shootoutWin: number
): number {
  return outcome.win + outcome.draw * shootoutWin;
}

// =============================================================================
export function initMatch(me: SideSetup, opp: SideSetup, venueId: string, seed: number): MatchState {
  const stamina: Record<string, number> = {};
  for (const p of playersOf(me.teamId)) stamina[p.id] = 1;
  for (const p of playersOf(opp.teamId)) stamina[p.id] = 1;

  const base = computeLambdas(me, opp, venueId);
  const p0 = winProbGivenScore(
    0,
    0,
    base.lambdaMe * ENGINE_CONSTANTS.REALIZED_GOAL_CALIBRATION,
    base.lambdaOpp * ENGINE_CONSTANTS.REALIZED_GOAL_CALIBRATION
  );

  return {
    minute: 0,
    scoreMe: 0,
    scoreOpp: 0,
    stamina,
    rngState: seed,
    events: [{ minute: 0, type: "kickoff", side: "me", textKo: "경기가 시작되었습니다!" }],
    interventions: [],
    me,
    opp,
    venueId,
    seed,
    subsUsedMe: 0,
    finished: false,
    probTimeline: [{ minute: 0, win: p0.win, draw: p0.draw }],
    lambdaMe: base.lambdaMe,
    lambdaOpp: base.lambdaOpp,
    lines: base.lines,
    possMeAccum: 0,
    possMinutes: 0,
    injuryTime: 0,
    booked: { me: [], opp: [] },
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

  // 퇴장으로 라인업이 바뀔 수 있으므로 이번 분 동안의 "현재" 셋업을 지역 변수로 든다.
  // 퇴장이 없으면 state.me/state.opp와 같은 참조가 그대로 반환된다.
  let meSide = state.me;
  let oppSide = state.opp;
  let sentOff = false;
  const booked = {
    // persist v2 세션에서 복원된 상태에는 booked가 없을 수 있어 방어한다.
    me: state.booked?.me ?? [],
    opp: state.booked?.opp ?? [],
  };
  const sideOf = (s: "me" | "opp"): SideSetup => (s === "me" ? meSide : oppSide);

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

  // 파울/카드. 경고를 이미 갖고 있던 선수가 다시 지목되면 두 번째 경고로 퇴장한다.
  // 퇴장 시 해당 슬롯을 라인업에서 지워 이후 λ·슈터 선택·점유율이 10인 체제를
  // 반영하게 한다(lineStrengths가 정원을 분모로 쓰므로 라인 전력이 실제로 떨어지고,
  // winprob.ts의 manpowerAttMult가 팀 단위 공격 감소를 더한다).
  function processCard(side: "me" | "opp"): void {
    const setup = sideOf(side);
    const p = 0.008 * (setup.instructions.pressing / 2);
    if (rng.next() >= p) return;
    const formation = FORMATIONS[setup.instructions.formation];
    const squad = playersOf(setup.teamId);
    const player = selectRandomOnPitch(rng, setup, formation, squad);
    if (!player) return;

    const alreadyBooked = booked[side].includes(player.id);
    if (!alreadyBooked) {
      booked[side] = [...booked[side], player.id];
      additions.push({
        minute: newMinute,
        type: "card",
        side,
        playerId: player.id,
        textKo: eventText("card", rng, player.name),
      });
      return;
    }

    // 두 번째 경고 → 퇴장.
    const nextLineup = { ...setup.lineup };
    const slotId = Object.keys(nextLineup).find((k) => nextLineup[k] === player.id);
    if (slotId) delete nextLineup[slotId];
    const nextSide: SideSetup = { ...setup, lineup: nextLineup };
    if (side === "me") meSide = nextSide;
    else oppSide = nextSide;
    sentOff = true;
    additions.push({
      minute: newMinute,
      type: "red",
      side,
      playerId: player.id,
      textKo: redText(player.name),
    });
  }

  processCard("me");
  processCard("opp");

  // 퇴장이 나온 분에는 5분 경계를 기다리지 않고 즉시 λ를 재계산한다 — 수적 열세는
  // 다음 분부터 바로 승률에 반영돼야 한다(개입과 같은 취급).
  if (sentOff) {
    const rec = recomputeLambdas({ ...state, me: meSide, opp: oppSide, booked });
    lambdaMe = rec.lambdaMe;
    lambdaOpp = rec.lambdaOpp;
    lines = rec.lines;
  }

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
  decayOnPitch(stamina, meSide, staminaFlagsMe);
  decayOnPitch(stamina, oppSide, staminaFlagsOpp);

  if (newMinute === 45) {
    additions.push({ minute: 45, type: "halftime", side: "me", textKo: "⏱ 전반전이 종료되었습니다." });
  }

  let injuryTime = state.injuryTime;
  if (newMinute === 90 && injuryTime === 0) {
    injuryTime = 1 + Math.floor(rng.next() * 5);
  }

  let finished = false;
  if (injuryTime > 0 && newMinute === 90 + injuryTime) {
    additions.push({ minute: newMinute, type: "fulltime", side: "me", textKo: "경기 종료!" });
    finished = true;
  }

  // 이번 분의 볼 점유를 누적한다. lines/instructions만 보므로 결정론적이다.
  const possMeThisMinute = possessionShare(
    lines.me,
    lines.opp,
    state.me.instructions,
    state.opp.instructions
  );

  const remainingFraction = Math.max(0, (90 - newMinute) / 90);
  const prob = winProbGivenScore(
    scoreMe,
    scoreOpp,
    lambdaMe * remainingFraction * ENGINE_CONSTANTS.REALIZED_GOAL_CALIBRATION,
    lambdaOpp * remainingFraction * ENGINE_CONSTANTS.REALIZED_GOAL_CALIBRATION
  );

  return {
    ...state,
    minute: newMinute,
    scoreMe,
    scoreOpp,
    stamina,
    me: meSide,
    opp: oppSide,
    booked,
    rngState: rng.state(),
    events: [...state.events, ...additions],
    finished,
    probTimeline: [...state.probTimeline, { minute: newMinute, win: prob.win, draw: prob.draw }],
    lambdaMe,
    lambdaOpp,
    lines,
    possMeAccum: state.possMeAccum + possMeThisMinute,
    possMinutes: state.possMinutes + 1,
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

  // 이미 교체로 빠져나간 선수(과거 개입의 out)는 재투입 불가 — 규정상 교체된 선수는
  // 경기에 복귀할 수 없다. 과거 interventions 이력에서 out으로 등장한 id를 모은다.
  const subbedOff = new Set<string>();
  for (const prev of state.interventions) {
    for (const s of prev.subs ?? []) subbedOff.add(s.out);
  }

  if (iv.subs) {
    for (const { out, in: inId } of iv.subs) {
      if (subsUsedMe >= MAX_SUBS) continue; // 5명 초과 교체는 무시
      if (subbedOff.has(inId)) continue; // 교체로 빠진 선수는 재투입 불가
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

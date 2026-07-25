import { FORMATIONS } from "@/lib/data/formations";
import { playersOf } from "@/lib/data/players";
import { playerContribution } from "./strength";
import type { Formation, HeadToHead, Player, Position, SideSetup, Team, Venue } from "@/lib/types";

// 규칙 카드 아이콘의 시맨틱 키. 데이터(엔진)는 의미만 들고, 실제 그림은 UI가
// components/ui/RuleIcon.tsx에서 Phosphor 아이콘으로 매핑한다
// (lib/wc2026/entry-points.ts의 EntryPointIconKey와 동일한 패턴).
export type RuleIconKey =
  | "warning"
  | "target"
  | "lock"
  | "swap"
  | "bolt"
  | "shield"
  | "magnet"
  | "mountain"
  | "heat"
  | "flame"
  | "slump"
  | "chart"
  | "brain"
  | "run";

export interface AppliedRule {
  id: string;
  textKo: string;
  deltaAttack: number;
  deltaDefense: number;
  iconKey: RuleIconKey;
}

export interface ModifierResult {
  rules: AppliedRule[];
  attackMult: number;
  defenseMult: number;
  staminaFlags: {
    altitude: boolean;
    heat: boolean;
    highTempo: boolean;
    highPress: boolean;
  };
}

// RULE_DEFS는 항상 "me" 시점으로 평가된다: 조건은 me/opp의 지시사항을 보고,
// 효과(deltaAttack/deltaDefense)는 me의 공격력/수비력에 곱해질 보정치(-1)다.
// applyModifiers(me, opp, ...)와 applyModifiers(opp, me, ...)를 각각 호출해
// 양 팀의 ModifierResult를 얻는다 (winprob.ts의 computeLambdas 참고).
export interface RuleCtx {
  me: SideSetup;
  opp: SideSetup;
  venue: Venue;
  meTeam: Team;
  oppTeam: Team;
  h2h?: HeadToHead;
  meSquad: Player[];
  oppSquad: Player[];
  meFormation: Formation;
  oppFormation: Formation;
  meAttPaceAvg: number;
  oppAttPaceAvg: number;
  oppDefContribAvg: number;
  oppFbLContrib: number | null;
  oppFbRContrib: number | null;
  oppAttDribblingAvg: number;
  /** 롱볼 적합도 -1~+1. 공중전·피지컬이 패스·드리블보다 좋을수록 +. */
  meDirectFit: number;
  /** 넓은 폭 적합도 -1~+1. 측면(WG/FB) 스피드·드리블이 중앙 패스·수비보다 좋을수록 +. */
  meWideFit: number;
}

interface RuleDef {
  id: string;
  when: (ctx: RuleCtx) => boolean;
  effect: (ctx: RuleCtx) => { da: number; dd: number };
  textKo: (ctx: RuleCtx) => string;
  iconKey: (ctx: RuleCtx) => RuleIconKey;
}

function playerAt(side: SideSetup, squad: Player[], slotId: string): Player | undefined {
  const playerId = side.lineup[slotId];
  return squad.find((p) => p.id === playerId);
}

function slotContribution(
  side: SideSetup,
  squad: Player[],
  formation: Formation,
  slotId: string
): number {
  const slot = formation.slots.find((s) => s.id === slotId);
  if (!slot) return 0;
  const player = playerAt(side, squad, slotId);
  if (!player) return 0;
  const role = side.roles[slotId];
  return playerContribution(player, slot.position, role, 1);
}

function attPaceAvg(side: SideSetup, squad: Player[], formation: Formation): number {
  const slots = formation.slots.filter((s) => s.position === "WG" || s.position === "ST");
  const paces = slots
    .map((s) => playerAt(side, squad, s.id)?.attrs.pace)
    .filter((v): v is number => v !== undefined);
  if (!paces.length) return 0;
  return paces.reduce((a, b) => a + b, 0) / paces.length;
}

// attPaceAvg와 동일한 att라인(WG/ST) 평균 산식이되, pace 대신 dribbling을 집계한다.
// man_marking_scheme 규칙("맨마킹이 개인기 있는 드리블러에게는 뚫린다")의 조건에
// 쓰인다 — instructions.marking(수비방식 UI 토글)이 아직 어떤 규칙에서도 읽히지
// 않아 사장돼 있던 것을 이 규칙으로 살린다.
function attDribblingAvg(side: SideSetup, squad: Player[], formation: Formation): number {
  const slots = formation.slots.filter((s) => s.position === "WG" || s.position === "ST");
  const vals = slots
    .map((s) => playerAt(side, squad, s.id)?.attrs.dribbling)
    .filter((v): v is number => v !== undefined);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ── 세부 지시의 "스쿼드 적합도" ────────────────────────────────────────────
//
// 선발 11명의 특정 능력치 평균을 뽑는다. 아래 fit* 함수들이 "이 지시가 우리 스쿼드에
// 맞는가"를 판단하는 재료다.
function lineupAttrAvg(
  side: SideSetup,
  squad: Player[],
  formation: Formation,
  pick: (p: Player) => number,
  positions?: Position[]
): number {
  const slots = positions
    ? formation.slots.filter((s) => positions.includes(s.position))
    : formation.slots;
  const vals = slots
    .map((s) => playerAt(side, squad, s.id))
    .filter((p): p is Player => p !== undefined)
    .map(pick);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// 두 능력치 축의 우열을 -1~+1로 정규화한다.
// 예: fitBalance(공중전 평균, 패스 평균) > 0 이면 "롱볼에 맞는 스쿼드".
// FIT_SPAN은 이 정도 차이가 나면 최대 효과로 본다는 기준(능력치 1~99 스케일).
const FIT_SPAN = 12;
function fitBalance(forAttr: number, againstAttr: number): number {
  const diff = (forAttr - againstAttr) / FIT_SPAN;
  return Math.max(-1, Math.min(1, diff));
}

function defContribAvg(side: SideSetup, squad: Player[], formation: Formation): number {
  const slots = formation.slots.filter((s) => s.position === "CB" || s.position === "FB");
  const vals = slots.map((s) => slotContribution(side, squad, formation, s.id));
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// 특정 측(좌/우)에 배치된 FB 슬롯 중 기여도가 가장 낮은 값을 반환한다.
// 해당 측에 FB 슬롯이 없으면 null (규칙 미발동 처리용).
function fbContribBySuffix(
  side: SideSetup,
  squad: Player[],
  formation: Formation,
  suffix: "_l" | "_r"
): number | null {
  const candidates = formation.slots.filter((s) => s.position === "FB" && s.id.endsWith(suffix));
  if (!candidates.length) return null;
  let weakest: number | null = null;
  for (const slot of candidates) {
    const c = slotContribution(side, squad, formation, slot.id);
    if (weakest === null || c < weakest) weakest = c;
  }
  return weakest;
}

// export: recommend.ts(23,328개 전술 조합 전수 탐색)가 포메이션당 1회만 이 함수를 호출해
// lineup/스쿼드에서 파생되는 값들(meAttPaceAvg 등, TeamInstructions와 무관)을 캐시해 두고,
// 콤보마다는 evaluateModifiers()만 반복 호출하도록 buildCtx/evaluateModifiers를 분리했다
// (원래는 applyModifiers 내부에 인라인되어 있었다). applyModifiers의 동작은 동일하다.
export function buildCtx(
  me: SideSetup,
  opp: SideSetup,
  venue: Venue,
  meTeam: Team,
  oppTeam: Team,
  h2h?: HeadToHead
): RuleCtx {
  const meSquad = playersOf(me.teamId);
  const oppSquad = playersOf(opp.teamId);
  const meFormation = FORMATIONS[me.instructions.formation];
  const oppFormation = FORMATIONS[opp.instructions.formation];
  return {
    me,
    opp,
    venue,
    meTeam,
    oppTeam,
    h2h,
    meSquad,
    oppSquad,
    meFormation,
    oppFormation,
    meAttPaceAvg: attPaceAvg(me, meSquad, meFormation),
    oppAttPaceAvg: attPaceAvg(opp, oppSquad, oppFormation),
    oppDefContribAvg: defContribAvg(opp, oppSquad, oppFormation),
    oppFbLContrib: fbContribBySuffix(opp, oppSquad, oppFormation, "_l"),
    oppFbRContrib: fbContribBySuffix(opp, oppSquad, oppFormation, "_r"),
    oppAttDribblingAvg: attDribblingAvg(opp, oppSquad, oppFormation),
    meDirectFit: fitBalance(
      (lineupAttrAvg(me, meSquad, meFormation, (p) => p.aerial) +
        lineupAttrAvg(me, meSquad, meFormation, (p) => p.attrs.physical)) /
        2,
      (lineupAttrAvg(me, meSquad, meFormation, (p) => p.attrs.passing) +
        lineupAttrAvg(me, meSquad, meFormation, (p) => p.attrs.dribbling)) /
        2
    ),
    meWideFit: fitBalance(
      (lineupAttrAvg(me, meSquad, meFormation, (p) => p.attrs.pace, ["WG", "FB"]) +
        lineupAttrAvg(me, meSquad, meFormation, (p) => p.attrs.dribbling, ["WG", "FB"])) /
        2,
      (lineupAttrAvg(me, meSquad, meFormation, (p) => p.attrs.passing, ["CM", "DM", "ST"]) +
        lineupAttrAvg(me, meSquad, meFormation, (p) => p.attrs.defending, ["CM", "DM", "ST"])) /
        2
    ),
  };
}

// ── 임계값 절벽 제거 ────────────────────────────────────────────────────────
//
// 문제: 규칙 조건이 전부 이진 임계값이었다. oppAttPaceAvg가 79.9면 보정 0, 80.1이면
// 수비 −8%. 능력치 0.2 차이로 승률이 계단처럼 점프했고, 유저 입장에선 "선수 한 명
// 바꿨는데 승률이 뚝 떨어짐"이 설명되지 않았다.
//
// 해결: 임계값을 [lo, hi] 램프로 바꿔 강도 t(0~1)를 뽑고, 효과를 t에 비례시킨다.
// 카드(근거 문구)는 t가 CARD_MIN_INTENSITY를 넘을 때만 노출해 "거의 0인 보정"이
// 화면을 도배하지 않게 한다. 원래 임계값은 대체로 램프 구간의 중앙에 오도록 잡아,
// 임계값을 확실히 넘는 상황의 효과 크기는 종전과 같게 유지했다.
//
// 램프를 적용하지 않은 조건도 있다. venue의 고도·기온은 16개 경기장에 고정된 값이라
// 유저가 연속적으로 움직일 수 없고(경기장 선택은 이산 선택), h2h의 승수는 정수 표본
// 이라 램프가 오히려 의미를 흐린다. 이 둘은 의도적으로 이진 조건을 유지한다.
function ramp(value: number, lo: number, hi: number): number {
  if (hi <= lo) return value >= hi ? 1 : 0;
  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
}

/** 램프 강도가 이 값 미만이면 근거 카드를 띄우지 않는다(효과는 어차피 미미하다). */
const CARD_MIN_INTENSITY = 0.15;

/** 보정치를 사람이 읽는 퍼센트 문구로. 램프 때문에 값이 매번 다르므로 하드코딩할 수 없다. */
function pctKo(delta: number): string {
  const sign = delta >= 0 ? "+" : "−";
  return `${sign}${Math.round(Math.abs(delta) * 100)}%`;
}

// 상대 공격진 스피드 램프: 74~86. 원래 임계값 80이 중앙에 온다.
const PACE_RAMP: [number, number] = [74, 86];
// 상대 공격진 개인기 램프: 72~84. 원래 임계값 78이 중앙.
const DRIBBLE_RAMP: [number, number] = [72, 84];
// 우리 공격진 스피드 램프: 72~84. 원래 임계값 78이 중앙(분산 라인 활용 조건).
const MY_PACE_RAMP: [number, number] = [72, 84];

function paceIntensity(ctx: RuleCtx): number {
  return ramp(ctx.oppAttPaceAvg, ...PACE_RAMP);
}
function oppDribbleIntensity(ctx: RuleCtx): number {
  return ramp(ctx.oppAttDribblingAvg, ...DRIBBLE_RAMP);
}

// 오프사이드 트랩은 "이득 ↔ 리스크"가 뒤집히는 규칙이라 두 극단을 강도로 보간한다.
// t=0(느린 상대)이면 수비 +4%, t=1(빠른 상대)이면 −5%. 중간에서 자연히 0을 지난다.
const OFFSIDE_GAIN = 0.04;
const OFFSIDE_RISK = -0.05;
function offsideTrapEffect(ctx: RuleCtx): number {
  const t = ramp(ctx.oppAttPaceAvg, 76, 88); // 원래 임계값 82가 중앙
  return OFFSIDE_GAIN * (1 - t) + OFFSIDE_RISK * t;
}
function offsideTrapIsRisk(ctx: RuleCtx): boolean {
  return offsideTrapEffect(ctx) < 0;
}

// 공략하는 쪽 상대 풀백이 그 팀 수비 평균보다 얼마나 약한가를 0~1로.
// 원래 조건은 "평균의 93% 미만"이라는 절벽이었다. 2%~14% 부족을 램프로 잡아
// 93%(=7% 부족) 지점이 램프 중앙에 오게 했다.
function flankWeakness(ctx: RuleCtx): number {
  const focus = ctx.me.instructions.focus;
  if (focus === "center") return 0;
  // focus=left → 내가 공략하는 쪽은 상대의 오른쪽(fb_r), focus=right → 상대의 왼쪽(fb_l)
  const target = focus === "left" ? ctx.oppFbRContrib : ctx.oppFbLContrib;
  if (target === null || ctx.oppDefContribAvg <= 0) return 0;
  const shortfall = 1 - target / ctx.oppDefContribAvg;
  return ramp(shortfall, 0.02, 0.14);
}

// 팀 폼(1~10)을 -1~+1 강도로. 원래는 form>=8 또는 <=3에서만 ±3%가 붙어, WC 팀처럼
// 폼이 ELO에서 파생되는 경우(register.ts의 formFromElo) ELO 1점 차이가 80점 경계를
// 넘으면 보정이 0에서 ±3%로 튀었다. 중앙 5.5를 기준으로 선형화한다.
function formIntensity(form: number): number {
  return Math.max(-1, Math.min(1, (form - 5.5) / 4.5));
}

// 주장의 강심장(mental) 강도. 원래 임계값 85가 램프 중앙(78~92).
function captainIntensity(ctx: RuleCtx): number {
  const captainId = ctx.me.special?.captainId;
  if (!captainId) return 0;
  const captain = ctx.meSquad.find((p) => p.id === captainId);
  if (!captain) return 0;
  return ramp(captain.mental, 78, 92);
}

// 세부 지시의 "상시" 기본 효과.
//
// 왜 필요한가: 이전에는 빌드업·공격 방향·폭·수비 방식이 전부 조건부 규칙만 갖고 있었다.
// 롱볼은 타겟맨이 있어야, 짧은 패스는 상대가 최대 압박이어야, 측면 집중은 그쪽 풀백이
// 약해야, 폭은 상대와 반대여야 발동했다. 조건이 안 맞으면 토글을 눌러도 승률이 문자
// 그대로 0만큼 움직여서 "이 지시들은 아무 의미가 없다"는 인상을 줬다.
//
// 그래서 각 선택지에 항상 걸리는 트레이드오프를 준다. 조건부 규칙(±5~7%)은 "상대를
// 읽었을 때의 보상"으로 그대로 남고, 이 기본 효과(±2% 내외)는 "그 선택 자체의 성격"이다.
//
// 밸런스 주의: 기본 조합(short + center + wide + zonal)의 합이 공격·수비 모두 0이
// 되도록 맞췄다. balance.test.ts는 16개 팀 전원에게 이 기본 조합을 물려 돌리므로,
// 합이 0이면 기존 밸런스·득점 캘리브레이션이 그대로 유지된다.
//   short {-2,+2} + wide {+2,-2} + center {0,0} + zonal {0,0} = {0, 0}
// 적합도 1.0(완전히 맞는 스쿼드)일 때의 최대 공격 보정. 반대로 -1.0이면 같은 크기의 감점.
const FIT_GAIN = 0.05;

// 적합도를 공격/수비 보정으로 바꾼다.
// 핵심: 공격과 수비를 정확히 상쇄시키면 안 된다. 양쪽을 같은 크기로 맞바꾸면 두 팀의
// 득점 기대값이 같이 올라가 승률이 거의 그대로다(실측 +0.3%p). 그래서 적합할수록
// 순이득, 안 맞을수록 순손해가 되도록 주 효과(공격)를 크게 두고 부수 효과(수비)를 작게 둔다.
function fitEffect(fit: number): { da: number; dd: number } {
  return { da: FIT_GAIN * fit, dd: FIT_GAIN * fit * 0.4 };
}

function fitWordKo(fit: number): string {
  if (fit >= 0.35) return "이 스쿼드에 잘 맞습니다";
  if (fit <= -0.35) return "이 스쿼드와는 잘 맞지 않습니다";
  return "이 스쿼드에는 무난합니다";
}

const BASELINE_DEFS: RuleDef[] = [
  {
    id: "buildup_style",
    when: () => true,
    // 롱볼은 공중전·피지컬 스쿼드에, 짧은 패스는 패스·드리블 스쿼드에 맞는다.
    // 그래서 같은 지시라도 팀에 따라 +도 되고 -도 된다(어느 한쪽이 항상 정답이 아니다).
    effect: (ctx) =>
      fitEffect(ctx.me.instructions.buildup === "direct" ? ctx.meDirectFit : -ctx.meDirectFit),
    textKo: (ctx) => {
      const fit = ctx.me.instructions.buildup === "direct" ? ctx.meDirectFit : -ctx.meDirectFit;
      const style = ctx.me.instructions.buildup === "direct" ? "롱볼 전개" : "짧은 패스 전개";
      return `${style}, ${fitWordKo(fit)}`;
    },
    iconKey: (ctx) => (ctx.me.instructions.buildup === "direct" ? "bolt" : "lock"),
  },
  {
    id: "width_style",
    when: () => true,
    // 넓은 폭은 측면 스피드·드리블에, 좁은 폭은 중앙 패스·수비에 맞는다.
    effect: (ctx) =>
      fitEffect(ctx.me.instructions.width === "wide" ? ctx.meWideFit : -ctx.meWideFit),
    textKo: (ctx) => {
      const fit = ctx.me.instructions.width === "wide" ? ctx.meWideFit : -ctx.meWideFit;
      const style = ctx.me.instructions.width === "wide" ? "넓은 폭" : "좁은 폭";
      return `${style}, ${fitWordKo(fit)}`;
    },
    iconKey: () => "swap",
  },
  {
    id: "focus_style",
    // 중앙은 기준점이라 효과 없음(카드도 뜨지 않는다).
    when: (ctx) => ctx.me.instructions.focus !== "center",
    // 측면 집중은 그쪽에 화력을 몰되 반대편이 얇아진다. 넓은 폭 적합도가 좋을수록
    // 측면 집중의 이득이 크다(측면 자원이 좋아야 한쪽으로 몰 의미가 있다).
    effect: (ctx) => ({ da: FIT_GAIN * 0.6 * ctx.meWideFit, dd: -0.012 }),
    textKo: (ctx) => {
      const sideKo = ctx.me.instructions.focus === "left" ? "왼쪽" : "오른쪽";
      return `${sideKo} 측면 집중, 반대편 뒷공간이 얇아집니다`;
    },
    iconKey: () => "target",
  },
];

// 23개 보정 규칙. 각 규칙은 me 시점 조건(when)을 평가하고, 발동 시
// deltaAttack/deltaDefense(effect)와 근거 카드 문구(textKo)를 만든다.
export const RULE_DEFS: RuleDef[] = [
  ...BASELINE_DEFS,
  {
    id: "high_line_vs_pace",
    when: (ctx) => ctx.me.instructions.line === 3 && paceIntensity(ctx) >= CARD_MIN_INTENSITY,
    effect: (ctx) => ({ da: 0, dd: -0.08 * paceIntensity(ctx) }),
    textKo: (ctx) =>
      `높은 라인, 상대 스피드에 배후가 뚫릴 수 있어요 ${pctKo(-0.08 * paceIntensity(ctx))}`,
    iconKey: () => "warning",
  },
  {
    id: "direct_targetman",
    when: (ctx) =>
      ctx.me.instructions.buildup === "direct" &&
      ctx.meFormation.slots
        .filter((s) => s.position === "ST")
        .some((s) => ctx.me.roles[s.id] === "st_target"),
    effect: () => ({ da: 0.06, dd: 0 }),
    textKo: () => "롱볼과 타겟맨 조합, 상대 배후를 노립니다 +6%",
    iconKey: () => "target",
  },
  {
    id: "short_vs_press",
    when: (ctx) => ctx.me.instructions.buildup === "short" && ctx.opp.instructions.pressing === 3,
    effect: () => ({ da: -0.05, dd: 0 }),
    textKo: () => "짧은 빌드업이 상대의 강한 압박에 막힙니다 −5%",
    iconKey: () => "lock",
  },
  {
    id: "focus_vs_weakflank",
    when: (ctx) => flankWeakness(ctx) >= CARD_MIN_INTENSITY,
    effect: (ctx) => ({ da: 0.07 * flankWeakness(ctx), dd: 0 }),
    textKo: (ctx) => {
      const side = ctx.me.instructions.focus === "left" ? "오른쪽" : "왼쪽";
      return `상대 ${side} 측면이 약점입니다 ${pctKo(0.07 * flankWeakness(ctx))}`;
    },
    iconKey: () => "target",
  },
  {
    id: "wide_vs_narrow",
    when: (ctx) => {
      const mw = ctx.me.instructions.width;
      const ow = ctx.opp.instructions.width;
      return (mw === "wide" && ow === "narrow") || (mw === "narrow" && ow === "wide");
    },
    effect: (ctx) =>
      ctx.me.instructions.width === "wide" ? { da: 0.03, dd: 0 } : { da: -0.03, dd: 0 },
    textKo: (ctx) =>
      ctx.me.instructions.width === "wide"
        ? "넓은 폭 공격이 상대의 좁은 수비 사이 공간을 벌립니다 +3%"
        : "좁은 폭이 상대의 넓은 수비 조직에 고립됩니다 −3%",
    iconKey: () => "swap",
  },
  {
    id: "counter_style",
    when: (ctx) => ctx.me.instructions.attacking === 1 && ctx.opp.instructions.line === 3,
    effect: () => ({ da: 0.06, dd: 0 }),
    textKo: () => "상대의 높은 라인 뒤 공간을 역습으로 노립니다 +6%",
    iconKey: () => "bolt",
  },
  {
    id: "offside_trap",
    // 기획 문서상 "상대 deltaAttack −4%"로 명시되어 있으나, 본 엔진은 규칙을 항상
    // me 시점(자신의 deltaAttack/deltaDefense)으로 평가하므로 상대 공격력을
    // 직접 낮추는 대신 동등한 효과인 "자신의 deltaDefense +0.04"로 구현했다.
    when: (ctx) => ctx.me.instructions.offsideTrap === true,
    effect: (ctx) => ({ da: 0, dd: offsideTrapEffect(ctx) }),
    textKo: (ctx) =>
      offsideTrapIsRisk(ctx)
        ? `오프사이드 트랩이 상대의 스피드에 무너질 위험이 있습니다 ${pctKo(offsideTrapEffect(ctx))}`
        : `오프사이드 트랩이 상대 공격을 무력화합니다 ${pctKo(offsideTrapEffect(ctx))}`,
    iconKey: (ctx) => (offsideTrapIsRisk(ctx) ? "warning" : "shield"),
  },
  {
    id: "man_marking_fatigue",
    when: (ctx) => !!ctx.me.special?.manMark,
    effect: () => ({ da: 0, dd: 0.05 }),
    textKo: () => "맨마킹으로 수비 조직력이 강화됩니다 +5%",
    iconKey: () => "magnet",
  },
  {
    id: "man_marking_scheme",
    // instructions.marking(수비방식: 지역방어/맨마킹 UI 토글)은 이 규칙이 추가되기
    // 전까지 어떤 규칙도 읽지 않는 사장된 값이었다. man_marking_fatigue(위)는
    // special.manMark(특정 1인 전담 마크 지정)를 보는 별개 메커니즘이라 서로
    // 독립적으로 발동할 수 있다.
    when: (ctx) => ctx.me.instructions.marking === "man",
    // 오프사이드 트랩과 같은 "이득 ↔ 리스크" 뒤집힘 구조라 두 극단을 보간한다.
    effect: (ctx) => {
      const t = oppDribbleIntensity(ctx);
      return { da: 0, dd: 0.02 * (1 - t) - 0.03 * t };
    },
    textKo: (ctx) => {
      const t = oppDribbleIntensity(ctx);
      const dd = 0.02 * (1 - t) - 0.03 * t;
      return dd < 0
        ? `맨마킹, 상대의 뛰어난 개인기에 뚫릴 위험이 있습니다 ${pctKo(dd)}`
        : `맨마킹으로 상대 공격을 밀착 봉쇄합니다 ${pctKo(dd)}`;
    },
    iconKey: () => "magnet",
  },
  {
    id: "altitude",
    when: (ctx) => ctx.venue.altitude > 1500 && ctx.me.instructions.pressing === 3,
    effect: () => ({ da: -0.04, dd: 0 }),
    textKo: () => "고지대, 강한 압박은 후반에 지칩니다 −4%",
    iconKey: () => "mountain",
  },
  {
    id: "heat",
    when: (ctx) =>
      ctx.venue.avgTempC >= 30 && !ctx.venue.dome && ctx.me.instructions.pressing === 3,
    effect: () => ({ da: -0.03, dd: 0 }),
    textKo: () => "폭염, 체력 소모가 큽니다 −3%",
    iconKey: () => "heat",
  },
  {
    id: "form",
    // 효과는 연속이지만 카드는 여전히 "확실히 좋다/나쁘다"일 때만 띄운다 — 폼 6짜리
    // 팀에 "+0.7%" 카드를 붙이면 근거 목록이 무의미하게 길어진다.
    when: (ctx) => Math.abs(formIntensity(ctx.meTeam.form)) >= 0.5,
    effect: (ctx) => ({ da: 0.03 * formIntensity(ctx.meTeam.form), dd: 0 }),
    textKo: (ctx) => {
      const da = 0.03 * formIntensity(ctx.meTeam.form);
      return da >= 0
        ? `물오른 폼, 경기력이 살아납니다 ${pctKo(da)}`
        : `부진한 폼이 발목을 잡습니다 ${pctKo(da)}`;
    },
    iconKey: (ctx) => (ctx.meTeam.form >= 5.5 ? "flame" : "slump"),
  },
  {
    id: "h2h_edge",
    // winA >= 3 최소 표본 가드는 의도적인 안티노이즈 장치다: 표본이 1~2건뿐인
    // 전적으로 "우위"를 판정하면 우연에 의한 노이즈를 규칙으로 오인할 수 있다.
    when: (ctx) => !!ctx.h2h && ctx.h2h.winA >= 3 && ctx.h2h.winA >= ctx.h2h.winB * 2,
    effect: () => ({ da: 0.02, dd: 0 }),
    textKo: () => "상대 전적 우위, 심리적으로 앞서갑니다 +2%",
    iconKey: () => "chart",
  },
  {
    id: "captain_mental",
    when: (ctx) => captainIntensity(ctx) >= CARD_MIN_INTENSITY,
    effect: (ctx) => ({ da: 0, dd: 0.02 * captainIntensity(ctx) }),
    textKo: (ctx) =>
      `강심장 주장이 수비 라인을 안정시킵니다 ${pctKo(0.02 * captainIntensity(ctx))}`,
    iconKey: () => "brain",
  },
  {
    id: "tempo_stamina",
    when: (ctx) => ctx.me.instructions.tempo === 3,
    effect: () => ({ da: 0.03, dd: 0 }),
    textKo: () => "빠른 템포로 상대를 몰아붙입니다 +3%",
    iconKey: () => "run",
  },
  {
    id: "tempo_fatigue_risk",
    // tempo_stamina의 반대급부. match.ts의 실시간 시뮬레이션은 highTempo일 때 체력
    // 소모율을 1.15배로 늘리지만(decayOnPitch), recommend()가 쓰는 사전 승률 계산은
    // 그 라이브 로직을 안 거치므로 여기서 별도 규칙으로 "90분 동안 유지되는 빠른
    // 템포의 체력 대가"를 근사한다. da +3%와 대칭으로 맞춰(dd −3%) 빠른 템포가
    // 상대와 무관하게 항상 이득인 공짜 보너스가 되지 않도록 한다.
    when: (ctx) => ctx.me.instructions.tempo === 3,
    effect: () => ({ da: 0, dd: -0.03 }),
    textKo: () => "빠른 템포가 후반으로 갈수록 체력을 갉아먹습니다 −3%",
    iconKey: () => "heat",
  },
  {
    id: "compact_line_solidity",
    // 압축은 공짜 보너스가 아니다: 수비 조직력을 얻는 만큼 라인 사이 공간이 좁아져
    // 공격 전개 폭을 그대로 희생한다(da −4% / dd +4%, 1:1 등가교환). defenseMult는
    // 상대 λ를, attackMult는 내 λ를 움직이는 구조라 크기를 맞추지 않으면 한쪽이
    // 항상 이겨 lineSpacing=1이 상대와 무관하게 최선이 되어버린다(winprob.ts 참고).
    // 1:1로 맞춰두면 실제로 유리한지는 두 팀의 λ 곡률(전력차)에 따라 매치업마다 달라진다.
    when: (ctx) => ctx.me.instructions.lineSpacing === 1,
    effect: () => ({ da: -0.04, dd: 0.04 }),
    textKo: () => "압축된 라인 간격, 수비는 단단해지지만 공격 전개 공간을 그만큼 내줍니다 (수비+4%/공격−4%)",
    iconKey: () => "shield",
  },
  {
    id: "spread_line_gaps",
    when: (ctx) =>
      ctx.me.instructions.lineSpacing === 3 && oppDribbleIntensity(ctx) >= CARD_MIN_INTENSITY,
    effect: (ctx) => ({ da: 0, dd: -0.05 * oppDribbleIntensity(ctx) }),
    textKo: (ctx) =>
      `벌어진 라인 사이 공간을 상대의 개인기가 파고듭니다 ${pctKo(-0.05 * oppDribbleIntensity(ctx))}`,
    iconKey: () => "warning",
  },
  {
    id: "spread_line_space",
    // 분산 라인의 반대급부: 빠른 공격진을 보유했을 때만 벌어진 공간을 실제로
    // 활용할 수 있다(팀 구성에 좌우되는 상황부 보너스, 압축의 무조건 보너스와 대비).
    when: (ctx) =>
      ctx.me.instructions.lineSpacing === 3 &&
      ramp(ctx.meAttPaceAvg, ...MY_PACE_RAMP) >= CARD_MIN_INTENSITY,
    effect: (ctx) => ({ da: 0.04 * ramp(ctx.meAttPaceAvg, ...MY_PACE_RAMP), dd: 0 }),
    textKo: (ctx) =>
      `벌어진 라인 간격의 공간을 빠른 공격진이 파고듭니다 ${pctKo(
        0.04 * ramp(ctx.meAttPaceAvg, ...MY_PACE_RAMP)
      )}`,
    iconKey: () => "swap",
  },
  {
    id: "possession_control",
    when: (ctx) => ctx.me.instructions.possession === 3 && ctx.me.instructions.buildup === "short",
    effect: () => ({ da: 0.05, dd: 0 }),
    textKo: () => "높은 점유율 지향과 짧은 빌드업이 경기를 지배합니다 +5%",
    iconKey: () => "chart",
  },
  {
    id: "possession_press_risk",
    // 상대 압박이 "상"일 때만 걸리면 기본값(중)인 대부분의 매치업에서 전혀 발동하지
    // 않아 possession_control(+5%)이 사실상 무조건 이득이 되어버린다. "중" 이상으로
    // 넓히고, "중"(기본값) 상대에게는 possession_control의 +5%를 거의 상쇄하는 −5%를
    // 줘서 평범한 상대에게는 순효과가 거의 0(매치업별 λ 곡률에 따라 갈림)이 되도록,
    // "상" 상대에게는 순수 손해(−7%)가 되도록 한다.
    when: (ctx) => ctx.me.instructions.possession === 3 && ctx.opp.instructions.pressing >= 2,
    effect: (ctx) => (ctx.opp.instructions.pressing === 3 ? { da: 0, dd: -0.07 } : { da: 0, dd: -0.05 }),
    textKo: (ctx) =>
      ctx.opp.instructions.pressing === 3
        ? "높은 점유율 지향이 상대의 강한 압박에 위험해집니다 −7%"
        : "높은 점유율 지향이 상대의 압박에 위험해집니다 −5%",
    iconKey: () => "warning",
  },
  {
    id: "fast_transition_exploit",
    when: (ctx) => ctx.me.instructions.transitionSpeed === 3 && ctx.opp.instructions.line === 3,
    effect: () => ({ da: 0.06, dd: 0 }),
    textKo: () => "빠른 전환이 상대의 높은 라인 뒷공간을 순식간에 노립니다 +6%",
    iconKey: () => "bolt",
  },
  {
    id: "slow_transition_control",
    when: (ctx) => ctx.me.instructions.transitionSpeed === 1 && ctx.me.instructions.possession === 3,
    effect: () => ({ da: 0, dd: 0.03 }),
    textKo: () => "느린 전환으로 안정적인 점유를 유지합니다 +3%",
    iconKey: () => "shield",
  },
];

// export: buildCtx와 짝을 이루는 규칙 평가 단계만 분리한 함수. RuleCtx를 이미 갖고 있는
// 호출자(recommend.ts)는 이 함수만 반복 호출해 buildCtx의 파생값 재계산을 피할 수 있다.
export function evaluateModifiers(ctx: RuleCtx): ModifierResult {
  const rules: AppliedRule[] = [];
  for (const def of RULE_DEFS) {
    if (!def.when(ctx)) continue;
    const { da, dd } = def.effect(ctx);
    rules.push({
      id: def.id,
      textKo: def.textKo(ctx),
      deltaAttack: da,
      deltaDefense: dd,
      iconKey: def.iconKey(ctx),
    });
  }
  const attackMult = rules.reduce((m, r) => m * (1 + r.deltaAttack), 1);
  const defenseMult = rules.reduce((m, r) => m * (1 + r.deltaDefense), 1);
  return {
    rules,
    attackMult,
    defenseMult,
    staminaFlags: {
      altitude: ctx.venue.altitude > 1500,
      heat: ctx.venue.avgTempC >= 30 && !ctx.venue.dome,
      highTempo: ctx.me.instructions.tempo === 3,
      highPress: ctx.me.instructions.pressing === 3,
    },
  };
}

export function applyModifiers(
  me: SideSetup,
  opp: SideSetup,
  venue: Venue,
  meTeam: Team,
  oppTeam: Team,
  h2h?: HeadToHead
): ModifierResult {
  return evaluateModifiers(buildCtx(me, opp, venue, meTeam, oppTeam, h2h));
}

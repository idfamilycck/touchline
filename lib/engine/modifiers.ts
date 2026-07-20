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

function offsideTrapIsRisk(ctx: RuleCtx): boolean {
  return ctx.oppAttPaceAvg > 82;
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

// 15개 보정 규칙. 각 규칙은 me 시점 조건(when)을 평가하고, 발동 시
// deltaAttack/deltaDefense(effect)와 근거 카드 문구(textKo)를 만든다.
export const RULE_DEFS: RuleDef[] = [
  ...BASELINE_DEFS,
  {
    id: "high_line_vs_pace",
    when: (ctx) => ctx.me.instructions.line === 3 && ctx.oppAttPaceAvg > 80,
    effect: () => ({ da: 0, dd: -0.08 }),
    textKo: () => "높은 라인, 상대 스피드에 배후가 뚫릴 수 있어요 −8%",
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
    when: (ctx) => {
      const focus = ctx.me.instructions.focus;
      if (focus === "center") return false;
      // focus=left → 내가 공략하는 쪽은 상대의 오른쪽(fb_r), focus=right → 상대의 왼쪽(fb_l)
      const target = focus === "left" ? ctx.oppFbRContrib : ctx.oppFbLContrib;
      if (target === null) return false;
      return target < ctx.oppDefContribAvg * 0.93;
    },
    effect: () => ({ da: 0.07, dd: 0 }),
    textKo: (ctx) => {
      const side = ctx.me.instructions.focus === "left" ? "오른쪽" : "왼쪽";
      return `상대 ${side} 측면이 약점입니다 +7%`;
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
    effect: (ctx) => (offsideTrapIsRisk(ctx) ? { da: 0, dd: -0.05 } : { da: 0, dd: 0.04 }),
    textKo: (ctx) =>
      offsideTrapIsRisk(ctx)
        ? "오프사이드 트랩이 상대의 스피드에 무너질 위험이 있습니다 −5%"
        : "오프사이드 트랩이 상대 공격을 무력화합니다 −4%",
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
    effect: (ctx) => (ctx.oppAttDribblingAvg >= 78 ? { da: 0, dd: -0.03 } : { da: 0, dd: 0.02 }),
    textKo: (ctx) =>
      ctx.oppAttDribblingAvg >= 78
        ? "맨마킹, 상대의 뛰어난 개인기에 뚫릴 위험이 있습니다 −3%"
        : "맨마킹으로 상대 공격을 밀착 봉쇄합니다 +2%",
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
    when: (ctx) => ctx.meTeam.form >= 8 || ctx.meTeam.form <= 3,
    effect: (ctx) => (ctx.meTeam.form >= 8 ? { da: 0.03, dd: 0 } : { da: -0.03, dd: 0 }),
    textKo: (ctx) =>
      ctx.meTeam.form >= 8
        ? "물오른 폼, 경기력이 살아납니다 +3%"
        : "부진한 폼이 발목을 잡습니다 −3%",
    iconKey: (ctx) => (ctx.meTeam.form >= 8 ? "flame" : "slump"),
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
    when: (ctx) => {
      const captainId = ctx.me.special?.captainId;
      if (!captainId) return false;
      const captain = ctx.meSquad.find((p) => p.id === captainId);
      return !!captain && captain.mental >= 85;
    },
    effect: () => ({ da: 0, dd: 0.02 }),
    textKo: () => "강심장 주장이 수비 라인을 안정시킵니다 +2%",
    iconKey: () => "brain",
  },
  {
    id: "tempo_stamina",
    when: (ctx) => ctx.me.instructions.tempo === 3,
    effect: () => ({ da: 0.03, dd: 0 }),
    textKo: () => "빠른 템포로 상대를 몰아붙입니다 +3%",
    iconKey: () => "run",
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

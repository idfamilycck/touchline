import { teamById } from "@/lib/data/teams";
import { venueById } from "@/lib/data/venues";
import { FORMATIONS } from "@/lib/data/formations";
import { h2hOf } from "@/lib/data/h2h";
import { lineStrengths, type LineStrengths } from "./strength";
import { outcomeProbs } from "./poisson";
import { applyModifiers, type AppliedRule, type ModifierResult } from "./modifiers";
import { ENGINE_CONSTANTS } from "./constants";
import type { SideSetup, Team } from "@/lib/types";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function eloMult(myElo: number, oppElo: number): number {
  const diff = clamp(myElo - oppElo, -ENGINE_CONSTANTS.ELO_DIFF_CAP, ENGINE_CONSTANTS.ELO_DIFF_CAP);
  return 1 + (diff / ENGINE_CONSTANTS.ELO_DIFF_CAP) * ENGINE_CONSTANTS.ELO_MULT_COEF;
}

// ---- 수적 열세 -------------------------------------------------------------
// 퇴장의 수비 쪽 영향은 lineStrengths가 이미 구조적으로 처리한다(빈 슬롯이 그 라인
// 평균을 정원 기준으로 끌어내린다 → 상대 λ의 분모인 meDef가 줄어 상대 λ가 오른다).
// 하지만 공격 쪽은 그렇지 않다: 센터백이 퇴장당해도 myAtt는 def 성분 10%만 잃어
// 거의 그대로다. 실제로는 한 명이 빠지면 전방 인원을 내려 수비를 메우므로 공격
// 자체가 크게 줄어든다(실측: 10명 팀의 기대 득점 약 −30%, 실점 약 +25%).
// 그 "조직적 후퇴"를 라인 평균으로는 표현할 수 없어 팀 단위 계수로 따로 곱한다.
// 잃은 인원당 0.93배 — 포지션별 라인 손실과 합쳐지면 필드 플레이어 1명 퇴장 시
// λ가 −10%(수비수) ~ −33%(공격수) 범위로 갈라진다.
export const MANPOWER_ATT_PER_MISSING = 0.93;

function manpowerAttMult(onPitch: number): number {
  return Math.pow(MANPOWER_ATT_PER_MISSING, Math.max(0, 11 - onPitch));
}

/** 포메이션 슬롯 중 실제로 선수가 배치된 수. 퇴장으로 슬롯이 지워지면 11 미만이 된다. */
export function onPitchCount(side: SideSetup): number {
  const formation = FORMATIONS[side.instructions.formation];
  if (!formation) return 11;
  let n = 0;
  for (const slot of formation.slots) {
    if (side.lineup[slot.id]) n++;
  }
  return n;
}

export interface LambdaResult {
  lambdaMe: number;
  lambdaOpp: number;
  rulesMe: AppliedRule[];
  rulesOpp: AppliedRule[];
  lines: { me: LineStrengths; opp: LineStrengths };
  staminaFlags: { me: ModifierResult["staminaFlags"]; opp: ModifierResult["staminaFlags"] };
}

// λ_me/λ_opp 계산식만 분리한 순수 함수: LineStrengths·ModifierResult·Team(elo)만 있으면
// 되고 SideSetup 전체나 venue/h2h 조회가 필요 없다. recommend.ts(23,328개 전술 조합
// 전수 탐색)처럼 lineStrengths와 ModifierResult를 이미 다른 경로로 확보한 호출자가
// 팀/venue/h2h를 다시 조회하지 않고 곧장 λ만 뽑아내도록 computeLambdas에서 분리했다.
// computeLambdas도 내부적으로 이 함수를 사용하므로(순수 리팩터, 동작 동일) 두 경로가
// 어긋날 일이 없다.
export function lambdasFromParts(
  meLines: LineStrengths,
  oppLines: LineStrengths,
  modMe: ModifierResult,
  modOpp: ModifierResult,
  meTeam: Team,
  oppTeam: Team,
  // 온피치 인원. 기본 11이라 기존 호출부(전원 배치)의 동작은 완전히 동일하다.
  meOnPitch = 11,
  oppOnPitch = 11
): { lambdaMe: number; lambdaOpp: number } {
  // myAtt: 나의 공격 종합력 (att 55% + mid 35% + def 10%)
  const myAtt = 0.55 * meLines.att + 0.35 * meLines.mid + 0.1 * meLines.def;
  // oppDef: 상대 수비 종합력 (def 50% + mid 30% + gk 20%)
  const oppDef = 0.5 * oppLines.def + 0.3 * oppLines.mid + 0.2 * oppLines.gk;
  const oppAtt = 0.55 * oppLines.att + 0.35 * oppLines.mid + 0.1 * oppLines.def;
  const meDef = 0.5 * meLines.def + 0.3 * meLines.mid + 0.2 * meLines.gk;

  // defenseMult 방향성 (중요):
  // λ_me = ... × attackMult_me / defenseMult_opp × eloMult_me
  // → "상대"의 defenseMult가 λ_me의 분모로 들어간다. 즉 상대 수비가 보정으로
  //   강화되면(defenseMult_opp > 1) 내 λ가 줄고, 상대 수비가 약화되면
  //   (defenseMult_opp < 1, 예: 상대의 high_line_vs_pace 리스크) 내 λ가 늘어난다.
  // 대칭적으로 λ_opp는 "나"의 defenseMult를 분모로 사용한다.
  const lambdaMe = clamp(
    ENGINE_CONSTANTS.LAMBDA_BASE *
      Math.pow(myAtt / oppDef, ENGINE_CONSTANTS.LAMBDA_ELASTICITY) *
      (modMe.attackMult / modOpp.defenseMult) *
      eloMult(meTeam.elo, oppTeam.elo) *
      manpowerAttMult(meOnPitch),
    ENGINE_CONSTANTS.LAMBDA_MIN,
    ENGINE_CONSTANTS.LAMBDA_MAX
  );
  const lambdaOpp = clamp(
    ENGINE_CONSTANTS.LAMBDA_BASE *
      Math.pow(oppAtt / meDef, ENGINE_CONSTANTS.LAMBDA_ELASTICITY) *
      (modOpp.attackMult / modMe.defenseMult) *
      eloMult(oppTeam.elo, meTeam.elo) *
      manpowerAttMult(oppOnPitch),
    ENGINE_CONSTANTS.LAMBDA_MIN,
    ENGINE_CONSTANTS.LAMBDA_MAX
  );

  return { lambdaMe, lambdaOpp };
}

export function computeLambdas(
  me: SideSetup,
  opp: SideSetup,
  venueId: string,
  precomputedLines?: { me: LineStrengths; opp: LineStrengths }
): LambdaResult {
  const venue = venueById(venueId);
  if (!venue) throw new Error(`unknown venue: ${venueId}`);
  const meTeam = teamById(me.teamId);
  const oppTeam = teamById(opp.teamId);
  if (!meTeam) throw new Error(`unknown team: ${me.teamId}`);
  if (!oppTeam) throw new Error(`unknown team: ${opp.teamId}`);

  // h2hOf는 호출자가 넘긴 (a, b) 순서에 맞춰 winA/winB를 정규화해 돌려준다.
  // rulesMe에는 (me, opp) 순서, rulesOpp에는 (opp, me) 순서로 각각 넘겨야
  // h2h_edge 규칙이 "나 기준" 승수 비교를 올바르게 할 수 있다.
  const h2hMe = h2hOf(me.teamId, opp.teamId);
  const h2hOpp = h2hOf(opp.teamId, me.teamId);

  // precomputedLines: lineStrengths는 lineup/roles/manMark에만 의존하고 instructions
  // (전술 파라미터)와는 무관하므로, 동일 라인업을 놓고 전술 조합만 바꿔가며 대량으로
  // 재평가하는 호출자(lib/engine/recommend.ts의 23,328개 조합 전수 탐색)는 라인업이
  // 고정된 동안 계산한 LineStrengths를 넘겨 이 함수 내부의 재계산을 건너뛸 수 있다.
  // 생략 시(기존 호출부는 전부 생략) 이전과 동일하게 항상 재계산한다.
  const meLines = precomputedLines?.me ?? lineStrengths(me, opp);
  const oppLines = precomputedLines?.opp ?? lineStrengths(opp, me);

  const modMe = applyModifiers(me, opp, venue, meTeam, oppTeam, h2hMe);
  const modOpp = applyModifiers(opp, me, venue, oppTeam, meTeam, h2hOpp);

  const { lambdaMe, lambdaOpp } = lambdasFromParts(
    meLines,
    oppLines,
    modMe,
    modOpp,
    meTeam,
    oppTeam,
    onPitchCount(me),
    onPitchCount(opp)
  );

  return {
    lambdaMe,
    lambdaOpp,
    rulesMe: modMe.rules,
    rulesOpp: modOpp.rules,
    lines: { me: meLines, opp: oppLines },
    staminaFlags: { me: modMe.staminaFlags, opp: modOpp.staminaFlags },
  };
}

export function winProbability(
  me: SideSetup,
  opp: SideSetup,
  venueId: string
): { win: number; draw: number; loss: number; lambdaMe: number; lambdaOpp: number; rules: AppliedRule[] } {
  const { lambdaMe, lambdaOpp, rulesMe } = computeLambdas(me, opp, venueId);
  const { win, draw, loss } = outcomeProbs(lambdaMe, lambdaOpp);
  return { win, draw, loss, lambdaMe, lambdaOpp, rules: rulesMe };
}

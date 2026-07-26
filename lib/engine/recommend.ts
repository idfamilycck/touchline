import { teamById } from "@/lib/data/teams";
import { venueById } from "@/lib/data/venues";
import { h2hOf } from "@/lib/data/h2h";
import { autoPlace } from "./autoplace";
import { lineStrengths } from "./strength";
import { winProbability, lambdasFromParts, onPitchCount } from "./winprob";
import { buildCtx, evaluateModifiers, type AppliedRule } from "./modifiers";
import { outcomeProbs } from "./poisson";
import type { FormationId, RoleId, SideSetup, TeamInstructions } from "@/lib/types";

export interface Recommendation {
  instructions: TeamInstructions;
  lineup: Record<string, string>;
  roles: Record<string, RoleId>;
  winDelta: number;
  winProb: number;
  topFactors: AppliedRule[];
  evaluated: number;
  elapsedMs: number;
}

const FORMATION_IDS: FormationId[] = ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "3-4-3", "5-4-1"];
const LINE_OPTS = [1, 2, 3] as const;
const ATTACKING_OPTS = [1, 2, 3] as const;
const TEMPO_OPTS = [1, 2, 3] as const;
const BUILDUP_OPTS = ["short", "balanced", "direct"] as const;
const OFFSIDE_TRAP_OPTS = [false, true] as const;
const LINE_SPACING_OPTS = [1, 2, 3] as const;
const POSSESSION_OPTS = [1, 2, 3] as const;
const TRANSITION_SPEED_OPTS = [1, 2, 3] as const;
// pressing/focus/width/marking은 탐색에서 제외한다(아래 큰 주석 참고) — 콤보 루프에서
// 호출자의 현재 값을 그대로 candidateBase.instructions에서 물려받는다.

function now(): number {
  // 브라우저/Node 모두 performance.now()를 우선 쓰고, 없으면 Date.now()로 대체한다.
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

// 전술 조합(TeamInstructions) 전수 탐색: 포메이션 6종 × line/attacking/tempo/buildup/
// lineSpacing/possession/transitionSpeed(각 3) × offsideTrap(2) = 26,244개.
//
// 탐색 축 선정 기준(pressing/focus/width/marking을 뺀 이유): 이 엔진에서 TeamInstructions는
// 오직 modifiers.ts의 RULE_DEFS를 통해서만 승률에 영향을 준다(라인업 능력치 계산은
// instructions를 보지 않는다). pressing은 고지대·폭염 경기장이 아니면 어떤 규칙도 참조하지
// 않아 평지 경기에서는 탐색해도 결과가 안 바뀌고, focus/width/marking은 델타가 ±2~3%로
// 작다. 반대로 line/attacking/tempo/buildup/lineSpacing/possession/transitionSpeed는 규칙
// 발동 빈도·델타가 커서 승률에 실질적 영향을 준다. 축 3개(lineSpacing/possession/
// transitionSpeed)를 더 늘리고 싶다면, 다른 축을 하나 더 빼서 3^n을 같은 자릿수로 유지해야
// 500ms 예산이 안전하다(3^8=6561부터 예산의 72%를 써서 CI 여유가 급격히 줄어든다).
// 탐색에서 뺀 4개 값은 candidateBase.instructions(= 호출자의 현재 me.instructions)를 그대로
// 물려받으므로, 사용자가 프리셋 등으로 미리 설정해 둔 값이 그대로 유지된 채 나머지 7개
// 축만 최적화된다.
//
// 성능 설계 (중요, elapsedMs < 500ms 예산):
// winProbability를 23,328번 그대로 호출하면(직접 벤치마크 확인) 약 8초가 걸린다. 병목은
// 세 군데였고 각각 다르게 해결했다:
//
//   1) lineStrengths/playerContribution — lineup·roles·manMark에만 의존하고 instructions
//      (전술 파라미터)와는 무관하다. 포메이션별로 autoPlace를 "딱 1회"만 호출해
//      lineup/roles를 캐시하고, 그 lineup으로 만든 후보에 대해 lineStrengths도
//      "포메이션당 1회"만 계산한다. 상대(opp) 쪽 라인 강도(oppLines)는 opp 라인업(고정)과
//      me.special.manMark(탐색 내내 불변)에만 의존하므로 전체 탐색에서 딱 1회만 계산한다.
//
//   2) applyModifiers의 RuleCtx 구성(buildCtx) — meAttPaceAvg/oppAttPaceAvg/
//      oppDefContribAvg/oppFbL·RContrib 같은 파생값은 라인업/포메이션에서만 나오고
//      instructions는 보지 않는데도, applyModifiers를 그대로 호출하면 콤보마다
//      buildCtx를 처음부터 다시 실행해(내부적으로 playerContribution도 호출) 낭비가
//      컸다. modifiers.ts를 buildCtx(파생값 계산)와 evaluateModifiers(RULE_DEFS 평가)로
//      분리해, buildCtx는 포메이션당 2회(모드me·모드opp 관점 각 1회)만 부르고
//      evaluateModifiers만 콤보마다 얕은 복제한 ctx(instructions 필드만 교체)로 반복
//      호출한다. winprob.ts의 lambdasFromParts는 LineStrengths·ModifierResult만으로
//      λ를 계산하는 순수 함수로 분리해 team/venue/h2h 재조회 없이 곧장 사용한다.
//      (winProbability의 공개 시그니처는 그대로 유지했다.)
//
//   3) lib/engine/poisson.ts의 outcomeProbs/poissonPmf — 원래 구현은 ln(k!)를 매번
//      O(k) 루프로 재계산하고, 이중루프 안쪽에서 바깥 루프와 무관한 pB(b)를 961번
//      재계산했다. 둘 다 수학적으로 동일한 결과를 유지하면서 캐싱/사전계산으로
//      재계산을 없앴다(자세한 내용은 poisson.ts 주석 참고).
//
//   부수적으로 playersOf(teamId)도 매 호출마다 329명 전체를 filter()하던 것을 팀별
//   결과 캐시로 바꿨다(lib/data/players.ts).
//
// 위 세 가지를 모두 적용하지 않으면 23,328회 전수 평가가 500ms 예산을 크게 초과한다
// (직접 벤치마크로 단계별 기여도를 확인했다: 8.4s → poisson 최적화 후 ~2.3s →
// lineStrengths/buildCtx 호이스팅 후 실측값은 self-review 리포트 참고).
//
// winDelta ≥ 0 보장: 탐색 후보는 모두 autoPlace가 만든 라인업에서 나오므로, 호출자가
// 직접 짠 수동 라인업(me.lineup/me.roles)이 그 어떤 autoPlace 후보보다 강할 수도 있다.
// 그런 역전을 막기 위해 me를 있는 그대로(lineup/roles/instructions 전부 원본) 마지막
// 후보로 함께 평가한다(evaluated에도 포함, 총 26,245개). 이 "현재 설정" 후보가 이기면
// 그대로 반환한다(winDelta = 0, topFactors는 현재 설정의 rules에서 계산) — 즉 recommend()
// 는 호출자가 이미 가진 설정보다 절대 더 나쁜 winProb을 추천하지 않는다.
export function recommend(me: SideSetup, opp: SideSetup, venueId: string): Recommendation {
  const start = now();

  const current = winProbability(me, opp, venueId);

  const venue = venueById(venueId);
  if (!venue) throw new Error(`unknown venue: ${venueId}`);
  const meTeam = teamById(me.teamId);
  const oppTeam = teamById(opp.teamId);
  if (!meTeam) throw new Error(`unknown team: ${me.teamId}`);
  if (!oppTeam) throw new Error(`unknown team: ${opp.teamId}`);
  const h2hMe = h2hOf(me.teamId, opp.teamId);
  const h2hOpp = h2hOf(opp.teamId, me.teamId);

  // 상대 라인 강도: opp 라인업(고정) + me.special(맨마킹, 탐색 내내 불변)에만 의존 → 1회 계산
  const oppLines = lineStrengths(opp, me);

  let evaluated = 0;
  let bestWin = -Infinity;
  let bestInstructions: TeamInstructions | undefined;
  let bestLineup: Record<string, string> | undefined;
  let bestRoles: Record<string, RoleId> | undefined;
  let bestRules: AppliedRule[] = [];

  for (const formation of FORMATION_IDS) {
    const { lineup, roles } = autoPlace(me.teamId, formation);

    // instructions는 formation 필드만 의미가 있다(lineStrengths/buildCtx의 파생값은
    // side.instructions.formation으로 슬롯을 조회할 뿐 전술 파라미터는 보지 않는다).
    // 나머지 필드는 콤보 루프에서 매번 실제 값으로 교체되므로 여기서는 placeholder다.
    const candidateBase: SideSetup = {
      teamId: me.teamId,
      lineup,
      roles,
      special: me.special,
      instructions: { ...me.instructions, formation },
    };
    const meLines = lineStrengths(candidateBase, opp);

    // RuleCtx의 라인업 파생값(meAttPaceAvg 등)은 formation당 1회만 계산해 재사용한다.
    // ctxMeBase: "나" 관점(내 instructions만 콤보마다 교체) / ctxOppBase: "상대" 관점
    // (상대는 자기 instructions 고정, 내 instructions만 콤보마다 교체).
    const ctxMeBase = buildCtx(candidateBase, opp, venue, meTeam, oppTeam, h2hMe);
    const ctxOppBase = buildCtx(opp, candidateBase, venue, oppTeam, meTeam, h2hOpp);

    for (const line of LINE_OPTS) {
      for (const attacking of ATTACKING_OPTS) {
        for (const tempo of TEMPO_OPTS) {
          for (const buildup of BUILDUP_OPTS) {
            for (const lineSpacing of LINE_SPACING_OPTS) {
              for (const possession of POSSESSION_OPTS) {
                for (const transitionSpeed of TRANSITION_SPEED_OPTS) {
                  for (const offsideTrap of OFFSIDE_TRAP_OPTS) {
                    // pressing/focus/width/marking은 탐색 대상에서 제외한다(파일 상단 큰
                    // 주석 참고) — 호출자가 이미 설정한 값을 그대로 유지해, 이 네 값은
                    // "현재 설정" 후보(아래 evaluated++ 블록)를 통해서만 승률에 반영된다.
                    const instructions: TeamInstructions = {
                      formation,
                      pressing: me.instructions.pressing,
                      line,
                      attacking,
                      tempo,
                      buildup,
                      focus: me.instructions.focus,
                      width: me.instructions.width,
                      marking: me.instructions.marking,
                      offsideTrap,
                      lineSpacing,
                      possession,
                      transitionSpeed,
                    };

                    const modMe = evaluateModifiers({
                      ...ctxMeBase,
                      me: { ...ctxMeBase.me, instructions },
                    });
                    const modOpp = evaluateModifiers({
                      ...ctxOppBase,
                      opp: { ...ctxOppBase.opp, instructions },
                    });

                    const { lambdaMe, lambdaOpp } = lambdasFromParts(
                      meLines,
                      oppLines,
                      modMe,
                      modOpp,
                      meTeam,
                      oppTeam,
                      // rewrite 모드에선 실제 퇴장이 반영된 10인 라인업으로 작전실에
                      // 들어올 수 있다. 후보는 autoPlace(11인)지만 상대는 그대로이므로
                      // 양쪽 인원을 명시해 수적 상황을 추천에도 반영한다.
                      onPitchCount(candidateBase),
                      onPitchCount(opp)
                    );
                    const { win } = outcomeProbs(lambdaMe, lambdaOpp);
                    evaluated++;

                    if (win > bestWin) {
                      bestWin = win;
                      bestInstructions = instructions;
                      bestLineup = lineup;
                      bestRoles = roles;
                      bestRules = modMe.rules;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // "현재 설정" 후보: 호출자가 이미 가진 me.lineup/me.roles/me.instructions을 있는 그대로
  // 평가한다. `current`는 함수 시작부에서 winProbability(me, opp, venueId)로 이미 계산해
  // 두었으므로 재계산 없이 재사용한다. 동점(>=)이면 현재 설정을 채택해 winDelta가 정확히
  // 0이 되도록 한다.
  evaluated++;
  if (current.win >= bestWin) {
    bestWin = current.win;
    bestInstructions = me.instructions;
    bestLineup = me.lineup;
    bestRoles = me.roles;
    bestRules = current.rules;
  }

  const topFactors = [...bestRules]
    .sort(
      (a, b) =>
        Math.abs(b.deltaAttack) +
        Math.abs(b.deltaDefense) -
        (Math.abs(a.deltaAttack) + Math.abs(a.deltaDefense))
    )
    .slice(0, 3);

  const elapsedMs = now() - start;

  return {
    instructions: bestInstructions!,
    lineup: bestLineup!,
    roles: bestRoles!,
    winDelta: bestWin - current.win,
    winProb: bestWin,
    topFactors,
    evaluated,
    elapsedMs,
  };
}

// 경기 종료 후 전술 평가·보완 코멘트 생성 (순수 로직).
// 전부 엔진 데이터 근거: 발동 규칙(applyModifiers), 경기 이벤트, 체력 플래그.
// (스펙 §7: docs/superpowers/specs/2026-07-18-match-highlight-jump-design.md)

import type { MatchState } from "@/lib/engine/match";
import type { AppliedRule, ModifierResult } from "@/lib/engine/modifiers";

export interface TacticsReview {
  worked: AppliedRule[]; // 종합효과(공격+수비) 양수 — 통한 전술
  hurt: AppliedRule[]; // 음수 — 발목 잡은 부분
  /**
   * 내 감점 규칙이 하나도 없는데 이기지도 못한 경우, 상대 쪽에서 우위였던 규칙.
   *
   * 이게 없으면 "졌는데 전술 감점 요인은 없었어요"라는 모순된 화면이 나온다. 진 이유가
   * 내 전술의 실수가 아니라 (a) 상대 전술의 우위이거나 (b) 순수 결정력 차이일 수 있는데,
   * 이전 구현은 내 발동 규칙만 봐서 두 경우를 구분하지 못하고 똑같이 침묵했다.
   */
  oppEdge: AppliedRule[];
  tips: string[]; // 다음 경기 보완 제안 (최대 4, 최소 1)
}

const impact = (r: AppliedRule) => r.deltaAttack + r.deltaDefense;

export function buildTacticsReview(
  match: MatchState,
  meMod: ModifierResult,
  oppMod: ModifierResult
): TacticsReview {
  const worked = meMod.rules.filter((r) => impact(r) > 0).sort((a, b) => impact(b) - impact(a));
  const hurt = meMod.rules.filter((r) => impact(r) < 0).sort((a, b) => impact(a) - impact(b));

  // 이기지 못했고 내 감점도 없을 때만 상대 우위를 꺼낸다(이겼으면 굳이 변명하지 않는다).
  const won = match.scoreMe > match.scoreOpp;
  const oppEdge =
    !won && hurt.length === 0
      ? oppMod.rules
          .filter((r) => impact(r) > 0)
          .sort((a, b) => impact(b) - impact(a))
          .slice(0, 3)
      : [];

  const tips: string[] = [];

  const crises = match.events.filter((e) => e.type === "crisis").length;
  if (crises >= 2) {
    tips.push(
      `위기 국면이 ${crises}번 왔어요. 흐름이 넘어갈 땐 수비 라인을 한 칸 내리거나 수비형 역할 전환으로 끊어주세요.`
    );
  }

  const shotsMe = match.events.filter((e) => e.type === "shot" && e.side === "me").length;
  const shotsOpp = match.events.filter((e) => e.type === "shot" && e.side === "opp").length;
  if (shotsOpp > shotsMe) {
    tips.push(
      `슛 ${shotsMe}:${shotsOpp} 열세, 공격 성향·템포를 한 단계 올리거나 폭을 넓혀 기회 생산을 늘려보세요.`
    );
  }

  if (match.scoreOpp >= 2) {
    const oppTop = oppMod.rules
      .filter((r) => impact(r) > 0)
      .sort((a, b) => impact(b) - impact(a))[0];
    tips.push(
      oppTop
        ? `${match.scoreOpp}실점, 상대의 "${oppTop.textKo}" 강점이 살아있었어요. 맨마킹이나 라인 조정으로 억제해 보세요.`
        : `${match.scoreOpp}실점, 수비 라인과 GK 앞 보호(수비형 미드필더 역할)를 점검해 보세요.`
    );
  }

  const f = meMod.staminaFlags;
  if (f.heat && (f.highPress || f.highTempo)) {
    tips.push(
      "폭염 경기장에서 고압박·고템포는 후반 체력을 깎아요. 강도를 한 단계 낮추거나 60분대 교체를 준비하세요."
    );
  } else if (f.altitude) {
    tips.push("고지대는 전원 체력 소모가 커요. 템포를 낮추고 교체 카드를 아끼지 마세요.");
  }

  if (hurt.length > 0 && tips.length < 4) {
    tips.push(`감점 규칙 ${hurt.length}건이 발동 중이었어요. "발목 잡은 부분"의 지시부터 조정해 보세요.`);
  }

  if (tips.length === 0) {
    if (won) {
      tips.push("감점 요인 없이 깔끔한 운영이었어요. 이 전술 틀을 유지하며 상대별 미세 조정만 하면 됩니다.");
    } else if (oppEdge.length > 0) {
      tips.push(
        `내 전술에는 감점이 없었어요. 대신 상대의 "${oppEdge[0].textKo}"가 살아 있었습니다. 이걸 지우는 쪽으로 지시를 맞춰보세요.`
      );
    } else {
      tips.push(
        "양 팀 모두 전술 보정이 걸리지 않은 순수 결정력 싸움이었어요. 슈팅·중요국면 능력이 좋은 선수에게 공격 역할을 몰아줘 보세요."
      );
    }
  }

  return { worked, hurt, oppEdge, tips: tips.slice(0, 4) };
}

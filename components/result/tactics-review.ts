// 경기 종료 후 전술 평가·보완 코멘트 생성 (순수 로직).
// 전부 엔진 데이터 근거: 발동 규칙(applyModifiers), 경기 이벤트, 체력 플래그.
// (스펙 §7: docs/superpowers/specs/2026-07-18-match-highlight-jump-design.md)

import type { MatchState } from "@/lib/engine/match";
import type { AppliedRule, ModifierResult } from "@/lib/engine/modifiers";

export interface TacticsReview {
  worked: AppliedRule[]; // 종합효과(공격+수비) 양수 — 통한 전술
  hurt: AppliedRule[]; // 음수 — 발목 잡은 부분
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
    tips.push(
      match.scoreMe > match.scoreOpp
        ? "감점 요인 없이 깔끔한 운영이었어요. 이 전술 틀을 유지하며 상대별 미세 조정만 하면 됩니다."
        : "전술 감점 요인은 없었어요. 결정력 싸움이었습니다. 슈팅·중요국면 능력이 좋은 선수에게 공격 역할을 몰아줘 보세요."
    );
  }

  return { worked, hurt, tips: tips.slice(0, 4) };
}

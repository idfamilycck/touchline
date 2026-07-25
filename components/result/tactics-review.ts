// 경기 종료 후 전술 평가·보완 코멘트 생성 (순수 로직).
// 전부 엔진 데이터 근거: 발동 규칙(applyModifiers), 경기 이벤트, 체력 플래그.
// (스펙 §7: docs/superpowers/specs/2026-07-18-match-highlight-jump-design.md)

import type { MatchState } from "@/lib/engine/match";
import type { AppliedRule, ModifierResult } from "@/lib/engine/modifiers";
import { matchStats, interventionImpacts } from "@/lib/engine/match-stats";
import { LATE_MINUTE, type OppScouting } from "@/lib/wc2026/scouting";

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
  tips: string[]; // 이번 경기에서 짚어볼 점 (회고 · 최대 4, 최소 1)
  /**
   * 경기 전 스카우팅과 실제 결과의 대조.
   *
   * 작전실에서 "상대는 대회 실점의 절반을 75분 이후에 내줬다"고 알려주고 끝내면
   * 그 정보가 판단에 쓸모 있었는지 확인할 길이 없다. 여기서 같은 실측 프로필을 결과와
   * 맞대어 "경고가 맞았는가 / 약점을 파고들었는가"를 문장으로 닫는다.
   */
  scoutingRetro: ScoutRetroLine[];
}

export interface ScoutRetroLine {
  id: string;
  /**
   * 이번 경기에서 그 항목이 우리에게 유리하게 끝났는가.
   *
   * "스카우팅이 맞았는가"가 아니라 "우리에게 좋았는가"로 잡는다. 둘은 다르다 —
   * "막판 실점 취약"이라는 예측이 적중하면 그건 우리에게 좋은 일이지만,
   * "화력형"이 적중하면 나쁜 일이다. 적중 여부로 색을 칠하면 두 경우가 같은
   * 빨강이 되어 화면이 거짓말을 한다.
   */
  favorable: boolean;
  textKo: string;
}

const impact = (r: AppliedRule) => r.deltaAttack + r.deltaDefense;

// 이 값 미만의 효과는 "통한 전술"로도 "발목 잡은 부분"으로도 부르지 않는다.
// 세부 지시의 스쿼드 적합도 규칙은 적합도가 중립에 가까우면 ±0.3%p 수준으로 떨어지는데,
// 그걸 감점으로 분류하면 "이 스쿼드에는 무난합니다"라는 문구가 빨간 카드에 실리는
// 모순이 생긴다. 리포트는 판단이 서는 것만 말해야 한다.
const MEANINGFUL = 0.005;

// "상대가 앞선 부분"에 실을 상대 규칙의 최소 효과. 내 카드보다 문턱을 높인다:
// 상대 스쿼드에 "무난한"(효과가 미미한) 규칙까지 끌어오면 "짧은 패스 전개, 이 스쿼드에는
// 무난합니다" 같은 중립 문구가 빨간 "상대가 앞선 부분" 카드에 실려 제목과 모순된다.
// 상대가 확실히 앞선 것(≥1.5%p)만 담는다.
const OPP_EDGE_MIN = 0.015;

// ── 스카우팅 대조 ────────────────────────────────────────────────────────────
// 경기 전 브리핑에 실린 성향 태그(전부 실제 대회 기록에서 나온 것)를 이번 경기의
// 실제 전개와 맞대어 본다. 각 줄은 "무엇을 알고 있었는가 -> 실제로 어떻게 됐는가"
// 형태라, 감독의 판단이 유효했는지 스스로 검증할 수 있다.
export function buildScoutingRetro(match: MatchState, scout?: OppScouting): ScoutRetroLine[] {
  if (!scout) return [];

  const goals = match.events.filter((e) => e.type === "goal");
  const myGoals = goals.filter((e) => e.side === "me");
  const oppGoals = goals.filter((e) => e.side === "opp");
  const myLateGoals = myGoals.filter((e) => e.minute >= LATE_MINUTE);
  const oppSecondHalfGoals = oppGoals.filter((e) => e.minute > 45);

  const trait = (id: string) => scout.traits.find((t) => t.id === id);
  const out: ScoutRetroLine[] = [];

  const lateCollapse = trait("late_collapse");
  if (lateCollapse) {
    out.push(
      myLateGoals.length > 0
        ? {
            id: "late_collapse",
            favorable: true,
            textKo: `${scout.nameKo}는 대회 실점의 상당수를 ${LATE_MINUTE}분 이후에 내줬습니다(${lateCollapse.evidenceKo}). 이번에도 ${myLateGoals
              .map((g) => `${g.minute}분`)
              .join(", ")}에 그 구간을 파고들었어요.`,
          }
        : {
            id: "late_collapse",
            favorable: false,
            textKo: `${lateCollapse.evidenceKo} — 상대의 가장 약한 시간대였는데 이번엔 그 구간에서 득점하지 못했습니다. 막판에 교체와 템포를 몰아줬다면 달랐을 지점이에요.`,
          }
    );
  }

  const firepower = trait("firepower");
  if (firepower) {
    out.push(
      match.scoreOpp >= 2
        ? {
            id: "firepower",
            favorable: false,
            textKo: `경고했던 화력이 살아났습니다(${firepower.evidenceKo}). ${match.scoreOpp}실점 — 수비 라인을 더 내리거나 맨마킹으로 묶었어야 했어요.`,
          }
        : {
            id: "firepower",
            favorable: true,
            textKo: `${firepower.evidenceKo}인 상대를 ${match.scoreOpp}실점으로 막았습니다. 수비 조직이 통했어요.`,
          }
    );
  }

  const secondHalf = trait("second_half");
  if (secondHalf) {
    out.push(
      oppSecondHalfGoals.length > 0
        ? {
            id: "second_half",
            favorable: false,
            textKo: `후반에 강한 팀이라는 경고대로(${secondHalf.evidenceKo}) 후반에 ${oppSecondHalfGoals.length}실점했습니다.`,
          }
        : {
            id: "second_half",
            favorable: true,
            textKo: `${secondHalf.evidenceKo}인 상대의 후반을 무실점으로 넘겼습니다. 체력 관리가 통했어요.`,
          }
    );
  }

  const leaky = trait("leaky");
  if (leaky) {
    out.push(
      match.scoreMe >= 2
        ? {
            id: "leaky",
            favorable: true,
            textKo: `수비가 흔들리는 상대(${leaky.evidenceKo})를 상대로 ${match.scoreMe}골을 넣었습니다. 약점을 제대로 공략했어요.`,
          }
        : {
            id: "leaky",
            favorable: false,
            textKo: `${leaky.evidenceKo}인 상대인데 ${match.scoreMe}골에 그쳤습니다. 더 공격적으로 나갔어야 할 상대였어요.`,
          }
    );
  }

  const solid = trait("solid") ?? trait("cleansheet");
  if (solid && !leaky) {
    out.push(
      match.scoreMe > 0
        ? {
            id: "solid",
            favorable: true,
            textKo: `${solid.evidenceKo}인 단단한 상대의 골문을 열었습니다(${match.scoreMe}골).`,
          }
        : {
            id: "solid",
            favorable: false,
            textKo: `${solid.evidenceKo} — 원래 뚫기 어려운 상대였고 이번에도 득점하지 못했습니다. 공격 가담을 더 늘려볼 만했어요.`,
          }
    );
  }

  // 4줄이 넘어가면 회고가 아니라 목록이 된다.
  return out.slice(0, 4);
}

export function buildTacticsReview(
  match: MatchState,
  meMod: ModifierResult,
  oppMod: ModifierResult,
  scout?: OppScouting
): TacticsReview {
  const worked = meMod.rules
    .filter((r) => impact(r) >= MEANINGFUL)
    .sort((a, b) => impact(b) - impact(a));
  const hurt = meMod.rules
    .filter((r) => impact(r) <= -MEANINGFUL)
    .sort((a, b) => impact(a) - impact(b));

  // 이기지 못했고 내 감점도 없을 때만 상대 우위를 꺼낸다(이겼으면 굳이 변명하지 않는다).
  const won = match.scoreMe > match.scoreOpp;
  // 내가 이미 갖고 있던 강점은 "상대가 앞선 부분"이 아니다. 양 팀이 같은 기본 세팅이면
  // 같은 규칙이 양쪽에 발동해, 초록 카드와 빨강 카드에 똑같은 문구가 나란히 실렸다.
  // 화면상 고장으로 보일 뿐 아니라 "상대가 앞섰다"는 말 자체가 사실이 아니다.
  const myRuleIds = new Set(worked.map((r) => r.id));
  const oppEdge =
    !won && hurt.length === 0
      ? oppMod.rules
          .filter((r) => impact(r) >= OPP_EDGE_MIN && !myRuleIds.has(r.id))
          .sort((a, b) => impact(b) - impact(a))
          .slice(0, 3)
      : [];

  const tips: string[] = [];

  // ── 경기 지표 기반 진단 ──────────────────────────────────────────────
  // 규칙 발동 여부만 보면 "전술은 문제없었는데 왜 졌는지" 설명이 비는 경우가 많다.
  // 실제 기록(결정력·유효슈팅·수비 노출)을 함께 읽어 원인을 좁힌다.
  const s = matchStats(match);

  // 결정력: 유효슈팅을 충분히 만들고도 못 넣었는가.
  if (s.me.onTarget >= 4 && s.me.goals <= 1) {
    tips.push(
      `유효슈팅 ${s.me.onTarget}개로 ${s.me.goals}골. 기회는 만들었지만 마무리가 아쉬웠어요. 슈팅·침착성이 높은 선수를 최전방에 두거나 공격 성향을 한 단계 낮춰 더 좋은 자리에서 쏘게 해보세요.`
    );
  }
  // 기회 생산: 찬스가 슈팅으로 이어지지 않았는가.
  if (s.me.chances >= 6 && s.me.shots <= Math.floor(s.me.chances / 3)) {
    tips.push(
      `찬스 ${s.me.chances}회 중 슈팅은 ${s.me.shots}회에 그쳤어요. 템포를 올리거나 침투형 역할을 늘려 마지막 패스가 한 번 더 나오게 해보세요.`
    );
  }
  // 수비 노출: 상대에게 유효슈팅을 많이 내줬는가.
  if (s.opp.onTarget >= 5) {
    tips.push(
      `상대 유효슈팅을 ${s.opp.onTarget}개나 허용했어요. 수비 라인을 내리거나 수비형 미드필더 역할로 GK 앞 공간을 덮어보세요.`
    );
  }

  // ── 개입 효과 ────────────────────────────────────────────────────────
  // 이 앱에서 가장 감독 리포트다운 지표인데 지금까지 어디에서도 쓰이지 않았다.
  const impacts = interventionImpacts(match.interventions ?? [], match.probTimeline ?? []);
  if (impacts.length > 0) {
    const best = [...impacts].sort((a, b) => b.deltaPct - a.deltaPct)[0];
    const worst = [...impacts].sort((a, b) => a.deltaPct - b.deltaPct)[0];
    if (best.deltaPct >= 3) {
      tips.push(
        `${best.minute}분 개입 이후 승률이 ${best.deltaPct}%p 올랐어요. 이 조정이 흐름을 바꿨습니다.`
      );
    } else if (worst.deltaPct <= -3) {
      tips.push(
        `${worst.minute}분 개입 이후 승률이 ${Math.abs(worst.deltaPct)}%p 떨어졌어요. 같은 상황이 오면 다른 카드를 써보세요.`
      );
    }
  } else if (match.scoreMe <= match.scoreOpp) {
    tips.push(
      "경기 중 개입이 한 번도 없었어요. 위기 알림이 뜰 때 [작전 변경]으로 라인이나 성향을 조정하면 흐름을 되돌릴 수 있습니다."
    );
  }

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

  // 상한 6: "너무 부족하다"는 지적을 받아 4에서 올렸다. 그 이상은 리포트가 아니라
  // 목록이 되어 오히려 안 읽힌다.
  return {
    worked,
    hurt,
    oppEdge,
    tips: tips.slice(0, 6),
    scoutingRetro: buildScoutingRetro(match, scout),
  };
}

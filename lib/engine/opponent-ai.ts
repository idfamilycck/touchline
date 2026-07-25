// 상대 감독의 인게임 대응.
//
// 왜 필요한가: 이 엔진의 개입(Intervention)은 side가 "me"로 고정돼 있어, 상대는
// 킥오프 전술 그대로 90분을 버텼다. 두 골 뒤지고 있어도 라인을 올리지 않고, 한 골
// 앞서도 잠그지 않았다. 그래서 유저의 모든 판단이 "가만히 있는 표적"을 상대로 이뤄져
// 감독 시뮬레이션의 핵심 긴장 — 내가 손을 쓰면 상대도 손을 쓴다 — 이 빠져 있었다.
//
// 설계 원칙 세 가지:
//  1) RNG를 소비하지 않는다. 카운터팩추얼("개입이 없었다면?")은 같은 시드로 재생하며
//     RNG 스트림이 갈리지 않아야 하고, 상대 대응은 스코어·시간의 결정론적 함수여야
//     "그때 상대가 왜 그렇게 했는지"를 리포트에서 설명할 수 있다.
//  2) 각 대응은 경기당 한 번만 발동한다(id로 중복 방지). 조건이 매 분 참인 규칙을
//     매 분 재적용하면 이벤트 피드가 도배되고 λ가 무의미하게 재계산된다.
//  3) 우선순위 순으로 첫 번째 매칭만 적용한다. "2골 뒤짐"과 "1골 뒤짐"이 동시에
//     참일 수는 없지만, 시간 조건이 겹치는 규칙들 사이에서 가장 급한 것이 이긴다.

import type { TeamInstructions } from "@/lib/types";

export interface OpponentReactionCtx {
  minute: number;
  /** 상대 팀 기준 득점차 (양수면 상대가 앞서고 있다). */
  oppLead: number;
  instructions: TeamInstructions;
  /** 이미 발동한 대응 id 목록. */
  applied: string[];
}

export interface OpponentReaction {
  id: string;
  /** 적용 후 상대 지시. 원본을 변형하지 않고 새 객체를 만든다. */
  instructions: TeamInstructions;
  /** 중계·리포트에 노출할 문구(우리 시점 서술). */
  textKo: string;
}

interface ReactionDef {
  id: string;
  when: (ctx: OpponentReactionCtx) => boolean;
  apply: (prev: TeamInstructions) => TeamInstructions;
  textKo: string;
}

// 뒤지고 있을 때: 전방으로 무게를 옮기고 라인을 올린다 — 대신 배후가 열린다.
// (우리 쪽 counter_style·fast_transition_exploit 규칙이 상대의 line=3을 조건으로
//  잡고 있어, 이 대응은 유저에게 "역습 카드를 쓸 창"으로도 작동한다.)
const CHASE: (prev: TeamInstructions) => TeamInstructions = (prev) => ({
  ...prev,
  attacking: 3,
  line: 3,
  tempo: 3,
  possession: 3,
  transitionSpeed: 3,
});

// 앞서고 있을 때: 라인을 내리고 간격을 압축한다 — 공격 전개를 그만큼 포기한다.
const PARK: (prev: TeamInstructions) => TeamInstructions = (prev) => ({
  ...prev,
  attacking: 1,
  line: 1,
  tempo: 2,
  lineSpacing: 1,
  transitionSpeed: 1,
});

export const OPPONENT_REACTION_DEFS: ReactionDef[] = [
  {
    id: "opp_all_out",
    // 두 골 이상 뒤진 채 60분을 넘기면 계산을 접고 총공세로 나온다.
    when: (c) => c.minute >= 60 && c.oppLead <= -2,
    apply: CHASE,
    textKo: "상대 감독이 총공세로 전환합니다 — 라인을 끌어올리고 전원을 앞으로 보냅니다.",
  },
  {
    id: "opp_chase",
    // 한 골 뒤진 채 70분을 넘기면 공세를 강화한다.
    when: (c) => c.minute >= 70 && c.oppLead === -1,
    apply: (prev) => ({ ...prev, attacking: 3, tempo: 3, transitionSpeed: 3 }),
    textKo: "상대 감독이 공격 성향을 끌어올립니다 — 동점을 노리고 템포를 높입니다.",
  },
  {
    id: "opp_late_gamble",
    // 무승부인 채 80분을 넘기면 승부수를 던진다. 녹아웃이면 어차피 연장·승부차기라
    // 손해가 크지 않고, 조별리그에서도 승점 3이 1보다 크므로 합리적인 선택이다.
    when: (c) => c.minute >= 80 && c.oppLead === 0,
    apply: (prev) => ({ ...prev, attacking: 3, tempo: 3, possession: 3 }),
    textKo: "상대 감독이 막판 승부수를 던집니다 — 무승부로 끝낼 생각이 없습니다.",
  },
  {
    id: "opp_manage_lead",
    // 두 골 이상 앞선 채 65분을 넘기면 경기를 관리한다.
    when: (c) => c.minute >= 65 && c.oppLead >= 2,
    apply: (prev) => ({ ...prev, attacking: 1, tempo: 1, lineSpacing: 1 }),
    textKo: "상대 감독이 경기를 관리하기 시작합니다 — 템포를 떨어뜨립니다.",
  },
  {
    id: "opp_park_bus",
    // 한 골 앞선 채 75분을 넘기면 잠근다.
    when: (c) => c.minute >= 75 && c.oppLead === 1,
    apply: PARK,
    textKo: "상대 감독이 라인을 내려 잠그기에 들어갑니다 — 뒷공간이 좁아집니다.",
  },
];

/**
 * 이번 분에 상대가 취할 대응. 없으면 null.
 *
 * 호출자(simulateMinute)는 반환된 instructions를 상대 셋업에 얹고 λ를 즉시
 * 재계산해야 한다 — 우리 개입과 동일한 취급이다.
 */
export function nextOpponentReaction(ctx: OpponentReactionCtx): OpponentReaction | null {
  for (const def of OPPONENT_REACTION_DEFS) {
    if (ctx.applied.includes(def.id)) continue;
    if (!def.when(ctx)) continue;
    const instructions = def.apply(ctx.instructions);
    return { id: def.id, instructions, textKo: def.textKo };
  }
  return null;
}

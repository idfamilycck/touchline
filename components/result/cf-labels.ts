// 복기(result) 화면 공용 라벨/헬퍼 — 순수 데이터 모듈, 스토어 비의존.
// 카운터팩추얼 델타를 비축구팬도 이해할 친절한 한국어 한 문장/요약으로 변환한다.
// 색 규칙: 유리(승률↑)=초록, 불리(승률↓)=빨강, 항상 수치(%p)를 병기한다.

import type { Intervention } from "@/lib/engine/match";
import type { CfDelta } from "@/lib/engine/counterfactual";

// 개입 종류를 한국어로. 교체와 전술 변경이 한 개입에 함께 들어갈 수 있다.
export function interventionTypeKo(iv: Intervention): string {
  const hasSub = (iv.subs?.length ?? 0) > 0;
  const hasTactic = Boolean(iv.instructions || iv.roles || iv.special);
  if (hasSub && hasTactic) return "교체·전술 변경";
  if (hasSub) return "선수 교체";
  return "전술 변경";
}

// 승률 델타(0~1 단위)를 부호 있는 %p 문자열로. 음수는 유니코드 마이너스(−)로 표기한다.
export function signedPp(delta: number): string {
  const pp = Math.round(delta * 100);
  const sign = pp > 0 ? "+" : pp < 0 ? "−" : "±";
  return `${sign}${Math.abs(pp)}%p`;
}

export interface HeroLine {
  text: string;
  // tone: 유리(초록)/불리(빨강)/중립(무개입). 색과 아이콘을 결정한다.
  tone: "gain" | "danger" | "neutral";
}

// 헤드라인 결론 한 문장: 개입이 있으면 |델타| 최대 개입 기준, 없으면 무개입 문구.
export function heroLine(deltas: CfDelta[]): HeroLine {
  if (deltas.length === 0) {
    return { text: "무개입 완주, 데이터를 믿으셨군요", tone: "neutral" };
  }
  const top = [...deltas].sort((a, b) => Math.abs(b.probDelta) - Math.abs(a.probDelta))[0];
  const pp = Math.round(top.probDelta * 100);
  const minute = top.intervention.minute;
  const type = interventionTypeKo(top.intervention);
  if (pp >= 0) {
    return { text: `당신의 ${minute}' ${type}가 승률을 +${pp}%p 바꿨습니다`, tone: "gain" };
  }
  return { text: `${minute}' ${type}, −${Math.abs(pp)}%p 아쉬운 판단이었어요`, tone: "danger" };
}

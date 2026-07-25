// 대회 단계(finishRound)의 표시 이름과 색 등급.
//
// 48개 팀 카드가 전부 같은 회색 태그를 달고 있으면 "국가 목록"으로 읽힌다. 실제로는
// 각 팀이 2026 월드컵에서 어디까지 갔는지가 이미 데이터에 있으므로, 그 성적을 색의
// 세기로 인코딩해 훑는 것만으로 대회 구조가 보이게 한다.
//
// 색 규칙: 트로피 골드 한 가지 색의 세기 단계만 쓴다(금/은/동 3색을 도입하지 않는다).
// 골드는 대회 단계 시맨틱 전용이며 버튼 같은 상호작용 요소에는 절대 쓰지 않는다.

export type StageTone = "gold" | "gold-soft" | "neutral" | "dim";

export interface StageStyle {
  labelKo: string;
  tone: StageTone;
}

/** finishRound 코드 -> 한글 라벨 + 색 등급. */
export const STAGE: Record<string, StageStyle> = {
  // 결승전이 데이터에 들어오기 전에는 두 결승 진출팀을 구분할 수 없어 둘 다 "결승 진출"
  // 이었다. 이제 결승 결과가 있으므로 우승과 준우승을 나눈다.
  champion: { labelKo: "우승", tone: "gold" },
  final: { labelKo: "준우승", tone: "gold" },
  third: { labelKo: "4강", tone: "gold-soft" },
  qf: { labelKo: "8강", tone: "neutral" },
  r16: { labelKo: "16강", tone: "neutral" },
  r32: { labelKo: "32강", tone: "dim" },
  group: { labelKo: "조별리그", tone: "dim" },
};

export function stageOf(finishRound: string): StageStyle {
  return STAGE[finishRound] ?? { labelKo: finishRound, tone: "dim" };
}

/** 한글 라벨로부터 색 등급을 되찾는다(Team.styleTags에는 라벨 문자열만 실려 있다). */
export function toneOfLabel(labelKo: string): StageTone {
  for (const s of Object.values(STAGE)) {
    if (s.labelKo === labelKo) return s.tone;
  }
  return "dim";
}

/** 태그 칩에 그대로 붙이는 Tailwind 클래스. */
export const STAGE_CHIP: Record<StageTone, string> = {
  gold: "border border-gold/40 bg-gold/15 text-gold font-bold",
  "gold-soft": "border border-gold/25 bg-gold/8 text-gold/85",
  neutral: "border border-line bg-surface-2 text-ink/75",
  dim: "border border-line/60 bg-surface-2/60 text-dim",
};

// ── 라운드(경기가 속한 단계) 톤 ──────────────────────────────────────────────
// 위의 STAGE는 "팀이 어디까지 갔는가"이고, 이건 "이 경기가 몇 강인가"다.
// 대진표 컬럼과 경기 브라우저 필터가 같은 램프를 써야 결승으로 갈수록 진해지는
// 시각적 위계가 두 화면에서 어긋나지 않는다.
export const ROUND_TONE: Record<string, StageTone> = {
  final: "gold",
  sf: "gold-soft",
  third: "gold-soft",
  qf: "neutral",
  r16: "neutral",
  r32: "dim",
  group: "dim",
};

export function roundTone(round: string): StageTone {
  return ROUND_TONE[round] ?? "dim";
}

/** 라운드 라벨 텍스트 색. */
export const ROUND_LABEL_CLASS: Record<StageTone, string> = {
  gold: "text-gold",
  "gold-soft": "text-gold/75",
  neutral: "text-ink/70",
  dim: "text-dim",
};

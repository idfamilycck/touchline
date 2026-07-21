// 대륙(축구 연맹)별 분류.
//
// 48개국을 한 화면에 균일하게 늘어놓으면 원하는 팀을 찾기 어렵다. 실제 월드컵도
// 대륙별 예선으로 나뉘므로, 팀 선택을 대륙 그룹으로 묶어 훑는 범위를 좁힌다.
//
// 코드 -> 연맹 매핑은 data/wc2026/teams.json의 48개 코드 전체를 손으로 채웠다.

export type Confederation = "UEFA" | "CONMEBOL" | "CONCACAF" | "CAF" | "AFC" | "OFC";

/** 연맹 표시 이름(한글)과 정렬 순서. */
export const CONFEDERATIONS: Array<{ key: Confederation; labelKo: string }> = [
  { key: "UEFA", labelKo: "유럽" },
  { key: "CONMEBOL", labelKo: "남미" },
  { key: "CONCACAF", labelKo: "북중미" },
  { key: "CAF", labelKo: "아프리카" },
  { key: "AFC", labelKo: "아시아" },
  { key: "OFC", labelKo: "오세아니아" },
];

const BY_CODE: Record<string, Confederation> = {
  // UEFA (유럽)
  AUT: "UEFA", BEL: "UEFA", BIH: "UEFA", CRO: "UEFA", CZE: "UEFA", ENG: "UEFA",
  ESP: "UEFA", FRA: "UEFA", GER: "UEFA", NED: "UEFA", NOR: "UEFA", POR: "UEFA",
  SCO: "UEFA", SUI: "UEFA", SWE: "UEFA", TUR: "UEFA",
  // CONMEBOL (남미)
  ARG: "CONMEBOL", BRA: "CONMEBOL", COL: "CONMEBOL", ECU: "CONMEBOL",
  PAR: "CONMEBOL", URU: "CONMEBOL",
  // CONCACAF (북중미·카리브)
  CAN: "CONCACAF", CUW: "CONCACAF", HAI: "CONCACAF", MEX: "CONCACAF",
  PAN: "CONCACAF", USA: "CONCACAF",
  // CAF (아프리카)
  ALG: "CAF", CIV: "CAF", COD: "CAF", CPV: "CAF", EGY: "CAF", GHA: "CAF",
  MAR: "CAF", RSA: "CAF", SEN: "CAF", TUN: "CAF",
  // AFC (아시아)
  AUS: "AFC", IRN: "AFC", IRQ: "AFC", JOR: "AFC", JPN: "AFC", KOR: "AFC",
  KSA: "AFC", QAT: "AFC", UZB: "AFC",
  // OFC (오세아니아)
  NZL: "OFC",
};

export function confederationOf(code: string): Confederation {
  return BY_CODE[code.toUpperCase()] ?? "UEFA";
}

const LABEL: Record<Confederation, string> = Object.fromEntries(
  CONFEDERATIONS.map((c) => [c.key, c.labelKo])
) as Record<Confederation, string>;

export function confederationLabel(key: Confederation): string {
  return LABEL[key];
}

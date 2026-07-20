// 볼 점유 모델(순수 함수).
//
// 이전에는 엔진이 점유를 시뮬레이션하지 않아, 복기 화면에서 "찬스 생성 비중"을
// 점유율 대신 보여줬다. 여기서 실제 점유율을 계산해 그 대체를 없앤다.
//
// 점유는 세 가지로 결정된다:
//   1) 미드필드 장악 (주 요인) - 중원 강도 비율
//   2) 빌드업 성향 - 짧은 패스는 공을 오래 쥐고, 롱볼은 빨리 넘긴다
//   3) 템포 - 느린 템포는 안정적으로 소유, 빠른 템포는 자주 넘긴다
//
// 결정론적이다(RNG를 쓰지 않는다). 그래서 카운터팩추얼 재생 불변식을 깨지 않고,
// simulateMinute이 매 분 누적해도 같은 상태면 같은 점유가 나온다.

import type { LineStrengths } from "./strength";
import type { TeamInstructions } from "@/lib/types";

/**
 * 빌드업/템포에 따른 "볼 보유 성향" 배수. 1.0 기준.
 * 짧은 패스 + 느린 템포 = 오래 쥔다(>1), 롱볼 + 빠른 템포 = 빨리 넘긴다(<1).
 */
function retention(instr: TeamInstructions): number {
  let r = 1;
  r *= instr.buildup === "short" ? 1.18 : 0.85;
  // 템포 3(빠름)은 소유를 자주 넘기고, 1(느림)은 안정적으로 쥔다.
  r *= instr.tempo === 3 ? 0.92 : instr.tempo === 1 ? 1.08 : 1;
  return r;
}

/**
 * me 팀의 볼 점유 비율(0~1). 중원 강도에 보유 성향 배수를 곱해 정규화한다.
 * 미드필드가 0인 극단(라인업 미완성 등)에서는 성향만으로 나눈다.
 */
export function possessionShare(
  meLine: LineStrengths,
  oppLine: LineStrengths,
  meInstr: TeamInstructions,
  oppInstr: TeamInstructions
): number {
  const wMe = Math.max(1, meLine.mid) * retention(meInstr);
  const wOpp = Math.max(1, oppLine.mid) * retention(oppInstr);
  const total = wMe + wOpp;
  if (total <= 0) return 0.5;
  return wMe / total;
}

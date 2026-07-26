// 성적표 데이터가 표시 검증 수치와 어긋나지 않게 강제한다. engineScorecard()는
// validation.test.ts와 같은 분석 예측을 쓰므로, 집계도 lib/wc2026/validation.ts와
// 일치해야 한다. 엔진을 바꿔 한쪽만 움직이면 여기서 실패한다.

import { describe, it, expect } from "vitest";
import { engineScorecard } from "@/lib/wc2026/scorecard";
import { ENGINE_VALIDATION } from "@/lib/wc2026/validation";

describe("engineScorecard", () => {
  const sc = engineScorecard();

  it("검증 경기 수가 표시 수치와 일치한다", () => {
    expect(sc.matches).toBe(ENGINE_VALIDATION.matches);
  });

  it("승부 갈린 경기 승자 재현율이 표시 수치와 일치한다", () => {
    expect(sc.ratePct).toBeCloseTo(ENGINE_VALIDATION.decisiveWinRatePct, 1);
  });

  it("셀 수 = 승부가 갈린 경기 수이고, 적중 수가 재현율과 맞는다", () => {
    expect(sc.cells.length).toBe(sc.decisive);
    expect(sc.cells.filter((c) => c.correct).length).toBe(sc.correct);
    expect(sc.decisive + sc.draws).toBe(sc.matches);
  });
});

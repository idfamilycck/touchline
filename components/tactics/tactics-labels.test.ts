import { describe, it, expect } from "vitest";
import { jerseyOf } from "@/components/tactics/tactics-labels";

describe("jerseyOf", () => {
  it("가상팀 id(kor_01)는 뒤 숫자를 등번호로 쓴다", () => {
    expect(jerseyOf("kor_01")).toBe(1);
    expect(jerseyOf("kor_16")).toBe(16);
    expect(jerseyOf("bra_20")).toBe(20);
  });

  it("월드컵 선수 id(불투명 ESPN 숫자)는 1~99 표시 번호로 매핑된다", () => {
    for (const id of ["238886", "259835", "173663", "301894"]) {
      const j = jerseyOf(id);
      expect(Number.isInteger(j)).toBe(true);
      expect(j).toBeGreaterThanOrEqual(1);
      expect(j).toBeLessThanOrEqual(99);
    }
  });

  it("같은 id는 항상 같은 번호(안정적)", () => {
    expect(jerseyOf("238886")).toBe(jerseyOf("238886"));
  });
});

import { describe, it, expect } from "vitest";
import { possessionShare } from "./possession";
import type { LineStrengths } from "./strength";
import type { TeamInstructions } from "@/lib/types";

const line = (mid: number): LineStrengths => ({ gk: 50, def: 50, mid, att: 50 });

const instr = (over: Partial<TeamInstructions> = {}): TeamInstructions => ({
  formation: "4-3-3",
  pressing: 2,
  line: 2,
  attacking: 2,
  tempo: 2,
  buildup: "short",
  focus: "center",
  width: "wide",
  marking: "zonal",
  offsideTrap: false,
  ...over,
});

describe("possessionShare", () => {
  it("모든 조건이 같으면 50:50", () => {
    expect(possessionShare(line(70), line(70), instr(), instr())).toBeCloseTo(0.5, 6);
  });

  it("중원이 강한 쪽이 더 많이 점유한다", () => {
    const share = possessionShare(line(90), line(60), instr(), instr());
    expect(share).toBeGreaterThan(0.5);
  });

  it("같은 중원이면 짧은 패스가 롱볼보다 오래 점유한다", () => {
    const short = possessionShare(line(70), line(70), instr({ buildup: "short" }), instr({ buildup: "direct" }));
    expect(short).toBeGreaterThan(0.5);
  });

  it("같은 중원이면 느린 템포가 빠른 템포보다 오래 점유한다", () => {
    const slow = possessionShare(line(70), line(70), instr({ tempo: 1 }), instr({ tempo: 3 }));
    expect(slow).toBeGreaterThan(0.5);
  });

  it("결과는 항상 0~1 범위이고 양쪽 합이 1이다", () => {
    const me = possessionShare(line(95), line(40), instr({ buildup: "short", tempo: 1 }), instr({ buildup: "direct", tempo: 3 }));
    const opp = possessionShare(line(40), line(95), instr({ buildup: "direct", tempo: 3 }), instr({ buildup: "short", tempo: 1 }));
    expect(me).toBeGreaterThan(0);
    expect(me).toBeLessThan(1);
    expect(me + opp).toBeCloseTo(1, 6);
  });

  it("중원이 0이어도(라인업 미완성) 크래시하지 않고 성향으로 나뉜다", () => {
    const share = possessionShare(line(0), line(0), instr({ buildup: "short" }), instr({ buildup: "direct" }));
    expect(share).toBeGreaterThan(0.5);
    expect(Number.isFinite(share)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  EDGE_DEADBAND,
  edgeToneFromWinLoss,
  edgeToneFromWinPct,
} from "@/lib/edge-tone";

describe("edgeToneFromWinLoss (승/무/패 3-결과)", () => {
  it("승률과 패률이 같으면 유리라고 단언하지 않는다", () => {
    // 회귀: 이전 `win >= loss` 이분법은 여기서 "우리가 유리해요"를 띄웠다.
    expect(edgeToneFromWinLoss(38, 38)).toBe("even");
  });

  it("데드밴드 안쪽의 근소한 우위는 팽팽으로 본다", () => {
    expect(edgeToneFromWinLoss(38.4, 37.6)).toBe("even");
    expect(edgeToneFromWinLoss(37.6, 38.4)).toBe("even");
  });

  it("데드밴드 경계값은 우세/열세로 인정한다", () => {
    expect(edgeToneFromWinLoss(40 + EDGE_DEADBAND, 40)).toBe("favored");
    expect(edgeToneFromWinLoss(40, 40 + EDGE_DEADBAND)).toBe("behind");
  });

  it("격차가 뚜렷하면 방향대로 판정한다", () => {
    expect(edgeToneFromWinLoss(55, 20)).toBe("favored");
    expect(edgeToneFromWinLoss(15, 60)).toBe("behind");
  });
});

describe("edgeToneFromWinPct (2-결과 ELO 기준선)", () => {
  it("정확히 50%는 팽팽", () => {
    expect(edgeToneFromWinPct(50)).toBe("even");
  });

  it("50%를 근소하게 넘겨도 우세로 단언하지 않는다", () => {
    // 회귀: 이전 `pct >= 50`은 50.4%에도 초록 ▲를 띄웠다.
    expect(edgeToneFromWinPct(50.4)).toBe("even");
    expect(edgeToneFromWinPct(49.6)).toBe("even");
  });

  it("데드밴드를 넘기면 방향대로 판정한다", () => {
    expect(edgeToneFromWinPct(52)).toBe("favored");
    expect(edgeToneFromWinPct(48)).toBe("behind");
    expect(edgeToneFromWinPct(73)).toBe("favored");
  });
});

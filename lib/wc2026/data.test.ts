import { describe, it, expect } from "vitest";
import { wc2026TeamList } from "@/lib/wc2026/data";

describe("wc2026TeamList", () => {
  const list = wc2026TeamList();

  it("48개 팀을 반환한다", () => {
    expect(list).toHaveLength(48);
  });

  it("모든 팀의 code는 3글자, id는 wc_ 접두사", () => {
    for (const t of list) {
      expect(t.code).toMatch(/^[A-Z]{3}$/);
      expect(t.id).toMatch(/^wc_/);
    }
  });

  it("elo 내림차순으로 정렬돼 있다", () => {
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].elo).toBeGreaterThanOrEqual(list[i].elo);
    }
  });

  it("아르헨티나(ARG)가 존재하고 한글명이 올바르다", () => {
    const arg = list.find((t) => t.code === "ARG");
    expect(arg).toBeDefined();
    expect(arg!.nameKo).toBe("아르헨티나");
  });
});

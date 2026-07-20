// lib/wc2026/player-names.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { koreanName } from "@/lib/wc2026/player-names";
import { registerWc2026 } from "@/lib/wc2026/register";
import { playersOf } from "@/lib/data/players";

beforeAll(() => registerWc2026());

describe("koreanName", () => {
  it("KOR 대표팀 선수의 로마자 표기를 한글 이름으로 변환한다", () => {
    expect(koreanName("Son Heung-Min")).toBe("손흥민");
    expect(koreanName("Lee Kang-In")).toBe("이강인");
    expect(koreanName("Kim Min-Jae")).toBe("김민재");
    expect(koreanName("Hwang Hee-Chan")).toBe("황희찬");
    expect(koreanName("Cho Gue-Sung")).toBe("조규성");
  });

  it("세계적으로 유명한 타국 선수도 한글 표기를 반환한다", () => {
    expect(koreanName("Lionel Messi")).toBe("리오넬 메시");
    expect(koreanName("Kylian Mbappé")).toBe("킬리안 음바페");
    expect(koreanName("Jude Bellingham")).toBe("주드 벨링엄");
  });

  it("매핑에 없는 이름은 undefined를 반환한다(호출부가 로마자로 폴백)", () => {
    expect(koreanName("Nonexistent Player Xyz")).toBeUndefined();
    expect(koreanName("")).toBeUndefined();
  });

  it("registerWc2026() 이후 등록된 KOR 스쿼드 선수들이 한글 이름을 갖는다", () => {
    const squad = playersOf("wc_kor");
    expect(squad.length).toBeGreaterThan(0);
    const names = squad.map((p) => p.name);
    expect(names).toContain("손흥민");
    expect(names).toContain("이강인");
    expect(names).toContain("김민재");
    // 로마자 표기가 하나라도 그대로 남아있지 않아야 한다(전원 매핑됨을 검증) —
    // KOR 스쿼드 26명 전원이 player-names.ts에 있으므로 아스키 성/이름 패턴이 없어야 한다.
    const stillRomanized = names.filter((n) => /^[A-Za-z][A-Za-z -]*$/.test(n));
    expect(stillRomanized).toEqual([]);
  });
});

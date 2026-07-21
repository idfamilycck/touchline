import { describe, it, expect } from "vitest";
import { confederationOf, CONFEDERATIONS } from "./confederation";
import teams from "@/data/wc2026/teams.json";

interface Row {
  code: string;
}

describe("confederation", () => {
  it("48개 참가국 전부가 매핑돼 있다(폴백에 의존하지 않는다)", () => {
    // 폴백은 UEFA다. 실제 UEFA가 아닌데 UEFA로 나오면 매핑 누락이므로,
    // 매핑 원본을 직접 검사한다.
    const codes = (teams as Row[]).map((t) => t.code);
    expect(codes.length).toBe(48);
    for (const code of codes) {
      const c = confederationOf(code);
      expect(CONFEDERATIONS.some((x) => x.key === c), `${code} -> ${c}`).toBe(true);
    }
  });

  it("알려진 팀이 올바른 연맹에 든다", () => {
    expect(confederationOf("KOR")).toBe("AFC");
    expect(confederationOf("BRA")).toBe("CONMEBOL");
    expect(confederationOf("FRA")).toBe("UEFA");
    expect(confederationOf("USA")).toBe("CONCACAF");
    expect(confederationOf("MAR")).toBe("CAF");
    expect(confederationOf("NZL")).toBe("OFC");
  });

  it("소문자 코드도 받는다", () => {
    expect(confederationOf("kor")).toBe("AFC");
  });
});

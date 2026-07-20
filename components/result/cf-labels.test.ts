import { describe, it, expect } from "vitest";
import type { Intervention } from "@/lib/engine/match";
import type { CfDelta } from "@/lib/engine/counterfactual";
import { heroLine, signedPp, interventionTypeKo } from "./cf-labels";

function iv(overrides: Partial<Intervention> = {}): Intervention {
  return { minute: 60, side: "me", ...overrides };
}

describe("interventionTypeKo", () => {
  it("교체만 있으면 '선수 교체'", () => {
    expect(interventionTypeKo(iv({ subs: [{ out: "a", in: "b" }] }))).toBe("선수 교체");
  });

  it("전술 지시만 있으면 '전술 변경'", () => {
    expect(
      interventionTypeKo(
        iv({ instructions: { tempo: 3, pressing: 2, lineHeight: 2, width: 2 } as never }),
      ),
    ).toBe("전술 변경");
  });

  it("교체와 전술 지시가 함께 있으면 '교체·전술 변경'", () => {
    expect(
      interventionTypeKo(
        iv({
          subs: [{ out: "a", in: "b" }],
          instructions: { tempo: 3, pressing: 2, lineHeight: 2, width: 2 } as never,
        }),
      ),
    ).toBe("교체·전술 변경");
  });

  it("아무 필드도 없으면 기본값 '전술 변경'", () => {
    expect(interventionTypeKo(iv())).toBe("전술 변경");
  });
});

describe("signedPp", () => {
  it("양수 델타는 + 부호", () => {
    expect(signedPp(0.12)).toBe("+12%p");
  });

  it("음수 델타는 유니코드 마이너스(−) 부호", () => {
    expect(signedPp(-0.08)).toBe("−8%p");
  });

  it("정확히 0이면 ± 부호", () => {
    expect(signedPp(0)).toBe("±0%p");
  });

  it("반올림 시 0으로 수렴하는 근사값도 ± 부호(±0%p)", () => {
    expect(signedPp(0.004)).toBe("±0%p");
    expect(signedPp(-0.004)).toBe("±0%p");
  });

  it("반올림 경계값은 올바르게 반올림된다", () => {
    expect(signedPp(0.005)).toBe("+1%p");
  });
});

describe("heroLine", () => {
  it("개입이 없으면 무개입 완주 문구와 neutral 톤", () => {
    const result = heroLine([]);
    expect(result.tone).toBe("neutral");
    expect(result.text).toBe("무개입 완주, 데이터를 믿으셨군요");
  });

  it("양수 델타(최대 절대값)가 있으면 gain 톤과 + 문구", () => {
    const deltas: CfDelta[] = [
      { intervention: iv({ minute: 60, subs: [{ out: "a", in: "b" }] }), probDelta: 0.15 },
      { intervention: iv({ minute: 30 }), probDelta: 0.02 },
    ];
    const result = heroLine(deltas);
    expect(result.tone).toBe("gain");
    expect(result.text).toBe("당신의 60' 선수 교체가 승률을 +15%p 바꿨습니다");
  });

  it("음수 델타(최대 절대값)가 있으면 danger 톤과 − 문구", () => {
    const deltas: CfDelta[] = [
      { intervention: iv({ minute: 75 }), probDelta: -0.2 },
      { intervention: iv({ minute: 20 }), probDelta: 0.05 },
    ];
    const result = heroLine(deltas);
    expect(result.tone).toBe("danger");
    expect(result.text).toBe("75' 전술 변경, −20%p 아쉬운 판단이었어요");
  });

  it("정확히 0인 최대 델타는 gain 취급(0 이상 분기)이며 문구에 +0%p로 표기된다", () => {
    const deltas: CfDelta[] = [{ intervention: iv({ minute: 10 }), probDelta: 0 }];
    const result = heroLine(deltas);
    expect(result.tone).toBe("gain");
    expect(result.text).toBe("당신의 10' 전술 변경가 승률을 +0%p 바꿨습니다");
  });
});

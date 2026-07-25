import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { FIFA_TO_FLAG, flagSrc } from "./flag-codes";
import teamsJson from "@/data/wc2026/teams.json";

const PUBLIC_FLAGS = join(process.cwd(), "public", "flags");
const WC_CODES = (teamsJson as Array<{ code: string }>).map((t) => t.code);

// 레거시 16개국(lib/data/teams.ts)의 코드. 소스에서 직접 뽑아 팀이 바뀌어도 따라간다.
const LEGACY_CODES = [
  ...readFileSync(join(process.cwd(), "lib", "data", "teams.ts"), "utf8").matchAll(
    /code:\s*"([A-Z]{3})"/g
  ),
].map((m) => m[1]);

describe("국기 매핑", () => {
  it("실제 2026 월드컵 48개국 전부 매핑이 있다", () => {
    const missing = WC_CODES.filter((c) => !FIFA_TO_FLAG[c]);
    expect(missing).toEqual([]);
  });

  it("레거시 팀 코드도 전부 매핑이 있다", () => {
    expect(LEGACY_CODES.length).toBeGreaterThan(0);
    const missing = LEGACY_CODES.filter((c) => !FIFA_TO_FLAG[c]);
    expect(missing).toEqual([]);
  });

  it("매핑된 국기 파일이 public/flags/ 에 모두 존재한다", () => {
    const missing = Object.entries(FIFA_TO_FLAG)
      .filter(([, iso]) => !existsSync(join(PUBLIC_FLAGS, `${iso}.svg`)))
      .map(([fifa, iso]) => `${fifa}->${iso}`);
    expect(missing).toEqual([]);
  });

  it("서로 다른 팀이 같은 국기를 쓰지 않는다", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const [fifa, iso] of Object.entries(FIFA_TO_FLAG)) {
      const prev = seen.get(iso);
      if (prev) dupes.push(`${prev}/${fifa} -> ${iso}`);
      else seen.set(iso, fifa);
    }
    expect(dupes).toEqual([]);
  });

  it("잉글랜드·스코틀랜드는 유니언잭이 아니라 각자 깃발을 쓴다", () => {
    // 월드컵은 둘을 별개 대표팀으로 취급한다. gb로 뭉뚱그리면 같은 깃발이 두 번 나온다.
    expect(FIFA_TO_FLAG.ENG).toBe("gb-eng");
    expect(FIFA_TO_FLAG.SCO).toBe("gb-sct");
  });

  it("헷갈리기 쉬운 FIFA-ISO 불일치가 올바르다", () => {
    // FIFA 코드와 ISO alpha-2가 직관적으로 이어지지 않는 것들.
    expect(FIFA_TO_FLAG.GER).toBe("de"); // 독일
    expect(FIFA_TO_FLAG.NED).toBe("nl"); // 네덜란드
    expect(FIFA_TO_FLAG.KSA).toBe("sa"); // 사우디아라비아
    expect(FIFA_TO_FLAG.RSA).toBe("za"); // 남아공
    expect(FIFA_TO_FLAG.ALG).toBe("dz"); // 알제리
    expect(FIFA_TO_FLAG.CRO).toBe("hr"); // 크로아티아
    expect(FIFA_TO_FLAG.SUI).toBe("ch"); // 스위스
    expect(FIFA_TO_FLAG.KOR).toBe("kr"); // 대한민국
    expect(FIFA_TO_FLAG.JPN).toBe("jp");
  });

  it("flagSrc는 대소문자를 가리지 않고 public 경로를 돌려준다", () => {
    expect(flagSrc("KOR")).toBe("/flags/kr.svg");
    expect(flagSrc("kor")).toBe("/flags/kr.svg");
  });

  it("모르는 코드는 undefined (호출부가 색 배지로 폴백한다)", () => {
    expect(flagSrc("ZZZ")).toBeUndefined();
    expect(flagSrc("")).toBeUndefined();
  });

  it("public/flags/ 에 매핑에 없는 유령 파일이 남아 있지 않다", () => {
    const used = new Set(Object.values(FIFA_TO_FLAG).map((iso) => `${iso}.svg`));
    const extra = readdirSync(PUBLIC_FLAGS).filter((f) => f.endsWith(".svg") && !used.has(f));
    expect(extra).toEqual([]);
  });
});

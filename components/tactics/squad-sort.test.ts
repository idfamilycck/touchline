import { describe, it, expect } from "vitest";
import { sortSquad, overallOf, type SortKey } from "@/components/tactics/squad-sort";
import type { Player } from "@/lib/types";

function mkPlayer(overrides: Partial<Player> & { id: string }): Player {
  return {
    teamId: "kor",
    name: overrides.id,
    age: 25,
    caps: 10,
    positions: ["CM"],
    attrs: {
      shooting: 50,
      passing: 50,
      dribbling: 50,
      defending: 50,
      pace: 50,
      physical: 50,
      goalkeeping: 5,
      stamina: 50,
    },
    setPiece: 50,
    aerial: 50,
    penalty: 50,
    mental: 50,
    ...overrides,
  };
}

const SQUAD: Player[] = [
  mkPlayer({ id: "a", name: "다현", age: 28, attrs: { shooting: 90, passing: 40, dribbling: 60, defending: 30, pace: 88, physical: 60, goalkeeping: 3, stamina: 70 } }),
  mkPlayer({ id: "b", name: "가은", age: 22, attrs: { shooting: 40, passing: 90, dribbling: 55, defending: 60, pace: 50, physical: 55, goalkeeping: 4, stamina: 65 } }),
  mkPlayer({ id: "c", name: "나래", age: 35, attrs: { shooting: 60, passing: 60, dribbling: 60, defending: 60, pace: 60, physical: 60, goalkeeping: 6, stamina: 60 } }),
  mkPlayer({ id: "d", name: "라온", age: 19, positions: ["GK"], attrs: { shooting: 10, passing: 45, dribbling: 20, defending: 30, pace: 40, physical: 60, goalkeeping: 88, stamina: 45 } }),
];

describe("overallOf", () => {
  it("필드 플레이어는 6개 핵심 스탯 평균을 핵심 능력치로 쓴다(골키핑 제외)", () => {
    const gk9 = mkPlayer({ id: "z", positions: ["CM"], attrs: { ...SQUAD[0].attrs, goalkeeping: 99 } });
    const gk1 = mkPlayer({ id: "y", positions: ["CM"], attrs: { ...SQUAD[0].attrs, goalkeeping: 1 } });
    // 필드 플레이어는 goalkeeping 값과 무관하게 종합이 같아야 한다.
    expect(overallOf(gk9)).toBeCloseTo(overallOf(gk1));
  });

  it("GK 포지션 보유 선수는 goalkeeping을 핵심 능력치로 쓴다", () => {
    const strongGk = mkPlayer({ id: "gk1", positions: ["GK"], attrs: { ...SQUAD[0].attrs, goalkeeping: 90 } });
    const weakGk = mkPlayer({ id: "gk2", positions: ["GK"], attrs: { ...SQUAD[0].attrs, goalkeeping: 20 } });
    expect(overallOf(strongGk)).toBeGreaterThan(overallOf(weakGk));
  });
});

describe("sortSquad", () => {
  const KEYS: SortKey[] = [
    "name",
    "age",
    "overall",
    "shooting",
    "passing",
    "dribbling",
    "defending",
    "pace",
    "physical",
    "goalkeeping",
    "stamina",
    "setPiece",
    "aerial",
    "penalty",
    "mental",
  ];

  it("절대 선수를 잃어버리거나 중복시키지 않는다(모든 키 × 양방향)", () => {
    for (const key of KEYS) {
      for (const dir of ["asc", "desc"] as const) {
        const sorted = sortSquad(SQUAD, key, dir);
        expect(sorted).toHaveLength(SQUAD.length);
        expect(new Set(sorted.map((p) => p.id))).toEqual(new Set(SQUAD.map((p) => p.id)));
      }
    }
  });

  it("원본 배열을 변경하지 않는다", () => {
    const before = [...SQUAD];
    sortSquad(SQUAD, "age", "asc");
    expect(SQUAD).toEqual(before);
  });

  it("name 오름차순: 가나다순", () => {
    const sorted = sortSquad(SQUAD, "name", "asc");
    expect(sorted.map((p) => p.name)).toEqual(["가은", "나래", "다현", "라온"]);
  });

  it("age 오름차순/내림차순 토글이 반대 순서를 만든다", () => {
    const asc = sortSquad(SQUAD, "age", "asc").map((p) => p.id);
    const desc = sortSquad(SQUAD, "age", "desc").map((p) => p.id);
    expect(asc).toEqual(["d", "b", "a", "c"]); // 19, 22, 28, 35
    expect(desc).toEqual([...asc].reverse());
  });

  it("shooting 기준 정렬: 값이 큰 선수가 desc에서 먼저 온다", () => {
    const desc = sortSquad(SQUAD, "shooting", "desc");
    expect(desc[0].id).toBe("a"); // shooting 90
  });

  it("overall 기준 정렬: GK가 goalkeeping 덕에 상위권에 들 수 있다", () => {
    const desc = sortSquad(SQUAD, "overall", "desc");
    // d(GK, goalkeeping 88)가 최소 꼴찌는 아니어야 한다.
    expect(desc.indexOf(SQUAD.find((p) => p.id === "d")!)).toBeLessThan(SQUAD.length - 1);
  });

  it("안정 정렬: 동점자는 원래 상대 순서를 유지한다(asc/desc 모두)", () => {
    const tied: Player[] = [
      mkPlayer({ id: "t1", name: "동점1", age: 25 }),
      mkPlayer({ id: "t2", name: "동점2", age: 25 }),
      mkPlayer({ id: "t3", name: "동점3", age: 25 }),
    ];
    const asc = sortSquad(tied, "age", "asc").map((p) => p.id);
    const desc = sortSquad(tied, "age", "desc").map((p) => p.id);
    expect(asc).toEqual(["t1", "t2", "t3"]);
    expect(desc).toEqual(["t1", "t2", "t3"]);
  });
});

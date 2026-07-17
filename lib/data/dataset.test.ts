import { describe, it, expect } from "vitest";
import { TEAMS, teamById } from "./teams";
import { PLAYERS, playersOf } from "./players";
import { VENUES } from "./venues";
import { H2H, h2hOf } from "./h2h";

describe("dataset integrity", () => {
  it("팀 16개, id 유일, elo 1500~2200", () => {
    expect(TEAMS).toHaveLength(16);
    expect(new Set(TEAMS.map((t) => t.id)).size).toBe(16);
    for (const t of TEAMS) { expect(t.elo).toBeGreaterThan(1500); expect(t.elo).toBeLessThan(2200); }
  });
  it("모든 팀 선수 정확히 20명, 포지션 구성 충족", () => {
    for (const t of TEAMS) {
      const squad = playersOf(t.id);
      expect(squad).toHaveLength(20);
      const primary = (p: string) => squad.filter((x) => x.positions[0] === p).length;
      expect(primary("GK")).toBe(2);
      expect(primary("CB")).toBeGreaterThanOrEqual(3);
      expect(primary("ST") + primary("WG")).toBeGreaterThanOrEqual(4);
    }
  });
  it("능력치·보조 스탯 전부 1~99 정수, 나이 17~40", () => {
    for (const p of PLAYERS) {
      for (const v of [...Object.values(p.attrs), p.setPiece, p.aerial, p.penalty, p.mental]) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(99);
      }
      expect(p.age).toBeGreaterThanOrEqual(17); expect(p.age).toBeLessThanOrEqual(40);
      expect(teamById(p.teamId)).toBeDefined();
    }
  });
  it("경기장 8개 — 고도 1500m 초과 1곳 이상, 돔 2곳 이상, 30도 이상 폭염 2곳 이상", () => {
    expect(VENUES).toHaveLength(8);
    expect(VENUES.filter((v) => v.altitude > 1500).length).toBeGreaterThanOrEqual(1);
    expect(VENUES.filter((v) => v.dome).length).toBeGreaterThanOrEqual(2);
    expect(VENUES.filter((v) => v.avgTempC >= 30 && !v.dome).length).toBeGreaterThanOrEqual(2);
  });
  it("h2h 20쌍 이상, 조회는 순서 무관(방향은 인자 순서로 정렬) 동일 결과", () => {
    expect(H2H.length).toBeGreaterThanOrEqual(20);
    const r1 = h2hOf("kor", "jpn"); const r2 = h2hOf("jpn", "kor");
    expect(r1).toBeDefined(); expect(r2).toBeDefined();
    // r1 is oriented kor->jpn, r2 is oriented jpn->kor: same match, opposite orientation.
    expect(r1!.winA).toBe(r2!.winB);
    expect(r1!.winB).toBe(r2!.winA);
    expect(r1!.draw).toBe(r2!.draw);
  });
});

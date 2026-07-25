import { describe, it, expect } from "vitest";
import { oppLineup, layoutLineup, lateralRank } from "@/lib/wc2026/lineup";
import { wc2026Matches } from "@/lib/wc2026/source";
import teamsJson from "@/data/wc2026/teams.json";

const CODES = (teamsJson as Array<{ code: string }>).map((t) => t.code);
const p = (position: string, name = position) => ({ playerId: `id-${name}`, name, position });

describe("lateralRank", () => {
  it("접미사 표기(-L/-R)는 안쪽(±1)", () => {
    expect(lateralRank("CD-L")).toBe(-1);
    expect(lateralRank("AM-R")).toBe(1);
    expect(lateralRank("CD")).toBe(0);
  });

  it("접두사 표기(LB/RM/LF)는 측면(±2)", () => {
    expect(lateralRank("LB")).toBe(-2);
    expect(lateralRank("RB")).toBe(2);
    expect(lateralRank("LM")).toBe(-2);
    expect(lateralRank("RF")).toBe(2);
  });

  it("RCF는 측면이 아니라 중앙 조합의 오른쪽", () => {
    expect(lateralRank("RCF")).toBe(1);
  });

  it("측면 자원이 같은 쪽 중앙 자원보다 바깥이다", () => {
    // 이게 뒤집히면 4백에서 센터백이 풀백보다 바깥에 선다.
    expect(lateralRank("LB")).toBeLessThan(lateralRank("CD-L"));
    expect(lateralRank("RB")).toBeGreaterThan(lateralRank("CD-R"));
    expect(lateralRank("LM")).toBeLessThan(lateralRank("CM-L"));
  });

  it("중앙 포지션은 0", () => {
    for (const pos of ["G", "DM", "CM", "AM", "F", "SW", "M"]) {
      expect(lateralRank(pos), pos).toBe(0);
    }
  });
});

describe("layoutLineup", () => {
  const XI = [
    p("G"), p("LB"), p("CD-L"), p("CD-R"), p("RB"),
    p("DM"), p("CM-L"), p("CM-R"),
    p("LM"), p("RM"), p("F"),
  ];

  it("11명 전부 좌표를 받는다", () => {
    expect(layoutLineup(XI)).toHaveLength(11);
  });

  it("골키퍼가 가장 뒤, 공격수가 가장 앞", () => {
    const slots = layoutLineup(XI);
    const gk = slots.find((s) => s.band === "gk")!;
    const st = slots.find((s) => s.band === "att")!;
    const def = slots.filter((s) => s.band === "def");
    expect(gk.y).toBeLessThan(Math.min(...def.map((d) => d.y)));
    expect(st.y).toBeGreaterThan(Math.max(...def.map((d) => d.y)));
  });

  it("같은 줄 안에서 왼쪽 라벨이 실제로 왼쪽에 온다", () => {
    const slots = layoutLineup(XI);
    const lb = slots.find((s) => s.position === "LB")!;
    const rb = slots.find((s) => s.position === "RB")!;
    const cdl = slots.find((s) => s.position === "CD-L")!;
    const cdr = slots.find((s) => s.position === "CD-R")!;
    // 풀백이 센터백보다 바깥에 선다.
    expect(lb.x).toBeLessThan(cdl.x);
    expect(cdl.x).toBeLessThan(cdr.x);
    expect(cdr.x).toBeLessThan(rb.x);
  });

  it("중원에서도 측면 자원이 중앙 자원보다 바깥이다", () => {
    const slots = layoutLineup([
      p("CM-L"), p("LM"), p("CM-R"), p("RM"),
    ]);
    const x = (pos: string) => slots.find((s) => s.position === pos)!.x;
    expect(x("LM")).toBeLessThan(x("CM-L"));
    expect(x("CM-L")).toBeLessThan(x("CM-R"));
    expect(x("CM-R")).toBeLessThan(x("RM"));
  });

  it("한 줄에 한 명이면 중앙에 선다", () => {
    const slots = layoutLineup(XI);
    expect(slots.find((s) => s.band === "gk")!.x).toBe(50);
    expect(slots.find((s) => s.band === "att")!.x).toBe(50);
  });

  it("좌표가 피치 안에 있다", () => {
    for (const s of layoutLineup(XI)) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(100);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(100);
    }
  });

  it("같은 줄 선수끼리 좌표가 겹치지 않는다", () => {
    const slots = layoutLineup(XI);
    const byBand = new Map<string, number[]>();
    for (const s of slots) byBand.set(s.band, [...(byBand.get(s.band) ?? []), s.x]);
    for (const [band, xs] of byBand) {
      expect(new Set(xs).size, `${band} 겹침`).toBe(xs.length);
    }
  });

  it("빈 명단은 빈 배열", () => {
    expect(layoutLineup([])).toEqual([]);
  });
});

describe("oppLineup (실데이터)", () => {
  it("경기를 지정하면 그 경기의 실제 선발을 준다", () => {
    const m = wc2026Matches()[0];
    const l = oppLineup(m.home, m.id)!;
    expect(l.matchId).toBe(m.id);
    expect(l.vsCode).toBe(m.away);
    expect(l.starters).toHaveLength(11);
    expect(l.scoreFor).toBe(m.scoreHome);
    expect(l.scoreAgainst).toBe(m.scoreAway);
  });

  it("원정팀도 스코어가 자기 기준으로 뒤집힌다", () => {
    const m = wc2026Matches()[0];
    const l = oppLineup(m.away, m.id)!;
    expect(l.vsCode).toBe(m.home);
    expect(l.scoreFor).toBe(m.scoreAway);
    expect(l.scoreAgainst).toBe(m.scoreHome);
  });

  it("경기를 지정하지 않으면 그 팀의 마지막 경기를 쓴다", () => {
    const l = oppLineup("ESP")!;
    const esp = wc2026Matches()
      .filter((m) => m.home === "ESP" || m.away === "ESP")
      .sort((a, b) => a.kickoffISO.localeCompare(b.kickoffISO));
    expect(l.matchId).toBe(esp.at(-1)!.id);
    // 스페인의 마지막 경기는 결승이다.
    expect(l.round).toBe("final");
  });

  it("48개국 전부 명단과 포메이션이 나온다", () => {
    for (const code of CODES) {
      const l = oppLineup(code);
      expect(l, code).toBeDefined();
      expect(l!.starters.length, code).toBeGreaterThanOrEqual(10);
      expect(l!.shapeKo, code).toMatch(/^\d(-\d){2,3}$/);
    }
  });

  it("실제 선수 이름이 실려 있다 (빈 문자열/자리표시자가 아니다)", () => {
    const l = oppLineup("ARG")!;
    for (const s of l.starters) {
      expect(s.name.length).toBeGreaterThan(1);
      expect(s.playerId.length).toBeGreaterThan(0);
    }
  });

  it("교체 명단도 함께 준다", () => {
    expect(oppLineup("ESP")!.bench.length).toBeGreaterThan(0);
  });

  it("teamId 형식도 받는다", () => {
    expect(oppLineup("wc_esp")!.teamCode).toBe("ESP");
  });

  it("대회에 없는 팀은 undefined", () => {
    expect(oppLineup("ZZZ")).toBeUndefined();
  });

  it("결승 명단을 정확히 가져온다", () => {
    const fin = wc2026Matches().find((m) => m.round === "final")!;
    const esp = oppLineup("ESP", fin.id)!;
    expect(esp.scoreFor).toBe(1);
    expect(esp.scoreAgainst).toBe(0);
    expect(esp.vsCode).toBe("ARG");
    expect(esp.starters).toHaveLength(11);
  });
});

import { describe, expect, it } from "vitest";
import { playerDots, followBall, VB_W, VB_H } from "./livepitch-geometry";
import { makeSetup } from "@/lib/engine/__testutils__";
import { FORMATIONS } from "@/lib/data/formations";

describe("playerDots (라이브 피치 선수 좌표)", () => {
  const me = makeSetup("kor");
  const opp = makeSetup("bra");

  it("양 팀 각 11명, 라인업의 playerId를 그대로 사용한다", () => {
    const mine = playerDots(me, "me");
    const theirs = playerDots(opp, "opp");
    expect(mine).toHaveLength(11);
    expect(theirs).toHaveLength(11);
    expect(new Set(mine.map((d) => d.playerId))).toEqual(new Set(Object.values(me.lineup)));
  });

  it("me는 왼쪽 절반(오른쪽 공격), opp는 오른쪽 절반에 배치된다", () => {
    for (const d of playerDots(me, "me")) expect(d.cx).toBeLessThan(VB_W / 2);
    for (const d of playerDots(opp, "opp")) expect(d.cx).toBeGreaterThan(VB_W / 2);
  });

  it("모든 점이 피치 라인(6px 여백) 안쪽에 있다", () => {
    for (const d of [...playerDots(me, "me"), ...playerDots(opp, "opp")]) {
      expect(d.cx).toBeGreaterThan(6);
      expect(d.cx).toBeLessThan(VB_W - 6);
      expect(d.cy).toBeGreaterThan(6);
      expect(d.cy).toBeLessThan(VB_H - 6);
    }
  });

  it("공격 방향: me GK는 스트라이커보다 왼쪽, opp GK는 오른쪽", () => {
    const slots = FORMATIONS[me.instructions.formation].slots;
    const gkSlot = slots.find((s) => s.position === "GK")!.id;
    const stSlot = slots.find((s) => s.position === "ST")!.id;
    const mine = Object.fromEntries(playerDots(me, "me").map((d) => [d.slotId, d]));
    expect(mine[gkSlot].cx).toBeLessThan(mine[stSlot].cx);

    const oppSlots = FORMATIONS[opp.instructions.formation].slots;
    const oppGk = oppSlots.find((s) => s.position === "GK")!.id;
    const oppSt = oppSlots.find((s) => s.position === "ST")!.id;
    const theirs = Object.fromEntries(playerDots(opp, "opp").map((d) => [d.slotId, d]));
    expect(theirs[oppGk].cx).toBeGreaterThan(theirs[oppSt].cx);
  });

  it("followBall: 모든 선수가 공 방향으로 끌려가되 라인별 강도가 다르다", () => {
    const dots = playerDots(me, "me");
    const byId = Object.fromEntries(dots.map((d) => [d.slotId, d]));
    const ball = { cx: 250, cy: 40 }; // 오른쪽 위 (상대 진영)
    const gk = followBall(byId["gk"], ball);
    const mid = followBall(byId["cm_l"], ball);
    // 방향: 둘 다 공 쪽(+x, -y 방향)으로 이동
    expect(gk.tx).toBeGreaterThanOrEqual(byId["gk"].cx);
    expect(mid.tx).toBeGreaterThan(byId["cm_l"].cx);
    expect(mid.ty).toBeLessThan(byId["cm_l"].cy);
    // 강도: 미드필더가 GK보다 훨씬 많이 따라간다
    expect(mid.tx - byId["cm_l"].cx).toBeGreaterThan(gk.tx - byId["gk"].cx);
  });

  it("followBall: 이동량이 캡을 넘지 않고 피치 경계 안에 머문다", () => {
    for (const d of playerDots(me, "me")) {
      const far = followBall(d, { cx: VB_W - 8, cy: 10 });
      expect(Math.abs(far.tx - d.cx)).toBeLessThanOrEqual(18);
      expect(Math.abs(far.ty - d.cy)).toBeLessThanOrEqual(18);
      expect(far.tx).toBeGreaterThan(6);
      expect(far.tx).toBeLessThan(VB_W - 6);
      expect(far.ty).toBeGreaterThan(6);
      expect(far.ty).toBeLessThan(VB_H - 6);
    }
  });

  it("followBall: 공이 선수 위치와 같으면 제자리", () => {
    const d = playerDots(me, "me")[3];
    const same = followBall(d, { cx: d.cx, cy: d.cy });
    expect(same.tx).toBeCloseTo(d.cx, 5);
    expect(same.ty).toBeCloseTo(d.cy, 5);
  });

  it("같은 포메이션이면 opp 좌표는 me 좌표의 점대칭 미러다", () => {
    const mine = Object.fromEntries(playerDots(me, "me").map((d) => [d.slotId, d]));
    const mirrored = Object.fromEntries(playerDots(me, "opp").map((d) => [d.slotId, d]));
    for (const slotId of Object.keys(mine)) {
      expect(mirrored[slotId].cx).toBeCloseTo(VB_W - mine[slotId].cx, 5);
      expect(mirrored[slotId].cy).toBeCloseTo(VB_H - mine[slotId].cy, 5);
    }
  });
});

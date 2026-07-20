import { describe, expect, it } from "vitest";
import {
  estimateTextWidth,
  layoutLabels,
  LABEL_DY_ABOVE,
  LABEL_DY_BELOW,
  LABEL_FONT_SIZE,
  LABEL_PRIORITY,
  type LabelCandidate,
} from "./livepitch-labels";
import { dynamicDots, followBall, VB_H, VB_W } from "./livepitch-geometry";
import { makeSetup } from "@/lib/engine/__testutils__";

const FONT = LABEL_FONT_SIZE;
const PAD_X = 1.4;
const PAD_Y = 1.1;

// 테스트용 사각형 계산 — 구현과 같은 규칙(폭 추정 + 여유)을 쓴다.
function rectOf(c: LabelCandidate, dy: number) {
  const half = estimateTextWidth(c.text, FONT) / 2 + PAD_X;
  const baseline = c.cy + dy;
  return {
    x0: c.cx - half,
    x1: c.cx + half,
    y0: baseline - FONT * 0.8 - PAD_Y,
    y1: baseline + FONT * 0.22 + PAD_Y,
  };
}

function hits(a: ReturnType<typeof rectOf>, b: ReturnType<typeof rectOf>) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** 배치 결과에 겹치는 라벨 쌍이 하나도 없는지 검사 */
function expectNoOverlap(candidates: LabelCandidate[], layout: Map<string, { dy: number }>) {
  const rects = candidates
    .filter((c) => layout.has(c.key))
    .map((c) => ({ key: c.key, r: rectOf(c, layout.get(c.key)!.dy) }));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      expect(
        hits(rects[i].r, rects[j].r),
        `${rects[i].key} 와 ${rects[j].key} 라벨이 겹친다`
      ).toBe(false);
    }
  }
}

const cand = (
  key: string,
  text: string,
  cx: number,
  cy: number,
  priority: number = LABEL_PRIORITY.normal
): LabelCandidate => ({ key, text, cx, cy, priority });

describe("estimateTextWidth (한글/라틴 혼용 폭 추정)", () => {
  it("한글 글자는 같은 글자 수의 라틴보다 넓다", () => {
    expect(estimateTextWidth("야말디", FONT)).toBeGreaterThan(estimateTextWidth("abc", FONT));
    expect(estimateTextWidth("손흥민", FONT)).toBeGreaterThan(estimateTextWidth("Kim", FONT));
  });

  it("한글은 글자당 약 1em", () => {
    expect(estimateTextWidth("야말디", FONT)).toBeCloseTo(3 * FONT, 5);
  });

  it("글자 수에 단조 증가하고, 빈 문자열은 0", () => {
    expect(estimateTextWidth("", FONT)).toBe(0);
    expect(estimateTextWidth("Otamendi", FONT)).toBeGreaterThan(estimateTextWidth("Ruiz", FONT));
  });

  it("폰트 크기에 비례한다", () => {
    expect(estimateTextWidth("Torres", 7.2)).toBeCloseTo(estimateTextWidth("Torres", 3.6) * 2, 5);
  });

  it("좁은 글자(i, l)가 넓은 글자(W, M)보다 좁게 추정된다", () => {
    expect(estimateTextWidth("lll", FONT)).toBeLessThan(estimateTextWidth("WWW", FONT));
  });
});

describe("layoutLabels (충돌 회피 배치)", () => {
  it("멀리 떨어진 라벨은 전부 기본(아래) 배치로 살아남는다", () => {
    const cs = [
      cand("a", "Otamendi", 40, 40),
      cand("b", "Torres", 200, 140),
      cand("c", "야말디", 120, 90),
    ];
    const layout = layoutLabels(cs);
    expect(layout.size).toBe(3);
    for (const c of cs) expect(layout.get(c.key)!.placement).toBe("below");
    expectNoOverlap(cs, layout);
  });

  it("바로 옆에 붙은 두 점 중 하나는 위로 뒤집혀 겹침이 사라진다", () => {
    const cs = [cand("a", "Otamendi", 100, 90), cand("b", "야말디", 103, 91)];
    const layout = layoutLabels(cs);
    expect(layout.size).toBe(2);
    const places = cs.map((c) => layout.get(c.key)!.placement).sort();
    expect(places).toEqual(["above", "below"]);
    expectNoOverlap(cs, layout);
  });

  it("아래/위 두 자리가 모두 막히면 낮은 우선순위 라벨을 숨긴다", () => {
    const cs = [
      cand("keep1", "Montiel", 100, 90, LABEL_PRIORITY.star),
      cand("keep2", "Torres", 101, 90, LABEL_PRIORITY.involved),
      cand("drop", "Almada", 100.5, 90.5, LABEL_PRIORITY.normal),
    ];
    const layout = layoutLabels(cs);
    expect(layout.has("keep1")).toBe(true);
    expect(layout.has("keep2")).toBe(true);
    expect(layout.has("drop")).toBe(false);
    expectNoOverlap(cs, layout);
  });

  it("우선순위가 높은 라벨은 낮은 라벨에 밀려 숨겨지지 않는다", () => {
    // 낮은 우선순위를 먼저 넣어도 star/involved/keeper가 자리를 차지한다.
    const cs = [
      cand("n1", "Cucurella", 100, 90, LABEL_PRIORITY.normal),
      cand("n2", "Medina", 100, 91, LABEL_PRIORITY.normal),
      cand("gk", "Martinez", 101, 90, LABEL_PRIORITY.keeper),
      cand("star", "Messi", 100.5, 90.5, LABEL_PRIORITY.star),
    ];
    const layout = layoutLabels(cs);
    expect(layout.has("star")).toBe(true);
    expect(layout.has("gk")).toBe(true);
    expectNoOverlap(cs, layout);
  });

  it("22명이 한 점에 뭉쳐도 겹침 없이 최대 2개만 표시된다", () => {
    const cs = Array.from({ length: 22 }, (_, i) => cand(`p${i}`, "Rodriguez", 150, 90));
    const layout = layoutLabels(cs);
    expect(layout.size).toBe(2);
    expectNoOverlap(cs, layout);
  });

  it("빈 이름은 후보에서 제외된다", () => {
    const layout = layoutLabels([cand("a", "", 50, 50), cand("b", "   ", 150, 50)]);
    expect(layout.size).toBe(0);
  });

  it("입력 순서가 달라도 결과가 같다(결정적)", () => {
    const cs = [
      cand("a", "Otamendi", 100, 90),
      cand("b", "야말디", 103, 91),
      cand("c", "Torres", 106, 92),
      cand("d", "Ruiz", 99, 93),
    ];
    const forward = layoutLabels(cs);
    const backward = layoutLabels([...cs].reverse());
    expect([...backward.entries()].sort()).toEqual([...forward.entries()].sort());
  });

  it("세로 경계를 벗어나는 배치는 고르지 않는다", () => {
    // 위쪽 끝 점: 'above'는 화면 밖이라 반드시 'below'를 쓴다.
    const layout = layoutLabels([cand("top", "야말디", 150, 10)], { minY: 0, maxY: VB_H });
    expect(layout.get("top")!.placement).toBe("below");
  });

  it("남의 선수 점 위에는 라벨을 놓지 않는다", () => {
    // b의 점이 a의 '아래' 자리를 정확히 막고 있으므로 a는 위로 뒤집힌다.
    const a = cand("a", "Medina", 100, 90);
    const layout = layoutLabels([a], {
      obstacles: [
        { key: "a", cx: 100, cy: 90 },
        { key: "b", cx: 100, cy: 101 },
      ],
    });
    expect(layout.get("a")!.placement).toBe("above");
  });

  it("자기 점은 장애물로 치지 않는다(아래 배치 유지)", () => {
    const layout = layoutLabels([cand("a", "Medina", 100, 90)], {
      obstacles: [{ key: "a", cx: 100, cy: 90 }],
    });
    expect(layout.get("a")!.placement).toBe("below");
  });

  it("점에 위아래로 둘러싸이면 라벨을 숨긴다", () => {
    const layout = layoutLabels([cand("a", "Otamendi", 100, 90)], {
      obstacles: [
        { key: "a", cx: 100, cy: 90 },
        { key: "b", cx: 100, cy: 101 },
        { key: "c", cx: 100, cy: 79 },
      ],
    });
    expect(layout.has("a")).toBe(false);
  });

  it("배치 dy는 정해진 두 값 중 하나다", () => {
    const cs = [cand("a", "Otamendi", 100, 90), cand("b", "야말디", 102, 90)];
    for (const p of layoutLabels(cs).values()) {
      expect([LABEL_DY_BELOW, LABEL_DY_ABOVE]).toContain(p.dy);
    }
  });
});

describe("layoutLabels + 실제 피치 좌표", () => {
  const me = makeSetup("kor");
  const opp = makeSetup("bra");

  // 실제 렌더와 같은 방식으로 22명의 목표 좌표를 만든다.
  function targetsAt(tilt: number, ball: { cx: number; cy: number }): LabelCandidate[] {
    const out: LabelCandidate[] = [];
    for (const [setup, side] of [
      [me, "me"],
      [opp, "opp"],
    ] as const) {
      for (const d of dynamicDots(setup, side, tilt)) {
        const t = followBall(d, ball);
        out.push(
          cand(
            `${side}-${d.slotId}`,
            d.slotId === "gk" ? "골키퍼" : `${side}-${d.slotId}`,
            t.tx,
            t.ty,
            d.slotId === "gk" ? LABEL_PRIORITY.keeper : LABEL_PRIORITY.normal
          )
        );
      }
    }
    return out;
  }

  const DOT_R = 6.5;
  const layoutOf = (cs: LabelCandidate[]) =>
    layoutLabels(cs, {
      minY: 0,
      maxY: VB_H,
      obstacles: cs.map((c) => ({ key: c.key, cx: c.cx, cy: c.cy })),
    });

  const SCENARIOS = [0, 0.15, 0.35, 0.5, 0.65, 0.85, 1].flatMap((tilt) =>
    [
      { cx: VB_W / 2, cy: VB_H / 2 },
      { cx: VB_W - 40, cy: 40 },
      { cx: 40, cy: VB_H - 40 },
    ].map((ball) => ({ tilt, ball }))
  );

  it("중원 밀집 국면들에서 표시된 라벨끼리 절대 겹치지 않는다", () => {
    for (const { tilt, ball } of SCENARIOS) {
      const cs = targetsAt(tilt, ball);
      expectNoOverlap(cs, layoutOf(cs));
    }
  });

  it("표시된 라벨이 다른 선수의 점을 덮지 않는다", () => {
    for (const { tilt, ball } of SCENARIOS) {
      const cs = targetsAt(tilt, ball);
      const layout = layoutOf(cs);
      for (const c of cs) {
        const p = layout.get(c.key);
        if (!p) continue;
        const r = rectOf(c, p.dy);
        for (const o of cs) {
          if (o.key === c.key) continue;
          const nx = Math.max(r.x0, Math.min(o.cx, r.x1));
          const ny = Math.max(r.y0, Math.min(o.cy, r.y1));
          expect(
            (o.cx - nx) ** 2 + (o.cy - ny) ** 2 >= DOT_R ** 2,
            `${c.key} 라벨이 ${o.key} 점을 덮는다`
          ).toBe(true);
        }
      }
    }
  });

  it("한산한 중립 국면에서는 대부분(과반)의 이름이 살아남는다", () => {
    const cs = targetsAt(0.5, { cx: VB_W / 2, cy: VB_H / 2 });
    expect(layoutOf(cs).size).toBeGreaterThan(cs.length / 2);
  });

  it("골키퍼 이름은 어떤 국면에서도 표시된다", () => {
    for (const tilt of [0, 0.5, 1]) {
      const layout = layoutOf(targetsAt(tilt, { cx: VB_W / 2, cy: VB_H / 2 }));
      expect(layout.has("me-gk")).toBe(true);
      expect(layout.has("opp-gk")).toBe(true);
    }
  });
});

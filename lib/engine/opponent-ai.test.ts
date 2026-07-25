import { describe, it, expect } from "vitest";
import { nextOpponentReaction, OPPONENT_REACTION_DEFS } from "./opponent-ai";
import { makeSetup } from "./__testutils__";
import { initMatch, simulateMinute, runFullMatch, type MatchState } from "./match";
import type { TeamInstructions } from "@/lib/types";

const BASE: TeamInstructions = makeSetup("bra", "4-3-3").instructions;

function ctx(minute: number, oppLead: number, applied: string[] = []) {
  return { minute, oppLead, instructions: BASE, applied };
}

describe("nextOpponentReaction", () => {
  it("전반에는 아무 대응도 하지 않는다", () => {
    expect(nextOpponentReaction(ctx(20, -2))).toBeNull();
    expect(nextOpponentReaction(ctx(44, 1))).toBeNull();
  });

  it("2골 뒤진 채 60분을 넘기면 총공세로 나온다", () => {
    const r = nextOpponentReaction(ctx(60, -2));
    expect(r?.id).toBe("opp_all_out");
    expect(r?.instructions.attacking).toBe(3);
    expect(r?.instructions.line).toBe(3);
  });

  it("1골 앞선 채 75분을 넘기면 잠근다", () => {
    const r = nextOpponentReaction(ctx(76, 1));
    expect(r?.id).toBe("opp_park_bus");
    expect(r?.instructions.line).toBe(1);
    expect(r?.instructions.lineSpacing).toBe(1);
    expect(r?.instructions.attacking).toBe(1);
  });

  it("무승부인 채 80분을 넘기면 승부수를 던진다", () => {
    const r = nextOpponentReaction(ctx(82, 0));
    expect(r?.id).toBe("opp_late_gamble");
    expect(r?.instructions.attacking).toBe(3);
  });

  it("이미 발동한 대응은 다시 발동하지 않는다", () => {
    expect(nextOpponentReaction(ctx(80, 1, ["opp_park_bus"]))).toBeNull();
  });

  it("원본 instructions를 변형하지 않는다 (순수 함수)", () => {
    const before = JSON.stringify(BASE);
    nextOpponentReaction(ctx(60, -2));
    expect(JSON.stringify(BASE)).toBe(before);
  });

  it("모든 대응 정의의 id는 유일하다", () => {
    const ids = OPPONENT_REACTION_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("상대 대응의 경기 내 통합", () => {
  it("상대가 앞서서 후반을 보내면 opp_tactic 이벤트가 나오고 지시가 실제로 바뀐다", () => {
    const me = makeSetup("kor", "4-3-3");
    const opp = makeSetup("bra", "4-3-3");

    // 상대(브라질)가 우세한 매치업이라 여러 시드 중 상대가 리드한 경기를 찾는다.
    let found: MatchState | undefined;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const s = runFullMatch(me, opp, "metlife", seed);
      if (s.events.some((e) => e.type === "opp_tactic")) found = s;
    }
    expect(found, "60개 시드 안에 상대 대응이 한 번도 없다면 조건을 확인해야 한다").toBeDefined();

    expect(found!.oppReactions.length).toBeGreaterThan(0);
    // 발동한 대응 id가 이벤트 수와 일치한다.
    const events = found!.events.filter((e) => e.type === "opp_tactic");
    expect(events).toHaveLength(found!.oppReactions.length);
    // 상대 지시가 킥오프 시점과 달라져 있다.
    expect(found!.opp.instructions).not.toEqual(found!.initialOpp.instructions);
  });

  it("같은 대응이 매 분 재발동하지 않는다 (id당 최대 1회)", () => {
    const me = makeSetup("kor", "4-3-3");
    const opp = makeSetup("bra", "4-3-3");
    for (let seed = 1; seed <= 30; seed++) {
      const s = runFullMatch(me, opp, "metlife", seed);
      const ids = s.oppReactions.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("상대 대응은 RNG를 소비하지 않는다 (같은 시드 → 같은 이벤트 로그)", () => {
    const me = makeSetup("kor", "4-3-3");
    const opp = makeSetup("bra", "4-3-3");
    const a = runFullMatch(me, opp, "metlife", 11);
    const b = runFullMatch(me, opp, "metlife", 11);
    expect(a.events).toEqual(b.events);
    expect(a.oppReactions).toEqual(b.oppReactions);
  });

  it("상대가 잠그면 상대 λ가 내려간다", () => {
    const me = makeSetup("kor", "4-3-3");
    const opp = makeSetup("bra", "4-3-3");

    for (let seed = 1; seed <= 120; seed++) {
      let state = initMatch(me, opp, "metlife", seed);
      while (!state.finished) {
        const prevOppLambda = state.lambdaOpp;
        state = simulateMinute(state);
        const fired = state.events.find(
          (e) => e.minute === state.minute && e.type === "opp_tactic"
        );
        const id = state.oppReactions[state.oppReactions.length - 1]?.id;
        if (fired && (id === "opp_park_bus" || id === "opp_manage_lead")) {
          expect(state.lambdaOpp).toBeLessThan(prevOppLambda);
          return;
        }
      }
    }
    throw new Error("120개 시드 안에 상대의 잠그기 대응이 발생하지 않았다");
  });
});

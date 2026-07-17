import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { autoPlace } from "./engine/autoplace";
import { winProbability } from "./engine/winprob";
import { applyIntervention, initMatch, simulateMinute } from "./engine/match";
import type { Intervention, MatchState } from "./engine/match";
import { simulateShootout } from "./engine/shootout";
import type { ShootoutResult } from "./engine/shootout";
import type {
  FormationId,
  RoleId,
  SideSetup,
  SpecialInstructions,
  TeamInstructions,
} from "./types";

const DEFAULT_INSTRUCTIONS: TeamInstructions = {
  formation: "4-3-3",
  pressing: 2,
  line: 2,
  attacking: 2,
  tempo: 2,
  buildup: "short",
  focus: "center",
  width: "wide",
  marking: "zonal",
  offsideTrap: false,
};

const DEFAULT_SPECIAL: SpecialInstructions = { ckBigMenForward: false };

// autoPlace 결과(lineup/roles)로 SideSetup을 조립한다. instructions/special은 항상
// 기본값으로 시작하고, 호출부(setInstructions)가 formation 변경 시 이 함수를 다시
// 불러 라인업만 재배치한 뒤 나머지 instructions는 별도로 병합해 보존한다.
function buildSideSetup(teamId: string, formation: FormationId): SideSetup {
  const { lineup, roles } = autoPlace(teamId, formation);
  return {
    teamId,
    lineup,
    roles,
    instructions: { ...DEFAULT_INSTRUCTIONS, formation },
    special: { ...DEFAULT_SPECIAL },
  };
}

export interface AppSetup {
  myTeamId?: string;
  oppTeamId?: string;
  venueId?: string;
  seed: number;
}

export interface AppState {
  setup: AppSetup;
  me?: SideSetup;
  opp?: SideSetup;
  match?: MatchState;
  shootout?: ShootoutResult;
  onboardingDone: boolean;

  startQuick: () => void;
  selectMatchup: (my: string, opp: string, venue: string) => void;
  movePlayer: (slotId: string, playerId: string) => void;
  setInstructions: (i: Partial<TeamInstructions>) => void;
  setRole: (slotId: string, role: RoleId) => void;
  setSpecial: (s: Partial<SpecialInstructions>) => void;
  beginMatch: () => void;
  tickMinute: () => void;
  intervene: (iv: Omit<Intervention, "minute">) => void;
  reset: () => void;

  runShootout: (kickers: string[]) => void;
  completeOnboarding: () => void;
}

const INITIAL_SETUP: AppSetup = { seed: 0 };

// SSR/정적 빌드 가드: sessionStorage는 브라우저 전용 전역이다. Node(빌드/SSR) 환경에서는
// 아예 선언돼 있지 않으므로 "typeof sessionStorage" 검사는(식별자를 값으로 참조하지
// 않으므로) 안전하게 "undefined"를 반환한다 — window가 없는 vitest(environment: "node")
// 테스트에서도 globalThis.sessionStorage를 직접 스텁해두면 이 검사를 그대로 통과한다.
// 사용 불가 시 명시적으로 throw해 zustand persist의 createJSONStorage가 내부 try/catch로
// 이를 잡아 storage=undefined로 폴백하도록 한다(zustand/esm/middleware.mjs 확인:
// storage가 없으면 setItem 호출 시 console.warn만 하고 조용히 넘어가며, import 자체나
// getItem 호출도 크래시하지 않는다).
function getSessionStorage(): Storage {
  if (typeof sessionStorage === "undefined") {
    throw new Error("sessionStorage unavailable (SSR/build)");
  }
  return sessionStorage;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      setup: INITIAL_SETUP,
      me: undefined,
      opp: undefined,
      match: undefined,
      shootout: undefined,
      onboardingDone: false,

      startQuick: () => {
        const seed = Date.now() % 1e9;
        set({
          setup: { myTeamId: "kor", oppTeamId: "bra", venueId: "metlife", seed },
          me: buildSideSetup("kor", "4-3-3"),
          opp: buildSideSetup("bra", "4-3-3"),
          match: undefined,
          shootout: undefined,
        });
      },

      selectMatchup: (my, opp, venue) => {
        const seed = Date.now() % 1e9;
        set({
          setup: { myTeamId: my, oppTeamId: opp, venueId: venue, seed },
          // opp 쪽은 유저가 편집하지 않으므로 autoPlace + 기본 지시사항으로 고정한다
          // (브리프의 "opp side gets autoPlace lineup + default instructions" 설계).
          me: buildSideSetup(my, "4-3-3"),
          opp: buildSideSetup(opp, "4-3-3"),
          match: undefined,
          shootout: undefined,
        });
      },

      movePlayer: (slotId, playerId) => {
        const me = get().me;
        if (!me) return;
        const lineup = { ...me.lineup };
        // playerId가 이미 다른 슬롯에 있으면 두 슬롯을 스왑, 벤치에서 온 선수면
        // 목표 슬롯의 기존 점유자를 그냥 덮어쓴다(벤치는 lineup에 없는 선수들의
        // 파생 집합이므로 별도 상태 갱신이 필요 없다).
        const fromSlotId = Object.keys(lineup).find(
          (k) => lineup[k] === playerId && k !== slotId
        );
        if (fromSlotId) {
          const displaced = lineup[slotId];
          lineup[fromSlotId] = displaced;
        }
        lineup[slotId] = playerId;
        set({ me: { ...me, lineup } });
      },

      setInstructions: (i) => {
        const me = get().me;
        if (!me) return;
        const newInstructions: TeamInstructions = { ...me.instructions, ...i };
        if (i.formation && i.formation !== me.instructions.formation) {
          const { lineup, roles } = autoPlace(me.teamId, i.formation);
          set({ me: { ...me, instructions: newInstructions, lineup, roles } });
        } else {
          set({ me: { ...me, instructions: newInstructions } });
        }
      },

      setRole: (slotId, role) => {
        const me = get().me;
        if (!me) return;
        set({ me: { ...me, roles: { ...me.roles, [slotId]: role } } });
      },

      setSpecial: (s) => {
        const me = get().me;
        if (!me) return;
        set({ me: { ...me, special: { ...me.special, ...s } } });
      },

      beginMatch: () => {
        const { me, opp, setup } = get();
        if (!me || !opp || !setup.venueId) return;
        set({ match: initMatch(me, opp, setup.venueId, setup.seed), shootout: undefined });
      },

      tickMinute: () => {
        const match = get().match;
        if (!match) return;
        set({ match: simulateMinute(match) });
      },

      intervene: (iv) => {
        const match = get().match;
        if (!match) return;
        const full: Intervention = { ...iv, minute: match.minute };
        set({ match: applyIntervention(match, full) });
      },

      runShootout: (kickers) => {
        const { me, opp, match, setup } = get();
        // 경기가 진행된 경우 match.me/opp(교체 등 개입이 반영된 라이브 로스터)를
        // 써야 한다 — top-level me/opp는 킥오프 시점 스냅샷이라 60분에 GK를
        // 교체해도 갱신되지 않는다(intervene은 match.me만 갱신하고 top-level
        // me/opp는 건드리지 않음). 매치가 아직 시작되지 않은 경우에만 top-level
        // me/opp로 폴백한다.
        const shootoutMe = match?.me ?? me;
        const shootoutOpp = match?.opp ?? opp;
        if (!shootoutMe || !shootoutOpp) return;
        set({ shootout: simulateShootout(kickers, shootoutMe, shootoutOpp, setup.seed) });
      },

      completeOnboarding: () => set({ onboardingDone: true }),

      reset: () => {
        set({
          setup: INITIAL_SETUP,
          me: undefined,
          opp: undefined,
          match: undefined,
          shootout: undefined,
          // onboardingDone은 의도적으로 유지한다: reset()은 매치업/경기 세션을
          // 새로 시작하기 위한 것이지, "온보딩을 다시 봐야 하는가"라는 앱 차원의
          // 영속적 설정과는 별개다.
        });
      },
    }),
    {
      name: "dugout-v1",
      storage: createJSONStorage(getSessionStorage),
    }
  )
);

// 파생 셀렉터: me/opp/venue가 모두 준비된 뒤에만 winProbability를 계산한다.
// [me, opp, venueId] 참조가 바뀔 때만 재계산되도록 useMemo로 메모이즈한다.
export function useWinProb(): ReturnType<typeof winProbability> | undefined {
  const me = useAppStore((s) => s.me);
  const opp = useAppStore((s) => s.opp);
  const venueId = useAppStore((s) => s.setup.venueId);
  return useMemo(() => {
    if (!me || !opp || !venueId) return undefined;
    return winProbability(me, opp, venueId);
  }, [me, opp, venueId]);
}

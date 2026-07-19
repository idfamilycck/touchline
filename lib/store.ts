import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { autoPlace } from "./engine/autoplace";
import { winProbability } from "./engine/winprob";
import { applyIntervention, initMatch, simulateMinute } from "./engine/match";
import type { Intervention, MatchState } from "./engine/match";
import { simulateShootout } from "./engine/shootout";
import type { ShootoutResult } from "./engine/shootout";
import type { Recommendation } from "./engine/recommend";
import type {
  FormationId,
  RoleId,
  SideSetup,
  SpecialInstructions,
  TeamInstructions,
} from "./types";
import { registerWc2026 } from "@/lib/wc2026/register";
import { wc2026MatchById } from "@/lib/wc2026/data";
import { extractMoments } from "@/lib/wc2026/moments";
import { fromRealState } from "@/lib/engine/rewrite";

// 콜드 리로드(F5) 대응: rewrite 상태(mode:"rewrite", rewriteContext, wc_kor/wc_default를
// 참조하는 match)는 sessionStorage에 persist되어 새로고침 후에도 살아남지만,
// registerWc2026()이 채우는 인메모리 맵(teamById/playersOf/venueById)은 모듈 top-level
// `done` 플래그와 함께 페이지 풀로드마다 초기화된다. 지금까지는 app/rewrite/page.tsx와
// startRewrite()에서만 호출돼서, /tactics·/match·/result를 새로고침하면 이 store 모듈은
// import되지만 그 두 호출부는 거치지 않아 WC 데이터가 비어 있는 채로 venueById("wc_default")
// 등이 undefined를 반환 → 렌더 중 throw로 이어졌다(백서 C1). rewrite 상태를 가질 수 있는
// 모든 라우트가 이 store 모듈을 import하므로, 여기 모듈 스코프에서 한 번 호출해두면 어떤
// 진입점/새로고침이든 WC 데이터가 항상 등록돼 있음을 보장한다. registerWc2026()은
// idempotent(done 플래그)이고 JSON import + Map 쓰기만 하므로 window/document/sessionStorage에
// 의존하지 않아 정적 빌드/SSR 중 모듈 평가 시점에 호출해도 안전하다.
registerWc2026();

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

export interface RewriteContext {
  matchId: string;
  side: string;
  momentId: string;
  takeoverMinute: number;
}

export interface AppState {
  setup: AppSetup;
  me?: SideSetup;
  opp?: SideSetup;
  match?: MatchState;
  shootout?: ShootoutResult;
  onboardingDone: boolean;
  mode: "free" | "rewrite";
  rewriteContext?: RewriteContext;

  startQuick: () => void;
  selectMatchup: (my: string, opp: string, venue: string) => void;
  startRewrite: (matchId: string, side: string, momentId: string) => void;
  movePlayer: (slotId: string, playerId: string) => void;
  setInstructions: (i: Partial<TeamInstructions>) => void;
  setRole: (slotId: string, role: RoleId) => void;
  setSpecial: (s: Partial<SpecialInstructions>) => void;
  applyRecommendation: (rec: Pick<Recommendation, "instructions" | "lineup" | "roles">) => void;
  beginMatch: () => void;
  tickMinute: () => void;
  intervene: (iv: Omit<Intervention, "minute">) => void;
  reset: () => void;

  runShootout: (kickers: string[]) => void;
  rematch: () => void;
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
      mode: "free",
      rewriteContext: undefined,

      startQuick: () => {
        const seed = Date.now() % 1e9;
        set({
          setup: { myTeamId: "kor", oppTeamId: "bra", venueId: "metlife", seed },
          me: buildSideSetup("kor", "4-3-3"),
          opp: buildSideSetup("bra", "4-3-3"),
          match: undefined,
          shootout: undefined,
          mode: "free",
          rewriteContext: undefined,
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
          mode: "free",
          rewriteContext: undefined,
        });
      },

      // 실제 WC2026 경기의 "결정적 순간" 하나를 골라 그 시점(takeoverMinute)부터
      // 유저가 개입할 수 있는 rewrite 모드로 진입한다. registerWc2026()은 idempotent라
      // 매번 호출해도 안전하다 — /tactics, /match 등 어느 진입점에서 startRewrite를
      // 불러도 wc2026 팀/선수/경기장이 엔진 데이터에 등록돼 있음을 보장한다.
      startRewrite: (matchId, side, momentId) => {
        registerWc2026();
        const match = wc2026MatchById(matchId);
        if (!match) return;
        const moment = extractMoments(match, side).find((m) => m.id === momentId);
        if (!moment) return;
        const seed = Date.now() % 1e9;
        const matchState = fromRealState(match, side, moment, seed);
        set({
          mode: "rewrite",
          rewriteContext: {
            matchId,
            side,
            momentId,
            takeoverMinute: moment.takeoverMinute,
          },
          me: matchState.me,
          opp: matchState.opp,
          match: matchState,
          shootout: undefined,
          setup: {
            myTeamId: matchState.me.teamId,
            oppTeamId: matchState.opp.teamId,
            venueId: matchState.venueId,
            seed,
          },
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

      // 추천 전술 일괄 반영: recommend()가 돌려준 instructions/lineup/roles를 한 번에
      // 현재 me에 덮어쓴다. special/teamId는 사용자 설정을 그대로 보존한다.
      applyRecommendation: (rec) => {
        const me = get().me;
        if (!me) return;
        set({
          me: {
            ...me,
            instructions: rec.instructions,
            lineup: rec.lineup,
            roles: rec.roles,
          },
        });
      },

      beginMatch: () => {
        const { me, opp, setup, mode, match } = get();
        if (!me || !opp || !setup.venueId) return;
        if (mode === "rewrite") {
          // rewrite 모드: startRewrite가 이미 fromRealState로 takeoverMinute 시점의
          // match를 만들어뒀다. initMatch로 재초기화(0분부터)하면 그 상태가 사라지므로,
          // 대신 유저가 방금 작전실에서 편집한 me(전술/라인업)만 기존 match에 얹는다.
          // minute/score/이벤트 이력은 그대로 유지된다 — λ는 다음 5분 경계/개입에서
          // 재계산되므로 즉시 반영되지 않아도 무방하다.
          if (!match) return;
          set({ match: { ...match, me }, shootout: undefined });
          return;
        }
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

      // 다시 도전: 같은 매치업(팀/경기장)을 유지한 채 시드만 +1 해 새 경기를 준비한다.
      // me/opp는 selectMatchup과 동일하게 autoPlace 기본 셋업으로 리셋하고(작전실에서
      // 다시 짜도록), match/shootout은 비운다. 팀 미선택 상태면 아무 것도 하지 않는다.
      rematch: () => {
        const { setup } = get();
        if (!setup.myTeamId || !setup.oppTeamId || !setup.venueId) return;
        set({
          setup: { ...setup, seed: setup.seed + 1 },
          me: buildSideSetup(setup.myTeamId, "4-3-3"),
          opp: buildSideSetup(setup.oppTeamId, "4-3-3"),
          match: undefined,
          shootout: undefined,
        });
      },

      completeOnboarding: () => set({ onboardingDone: true }),

      reset: () => {
        set({
          setup: INITIAL_SETUP,
          me: undefined,
          opp: undefined,
          match: undefined,
          shootout: undefined,
          mode: "free",
          rewriteContext: undefined,
          // onboardingDone은 의도적으로 유지한다: reset()은 매치업/경기 세션을
          // 새로 시작하기 위한 것이지, "온보딩을 다시 봐야 하는가"라는 앱 차원의
          // 영속적 설정과는 별개다.
        });
      },
    }),
    {
      // v1 -> v2: mode/rewriteContext 필드 추가로 스키마가 바뀌어 persist 버전을
      // 올린다. 마이그레이션 없이 키 이름만 바꿔 v1 세션 스토리지는 자연히
      // 버려진다(세션 스토리지라 탭 종료 시 어차피 사라지는 값이라 손실 영향 적음).
      name: "touchline-v2",
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

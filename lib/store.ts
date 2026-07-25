import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { autoPlace } from "./engine/autoplace";
import { applyModifiers, type AppliedRule } from "./engine/modifiers";
import { lineStrengths, type LineStrengths } from "./engine/strength";
import { teamById } from "./data/teams";
import { venueById } from "./data/venues";
import { h2hOf } from "./data/h2h";
import { scoutTeam, type OppScouting } from "@/lib/wc2026/scouting";
import { oppLineup, type OppLineup } from "@/lib/wc2026/lineup";
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
import { fromRealState } from "@/lib/engine/rewrite";
import { oppTacticProfile } from "@/lib/wc2026/opponent-tactics";

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
  lineSpacing: 2,
  possession: 2,
  transitionSpeed: 2,
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

// 상대(우리가 지정한 감독) 시작 전술을 그 나라의 프로파일로 고정한다 — 실제 대형(진짜)
// + 국가 축구 정체성 매핑(산정). 유저가 편집하는 우리(me) 쪽과 달리 상대는 여기서
// 못 박히므로, 매치업이 "밸런스 4-3-3 vs 밸런스 4-3-3"이 아니라 각국의 색으로 붙는다.
function buildOppSetup(teamId: string): SideSetup {
  const prof = oppTacticProfile(teamId, oppLineup(teamId)?.shapeKo);
  const { lineup, roles } = autoPlace(teamId, prof.instructions.formation);
  return {
    teamId,
    lineup,
    roles,
    instructions: prof.instructions,
    special: { ...DEFAULT_SPECIAL },
  };
}

// rewrite 모드: fromRealState가 만든 상대(실제 선발·실제 대형)에 성향 축만 얹는다.
// 대형·라인업은 실측이므로 건드리지 않고, pressing/line/possession 등 축만 프로파일로
// 고정한다.
function applyOppProfile(opp: SideSetup): SideSetup {
  const prof = oppTacticProfile(opp.teamId);
  return {
    ...opp,
    instructions: { ...opp.instructions, ...prof.axes },
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
  endMinute?: number; // 지정 시 그 분에서 세션이 강제 종료된다(전반전/후반전 프리셋).
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
  startRewrite: (
    matchId: string,
    side: string,
    entry: { id: string; takeoverMinute: number; endMinute?: number }
  ) => void;
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

      // 실제 2026 월드컵 48개국(wc2026TeamList)이 홈 화면 매치업 대상이므로, 퀵스타트도
      // 가상의 16개 고정 팀(kor/bra) 대신 실제 wc_kor/wc_bra를 쓴다. registerWc2026()이
      // 모듈 로드 시 이미 호출돼 wc_kor/wc_bra의 팀/선수 데이터가 등록돼 있다.
      startQuick: () => {
        const seed = Date.now() % 1e9;
        set({
          setup: { myTeamId: "wc_kor", oppTeamId: "wc_bra", venueId: "metlife", seed },
          me: buildSideSetup("wc_kor", "4-3-3"),
          opp: buildOppSetup("wc_bra"),
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
          opp: buildOppSetup(opp),
          match: undefined,
          shootout: undefined,
          mode: "free",
          rewriteContext: undefined,
        });
      },

      // 실제 WC2026 경기의 진입점(프리셋 또는 이벤트 5분 전, lib/wc2026/entry-points.ts)
      // 하나를 골라 그 시점(entry.takeoverMinute)부터 유저가 개입할 수 있는 rewrite
      // 모드로 진입한다. entry가 이미 takeoverMinute(및 필요 시 endMinute)을 들고
      // 있으므로 여기서 다시 moments를 조회해 해석할 필요가 없다. registerWc2026()은
      // idempotent라 매번 호출해도 안전하다 — /tactics, /match 등 어느 진입점에서
      // startRewrite를 불러도 wc2026 팀/선수/경기장이 엔진 데이터에 등록돼 있음을 보장한다.
      startRewrite: (matchId, side, entry) => {
        registerWc2026();
        const match = wc2026MatchById(matchId);
        if (!match) return;
        const seed = Date.now() % 1e9;
        const st = fromRealState(match, side, { takeoverMinute: entry.takeoverMinute }, seed);
        // 상대 시작 전술을 그 나라 프로파일로 고정 — 화면(store.opp)과 라이브 시뮬
        // (match.opp)이 같은 상대를 보도록 둘 다에 프로파일을 얹는다. lines(선수 전력)는
        // 전술과 무관하므로 그대로 두고, lambda는 엔진이 주기적으로 재계산한다.
        const oppProfiled = applyOppProfile(st.opp);
        set({
          mode: "rewrite",
          rewriteContext: {
            matchId,
            side,
            momentId: entry.id,
            takeoverMinute: entry.takeoverMinute,
            endMinute: entry.endMinute,
          },
          me: st.me,
          opp: oppProfiled,
          match: { ...st, opp: oppProfiled },
          shootout: undefined,
          setup: {
            myTeamId: st.me.teamId,
            oppTeamId: st.opp.teamId,
            venueId: st.venueId,
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

      // rewrite 모드의 endMinute(전반전/후반전 프리셋)에 도달하면 정규 종료(90분)를
      // 기다리지 않고 세션을 강제 종료한다. simulateMinute 자체(순수 엔진)는 이 개념을
      // 모르므로, 매 분 진행 뒤 스토어 레벨에서 이 wrapper가 종료 여부를 판단하고
      // synthetic fulltime 이벤트를 붙인다 — 엔진 파일은 수정하지 않는다.
      tickMinute: () => {
        const { match, mode, rewriteContext } = get();
        if (!match || match.finished) return;
        const next = simulateMinute(match);
        const end = mode === "rewrite" ? rewriteContext?.endMinute : undefined;
        if (end != null && next.minute >= end && !next.finished) {
          set({
            match: {
              ...next,
              finished: true,
              events: [
                ...next.events,
                { minute: next.minute, type: "fulltime", side: "me", textKo: "세션 종료" },
              ],
            },
          });
          return;
        }
        set({ match: next });
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
          opp: buildOppSetup(setup.oppTeamId),
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

// 작전실용 파생 셀렉터 ─────────────────────────────────────────────────────────
//
// 여기에는 킥오프 전 승률을 주는 셀렉터가 없다(예전 useWinProb은 제거됐다).
// 전술을 고르기 전에 결과 확률이 보이면 감독의 판단이 사라지고 "숫자가 큰 쪽으로
// 슬라이더를 미는" 최적화 게임이 되기 때문이다(자세한 이유는 ScoutingReport.tsx
// 상단 주석). 승률은 경기가 시작된 뒤 MatchState.probTimeline에서만 나온다.
// 승률을 계산하지 않고 "지금 내 세팅이 어떤 전술 효과를 발동시키고 있는가"만 준다.
// winProbability()는 내부적으로 이 applyModifiers()를 부른 뒤 포아송으로 승/무/패를
// 뽑는데, 작전실에는 그 앞단(발동 규칙)까지만 필요하다.
export function useTacticRules(): AppliedRule[] {
  const me = useAppStore((s) => s.me);
  const opp = useAppStore((s) => s.opp);
  const venueId = useAppStore((s) => s.setup.venueId);
  return useMemo(() => {
    if (!me || !opp || !venueId) return [];
    const venue = venueById(venueId);
    const meTeam = teamById(me.teamId);
    const oppTeam = teamById(opp.teamId);
    if (!venue || !meTeam || !oppTeam) return [];
    return applyModifiers(me, opp, venue, meTeam, oppTeam, h2hOf(me.teamId, opp.teamId)).rules;
  }, [me, opp, venueId]);
}

/** 라인별(GK/수비/중원/공격) 전력 비교. 결과 확률이 아니라 전력 구조다. */
export function useLineMatchup(): { me: LineStrengths; opp: LineStrengths } | undefined {
  const me = useAppStore((s) => s.me);
  const opp = useAppStore((s) => s.opp);
  return useMemo(() => {
    if (!me || !opp) return undefined;
    return { me: lineStrengths(me, opp), opp: lineStrengths(opp, me) };
  }, [me, opp]);
}

/**
 * 상대의 실제 선발 명단 + 포메이션 배치.
 *
 * rewrite 모드면 지금 다시 쓰는 바로 그 경기의 명단을, free 모드면 그 팀이 대회에서
 * 마지막으로 치른 경기의 명단을 준다(어느 쪽인지는 isCurrentMatch로 구분해 화면에서
 * 밝힌다 — "이 경기 선발"과 "마지막 경기 선발"은 다른 정보다).
 */
export function useOppLineup(): { lineup?: OppLineup; isCurrentMatch: boolean } {
  const opp = useAppStore((s) => s.opp);
  const rewriteContext = useAppStore((s) => s.rewriteContext);
  return useMemo(() => {
    if (!opp) return { lineup: undefined, isCurrentMatch: false };
    const matchId = rewriteContext?.matchId;
    return {
      lineup: oppLineup(opp.teamId, matchId),
      isCurrentMatch: Boolean(matchId),
    };
  }, [opp, rewriteContext]);
}

/**
 * 상대 스카우팅 리포트(실제 2026 월드컵 기록 기반).
 * rewrite 모드면 그 경기의 실제 선발 포메이션까지 포함된다.
 */
export function useOppScouting(): OppScouting | undefined {
  const me = useAppStore((s) => s.me);
  const opp = useAppStore((s) => s.opp);
  const rewriteContext = useAppStore((s) => s.rewriteContext);
  return useMemo(() => {
    if (!opp) return undefined;
    return scoutTeam(opp.teamId, {
      myElo: me ? teamById(me.teamId)?.elo : undefined,
      matchId: rewriteContext?.matchId,
    });
  }, [me, opp, rewriteContext]);
}

"use client";

// 작전실 — 감독석의 핵심 화면.
// 데스크톱: 3열(스쿼드 | 피치 보드 | 분석 패널). 모바일: 탭 전환(스쿼드/피치/분석).
// dnd-kit DndContext로 스쿼드→슬롯, 슬롯↔슬롯 드래그. 병행 수단으로 탭-투-배치 지원.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  useAppStore,
  useTacticRules,
  useLineMatchup,
  useOppScouting,
  useOppLineup,
} from "@/lib/store";
import { playersOf } from "@/lib/data/players";
import { teamById } from "@/lib/data/teams";
import { FORMATIONS } from "@/lib/data/formations";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { RewriteContextBadge } from "@/components/rewrite/RewriteContextBadge";
import { HandoffOverlay } from "@/components/rewrite/HandoffOverlay";
import { AnimatePresence } from "framer-motion";
import { SquadList } from "@/components/tactics/SquadList";
import { AttributeGrid } from "@/components/tactics/AttributeGrid";
import { PitchBoard } from "@/components/tactics/PitchBoard";
import { ScoutingReport } from "@/components/tactics/ScoutingReport";
import { LineMatchup } from "@/components/tactics/LineMatchup";
import { FactorCards } from "@/components/tactics/FactorCards";
import { InstructionsPanel } from "@/components/tactics/InstructionsPanel";
import { RolePicker } from "@/components/tactics/RolePicker";
import { SpecialPanel } from "@/components/tactics/SpecialPanel";
import { RecommendPanel } from "@/components/tactics/RecommendPanel";
import { MobileScoutStrip } from "@/components/tactics/MobileScoutStrip";
import { Coachmarks } from "@/components/tactics/Coachmarks";
import { jerseyOf, type Selection } from "@/components/tactics/tactics-labels";

type Tab = "squad" | "pitch" | "analysis";
type TacticTab = "team" | "role" | "special";

const TACTIC_TABS: { id: TacticTab; label: string }[] = [
  { id: "team", label: "팀 지시" },
  { id: "role", label: "선수 역할" },
  { id: "special", label: "특수 지시" },
];

// 예전엔 위 세 덩어리(스카우팅 · 전술 탭 · 근거/추천/상세)가 오른쪽 한 열에 세로로
// 전부 쌓여, 데스크톱에서도 4000px 모바일 스크롤이 됐다. 이제 셋을 분리해 lg 그리드가
// 각각 다른 자리에 배치한다(상대=오른쪽 레일, 전술 지시=피치 아래 가운데, 근거/추천/
// 상세=하단 가로 행). 모바일에서는 셋이 '분석' 탭 아래에 예전 순서 그대로 쌓인다.
//
// 승률을 여기 두지 않는 이유는 그대로다: 전술을 고르기도 전에 승률이 나오면 감독의
// 판단이 사라지고 "숫자가 큰 쪽으로 슬라이더를 미는" 게임이 된다. 승률은 경기가
// 시작된 뒤 /match의 ProbTimeline에서만 등장한다.

/** 상대 스카우팅 + 라인 매치업 (오른쪽 레일). */
function ScoutRail() {
  const oppTeamId = useAppStore((s) => s.opp?.teamId);
  const lines = useLineMatchup();
  const scout = useOppScouting();
  const { lineup, isCurrentMatch } = useOppLineup();
  const oppTeam = useMemo(() => (oppTeamId ? teamById(oppTeamId) : undefined), [oppTeamId]);

  return (
    <div className="flex flex-col gap-4">
      <ScoutingReport
        scout={scout}
        color1={oppTeam?.color1}
        color2={oppTeam?.color2}
        lineup={lineup}
        lineupIsCurrentMatch={isCurrentMatch}
      />
      <LineMatchup lines={lines} />
    </div>
  );
}

/** 전술 지시 탭(팀 지시 · 선수 역할 · 특수 지시) — 피치 아래 가운데. */
function TacticTabsPanel() {
  const [tab, setTab] = useState<TacticTab>("team");
  return (
    <div className="panel rounded-panel p-4">
      <div role="tablist" aria-label="전술 지시 종류" className="mb-4 flex gap-1.5">
        {TACTIC_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-keep-selection
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-full py-2 text-[13px] font-bold transition-colors ${
              tab === t.id ? "bg-accent text-accent-ink" : "bg-surface-2 text-dim"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "team" && <InstructionsPanel />}
      {tab === "role" && <RolePicker />}
      {tab === "special" && <SpecialPanel />}
    </div>
  );
}

/** 전술 근거 · AI 추천 · 계산 근거 상세 — 하단 가로 행(lg에서 3열). */
function ExtrasPanel() {
  const rules = useTacticRules();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <FactorCards rules={rules} />
      <RecommendPanel />

      {/* 상세 보기 — 엔진이 무엇을 보고 계산하는지. 결과 확률은 넣지 않는다. */}
      <details className="panel h-fit rounded-panel p-5">
        <summary className="cursor-pointer list-none">
          <span className="flex items-center justify-between">
            <span className="eyebrow text-dim">상세 보기 (계산 근거)</span>
            <span className="text-[13px] text-dim">펼치기 ▾</span>
          </span>
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <p className="rounded-panel border border-line bg-surface/50 p-3 text-[13px] leading-relaxed text-dim">
            엔진은 라인별 전력으로 양 팀의 기대 득점을 구하고, 위 전술 근거 카드가 그
            값을 올리거나 내립니다. 그 결과가 어떻게 나오는지는 경기를 치러 봐야
            알 수 있어요 — 킥오프 전에는 확률을 보여주지 않습니다.
          </p>
          <p className="rounded-panel border border-line bg-surface/50 p-3 text-[13px] leading-relaxed text-dim">
            경기가 시작되면 상단 지표판과 승률 그래프에서 흐름이 실시간으로 갱신됩니다.
          </p>
        </div>
      </details>
    </div>
  );
}

export default function TacticsPage() {
  const router = useRouter();
  const me = useAppStore((s) => s.me);
  const opp = useAppStore((s) => s.opp);
  const movePlayer = useAppStore((s) => s.movePlayer);
  const beginMatch = useAppStore((s) => s.beginMatch);
  const mode = useAppStore((s) => s.mode);
  const rewriteContext = useAppStore((s) => s.rewriteContext);
  // rewrite 모드에서 startRewrite가 저장한 인수 시점 상태(fromRealState). 지휘봉 인계
  // 오버레이가 그 순간의 스코어·분을 읽는다(free 모드에선 beginMatch 전까지 undefined).
  const match = useAppStore((s) => s.match);

  const scout = useOppScouting();
  const [tab, setTab] = useState<Tab>("pitch");
  const [selected, setSelected] = useState<Selection | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // 지휘봉 인계 순간: 결정적 순간을 골라 작전실에 처음 들어설 때 뜬다. 순간(momentId)
  // 마다 세션에서 한 번만(뒤로가기 재진입 시 반복 방지). localStorage를 쓰는 Coachmarks
  // (최초 1회 튜토리얼)와 달리 순간별 서사 비트라 sessionStorage로 분리 게이팅한다.
  const [showHandoff, setShowHandoff] = useState(false);
  useEffect(() => {
    if (mode !== "rewrite" || !rewriteContext) return;
    const key = `touchline-handoff-${rewriteContext.momentId}`;
    try {
      if (!sessionStorage.getItem(key)) {
        // 세션 스토리지(브라우저 API) 확인 후 표시 여부를 정하는 동기화라 setState가 맞다.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShowHandoff(true);
      }
    } catch {
      // 접근 불가 환경에서는 조용히 표시하지 않는다.
    }
  }, [mode, rewriteContext]);

  const dismissHandoff = useCallback(() => {
    if (rewriteContext) {
      try {
        sessionStorage.setItem(`touchline-handoff-${rewriteContext.momentId}`, "1");
      } catch {
        /* noop */
      }
    }
    setShowHandoff(false);
  }, [rewriteContext]);

  // PointerSensor 하나만 등록한다. TouchSensor를 함께 등록하면 터치 환경에서 센서가
  // 경쟁(anti-pattern)하므로, 최신 브라우저의 포인터 이벤트를 처리하는 PointerSensor로
  // 일원화한다. distance 활성 임계로 탭(이동 없음)은 click으로 통과되어 탭-투-배치가
  // 그대로 동작하고, 이는 터치 환경의 보장된 대체 경로다.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // 탭-투-배치: 선수 탭 → 선택(토글). 슬롯 탭 → 배치/스왑.
  const onSelectPlayer = useCallback((sel: Selection) => {
    setSelected((prev) => (prev && prev.playerId === sel.playerId ? null : sel));
  }, []);

  const onPlaceAtSlot = useCallback(
    (slotId: string) => {
      // movePlayer(zustand set)를 setSelected 업데이터 안에서 부르면 렌더 중 다른
      // 컴포넌트를 갱신하게 되어 경고가 난다. 이벤트 핸들러에서 직접 호출한다.
      if (!selected) return;
      movePlayer(slotId, selected.playerId);
      setSelected(null);
    },
    [movePlayer, selected]
  );

  // Escape / 바깥 클릭으로 선택 취소.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-keep-selection]")) setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [selected]);

  const onDragStart = (e: DragStartEvent) => {
    const pid = e.active.data.current?.playerId as string | undefined;
    setActiveId(pid ?? null);
    setSelected(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith("slotdrop-")) return;
    const targetSlot = overId.slice("slotdrop-".length);
    const playerId = active.data.current?.playerId as string | undefined;
    if (playerId) movePlayer(targetSlot, playerId);
  };

  // 매치업 미선택 상태(직접 URL 진입 등) 방어.
  if (!me) {
    return (
      <main id="main" className="flex flex-1 scroll-mt-14 flex-col items-center justify-center px-5 py-24 text-center">
        <p className="eyebrow text-accent">TOUCHLINE</p>
        <h1 className="display mt-4 text-balance text-4xl text-ink">먼저 매치업을 골라주세요</h1>
        <p className="mt-4 max-w-sm text-sm text-dim">
          작전실은 내 팀과 상대를 정한 뒤에 열립니다.
        </p>
        <Link
          href="/"
          className="mt-8 rounded-control bg-accent px-6 py-3 text-sm font-black text-accent-ink transition-transform hover:-translate-y-0.5"
        >
          ← 홈으로 가서 팀 고르기
        </Link>
      </main>
    );
  }

  const team = teamById(me.teamId);
  const teamColor = team?.color2 ?? "var(--color-accent)";
  const squad = playersOf(me.teamId);
  const activePlayer = activeId ? squad.find((p) => p.id === activeId) : undefined;
  // 탭-투-배치/스쿼드 선택 중인 선수의 전체 능력치를 스쿼드 열 아래에 바로 보여준다
  // (분석 탭으로 건너가지 않아도 즉시 확인 가능 — 모바일 탭 전환 왕복을 줄인다).
  const selectedPlayer = selected ? squad.find((p) => p.id === selected.playerId) : undefined;

  // "경기 시작" 게이팅: 현재 포메이션의 슬롯이 모두 채워졌는지.
  // free 모드는 언제나 11명 필수. rewrite 모드는 실제 경기 상태(퇴장 등)로 인해
  // 10명일 수 있으므로 10명 이상이면 시작을 허용한다(fromRealState가 남긴 빈 슬롯).
  const slots = FORMATIONS[me.instructions.formation].slots;
  const placedCount = slots.filter((s) => Boolean(me.lineup[s.id])).length;
  const minRequired = mode === "rewrite" ? 10 : 11;
  const canStart = placedCount >= minRequired;

  const oppTeam = opp ? teamById(opp.teamId) : undefined;

  const onBeginMatch = () => {
    if (!canStart) return;
    beginMatch();
    router.push("/match");
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "squad", label: "스쿼드" },
    { id: "pitch", label: "피치" },
    { id: "analysis", label: "분석" },
  ];

  return (
    <main id="main" className="flex flex-1 scroll-mt-14 flex-col pb-28">
      {/* ── 헤더 ─────────────────────────────────────────── */}
      <header className="border-b border-line px-5 py-4">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow text-accent">작전실</p>
            <h1 className="display mt-0.5 truncate text-2xl text-ink">
              {team?.nameKo ?? "우리 팀"} 라인업
            </h1>
            {mode === "rewrite" && rewriteContext && (
              <RewriteContextBadge
                className="mt-2"
                meNameKo={team?.nameKo ?? "우리 팀"}
                oppNameKo={oppTeam?.nameKo ?? "상대 팀"}
                takeoverMinute={rewriteContext.takeoverMinute}
              />
            )}
          </div>
          <Link
            href="/"
            className="shrink-0 rounded-control border border-line px-4 py-2 text-xs font-bold text-dim transition-colors hover:border-white/25 hover:text-ink"
          >
            ← 매치업
          </Link>
        </div>
      </header>

      {/* ── 모바일 탭 스위처 ─────────────────────────────── */}
      <div className="sticky top-14 z-10 border-b border-line bg-pitch/85 px-5 py-2 backdrop-blur-md lg:hidden">
        <div
          role="tablist"
          aria-label="작전실 보기 전환"
          className="mx-auto flex w-full max-w-6xl gap-1.5"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={
                t.id === "analysis" ? "panel-scout panel-tactics panel-extras" : `panel-${t.id}`
              }
              // 탭 전환 시 탭-투-배치 선택이 유지되도록(바깥 클릭 취소 대상에서 제외).
              data-keep-selection
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-full py-2 text-sm font-bold transition-colors ${
                tab === t.id
                  ? "bg-accent text-accent-ink"
                  : "bg-surface-2 text-dim"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* 상대 요약 스트립: 탭과 함께 고정돼, 스쿼드/피치 탭에서 라인업을 만지는
            동안에도 "누구를 상대하는가"가 계속 보인다(예전에는 승률이 이 자리였다). */}
        <MobileScoutStrip scout={scout} />
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="tactics-grid mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-5 pt-5">
          {/* 스쿼드 레일 (lg: 왼쪽, 스티키 + 내부 스크롤) */}
          <section
            id="panel-squad"
            role="tabpanel"
            aria-labelledby="tab-squad"
            className={`ta-squad ${tab === "squad" ? "block" : "hidden"} lg:block`}
          >
            <div className="lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto lg:pr-1">
              <SquadList
                me={me}
                teamColor={teamColor}
                selected={selected}
                onSelectPlayer={onSelectPlayer}
              />
              <AttributeGrid player={selectedPlayer} className="mt-4" />
            </div>
          </section>

          {/* 피치 (lg: 가운데 위) */}
          <section
            id="panel-pitch"
            role="tabpanel"
            aria-labelledby="tab-pitch"
            className={`ta-pitch ${tab === "pitch" ? "block" : "hidden"} lg:block`}
          >
            <PitchBoard
              me={me}
              teamColor={teamColor}
              selected={selected}
              onSelectPlayer={onSelectPlayer}
              onPlaceAtSlot={onPlaceAtSlot}
            />
          </section>

          {/* 상대 스카우팅 레일 (lg: 오른쪽, 스티키) */}
          <section
            id="panel-scout"
            role="tabpanel"
            aria-labelledby="tab-analysis"
            className={`ta-scout ${tab === "analysis" ? "block" : "hidden"} lg:block`}
          >
            <div className="lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto lg:pr-1">
              <ScoutRail />
            </div>
          </section>

          {/* 전술 지시 (lg: 피치 아래 가운데 — 예전엔 이 자리가 통째로 비어 있었다) */}
          <section
            id="panel-tactics"
            role="tabpanel"
            aria-labelledby="tab-analysis"
            className={`ta-tactics ${tab === "analysis" ? "block" : "hidden"} lg:block`}
          >
            <TacticTabsPanel />
          </section>

          {/* 근거 · 추천 · 상세 (lg: 하단 가로 행) */}
          <section
            id="panel-extras"
            role="tabpanel"
            aria-labelledby="tab-analysis"
            className={`ta-extras ${tab === "analysis" ? "block" : "hidden"} lg:block`}
          >
            <ExtrasPanel />
          </section>
        </div>

        <DragOverlay dropAnimation={null}>
          {activePlayer ? (
            <div className="pointer-events-none">
              <PlayerAvatar
                name={activePlayer.name}
                number={jerseyOf(activePlayer.id)}
                size={44}
                ring="var(--color-accent)"
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <footer className="mx-auto mt-10 w-full max-w-6xl px-5">
        <Disclaimer />
      </footer>

      {/* 하단 고정 CTA */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-pitch/90 px-5 py-3 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="stat-num text-[13px] text-ink">
              선발 {placedCount}/11 배치
            </p>
            {!canStart && (
              <p className="text-[13px] text-danger">
                {mode === "rewrite"
                  ? "최소 10명을 배치해야 경기를 시작할 수 있어요."
                  : "11명을 모두 배치해야 경기를 시작할 수 있어요."}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onBeginMatch}
            disabled={!canStart}
            className="shrink-0 rounded-control bg-accent px-7 py-3 text-sm font-black text-accent-ink transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            경기 시작 →
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showHandoff && match && oppTeam && (
          <HandoffOverlay
            meNameKo={team?.nameKo ?? "우리 팀"}
            oppNameKo={oppTeam.nameKo ?? "상대 팀"}
            meCode={team?.code ?? "ME"}
            oppCode={oppTeam.code ?? "OPP"}
            minute={match.minute}
            scoreMe={match.scoreMe}
            scoreOpp={match.scoreOpp}
            onStart={dismissHandoff}
          />
        )}
      </AnimatePresence>

      <Coachmarks />
    </main>
  );
}

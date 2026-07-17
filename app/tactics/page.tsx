"use client";

// 작전실 — 감독석의 핵심 화면.
// 데스크톱: 3열(스쿼드 | 피치 보드 | 분석 패널). 모바일: 탭 전환(스쿼드/피치/분석).
// dnd-kit DndContext로 스쿼드→슬롯, 슬롯↔슬롯 드래그. 병행 수단으로 탭-투-배치 지원.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useAppStore, useWinProb } from "@/lib/store";
import { playersOf } from "@/lib/data/players";
import { teamById } from "@/lib/data/teams";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SquadList } from "@/components/tactics/SquadList";
import { PitchBoard } from "@/components/tactics/PitchBoard";
import { jerseyOf, type Selection } from "@/components/tactics/tactics-labels";

type Tab = "squad" | "pitch" | "analysis";

// 우측 분석 패널(Task 14에서 확장) — 지금은 라이브 승률만 크게 노출.
function AnalysisPanel() {
  const wp = useWinProb();
  const win = wp ? Math.round(wp.win * 100) : undefined;
  const draw = wp ? Math.round(wp.draw * 100) : undefined;
  const loss = wp ? Math.round(wp.loss * 100) : undefined;
  const favored = win !== undefined && win >= (loss ?? 0);

  return (
    <div className="panel flex flex-col gap-5 rounded-3xl p-5">
      <div>
        <p className="eyebrow text-dim">라이브 승률 예측</p>
        <div className="mt-3 flex items-end gap-2">
          <span
            className="display stat-num text-7xl"
            style={{ color: favored ? "var(--color-gain)" : "var(--color-danger)" }}
          >
            {win ?? "--"}
          </span>
          <span className="mb-2 text-2xl font-black text-dim">%</span>
          <span className="mb-2 ml-1 text-sm font-bold text-ink">승리</span>
        </div>
        <p className="mt-1 text-xs text-dim">
          라인업을 바꾸면 실시간으로 다시 계산돼요.
        </p>
      </div>

      {/* 승/무/패 분포 바 */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-gain" style={{ width: `${win ?? 0}%` }} />
        <div className="h-full bg-dim/50" style={{ width: `${draw ?? 0}%` }} />
        <div className="h-full bg-danger" style={{ width: `${loss ?? 0}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="stat-num text-lg text-gain">{win ?? "--"}%</div>
          <div className="text-[11px] text-dim">승리</div>
        </div>
        <div>
          <div className="stat-num text-lg text-ink">{draw ?? "--"}%</div>
          <div className="text-[11px] text-dim">무승부</div>
        </div>
        <div>
          <div className="stat-num text-lg text-danger">{loss ?? "--"}%</div>
          <div className="text-[11px] text-dim">패배</div>
        </div>
      </div>

      <p className="rounded-xl border border-line bg-surface/50 p-3 text-[11px] leading-relaxed text-dim">
        상세 전술 지시와 추천은 다음 단계에서 열립니다. 지금은 라인업을 자유롭게
        바꿔가며 승률 변화를 확인해 보세요.
      </p>
    </div>
  );
}

export default function TacticsPage() {
  const me = useAppStore((s) => s.me);
  const movePlayer = useAppStore((s) => s.movePlayer);

  const [tab, setTab] = useState<Tab>("pitch");
  const [selected, setSelected] = useState<Selection | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } })
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
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-24 text-center">
        <p className="eyebrow text-accent">DUGOUT</p>
        <h1 className="display mt-4 text-4xl text-ink">먼저 매치업을 골라주세요</h1>
        <p className="mt-4 max-w-sm text-sm text-dim">
          작전실은 내 팀과 상대를 정한 뒤에 열립니다.
        </p>
        <Link
          href="/"
          className="mt-8 rounded-full bg-accent px-6 py-3 text-sm font-black text-accent-ink transition-transform hover:-translate-y-0.5"
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

  const tabs: { id: Tab; label: string }[] = [
    { id: "squad", label: "스쿼드" },
    { id: "pitch", label: "피치" },
    { id: "analysis", label: "분석" },
  ];

  return (
    <main className="flex flex-1 flex-col pb-10">
      {/* ── 헤더 ─────────────────────────────────────────── */}
      <header className="border-b border-line px-5 py-4">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow text-accent">작전실</p>
            <h1 className="display mt-0.5 truncate text-2xl text-ink">
              {team?.nameKo ?? "우리 팀"} 라인업
            </h1>
          </div>
          <Link
            href="/"
            className="shrink-0 rounded-full border border-line px-4 py-2 text-xs font-bold text-dim transition-colors hover:border-white/25 hover:text-ink"
          >
            ← 매치업
          </Link>
        </div>
      </header>

      {/* ── 모바일 탭 스위처 ─────────────────────────────── */}
      <div className="sticky top-0 z-10 border-b border-line bg-pitch/85 px-5 py-2 backdrop-blur-md lg:hidden">
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
              aria-selected={tab === t.id}
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
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 px-5 pt-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)_minmax(0,320px)]">
          {/* 스쿼드 열 */}
          <div className={`${tab === "squad" ? "block" : "hidden"} lg:block`}>
            <SquadList
              me={me}
              teamColor={teamColor}
              selected={selected}
              onSelectPlayer={onSelectPlayer}
            />
          </div>

          {/* 피치 열 */}
          <div className={`${tab === "pitch" ? "block" : "hidden"} lg:block`}>
            <PitchBoard
              me={me}
              teamColor={teamColor}
              selected={selected}
              onSelectPlayer={onSelectPlayer}
              onPlaceAtSlot={onPlaceAtSlot}
            />
          </div>

          {/* 분석 열 */}
          <div className={`${tab === "analysis" ? "block" : "hidden"} lg:block`}>
            <AnalysisPanel />
          </div>
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
    </main>
  );
}

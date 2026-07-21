"use client";

// 자유 매치업의 팀 선택.
//
// 이전에는 검색창 + 성적 필터 + 2단 레이아웃(큰 카드 + 컴팩트 행)이라 "너무 복잡"했다.
// 실제 월드컵이 대륙별 예선으로 나뉘는 데 착안해, 대륙(연맹) 세그먼트로 훑는 범위를
// 좁힌다. 한 대륙을 고르면 그 대륙 팀만 깔끔한 그리드로 보여준다.

import { useMemo, useState } from "react";
import { wc2026TeamList } from "@/lib/wc2026/data";
import { h2hOf } from "@/lib/data/h2h";
import { FlagBadge } from "@/components/ui/FlagBadge";
import { attrColor, attrTierKo } from "@/components/tactics/attr-color";
import { Reveal } from "@/components/ui/Reveal";
import {
  CONFEDERATIONS,
  confederationOf,
  type Confederation,
} from "@/lib/wc2026/confederation";
import type { Team } from "@/lib/types";

interface TeamGridProps {
  myTeamId?: string;
  oppTeamId?: string;
  onSelect: (teamId: string) => void;
}

type FilterKey = Confederation | "all";

function FormMeter({ form }: { form: number }) {
  const scaled = form * 10;
  const color = attrColor(scaled);
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <div className="h-1.5 w-8 overflow-hidden rounded-full bg-surface-2 sm:w-12">
        <div className="h-full rounded-full" style={{ width: `${(form / 10) * 100}%`, background: color }} />
      </div>
      <span className="stat-num whitespace-nowrap text-[13px]" style={{ color }}>
        {form}/10
      </span>
      <span className="sr-only">폼 {attrTierKo(scaled)}</span>
    </div>
  );
}

function TeamCard({
  t,
  isMine,
  isOpp,
  h2h,
  onSelect,
}: {
  t: Team;
  isMine: boolean;
  isOpp: boolean;
  h2h?: ReturnType<typeof h2hOf>;
  onSelect: (id: string) => void;
}) {
  const selected = isMine || isOpp;
  const ring = isMine ? "var(--color-accent)" : isOpp ? "var(--color-danger)" : undefined;
  return (
    <button
      type="button"
      onClick={() => onSelect(t.id)}
      aria-pressed={selected}
      className="panel group relative flex h-full w-full items-center gap-3 rounded-panel p-3 text-left transition-colors duration-150 hover:border-white/25"
      style={{ borderColor: ring }}
    >
      {selected && (
        <span className="sr-only">{isMine ? "내 팀으로 선택됨" : "상대 팀으로 선택됨"}</span>
      )}
      <FlagBadge code={t.code} color1={t.color1} color2={t.color2} size={40} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-ink">{t.nameKo}</div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="data-label">전력</span>
          <span className="stat-num text-lg leading-none text-ink">{t.elo}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {selected && (
          <span
            className="rounded-full px-2 py-0.5 text-[13px] font-black"
            style={{
              background: ring,
              color: isMine ? "var(--color-accent-ink)" : "#2a0710",
            }}
          >
            {isMine ? "내 팀" : "상대"}
          </span>
        )}
        {h2h ? (
          <span className="flex items-center gap-1 text-[13px]">
            <span className="stat-num text-gain">{h2h.winA}</span>
            <span className="text-dim">-</span>
            <span className="stat-num text-danger">{h2h.winB}</span>
          </span>
        ) : (
          <FormMeter form={t.form} />
        )}
      </div>
    </button>
  );
}

export function TeamGrid({ myTeamId, oppTeamId, onSelect }: TeamGridProps) {
  const teams = wc2026TeamList();
  const [filter, setFilter] = useState<FilterKey>("all");

  const step = !myTeamId ? 1 : !oppTeamId ? 2 : 3;
  const stepLabel =
    step === 1 ? "내 팀을 고르세요" : step === 2 ? "상대 팀을 고르세요" : "매치업 확정";

  // 각 대륙의 팀 수. 필터 칩에 개수를 함께 보여준다.
  const counts = useMemo(() => {
    const map = new Map<Confederation, number>();
    for (const t of teams) {
      const c = confederationOf(t.code);
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return map;
  }, [teams]);

  const visible = useMemo(() => {
    if (filter === "all") return teams;
    return teams.filter((t) => confederationOf(t.code) === filter);
  }, [teams, filter]);

  const decorate = (t: Team) => ({
    isMine: t.id === myTeamId,
    isOpp: t.id === oppTeamId,
    h2h: myTeamId && t.id !== myTeamId ? h2hOf(myTeamId, t.id) : undefined,
  });

  return (
    <div className="flex flex-col gap-5">
      {/* 단계 인디케이터 */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`flex h-7 items-center gap-2 rounded-full px-3 text-xs font-bold ${
            step === 1 ? "bg-accent text-accent-ink" : "bg-surface-2 text-dim"
          }`}
        >
          <span className="stat-num">1</span> 내 팀
        </span>
        <span aria-hidden className="text-dim">→</span>
        <span
          className={`flex h-7 items-center gap-2 rounded-full px-3 text-xs font-bold ${
            step === 2 ? "bg-accent text-accent-ink" : "bg-surface-2 text-dim"
          }`}
        >
          <span className="stat-num">2</span> 상대 팀
        </span>
        <span className="ml-auto text-sm font-semibold text-ink">{stepLabel}</span>
      </div>

      {/* 대륙 필터. 48개국을 한 번에 늘어놓지 않고 연맹별로 좁힌다. */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="대륙 필터">
        <button
          type="button"
          onClick={() => setFilter("all")}
          aria-pressed={filter === "all"}
          className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
            filter === "all" ? "bg-accent text-accent-ink" : "bg-surface-2 text-dim hover:text-ink"
          }`}
        >
          전체 <span className="stat-num">{teams.length}</span>
        </button>
        {CONFEDERATIONS.map((c) => {
          const n = counts.get(c.key) ?? 0;
          if (n === 0) return null;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              aria-pressed={filter === c.key}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                filter === c.key ? "bg-accent text-accent-ink" : "bg-surface-2 text-dim hover:text-ink"
              }`}
            >
              {c.labelKo} <span className="stat-num">{n}</span>
            </button>
          );
        })}
      </div>

      <p className="-mt-1 text-[13px] leading-relaxed text-dim">
        <b className="font-bold text-ink">전력</b>은 국제 축구 Elo 레이팅입니다(높을수록 강팀,
        대략 1600~2100). <b className="font-bold text-ink">폼</b>은 최근 경기력을 10점 만점으로
        환산한 값이고, 색이 진할수록 좋습니다.
      </p>

      <ul aria-label="팀 목록" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((t, i) => (
          <li key={t.id} className="[content-visibility:auto] [contain-intrinsic-size:76px]">
            <Reveal index={i % 3} step={0.04}>
              <TeamCard t={t} {...decorate(t)} onSelect={onSelect} />
            </Reveal>
          </li>
        ))}
      </ul>
    </div>
  );
}

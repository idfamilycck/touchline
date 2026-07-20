"use client";

// 스쿼드 리스트: 선발 11명(하이라이트) + 벤치 9명. 각 행은 드래그 소스이자
// 탭-투-배치 버튼. 정보 3계층 원칙에 따라 행별 요약 스탯은 포지션별 핵심 값 +
// 사용자가 고른 정렬 기준 능력치만 노출한다. 정렬은 표시 순서만 바꿀 뿐 lineup에는
// 영향을 주지 않는다(sortSquad는 순수 함수, 이 컴포넌트가 useState로 정렬 상태만 들고 있음).

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { playersOf } from "@/lib/data/players";
import { FORMATIONS } from "@/lib/data/formations";
import { PlayerAvatar, type PlayerBadge } from "@/components/ui/PlayerAvatar";
import type { Player, SideSetup } from "@/lib/types";
import { attrColor } from "./attr-color";
import { sortSquad, numericValueOf, type SortKey, type SortDir } from "./squad-sort";
import {
  POSITION_KO,
  POSITION_STATS,
  statValue,
  jerseyOf,
  badgesFor,
  type Selection,
} from "./tactics-labels";

interface SquadListProps {
  me: SideSetup;
  teamColor: string;
  selected: Selection | null;
  onSelectPlayer: (sel: Selection) => void;
}

// 헤더 "스탯" 열이 가리킬 수 있는 키(이름 정렬과는 별개의 축이라 name은 제외).
type StatSortKey = Exclude<SortKey, "name">;

// 헤더의 "스탯" 열 값을 고르는 선택지. 12개 능력치를 전부 열로 늘어놓는 대신,
// 포지션이 섞인 스쿼드에서 가장 자주 찾는 6개만 고른다.
const STAT_OPTIONS: { key: StatSortKey; label: string }[] = [
  { key: "overall", label: "종합" },
  { key: "shooting", label: "슈팅" },
  { key: "passing", label: "패스" },
  { key: "defending", label: "수비" },
  { key: "pace", label: "스피드" },
  { key: "stamina", label: "체력" },
];

// 헤더가 다루는 정렬 대상 3가지. "stat"은 STAT_OPTIONS에서 고른 키를 가리킨다.
type SortSlot = "name" | "age" | "stat";

function SortHeaderButton({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-keep-selection
      onClick={onClick}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`flex min-h-11 items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors sm:min-h-0 ${
        active ? "text-accent" : "text-dim hover:text-ink"
      } ${className ?? ""}`}
    >
      {label}
      <span aria-hidden className="text-[9px] leading-none">
        {active ? (dir === "asc" ? "▲" : "▼") : ""}
      </span>
    </button>
  );
}

interface HeaderRowProps {
  sortSlot: SortSlot | null;
  sortDir: SortDir;
  statKey: StatSortKey;
  statLabel: string;
  onToggle: (slot: SortSlot) => void;
  onStatKeyChange: (key: StatSortKey) => void;
}

function HeaderRow({ sortSlot, sortDir, statKey, statLabel, onToggle, onStatKeyChange }: HeaderRowProps) {
  return (
    <div className="mb-1.5 flex items-center gap-3 px-2.5">
      <span className="w-[38px] shrink-0" aria-hidden="true" />
      <SortHeaderButton
        label="이름"
        active={sortSlot === "name"}
        dir={sortDir}
        onClick={() => onToggle("name")}
        className="flex-1 justify-start text-left"
      />
      <SortHeaderButton
        label="나이"
        active={sortSlot === "age"}
        dir={sortDir}
        onClick={() => onToggle("age")}
        className="hidden w-9 shrink-0 justify-center text-center sm:flex"
      />
      <div className="flex shrink-0 items-center gap-1">
        <select
          aria-label="정렬 기준 능력치 선택"
          data-keep-selection
          value={statKey}
          onChange={(e) => onStatKeyChange(e.target.value as StatSortKey)}
          className="h-11 rounded-[8px] border border-line bg-surface-2 px-1 text-[10px] font-bold text-ink sm:h-6 sm:px-1.5"
        >
          {STAT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-keep-selection
          onClick={() => onToggle("stat")}
          aria-sort={sortSlot === "stat" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
          aria-label={`${statLabel} 기준 정렬`}
          className={`flex h-11 w-6 shrink-0 items-center justify-center text-[11px] font-bold sm:h-6 ${
            sortSlot === "stat" ? "text-accent" : "text-dim hover:text-ink"
          }`}
        >
          <span aria-hidden>{sortSlot === "stat" ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
        </button>
      </div>
    </div>
  );
}

interface RowProps {
  player: Player;
  starter: boolean;
  teamColor: string;
  badges: PlayerBadge[];
  isSelected: boolean;
  statKey: StatSortKey;
  statLabel: string;
  statActive: boolean;
  onSelectPlayer: (sel: Selection) => void;
}

function Row({
  player, starter, teamColor, badges, isSelected, statKey, statLabel, statActive, onSelectPlayer,
}: RowProps) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `squad-${player.id}`,
    data: { playerId: player.id },
  });

  const primary = player.positions[0];
  const posStats = POSITION_STATS[primary];
  const selectedValue = Math.round(numericValueOf(player, statKey));

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      data-keep-selection
      aria-pressed={isSelected}
      aria-label={`${player.name} · ${POSITION_KO[primary]} · ${player.age}세`}
      onClick={() => onSelectPlayer({ playerId: player.id })}
      className={`flex w-full cursor-grab items-center gap-3 rounded-[10px] border px-2.5 py-2 text-left transition-colors active:cursor-grabbing ${
        isSelected
          ? "border-accent bg-accent/10"
          : starter
            ? "border-line bg-surface-2/60 hover:border-white/20"
            : "border-transparent bg-surface/40 hover:border-white/15"
      }`}
      style={{ touchAction: "none", opacity: isDragging ? 0.4 : 1 }}
    >
      <PlayerAvatar
        name={player.name}
        number={jerseyOf(player.id)}
        badges={badges}
        size={38}
        ring={starter ? teamColor : "var(--color-line)"}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold text-ink">{player.name}</span>
          <span className="stat-num shrink-0 text-[11px] text-dim">{player.age}세</span>
        </div>
        <div className="text-[11px] text-dim">{POSITION_KO[primary]}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {posStats.map(([key, label], i) => {
          const v = statValue(player, key);
          return (
            <div
              key={key}
              className={`w-9 flex-col items-center ${i === 1 ? "hidden sm:flex" : "flex"}`}
            >
              <span className="stat-num text-sm" style={{ color: attrColor(v) }}>
                {v}
              </span>
              <span className="text-[9px] text-dim">{label}</span>
            </div>
          );
        })}
        <div
          className={`flex w-9 flex-col items-center rounded-[6px] ${statActive ? "bg-accent/10" : ""}`}
        >
          <span className="stat-num text-sm" style={{ color: attrColor(selectedValue) }}>
            {selectedValue}
          </span>
          <span className="text-[9px] text-dim">{statLabel}</span>
        </div>
      </div>
    </button>
  );
}

export function SquadList({ me, teamColor, selected, onSelectPlayer }: SquadListProps) {
  const squad = playersOf(me.teamId);
  const slots = FORMATIONS[me.instructions.formation].slots;

  const [sortSlot, setSortSlot] = useState<SortSlot | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statKey, setStatKey] = useState<StatSortKey>("overall");

  const toggleSort = (slot: SortSlot) => {
    if (sortSlot !== slot) {
      setSortSlot(slot);
      setSortDir(slot === "name" ? "asc" : "desc");
    } else {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  };

  // 선발: 포메이션 슬롯 순서(정렬 미적용 시 기본값). 벤치: lineup에 없는 나머지(파생).
  const starterIds = slots.map((s) => me.lineup[s.id]).filter(Boolean);
  const starterSet = new Set(starterIds);
  const rawStarters = slots
    .map((s) => squad.find((p) => p.id === me.lineup[s.id]))
    .filter((p): p is Player => Boolean(p));
  const rawBench = squad.filter((p) => !starterSet.has(p.id));

  // 정렬은 표시 순서만 바꾼다 — lineup/슬롯 매핑은 그대로 유지된다.
  const activeKey: SortKey | null =
    sortSlot === "name" ? "name" : sortSlot === "age" ? "age" : sortSlot === "stat" ? statKey : null;
  const starters = activeKey ? sortSquad(rawStarters, activeKey, sortDir) : rawStarters;
  const bench = activeKey ? sortSquad(rawBench, activeKey, sortDir) : rawBench;

  const statLabel = STAT_OPTIONS.find((o) => o.key === statKey)?.label ?? "스탯";

  return (
    <div className="flex flex-col gap-4">
      <HeaderRow
        sortSlot={sortSlot}
        sortDir={sortDir}
        statKey={statKey}
        statLabel={statLabel}
        onToggle={toggleSort}
        onStatKeyChange={setStatKey}
      />

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-accent">선발 11</h2>
          <span className="stat-num text-[11px] text-dim">{starters.length}/11</span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {starters.map((p) => (
            <li key={p.id}>
              <Row
                player={p}
                starter
                teamColor={teamColor}
                badges={badgesFor(p.id, me.special)}
                isSelected={selected?.playerId === p.id}
                statKey={statKey}
                statLabel={statLabel}
                statActive={sortSlot === "stat"}
                onSelectPlayer={onSelectPlayer}
              />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-dim">벤치</h2>
          <span className="stat-num text-[11px] text-dim">{bench.length}명</span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {bench.map((p) => (
            <li key={p.id}>
              <Row
                player={p}
                starter={false}
                teamColor={teamColor}
                badges={badgesFor(p.id, me.special)}
                isSelected={selected?.playerId === p.id}
                statKey={statKey}
                statLabel={statLabel}
                statActive={sortSlot === "stat"}
                onSelectPlayer={onSelectPlayer}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

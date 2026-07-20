"use client";

// 스쿼드 리스트: 선발 11명(하이라이트) + 벤치 9명. 각 행은 드래그 소스이자
// 탭-투-배치 버튼. 정보 3계층 원칙에 따라 요약 스탯은 포지션별 핵심 2개만 노출한다.

import { useDraggable } from "@dnd-kit/core";
import { playersOf } from "@/lib/data/players";
import { FORMATIONS } from "@/lib/data/formations";
import { PlayerAvatar, type PlayerBadge } from "@/components/ui/PlayerAvatar";
import type { Player, SideSetup } from "@/lib/types";
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

interface RowProps {
  player: Player;
  starter: boolean;
  teamColor: string;
  badges: PlayerBadge[];
  isSelected: boolean;
  onSelectPlayer: (sel: Selection) => void;
}

function Row({ player, starter, teamColor, badges, isSelected, onSelectPlayer }: RowProps) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `squad-${player.id}`,
    data: { playerId: player.id },
  });

  const primary = player.positions[0];
  const stats = POSITION_STATS[primary];

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
      <div className="flex shrink-0 gap-2">
        {stats.map(([key, label]) => (
          <div key={key} className="flex w-9 flex-col items-center">
            <span className="stat-num text-sm text-ink">{statValue(player, key)}</span>
            <span className="text-[9px] text-dim">{label}</span>
          </div>
        ))}
      </div>
    </button>
  );
}

export function SquadList({ me, teamColor, selected, onSelectPlayer }: SquadListProps) {
  const squad = playersOf(me.teamId);
  const slots = FORMATIONS[me.instructions.formation].slots;

  // 선발: 포메이션 슬롯 순서대로. 벤치: lineup에 없는 나머지(파생).
  const starterIds = slots.map((s) => me.lineup[s.id]).filter(Boolean);
  const starterSet = new Set(starterIds);
  const starters = slots
    .map((s) => squad.find((p) => p.id === me.lineup[s.id]))
    .filter((p): p is Player => Boolean(p));
  const bench = squad.filter((p) => !starterSet.has(p.id));

  return (
    <div className="flex flex-col gap-4">
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
                onSelectPlayer={onSelectPlayer}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

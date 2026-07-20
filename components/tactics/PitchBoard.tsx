"use client";

// 작전실 피치 보드: 세로형 SVG 피치 위에 FORMATIONS 좌표로 11개 슬롯을 렌더한다.
// 각 슬롯은 dnd-kit 드롭 타깃이자, 안의 아바타는 드래그 소스 + 탭-투-배치 버튼이다.
// 좌표: 포메이션의 (x, y)는 자기 진영 기준(y=0 골라인, 위가 공격). 화면에서는 위가
// 상대 골문이 되도록 top = (100 - y)% 로 배치한다.

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { FORMATIONS } from "@/lib/data/formations";
import { ROLES, DEFAULT_ROLE } from "@/lib/data/roles";
import { playersOf } from "@/lib/data/players";
import { positionFitness } from "@/lib/engine/strength";
import { PlayerAvatar, type PlayerBadge } from "@/components/ui/PlayerAvatar";
import type { Player, SideSetup } from "@/lib/types";
import {
  ROLE_SHORT,
  POSITION_SHORT,
  jerseyOf,
  badgesFor,
  type Selection,
} from "./tactics-labels";
import { ManMarkLine } from "./ManMarkLine";

interface PitchBoardProps {
  me: SideSetup;
  teamColor: string;
  selected: Selection | null;
  onSelectPlayer: (sel: Selection) => void;
  onPlaceAtSlot: (slotId: string) => void;
}

interface SlotProps {
  slotId: string;
  x: number;
  y: number;
  posShort: string;
  player: Player | undefined;
  roleShort: string;
  badges: PlayerBadge[];
  unfit: boolean;
  teamColor: string;
  selected: Selection | null;
  onSelectPlayer: (sel: Selection) => void;
  onPlaceAtSlot: (slotId: string) => void;
}

function Slot({
  slotId, x, y, posShort, player, roleShort, badges, unfit,
  teamColor, selected, onSelectPlayer, onPlaceAtSlot,
}: SlotProps) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `slotdrop-${slotId}`,
    data: { slotId },
  });
  const {
    setNodeRef: setDragRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({
    id: `slot-${slotId}`,
    data: player ? { playerId: player.id, fromSlotId: slotId } : undefined,
    disabled: !player,
  });

  const isSelectedHere = selected && player && selected.playerId === player.id;
  // 다른 선수가 집어진 상태면 이 슬롯은 배치 가능 대상 → 하이라이트
  const isEligibleTarget = selected && (!player || selected.playerId !== player.id);

  const ringColor = unfit
    ? "var(--color-danger)"
    : isSelectedHere
      ? "var(--color-accent)"
      : teamColor;

  const handleClick = () => {
    if (selected) {
      // 무언가 집어든 상태 → 이 슬롯에 배치/스왑
      onPlaceAtSlot(slotId);
    } else if (player) {
      onSelectPlayer({ playerId: player.id, fromSlotId: slotId });
    }
  };

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}%`, top: `${100 - y}%` }}
    >
      <div
        ref={setDropRef}
        className={`rounded-[10px] p-1 transition-[background-color,box-shadow] ${
          isOver
            ? "bg-accent/25 ring-2 ring-accent"
            : isEligibleTarget
              ? "animate-pulse ring-2 ring-accent/60"
              : ""
        }`}
      >
        <button
          ref={setDragRef}
          {...listeners}
          {...attributes}
          type="button"
          data-keep-selection
          aria-label={
            player
              ? `${posShort} · ${player.name}${unfit ? " · 부적합 위치" : ""}`
              : `${posShort} 빈 슬롯`
          }
          aria-pressed={Boolean(isSelectedHere)}
          title={unfit ? "이 선수에게 익숙하지 않은 위치예요" : undefined}
          onClick={handleClick}
          className="flex w-16 cursor-grab flex-col items-center gap-1 active:cursor-grabbing"
          style={{ touchAction: "none", opacity: isDragging ? 0.35 : 1 }}
        >
          {player ? (
            <PlayerAvatar
              name={player.name}
              number={jerseyOf(player.id)}
              badges={badges}
              size={44}
              ring={ringColor}
            />
          ) : (
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed text-[11px] font-bold text-dim"
              style={{ borderColor: "var(--color-line)" }}
            >
              {posShort}
            </span>
          )}
          <span className="flex flex-col items-center leading-tight">
            <span className="max-w-[64px] truncate text-[10px] font-bold text-ink">
              {player ? player.name : "-"}
            </span>
            <span className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-wide text-dim">
              <span className="text-accent/90">{posShort}</span>
              <span className="truncate">{roleShort}</span>
            </span>
          </span>
          {unfit && (
            <span className="rounded bg-danger/20 px-1 text-[8px] font-bold text-danger">
              부적합
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

export function PitchBoard({
  me, teamColor, selected, onSelectPlayer, onPlaceAtSlot,
}: PitchBoardProps) {
  const formation = FORMATIONS[me.instructions.formation];
  const squad = playersOf(me.teamId);
  const byId = (id?: string) => squad.find((p) => p.id === id);

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative mx-auto w-full max-w-[430px] overflow-hidden rounded-[10px] border border-line shadow-2xl"
        style={{
          aspectRatio: "68 / 105",
          background: "linear-gradient(180deg, var(--color-turf), var(--color-turf-2))",
        }}
      >
        {/* 피치 라인/서클/박스 + 잔디 이랑 */}
        <svg
          viewBox="0 0 68 105"
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          {Array.from({ length: 10 }).map((_, i) => (
            <rect
              key={i}
              x="0"
              y={i * 10.5}
              width="68"
              height="10.5"
              fill={i % 2 === 0 ? "rgba(255,255,255,0.022)" : "transparent"}
            />
          ))}
          <g fill="none" stroke="rgba(224,255,233,0.18)" strokeWidth="0.4">
            <rect x="2" y="2" width="64" height="101" />
            <line x1="2" y1="52.5" x2="66" y2="52.5" />
            <circle cx="34" cy="52.5" r="9.15" />
            {/* 상대 골문 쪽(상단) 박스 */}
            <rect x="13.85" y="2" width="40.3" height="16.5" />
            <rect x="24.84" y="2" width="18.32" height="5.5" />
            <path d="M 27 18.5 A 9.15 9.15 0 0 0 41 18.5" />
            {/* 우리 골문 쪽(하단) 박스 */}
            <rect x="13.85" y="86.5" width="40.3" height="16.5" />
            <rect x="24.84" y="97.5" width="18.32" height="5.5" />
            <path d="M 27 86.5 A 9.15 9.15 0 0 1 41 86.5" />
          </g>
          <g fill="rgba(224,255,233,0.18)">
            <circle cx="34" cy="52.5" r="0.5" />
            <circle cx="34" cy="13" r="0.5" />
            <circle cx="34" cy="92" r="0.5" />
          </g>
        </svg>

        {/* 맨마킹 라인(설정 시) */}
        {me.special.manMark && (
          <ManMarkLine
            formation={me.instructions.formation}
            lineup={me.lineup}
            markerId={me.special.manMark.markerId}
          />
        )}

        {/* 슬롯 오버레이 */}
        {formation.slots.map((slot) => {
          const player = byId(me.lineup[slot.id]);
          const roleId = me.roles[slot.id] ?? DEFAULT_ROLE[slot.position];
          const roleShort = ROLE_SHORT[roleId] ?? ROLES[roleId]?.nameKo ?? "";
          const unfit = player ? positionFitness(player, slot.position) < 0.75 : false;
          return (
            <Slot
              key={slot.id}
              slotId={slot.id}
              x={slot.x}
              y={slot.y}
              posShort={POSITION_SHORT[slot.position]}
              player={player}
              roleShort={roleShort}
              badges={player ? badgesFor(player.id, me.special) : []}
              unfit={unfit}
              teamColor={teamColor}
              selected={selected}
              onSelectPlayer={onSelectPlayer}
              onPlaceAtSlot={onPlaceAtSlot}
            />
          );
        })}
      </div>

      {/* 상대 골문 방향 힌트 */}
      <p className="mt-3 text-center text-[11px] text-dim">
        {selected
          ? "배치할 위치를 탭하세요 · 다시 선택을 탭하면 취소"
          : "선수를 끌어다 옮기거나, 탭해서 위치를 골라 배치하세요"}
      </p>
    </div>
  );
}

"use client";

// 전술 패널 탭 2: 선수 역할.
// 왼쪽에 선발 11명(현재 역할 표기) 목록 → 슬롯 선택 → 해당 포지션의 역할 후보
// (nameKo + descKo, 현재 역할 하이라이트) → setRole로 즉시 반영.

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { FORMATIONS } from "@/lib/data/formations";
import { ROLES, ROLES_BY_POSITION, DEFAULT_ROLE } from "@/lib/data/roles";
import { playersOf } from "@/lib/data/players";
import { POSITION_KO, ROLE_SHORT, STAT_LABELS, statValue } from "./tactics-labels";
import type { Position, RoleDef } from "@/lib/types";

// 역할의 weights를 비중 내림차순으로 정렬해 [스탯키, 라벨, 비중] 튜플로 반환.
function sortedRoleStats(role: RoleDef) {
  return Object.entries(role.weights)
    .filter((entry): entry is [keyof typeof STAT_LABELS, number] => entry[1] !== undefined)
    .sort((a, b) => b[1] - a[1]);
}

export function RolePicker() {
  const me = useAppStore((s) => s.me);
  const setRole = useAppStore((s) => s.setRole);
  const slots = me ? FORMATIONS[me.instructions.formation].slots : [];
  const [activeSlot, setActiveSlot] = useState<string | null>(slots[0]?.id ?? null);

  if (!me) return null;
  const squad = playersOf(me.teamId);

  const slot = slots.find((s) => s.id === activeSlot) ?? slots[0];
  const player = slot ? squad.find((p) => p.id === me.lineup[slot.id]) : undefined;
  const pos: Position | undefined = slot?.position;
  const roleOptions = pos ? ROLES_BY_POSITION[pos] : [];
  const currentRole = slot ? me.roles[slot.id] ?? DEFAULT_ROLE[slot.position] : undefined;

  return (
    <div data-keep-selection className="flex flex-col gap-4">
      {/* 슬롯 선택 */}
      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-accent">선수 선택</h2>
        <div className="grid grid-cols-2 gap-1.5">
          {slots.map((s) => {
            const p = squad.find((pl) => pl.id === me.lineup[s.id]);
            const roleId = me.roles[s.id] ?? DEFAULT_ROLE[s.position];
            const active = s.id === activeSlot;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveSlot(s.id)}
                className={`flex flex-col items-start rounded-[10px] border px-2.5 py-1.5 text-left transition-colors ${
                  active ? "border-accent bg-accent/15" : "border-line bg-surface-2/50 hover:border-white/20"
                }`}
              >
                <span className="flex w-full items-center gap-1.5">
                  <span className="stat-num text-[10px] text-accent">{s.position}</span>
                  <span className="truncate text-[12px] font-bold text-ink">{p?.name ?? "-"}</span>
                </span>
                <span className="truncate text-[10px] text-dim">{ROLE_SHORT[roleId]}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 역할 후보 */}
      {slot && pos && (
        <section>
          <div className="mb-2 flex items-baseline gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-accent">역할</h2>
            <span className="text-[11px] text-dim">
              {player?.name ?? "빈 슬롯"} · {POSITION_KO[pos]}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {roleOptions.map((roleId) => {
              const role = ROLES[roleId];
              const active = roleId === currentRole;
              const roleStats = sortedRoleStats(role);
              return (
                <button
                  key={roleId}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRole(slot.id, roleId)}
                  className={`rounded-[10px] border px-3 py-2.5 text-left transition-colors ${
                    active ? "border-accent bg-accent/15" : "border-line bg-surface-2/50 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[13px] font-bold ${active ? "text-accent" : "text-ink"}`}>
                      {role.nameKo}
                    </span>
                    {active && <span className="text-[10px] font-bold text-accent">● 현재</span>}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-dim">{role.descKo}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {roleStats.map(([key, weight]) => (
                      <span
                        key={key}
                        className="flex items-center gap-1 rounded-full border border-line bg-surface/60 px-2 py-0.5 text-[10px] text-dim"
                      >
                        <span>{STAT_LABELS[key]}</span>
                        <span className="text-dim/60">{Math.round(weight * 100)}%</span>
                        {player && (
                          <span className="stat-num font-bold text-ink">{statValue(player, key)}</span>
                        )}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

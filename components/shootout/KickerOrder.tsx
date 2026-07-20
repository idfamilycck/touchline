"use client";

// 승부차기 키커 지정: 필드 위 11명 중 5명을 순서대로 선택한다(탭-투-추가/제거).
// 각 행에 PK(페널티)·멘탈·체력을 노출해 비축구팬도 근거를 갖고 고르게 한다.
// 순서 = 킥 순서. 정확히 5명이어야 진행할 수 있다.

import { useMemo, useState } from "react";
import { playersOf } from "@/lib/data/players";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { teamById } from "@/lib/data/teams";
import { jerseyOf } from "@/components/tactics/tactics-labels";
import type { Player, SideSetup } from "@/lib/types";

interface KickerOrderProps {
  meSetup: SideSetup;
  stamina: Record<string, number>;
  onConfirm: (kickers: string[]) => void;
}

const NEED = 5;

function staminaTone(pct: number): string {
  if (pct >= 0.66) return "var(--color-gain)";
  if (pct >= 0.4) return "var(--color-accent)";
  return "var(--color-danger)";
}

export function KickerOrder({ meSetup, stamina, onConfirm }: KickerOrderProps) {
  const team = teamById(meSetup.teamId);
  const teamColor = team?.color1 ?? "var(--color-accent)";

  // 온피치 11명을 페널티 내림차순으로. 페널티 동률이면 멘탈로 2차 정렬.
  const onPitch = useMemo<Player[]>(() => {
    const squad = playersOf(meSetup.teamId);
    const ids = Object.values(meSetup.lineup);
    return ids
      .map((id) => squad.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p))
      .sort((a, b) => b.penalty - a.penalty || b.mental - a.mental);
  }, [meSetup.teamId, meSetup.lineup]);

  const [order, setOrder] = useState<string[]>([]);

  const toggle = (id: string) => {
    setOrder((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= NEED) return prev;
      return [...prev, id];
    });
  };

  const autoPick = () => setOrder(onPitch.slice(0, NEED).map((p) => p.id));
  const clear = () => setOrder([]);

  const ready = order.length === NEED;

  return (
    <div className="flex flex-col gap-4">
      <div className="panel rounded-[10px] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-accent">키커 지정</p>
            <h2 className="mt-1 text-lg font-black text-ink">킥 순서를 정하세요</h2>
            <p className="mt-1 text-[13px] text-dim">
              필드 위 11명 중 <span className="font-bold text-ink">5명</span>을 순서대로 탭하세요. PK·멘탈이 높을수록 성공률이 오릅니다.
            </p>
          </div>
          <span
            className="stat-num shrink-0 rounded-full px-3 py-1 text-sm font-black"
            style={{
              color: ready ? "var(--color-accent-ink)" : "var(--color-dim)",
              background: ready ? "var(--color-accent)" : "var(--color-surface-2)",
            }}
          >
            {order.length}/{NEED}
          </span>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={autoPick}
            className="rounded-full border border-accent/50 bg-accent/10 px-3.5 py-1.5 text-xs font-bold text-accent transition-colors hover:bg-accent/20"
          >
            추천 5인 자동 선택
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={order.length === 0}
            className="rounded-full border border-line px-3.5 py-1.5 text-xs font-bold text-dim transition-colors hover:text-ink disabled:opacity-40"
          >
            초기화
          </button>
        </div>
      </div>

      {/* 선택된 순서 미리보기 */}
      {order.length > 0 && (
        <div className="panel rounded-[10px] p-4">
          <p className="eyebrow mb-2 text-dim">킥 순서</p>
          <ol className="flex flex-wrap gap-2">
            {order.map((id, i) => {
              const p = onPitch.find((x) => x.id === id)!;
              return (
                <li
                  key={id}
                  className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-1.5 pr-3"
                >
                  <span className="stat-num flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-black text-accent-ink">
                    {i + 1}
                  </span>
                  <span className="text-[13px] font-bold text-ink">{p.name}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* 선택 가능한 온피치 11명 */}
      <ul className="flex flex-col gap-1.5">
        {onPitch.map((p) => {
          const idx = order.indexOf(p.id);
          const selected = idx >= 0;
          const st = stamina[p.id] ?? 1;
          const stPct = Math.round(st * 100);
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`${p.name}, 페널티 ${p.penalty}, 멘탈 ${p.mental}, 체력 ${stPct}퍼센트${selected ? `, ${idx + 1}번째 키커로 선택됨` : ""}`}
                onClick={() => toggle(p.id)}
                className={`flex w-full items-center gap-3 rounded-[10px] border px-2.5 py-2 text-left transition-colors ${
                  selected
                    ? "border-accent bg-accent/10"
                    : "border-line bg-surface-2/50 hover:border-white/20"
                }`}
              >
                <div className="relative">
                  <PlayerAvatar
                    name={p.name}
                    number={jerseyOf(p.id)}
                    size={38}
                    ring={selected ? "var(--color-accent)" : teamColor}
                  />
                  {selected && (
                    <span className="stat-num absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-black text-accent-ink">
                      {idx + 1}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-bold text-ink">{p.name}</span>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-[11px] text-dim">체력</span>
                    <span className="stat-num text-[11px] font-bold" style={{ color: staminaTone(st) }}>
                      {stPct}%
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <div className="flex w-10 flex-col items-center">
                    <span className="stat-num text-sm text-ink">{p.penalty}</span>
                    <span className="text-[9px] text-dim">PK</span>
                  </div>
                  <div className="flex w-10 flex-col items-center">
                    <span className="stat-num text-sm text-ink">{p.mental}</span>
                    <span className="text-[9px] text-dim">멘탈</span>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        disabled={!ready}
        onClick={() => ready && onConfirm(order)}
        className="sticky bottom-3 z-10 w-full rounded-full bg-accent py-4 text-base font-black text-accent-ink shadow-lg transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {ready ? "승부차기 시작 →" : `${NEED - order.length}명 더 선택하세요`}
      </button>
    </div>
  );
}

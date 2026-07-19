"use client";

import { wc2026TeamList } from "@/lib/wc2026/data";
import { h2hOf } from "@/lib/data/h2h";
import { FlagBadge } from "@/components/ui/FlagBadge";

interface TeamGridProps {
  myTeamId?: string;
  oppTeamId?: string;
  onSelect: (teamId: string) => void;
}

function FormMeter({ form }: { form: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-gain"
          style={{ width: `${(form / 10) * 100}%` }}
        />
      </div>
      <span className="stat-num text-[11px] text-dim">{form}/10</span>
    </div>
  );
}

export function TeamGrid({ myTeamId, oppTeamId, onSelect }: TeamGridProps) {
  const teams = wc2026TeamList();
  const step = !myTeamId ? 1 : !oppTeamId ? 2 : 3;
  const stepLabel =
    step === 1 ? "내 팀을 고르세요" : step === 2 ? "상대 팀을 고르세요" : "매치업 확정";

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

      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {teams.map((t) => {
          const isMine = t.id === myTeamId;
          const isOpp = t.id === oppTeamId;
          const selected = isMine || isOpp;
          const h2h = myTeamId && !isMine ? h2hOf(myTeamId, t.id) : undefined;

          const ring = isMine
            ? "var(--color-accent)"
            : isOpp
              ? "var(--color-danger)"
              : "var(--color-line)";

          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                aria-pressed={selected}
                className="panel group relative flex h-full w-full flex-col gap-3 rounded-2xl p-3 text-left transition-colors duration-150 hover:border-white/25"
                style={{ borderColor: selected ? ring : undefined }}
              >
                {/* 선택 상태는 스크린리더에 텍스트로도 전달(색/리본은 시각 전용) */}
                {selected && <span className="sr-only">{isMine ? "내 팀으로 선택됨" : "상대 팀으로 선택됨"}</span>}
                {selected && (
                  <span
                    className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black"
                    style={{
                      background: ring,
                      color: isMine ? "var(--color-accent-ink)" : "#2a0710",
                    }}
                  >
                    {isMine ? "내 팀" : "상대"}
                  </span>
                )}

                <div className="flex items-center gap-2.5">
                  <FlagBadge code={t.code} color1={t.color1} color2={t.color2} size={40} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-ink">{t.nameKo}</div>
                    <div className="text-[11px] text-dim">FIFA {t.fifaRank}위</div>
                  </div>
                </div>

                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-dim">ELO</div>
                    <div className="stat-num text-xl text-ink">{t.elo}</div>
                  </div>
                  <FormMeter form={t.form} />
                </div>

                {h2h ? (
                  <div className="flex items-center gap-2 border-t border-line pt-2 text-[11px]">
                    <span className="text-dim">상대전적</span>
                    <span className="stat-num text-gain">{h2h.winA}승</span>
                    <span className="stat-num text-dim">{h2h.draw}무</span>
                    <span className="stat-num text-danger">{h2h.winB}패</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1 border-t border-line pt-2">
                    {t.styleTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-dim"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { Wc2026Match, Wc2026Round } from "@/lib/wc2026/types";
import { wc2026TeamId } from "@/lib/wc2026/data";
import { teamById } from "@/lib/data/teams";
import { sortForBrowser, roundLabelKo, availableGroups } from "@/components/rewrite/match-browser";
import { FlagBadge } from "@/components/ui/FlagBadge";

const ROUND_ORDER: Wc2026Round[] = ["group", "r32", "r16", "qf", "sf", "third", "final"];

interface MatchBrowserProps {
  matches: Wc2026Match[];
  selectedMatchId?: string;
  selectedSide?: string;
  onSelectMatch: (match: Wc2026Match) => void;
  onSelectSide: (side: string) => void;
}

// wc 팀 코드 → 표시용 한국어 이름/배지 색상. 아직 registerWc2026()이 끝나지
// 않은 극초반 렌더에도 안전하도록 미등록 시 코드/회색으로 폴백한다.
function teamDisplay(code: string) {
  const team = teamById(wc2026TeamId(code));
  return {
    nameKo: team?.nameKo ?? code,
    color1: team?.color1 ?? "#666666",
    color2: team?.color2 ?? "#cccccc",
  };
}

export function MatchBrowser({
  matches,
  selectedMatchId,
  selectedSide,
  onSelectMatch,
  onSelectSide,
}: MatchBrowserProps) {
  const [roundFilter, setRoundFilter] = useState<Wc2026Round | undefined>(undefined);
  const [groupFilter, setGroupFilter] = useState<string | undefined>(undefined);

  // 실제 데이터에 존재하는 라운드만 탭으로 노출한다(예: 결승이 아직 데이터에
  // 없으면 "결승" 탭은 숨김).
  const availableRounds = useMemo(() => {
    const present = new Set(matches.map((m) => m.round));
    return ROUND_ORDER.filter((r) => present.has(r));
  }, [matches]);

  // 조별리그 선택 시 노출할 조(A~L) 목록.
  const groups = useMemo(() => availableGroups(matches), [matches]);

  // 라운드를 조별리그가 아닌 곳으로 바꾸면 조 필터를 초기화한다.
  function pickRound(r: Wc2026Round | undefined) {
    setRoundFilter(r);
    if (r !== "group") setGroupFilter(undefined);
  }

  const visible = useMemo(
    () => sortForBrowser(matches, roundFilter, roundFilter === "group" ? groupFilter : undefined),
    [matches, roundFilter, groupFilter],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* 라운드 필터 탭 */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => pickRound(undefined)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
            roundFilter === undefined ? "bg-accent text-accent-ink" : "bg-surface-2 text-dim"
          }`}
        >
          전체
        </button>
        {availableRounds.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => pickRound(r)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
              roundFilter === r ? "bg-accent text-accent-ink" : "bg-surface-2 text-dim"
            }`}
          >
            {roundLabelKo(r)}
          </button>
        ))}
      </div>

      {/* 조 필터(조별리그 선택 시에만) */}
      {roundFilter === "group" && groups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setGroupFilter(undefined)}
            className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
              groupFilter === undefined ? "bg-accent/80 text-accent-ink" : "bg-surface text-dim"
            }`}
          >
            전체 조
          </button>
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroupFilter(g)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                groupFilter === g ? "bg-accent/80 text-accent-ink" : "bg-surface text-dim"
              }`}
            >
              {g}조
            </button>
          ))}
        </div>
      )}

      {/* 경기 카드 그리드 */}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((m) => {
          const home = teamDisplay(m.home);
          const away = teamDisplay(m.away);
          const isKor = m.home === "KOR" || m.away === "KOR";
          const isSelected = m.id === selectedMatchId;
          const totalGoals = m.scoreHome + m.scoreAway;

          return (
            <li key={m.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelectMatch(m)}
                aria-pressed={isSelected}
                className="panel flex w-full flex-col gap-2.5 rounded-2xl p-4 text-left transition-colors duration-150 hover:border-white/25"
                style={{ borderColor: isSelected ? "var(--color-accent)" : undefined }}
              >
                <div className="flex items-center justify-between text-[10px] text-dim">
                  <span className="font-bold uppercase tracking-wider">{roundLabelKo(m.round)}</span>
                  {isKor && (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 font-black text-accent">
                      KOR
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <FlagBadge code={m.home} color1={home.color1} color2={home.color2} size={28} />
                    <span className="truncate text-sm font-bold text-ink">{home.nameKo}</span>
                  </div>
                  <span className="stat-num shrink-0 px-1 text-base text-ink">
                    {m.scoreHome} : {m.scoreAway}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-row-reverse items-center gap-2">
                    <FlagBadge code={m.away} color1={away.color1} color2={away.color2} size={28} />
                    <span className="truncate text-right text-sm font-bold text-ink">{away.nameKo}</span>
                  </div>
                </div>

                <div className="border-t border-line pt-2 text-[11px] text-dim">
                  총 {totalGoals}골 · 이벤트 {m.events.length}건
                </div>
              </button>

              {/* 팀 선택(관리할 팀 고르기) — 카드 선택 시에만 노출 */}
              {isSelected && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectSide(m.home)}
                    className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${
                      selectedSide === m.home
                        ? "bg-accent text-accent-ink"
                        : "bg-surface-2 text-ink hover:bg-surface"
                    }`}
                  >
                    {home.nameKo} 지휘하기
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectSide(m.away)}
                    className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${
                      selectedSide === m.away
                        ? "bg-accent text-accent-ink"
                        : "bg-surface-2 text-ink hover:bg-surface"
                    }`}
                  >
                    {away.nameKo} 지휘하기
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {visible.length === 0 && (
        <p className="py-8 text-center text-sm text-dim">이 라운드에는 경기가 없습니다.</p>
      )}
    </div>
  );
}

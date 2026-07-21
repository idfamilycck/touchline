"use client";

import { useRouter } from "next/navigation";
import { SoccerBall, ArrowsClockwise, Square } from "@phosphor-icons/react";
import { useAppStore } from "@/lib/store";
import { buildPresets, buildEventEntries, type EntryPoint, type EntryPointIconKey } from "@/lib/wc2026/entry-points";
import type { Wc2026Match } from "@/lib/wc2026/types";
import { wc2026TeamId } from "@/lib/wc2026/data";
import { teamById } from "@/lib/data/teams";
import { FlagBadge } from "@/components/ui/FlagBadge";
import { OfficialBoard } from "@/components/ui/OfficialBoard";

interface MomentCardsProps {
  match: Wc2026Match;
  side: string; // 3-letter code (match.home 또는 match.away)
}

// EntryPoint.iconKey(시맨틱) -> 실제 Phosphor 아이콘. 카드/경고는 별도 아이콘이 없어
// Square를 색으로 구분한다(옐로/레드 카드와 동일한 은유).
function EntryPointIcon({ iconKey, className }: { iconKey: EntryPointIconKey; className?: string }) {
  switch (iconKey) {
    case "goal":
      return <SoccerBall weight="bold" className={className} aria-hidden />;
    case "sub":
      return <ArrowsClockwise weight="bold" className={className} aria-hidden />;
    case "yellow":
      return <Square weight="bold" className={className} style={{ color: "#eab308" }} aria-hidden />;
    case "red":
      return <Square weight="bold" className={className} style={{ color: "var(--color-danger)" }} aria-hidden />;
  }
}

// wc 팀 코드 → 표시용 한국어 이름/배지 색상. MatchBrowser.tsx의 teamDisplay와 동일한
// 폴백 패턴(미등록 시 코드/회색) — registerWc2026() 타이밍에 안전하게.
function teamDisplay(code: string) {
  const team = teamById(wc2026TeamId(code));
  return {
    nameKo: team?.nameKo ?? code,
    color1: team?.color1 ?? "#666666",
    color2: team?.color2 ?? "#cccccc",
  };
}

// buildPresets()는 이벤트 유무와 무관하게 항상 3개를 반환하므로, 여기엔 더 이상
// "결정적 순간이 없습니다" 같은 막다른 화면이 없다 — 완승/무카드 경기라도 항상
// 최소 3개의 진입점(풀경기/전반전/후반전)이 뜬다.
export function MomentCards({ match, side }: MomentCardsProps) {
  const router = useRouter();
  const startRewrite = useAppStore((s) => s.startRewrite);

  const presets = buildPresets();
  const events = buildEventEntries(match, side);

  const handlePick = (entry: EntryPoint) => {
    startRewrite(match.id, side, entry);
    router.push("/tactics");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 진행 방식: 항상 존재하는 3개 프리셋 — 클린 승리 등 이벤트가 적은 경기에서도
          여기서 막다른 길 없이 진입할 수 있다. */}
      <div>
        <p className="mb-2.5 text-[13px] font-black uppercase tracking-wide text-dim">진행 방식</p>
        {/* lg 이상에서는 좁은 우측 상세 패널 안에 들어가므로 다시 1열로 돌린다. */}
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:grid-cols-1">
          {presets.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => handlePick(entry)}
                className="panel flex w-full flex-col gap-1.5 rounded-panel border border-accent/40 bg-accent/5 p-4 text-left transition-colors duration-150 hover:border-accent/70 hover:bg-accent/10"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-ink">{entry.labelKo}</p>
                  <OfficialBoard minute={entry.takeoverMinute} size="sm" />
                </div>
                {entry.subKo && <p className="text-[13px] leading-snug text-dim">{entry.subKo}</p>}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* 모든 순간: 이 경기에 기록된 모든 이벤트(득점/교체/카드)를 5분 전 진입점으로. */}
      {events.length > 0 && (
        <div>
          <p className="mb-3 text-[13px] font-black uppercase tracking-wide text-dim">
            모든 순간 · 5분 전부터
          </p>
          <ul className="grid max-h-[420px] grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1">
            {events.map((entry) => {
              const team = entry.teamCode ? teamDisplay(entry.teamCode) : undefined;
              return (
                <li key={entry.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => handlePick(entry)}
                    className={`panel flex w-full min-w-0 flex-col gap-2 rounded-panel border-l-4 p-4 text-left transition-colors duration-150 hover:border-white/25 ${
                      entry.isOurs ? "bg-accent/5" : "bg-white/[0.03]"
                    }`}
                    style={{
                      borderLeftColor: entry.emphasis
                        ? "var(--color-danger)"
                        : entry.isOurs
                          ? "var(--color-accent)"
                          : "rgba(255,255,255,0.18)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <OfficialBoard minute={entry.takeoverMinute} size="sm" label="부터 지휘" />
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 font-black ${
                          entry.isOurs ? "bg-accent/15 text-accent" : "bg-white/10 text-dim"
                        }`}
                      >
                        {entry.isOurs ? "우리" : "상대"}
                      </span>
                    </div>

                    {team && entry.iconKey && (
                      <div className="flex min-w-0 items-center gap-1.5">
                        <EntryPointIcon iconKey={entry.iconKey} className="size-4 shrink-0" />
                        <FlagBadge code={entry.teamCode ?? ""} color1={team.color1} color2={team.color2} size={18} />
                        <span className="truncate text-[13px] font-bold text-dim">{team.nameKo}</span>
                      </div>
                    )}

                    <p className="text-sm font-bold leading-snug text-ink">
                      <span className="stat-num text-dim">{entry.minute}&apos;</span> {entry.detailKo}{" "}
                      <span className="text-dim">{entry.kindKo}</span>
                    </p>
                    {entry.subKo && <p className="text-[13px] text-dim">{entry.subKo}</p>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

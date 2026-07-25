"use client";

// 상대팀 전력 상세 — 실제 선발 11명과 포메이션을 피치 위에 펼쳐 보여주는 시트.
//
// 스카우팅 리포트는 "이 팀이 어떤 팀인가"를 수치로 말한다. 감독이 그다음 알고 싶은 건
// "그래서 누가 어디에 서는가 + 각자 얼마나 강한가"인데, 좁은 분석 열에 다 넣으면 못
// 읽는다. 그래서 별도 오버레이로 뺐다.
//
// 이름·포지션·배치는 전부 실제 경기 기록이다. 능력치는 이 앱이 산정한 값(합성값,
// lib/wc2026/players.ts)이지만 — 경기 시뮬레이션이 바로 이 수치로 돌아가므로, 감독이
// 상대 전력을 판단하려면 그 값을 봐야 한다. 그래서 여기 함께 싣되, "산정한 값"임을
// 화면에 분명히 밝힌다. playersOf(팀)의 선수 id는 이 명단의 playerId와 동일하다
// (lib/wc2026/register.ts가 실제 명단에서 id를 그대로 가져와 등록한다).

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { X, Users } from "@phosphor-icons/react";
import type { OppLineup, LineupSlot } from "@/lib/wc2026/lineup";
import type { Player } from "@/lib/types";
import { playersOf } from "@/lib/data/players";
import { wc2026TeamId } from "@/lib/wc2026/source";
import { roundLabelKo } from "@/components/rewrite/match-browser";
import { FlagBadge } from "@/components/ui/FlagBadge";
import { AttributeGrid } from "@/components/tactics/AttributeGrid";
import { overallOf } from "@/components/tactics/squad-sort";
import { attrColor, attrTierKo } from "./attr-color";

interface OppSquadSheetProps {
  lineup: OppLineup;
  nameKo: string;
  color1?: string;
  color2?: string;
  /** 다시 쓰기 모드에서 지금 다시 쓰는 그 경기의 명단인가. */
  isCurrentMatch: boolean;
  onClose: () => void;
}

/** 밴드별 한글 라벨 — 명단 목록을 줄 단위로 묶는 데 쓴다. */
const BAND_LABEL: Record<LineupSlot["band"], string> = {
  gk: "골키퍼",
  def: "수비",
  dm: "수비형 미드필더",
  mid: "미드필더",
  am: "공격형 미드필더",
  att: "공격",
};

const BAND_ORDER: LineupSlot["band"][] = ["gk", "def", "dm", "mid", "am", "att"];

/** 표시용 종합값(정수). 없으면 undefined. */
function ovrOf(player: Player | undefined): number | undefined {
  return player ? Math.round(overallOf(player)) : undefined;
}

function PitchDot({ slot, ovr }: { slot: LineupSlot; ovr?: number }) {
  return (
    <div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
      // y는 0이 자기 골문이므로 화면에서는 아래쪽 -> bottom 기준으로 놓는다.
      style={{ left: `${slot.x}%`, bottom: `${slot.y}%` }}
    >
      <span className="relative flex size-7 items-center justify-center rounded-full border border-white/30 bg-accent text-[10px] font-black text-accent-ink shadow-sm">
        {slot.position.replace(/-[LR]$/, "")}
        {ovr != null && (
          <span
            className="stat-num absolute -right-2 -top-1.5 rounded-full border border-black/30 bg-black/80 px-1 text-[9px] font-black leading-[1.4]"
            style={{ color: attrColor(ovr) }}
          >
            {ovr}
            <span className="sr-only"> 종합 ({attrTierKo(ovr)})</span>
          </span>
        )}
      </span>
      <span className="max-w-[68px] truncate rounded-full bg-black/55 px-1.5 py-px text-[10px] font-bold leading-tight text-white">
        {slot.name}
      </span>
    </div>
  );
}

export function OppSquadSheet({
  lineup,
  nameKo,
  color1,
  color2,
  isCurrentMatch,
  onClose,
}: OppSquadSheetProps) {
  // 오버레이이므로 Escape로 닫힌다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 실제 명단 id -> 이 앱이 산정한 Player(능력치). register가 명단 id를 그대로 등록하므로
  // playerId로 바로 조회된다.
  const players = useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of playersOf(wc2026TeamId(lineup.teamCode))) m.set(p.id, p);
    return m;
  }, [lineup.teamCode]);

  // 선발 중 종합 최고 선수를 기본 선택 — 시트를 열자마자 대표 선수의 능력치가 보인다.
  const topId = useMemo(() => {
    let best: string | undefined;
    let bestOvr = -1;
    for (const s of lineup.starters) {
      const p = players.get(s.playerId);
      if (!p) continue;
      const o = overallOf(p);
      if (o > bestOvr) {
        bestOvr = o;
        best = s.playerId;
      }
    }
    return best;
  }, [players, lineup.starters]);

  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const activeId = selectedId ?? topId;
  const activePlayer = activeId ? players.get(activeId) : undefined;

  const kickoffKo = lineup.kickoffISO.slice(0, 10).replace(/-/g, ".");
  const byBand = BAND_ORDER.map((band) => ({
    band,
    players: lineup.starters.filter((s) => s.band === band),
  })).filter((g) => g.players.length > 0);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button
        type="button"
        aria-label="상대 전력 상세 닫기"
        onClick={onClose}
        className="absolute inset-0 m-0 cursor-default appearance-none border-0 bg-black/70 p-0"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`${nameKo} 실제 선수명단`}
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        className="panel relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-panel"
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <FlagBadge code={lineup.teamCode} color1={color1 ?? "#666"} color2={color2 ?? "#ccc"} size={34} />
            <div className="min-w-0">
              <p className="eyebrow text-accent">상대 전력 상세</p>
              <h2 className="truncate text-lg font-black leading-tight text-ink">{nameKo}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded-full border border-line p-1.5 text-dim transition-colors hover:border-white/25 hover:text-ink"
          >
            <X size={16} weight="bold" aria-hidden />
          </button>
        </div>

        {/* 출처: 어느 경기 명단인지 반드시 밝힌다. 다시 쓰기 모드가 아니면 마지막
            경기 기준이라 "지금 이 경기의 명단"으로 오해하면 안 된다. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface-2/40 px-5 py-2.5 text-[13px]">
          <span className="stat-num font-black text-ink">{lineup.shapeKo ?? "포메이션 미상"}</span>
          <span className="text-dim">·</span>
          <span className="text-dim">
            {isCurrentMatch ? "이 경기 실제 선발" : "대회 마지막 경기 선발"}
          </span>
          <span className="text-dim">·</span>
          <span className="stat-num text-dim">
            {roundLabelKo(lineup.round)} vs {lineup.vsCode} {lineup.scoreFor}-{lineup.scoreAgainst}
          </span>
          <span className="stat-num ml-auto text-dim">{kickoffKo}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,232px)_minmax(0,260px)]">
            {/* 피치 */}
            <div>
              <div className="pitch-stripes relative aspect-[3/4] w-full overflow-hidden rounded-panel border border-line">
                {/* 필드 라인 — 장식이라 스크린리더에서 숨긴다. */}
                <svg viewBox="0 0 300 400" className="absolute inset-0 h-full w-full" aria-hidden>
                  <g fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5">
                    <rect x="6" y="6" width="288" height="388" />
                    <line x1="6" y1="200" x2="294" y2="200" />
                    <circle cx="150" cy="200" r="42" />
                    <rect x="80" y="6" width="140" height="52" />
                    <rect x="80" y="342" width="140" height="52" />
                  </g>
                </svg>
                {lineup.starters.map((s) => (
                  <PitchDot key={s.playerId} slot={s} ovr={ovrOf(players.get(s.playerId))} />
                ))}
              </div>
              <p className="mt-2 text-center text-[12px] text-dim">
                아래가 자기 진영 · 배치는 실제 선발 포지션에서 역산했습니다
              </p>
            </div>

            {/* 명단 — 각 선수를 눌러 오른쪽에서 능력치를 본다. */}
            <div className="flex flex-col gap-4">
              <div>
                <p className="eyebrow flex items-center gap-1.5 text-dim">
                  <Users size={13} weight="bold" aria-hidden />
                  선발 {lineup.starters.length}명
                </p>
                <div className="mt-2 flex flex-col gap-2.5">
                  {byBand.map(({ band, players: bandPlayers }) => (
                    <div key={band}>
                      <p className="text-[11px] font-black uppercase tracking-wide text-dim">
                        {BAND_LABEL[band]}
                      </p>
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {bandPlayers.map((s) => {
                          const ovr = ovrOf(players.get(s.playerId));
                          const active = activeId === s.playerId;
                          return (
                            <li key={s.playerId}>
                              <button
                                type="button"
                                onClick={() => setSelectedId(s.playerId)}
                                aria-pressed={active}
                                className={`flex w-full items-center justify-between gap-2 rounded-control px-2 py-1 text-left transition-colors ${
                                  active ? "bg-accent/15 ring-1 ring-accent/40" : "hover:bg-surface-2/60"
                                }`}
                              >
                                <span className="truncate text-[13px] text-ink">{s.name}</span>
                                <span className="flex shrink-0 items-center gap-2">
                                  <span className="stat-num text-[11px] text-dim">{s.position}</span>
                                  {ovr != null && (
                                    <span
                                      className="stat-num w-6 text-right text-[13px] font-black"
                                      style={{ color: attrColor(ovr) }}
                                    >
                                      {ovr}
                                      <span className="sr-only"> 종합 ({attrTierKo(ovr)})</span>
                                    </span>
                                  )}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              {lineup.bench.length > 0 && (
                <div>
                  <p className="eyebrow text-dim">교체 명단 {lineup.bench.length}명</p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {lineup.bench.map((b) => {
                      const ovr = ovrOf(players.get(b.playerId));
                      const active = activeId === b.playerId;
                      return (
                        <li key={b.playerId}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(b.playerId)}
                            aria-pressed={active}
                            className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] transition-colors ${
                              active
                                ? "border-accent/50 bg-accent/15 text-ink"
                                : "border-line bg-surface-2/60 text-dim hover:border-white/25"
                            }`}
                          >
                            <span className="truncate">{b.name}</span>
                            {ovr != null && (
                              <span className="stat-num font-black" style={{ color: attrColor(ovr) }}>
                                {ovr}
                                <span className="sr-only"> 종합 ({attrTierKo(ovr)})</span>
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            {/* 선택한 선수 능력치 — 경기 시뮬레이션이 쓰는 그 값. */}
            <div className="flex flex-col gap-3">
              <AttributeGrid player={activePlayer} />
              <p className="rounded-panel border border-line bg-surface/40 px-3 py-2 text-[12px] leading-relaxed text-dim">
                이름·포지션·배치는 실제 경기 기록이고, 능력치는 이 앱이 산정한 값입니다 —
                경기 시뮬레이션이 바로 이 수치로 돌아갑니다.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

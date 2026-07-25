"use client";

// 작전실 분석 열의 1층 — 상대 스카우팅 브리핑.
//
// 여기 있던 WinGauge("라이브 승률 예측")를 대체한다. 이유: 전술을 고르기도 전에
// 승률이 나와버리면 감독의 판단이 사라진다. 슬라이더를 좌우로 흔들어 숫자가 큰 쪽을
// 고르는 최적화 게임이 되고, "상대를 보고 내 전술을 정한다"는 이 앱의 전제가 무너진다.
// 그래서 이 자리에는 결과 예측 대신 "판단 재료"를 놓는다 —
//   · 상대가 실제 대회에서 어떤 팀이었는가(실측 기록)
//   · 그래서 무엇을 조심하고 무엇을 파고들 것인가(근거를 인용한 대응책)
// 승률은 경기가 시작된 뒤 ProbTimeline에서만 등장한다.

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Binoculars, Warning, Target, ArrowDown, ArrowUp, Minus, Users } from "@phosphor-icons/react";
import type { OppScouting, CounterTip, ScoutTrait } from "@/lib/wc2026/scouting";
import type { OppLineup } from "@/lib/wc2026/lineup";
import { FlagBadge } from "@/components/ui/FlagBadge";
import { OppSquadSheet } from "@/components/tactics/OppSquadSheet";

interface ScoutingReportProps {
  scout?: OppScouting;
  /** 상대 배지 색(팀 데이터에서). 없으면 회색. */
  color1?: string;
  color2?: string;
  /** 상대의 실제 선발 명단. 있으면 "선수명단 보기"가 열린다. */
  lineup?: OppLineup;
  /** lineup이 지금 다시 쓰는 그 경기의 것인가(아니면 대회 마지막 경기). */
  lineupIsCurrentMatch?: boolean;
}

const TONE_STYLE: Record<ScoutTrait["tone"], { chip: string; label: string }> = {
  threat: { chip: "border-danger/40 bg-danger/10 text-danger", label: "경계" },
  weakness: { chip: "border-gain/40 bg-gain/10 text-gain", label: "기회" },
  neutral: { chip: "border-line bg-surface-2 text-dim", label: "참고" },
};

function DirectionIcon({ direction }: { direction: CounterTip["direction"] }) {
  if (direction === "up") return <ArrowUp weight="bold" className="size-3.5" aria-hidden />;
  if (direction === "down") return <ArrowDown weight="bold" className="size-3.5" aria-hidden />;
  return <Minus weight="bold" className="size-3.5" aria-hidden />;
}

/** 대회 기록 한 칸. */
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-panel border border-line bg-surface/40 px-2.5 py-2 text-center">
      <p className="text-[12px] leading-tight text-dim">{label}</p>
      <p className="stat-num mt-0.5 text-lg leading-none text-ink">{value}</p>
      {sub && <p className="stat-num mt-0.5 text-[12px] leading-tight text-dim">{sub}</p>}
    </div>
  );
}

export function ScoutingReport({
  scout,
  color1,
  color2,
  lineup,
  lineupIsCurrentMatch = false,
}: ScoutingReportProps) {
  const [squadOpen, setSquadOpen] = useState(false);

  if (!scout) {
    return (
      <div className="panel rounded-panel p-5">
        <p className="eyebrow flex items-center gap-1.5 text-dim">
          <Binoculars size={14} weight="bold" aria-hidden />
          상대 분석
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-dim">
          이 상대는 2026 월드컵 본선 기록이 없어 분석 자료를 만들 수 없습니다.
        </p>
      </div>
    );
  }

  const threats = scout.traits.filter((t) => t.tone === "threat");
  const weaknesses = scout.traits.filter((t) => t.tone === "weakness");
  const record = `${scout.wins}승 ${scout.draws}무 ${scout.losses}패`;

  return (
    <div className="panel flex flex-col gap-4 rounded-panel p-5">
      {/* 헤더: 누구를 상대하는가 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-1.5 text-accent">
            <Binoculars size={14} weight="bold" aria-hidden />
            상대 분석
          </p>
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <FlagBadge
              code={scout.teamCode}
              color1={color1 ?? "#666666"}
              color2={color2 ?? "#cccccc"}
              size={26}
            />
            <div className="min-w-0">
              <p className="truncate text-base font-black leading-tight text-ink">{scout.nameKo}</p>
              <p className="stat-num text-[12px] leading-tight text-dim">
                ELO {scout.elo} · {scout.finishKo}
              </p>
            </div>
          </div>
        </div>
        {(lineup?.shapeKo ?? scout.shapeKo) && (
          <div className="shrink-0 rounded-control border border-line bg-surface-2/60 px-2.5 py-1.5 text-center">
            <p className="text-[12px] leading-tight text-dim">실제 선발</p>
            <p className="stat-num text-sm font-black leading-tight text-ink">
              {lineup?.shapeKo ?? scout.shapeKo}
            </p>
          </div>
        )}
      </div>

      {/* 선수명단 상세: 포메이션 숫자만으로는 "누가 어디에 서는지"를 알 수 없다.
          좁은 분석 열에 피치를 욱여넣는 대신 오버레이로 연다. */}
      {lineup && (
        <button
          type="button"
          onClick={() => setSquadOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-control border border-accent/40 bg-accent/10 py-2 text-[13px] font-bold text-accent transition-colors hover:bg-accent/20"
        >
          <Users size={14} weight="bold" aria-hidden />
          실제 선수명단 · 포메이션 보기
        </button>
      )}

      {/* 대회 실적(실측) */}
      <div>
        <div className="grid grid-cols-4 gap-1.5">
          <Stat label="전적" value={`${scout.played}경기`} sub={record} />
          <Stat
            label="득점"
            value={String(scout.gf)}
            sub={`경기당 ${scout.gfPerMatch.toFixed(1)}`}
          />
          <Stat
            label="실점"
            value={String(scout.ga)}
            sub={`경기당 ${scout.gaPerMatch.toFixed(1)}`}
          />
          <Stat label="무실점" value={`${scout.cleanSheets}회`} sub={`${scout.played}경기 중`} />
        </div>

        {/* 시간대 분포: 이 팀이 언제 강하고 언제 무너지는지 — 개입 타이밍의 근거다. */}
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <div className="rounded-panel border border-line bg-surface/40 px-3 py-2">
            <p className="text-[12px] text-dim">득점 시간대</p>
            <p className="stat-num mt-0.5 text-[13px] text-ink">
              전반 {scout.goalsFirstHalf} · 후반 {scout.goalsSecondHalf}
            </p>
          </div>
          <div className="rounded-panel border border-line bg-surface/40 px-3 py-2">
            <p className="text-[12px] text-dim">실점 시간대</p>
            <p className="stat-num mt-0.5 text-[13px] text-ink">
              전반 {scout.concededFirstHalf} · 후반 {scout.concededSecondHalf}
            </p>
          </div>
        </div>
      </div>

      {/* 성향 태그 */}
      {scout.traits.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {threats.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-black uppercase tracking-wide text-dim">
                <Warning size={12} weight="bold" aria-hidden />
                경계할 점
              </p>
              <ul className="flex flex-col gap-1.5">
                {threats.map((t) => (
                  <li
                    key={t.id}
                    className={`rounded-panel border px-2.5 py-2 ${TONE_STYLE[t.tone].chip}`}
                  >
                    <p className="text-[13px] font-black leading-tight">{t.labelKo}</p>
                    <p className="stat-num mt-0.5 text-[12px] leading-tight opacity-80">
                      {t.evidenceKo}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {weaknesses.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-black uppercase tracking-wide text-dim">
                <Target size={12} weight="bold" aria-hidden />
                파고들 지점
              </p>
              <ul className="flex flex-col gap-1.5">
                {weaknesses.map((t) => (
                  <li
                    key={t.id}
                    className={`rounded-panel border px-2.5 py-2 ${TONE_STYLE[t.tone].chip}`}
                  >
                    <p className="text-[13px] font-black leading-tight">{t.labelKo}</p>
                    <p className="stat-num mt-0.5 text-[12px] leading-tight opacity-80">
                      {t.evidenceKo}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 대응책: 무엇을 어떻게 — 각 줄이 위 수치를 근거로 인용한다. */}
      {scout.counters.length > 0 && (
        <div className="rounded-panel border border-accent/30 bg-accent/5 p-3">
          <p className="eyebrow text-accent">이렇게 맞서세요</p>
          <ul className="mt-2 flex flex-col gap-2.5">
            {scout.counters.map((c) => (
              <li key={c.id}>
                <p className="flex items-center gap-1.5 text-[13px] font-black text-ink">
                  <span className="text-accent">
                    <DirectionIcon direction={c.direction} />
                  </span>
                  {c.headlineKo}
                </p>
                <p className="mt-0.5 pl-5 text-[12px] leading-relaxed text-dim">{c.reasonKo}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[12px] leading-relaxed text-dim">
        위 수치는 이 팀이 2026 월드컵에서 실제로 기록한 값입니다. 승부 예측이 아니라,
        전술을 정할 근거예요.
      </p>

      <AnimatePresence>
        {squadOpen && lineup && (
          <OppSquadSheet
            lineup={lineup}
            nameKo={scout.nameKo}
            color1={color1}
            color2={color2}
            isCurrentMatch={lineupIsCurrentMatch}
            onClose={() => setSquadOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

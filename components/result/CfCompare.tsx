"use client";

// 카운터팩추얼 비교: 실제 스코어 vs "평행세계"(개입 없이 처음부터 다시 돌린) 스코어를
// 나란히 보여주고, 개입별 승률 델타를 색+수치로 나열한다. 유리=초록/불리=빨강.

import { teamById } from "@/lib/data/teams";
import type { CfResult } from "@/lib/engine/counterfactual";
import type { MatchState } from "@/lib/engine/match";
import { interventionTypeKo, signedPp } from "./cf-labels";

interface CfCompareProps {
  cf: CfResult;
  match: MatchState;
}

function resultWord(me: number, opp: number): string {
  if (me > opp) return "승리";
  if (me === opp) return "무승부";
  return "패배";
}

function ScoreCard({
  label,
  meCode,
  oppCode,
  me,
  opp,
  highlight,
}: {
  label: string;
  meCode: string;
  oppCode: string;
  me: number;
  opp: number;
  highlight: boolean;
}) {
  const word = resultWord(me, opp);
  const wordColor = me > opp ? "var(--color-gain)" : me === opp ? "var(--color-dim)" : "var(--color-danger)";
  return (
    <div
      className={`flex flex-1 flex-col items-center rounded-[10px] border px-3 py-4 ${
        highlight ? "border-accent/60 bg-accent/10" : "border-line bg-surface-2/40"
      }`}
    >
      <p className="eyebrow text-center text-dim">{label}</p>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-dim">
        <span>{meCode}</span>
        <span className="stat-num display text-3xl text-ink">
          {me}<span className="px-1 text-dim">:</span>{opp}
        </span>
        <span>{oppCode}</span>
      </div>
      <span className="stat-num mt-2 text-xs font-black" style={{ color: wordColor }}>
        {word}
      </span>
    </div>
  );
}

export function CfCompare({ cf, match }: CfCompareProps) {
  const me = teamById(match.me.teamId);
  const opp = teamById(match.opp.teamId);
  const meCode = me?.code ?? "ME";
  const oppCode = opp?.code ?? "OPP";

  return (
    <section className="panel rounded-[10px] p-4">
      <div className="flex items-center justify-between">
        <p className="eyebrow text-accent">평행세계 비교</p>
        <span className="text-[11px] text-dim">개입이 없었다면?</span>
      </div>

      <div className="mt-3 flex items-stretch gap-3">
        <ScoreCard
          label="실제 경기"
          meCode={meCode}
          oppCode={oppCode}
          me={match.scoreMe}
          opp={match.scoreOpp}
          highlight
        />
        <div className="flex items-center">
          <span className="text-lg text-dim" aria-hidden>vs</span>
        </div>
        <ScoreCard
          label="무개입 시뮬레이션"
          meCode={meCode}
          oppCode={oppCode}
          me={cf.baseline.scoreMe}
          opp={cf.baseline.scoreOpp}
          highlight={false}
        />
      </div>

      {/* 개입별 승률 델타 */}
      {cf.deltas.length > 0 ? (
        <ul className="mt-4 flex flex-col">
          <li className="eyebrow px-1 pb-1.5 text-dim">개입별 승률 변화</li>
          {cf.deltas.map((d, i) => {
            const roundedPp = Math.round(d.probDelta * 100);
            const color =
              roundedPp > 0
                ? "var(--color-gain)"
                : roundedPp < 0
                  ? "var(--color-danger)"
                  : "var(--color-dim)";
            const arrow = roundedPp > 0 ? "▲" : roundedPp < 0 ? "▼" : "";
            return (
              <li
                key={`${d.intervention.minute}-${i}`}
                className="data-row flex items-center justify-between px-2 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="stat-num rounded-md bg-pitch px-2 py-0.5 text-xs font-bold text-ink">
                    {d.intervention.minute}′
                  </span>
                  <span className="text-[13px] text-ink">{interventionTypeKo(d.intervention)}</span>
                </div>
                <span className="stat-num text-sm font-black" style={{ color }} aria-hidden>
                  {arrow} {signedPp(d.probDelta)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 rounded-[10px] bg-surface-2/50 px-3 py-3 text-center text-[13px] text-dim">
          이 경기에서는 작전 개입이 없었습니다. 실제 결과가 곧 데이터가 예측한 결과입니다.
        </p>
      )}
    </section>
  );
}

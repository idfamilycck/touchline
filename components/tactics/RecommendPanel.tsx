"use client";

// "추천 전술 보기" — 온디맨드로 recommend()(약 100ms, 전술 조합 전수 탐색)를 돌려
// 추천 승률·현재 대비 델타·핵심 근거 3개를 보여주고, "적용" 시 instructions/lineup/roles를
// 일괄 반영한다. 동기 CPU 작업이라 스피너가 먼저 그려지도록 다음 프레임에 실행한다.

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { recommend, type Recommendation } from "@/lib/engine/recommend";

interface RecommendPanelProps {
  currentWin?: number; // 0~1
}

export function RecommendPanel({ currentWin }: RecommendPanelProps) {
  const me = useAppStore((s) => s.me);
  const opp = useAppStore((s) => s.opp);
  const venueId = useAppStore((s) => s.setup.venueId);
  const applyRecommendation = useAppStore((s) => s.applyRecommendation);

  const [loading, setLoading] = useState(false);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [applied, setApplied] = useState(false);

  const run = () => {
    if (!me || !opp || !venueId) return;
    setLoading(true);
    setApplied(false);
    // 스피너가 먼저 페인트되도록 다음 프레임으로 미룬다.
    requestAnimationFrame(() => {
      const result = recommend(me, opp, venueId);
      setRec(result);
      setLoading(false);
    });
  };

  const apply = () => {
    if (!rec) return;
    applyRecommendation(rec);
    setApplied(true);
  };

  const recWinPct = rec ? Math.round(rec.winProb * 100) : undefined;
  // 현재 대비 델타(%p). rec.winDelta는 추천 시점의 현재값 기준이라, 표시 시점의
  // currentWin과 재계산해 표기 일관성을 맞춘다.
  const deltaPct =
    rec && currentWin !== undefined ? Math.round(rec.winProb * 100) - Math.round(currentWin * 100) : undefined;

  return (
    <div className="panel flex flex-col gap-4 rounded-[10px] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow text-dim">AI 추천 전술</p>
          <p className="mt-1 text-[11px] text-dim">수천 개 조합을 훑어 최적 세팅을 제안해요.</p>
        </div>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={loading || !me}
        className="flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-black text-accent-ink transition-transform hover:-translate-y-0.5 disabled:opacity-60"
      >
        {loading ? (
          <>
            <span className="touchline-spin h-4 w-4 rounded-full border-2 border-accent-ink/30 border-t-accent-ink" />
            분석 중…
          </>
        ) : (
          <>⚡ 추천 전술 보기</>
        )}
      </button>

      {rec && !loading && (
        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between rounded-[10px] border border-line bg-surface/50 p-3">
            <div>
              <p className="text-[11px] text-dim">추천 세팅 예상 승률</p>
              <p className="stat-num text-3xl text-gain">{recWinPct}%</p>
              <p className="stat-num text-[11px] text-dim">
                포메이션 {rec.instructions.formation} · {rec.evaluated.toLocaleString()}개 조합 검토
              </p>
            </div>
            {deltaPct !== undefined && (
              <span
                className="stat-num rounded-full px-2.5 py-1 text-xs"
                style={{
                  color: deltaPct >= 0 ? "var(--color-gain)" : "var(--color-danger)",
                  background: deltaPct >= 0 ? "rgba(59,227,138,0.14)" : "rgba(255,92,122,0.14)",
                }}
              >
                {deltaPct >= 0 ? "▲ +" : "▼ −"}
                {Math.abs(deltaPct)}%p
              </span>
            )}
          </div>

          {rec.topFactors.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {rec.topFactors.map((f) => (
                <li
                  key={f.id}
                  className="flex items-start gap-2 rounded-[10px] border border-line bg-surface/40 px-3 py-2"
                >
                  <span className="text-base leading-none" aria-hidden>
                    {f.icon}
                  </span>
                  <span className="text-[11px] leading-snug text-ink">{f.textKo}</span>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={apply}
            disabled={applied}
            className={`rounded-full border py-2.5 text-sm font-bold transition-colors ${
              applied
                ? "border-line bg-surface-2 text-dim"
                : "border-accent bg-accent/10 text-accent hover:bg-accent/20"
            }`}
          >
            {applied ? "✓ 적용됨" : "이 전술 적용하기"}
          </button>
          {deltaPct !== undefined && deltaPct === 0 && (
            <p className="text-center text-[11px] text-dim">
              지금 세팅이 이미 최적에 가까워요 — 그대로 두어도 좋아요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

// "추천 전술 보기" — 온디맨드로 recommend()(약 100ms, 전술 조합 전수 탐색)를 돌려
// 추천 포메이션과 핵심 근거 3개를 보여주고, "적용" 시 instructions/lineup/roles를
// 일괄 반영한다. 동기 CPU 작업이라 스피너가 먼저 그려지도록 다음 프레임에 실행한다.
//
// 예전에는 "추천 세팅 예상 승률 62% (▲ +7%p)"를 함께 띄웠다. 지웠다 — 킥오프 전에
// 확률이 보이면 감독이 판단할 게 없어지고, 이 패널은 "정답 버튼"이 된다. 수석코치는
// 무엇을 권하는지와 그 이유를 말하지, 이기는 확률을 말하지 않는다.

import { useState } from "react";
import { Lightning, CheckCircle } from "@phosphor-icons/react";
import { useAppStore } from "@/lib/store";
import { recommend, type Recommendation } from "@/lib/engine/recommend";
import { RuleIcon } from "@/components/ui/RuleIcon";

export function RecommendPanel() {
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

  return (
    <div className="panel flex flex-col gap-4 rounded-panel p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow text-dim">AI 수석코치 전술</p>
          <p className="mt-1 text-[13px] text-dim">수천 개 조합을 훑어 최적 세팅을 제안해요.</p>
        </div>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={loading || !me}
        className="flex items-center justify-center gap-2 rounded-control bg-accent px-5 py-3 text-sm font-black text-accent-ink transition-transform hover:-translate-y-px active:scale-[0.99] disabled:opacity-60"
      >
        {loading ? (
          <>
            <span className="touchline-spin h-4 w-4 rounded-full border-2 border-accent-ink/30 border-t-accent-ink" />
            분석 중…
          </>
        ) : (
          <>
            <Lightning weight="bold" className="size-4" aria-hidden />
            수석코치 전술 보기
          </>
        )}
      </button>

      {rec && !loading && (
        <div className="flex flex-col gap-3">
          <div className="rounded-panel border border-line bg-surface/50 p-3">
            <p className="text-[13px] text-dim">추천 포메이션</p>
            <p className="stat-num text-3xl text-ink">{rec.instructions.formation}</p>
            <p className="stat-num mt-0.5 text-[13px] text-dim">
              {rec.evaluated.toLocaleString()}개 전술 조합을 검토했습니다
            </p>
          </div>

          {rec.topFactors.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {rec.topFactors.map((f) => (
                <li
                  key={f.id}
                  className="flex items-start gap-2 rounded-panel border border-line bg-surface/40 px-3 py-2"
                >
                  <RuleIcon iconKey={f.iconKey} className="mt-0.5 shrink-0 text-dim" />
                  <span className="text-[13px] leading-snug text-ink">{f.textKo}</span>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={apply}
            disabled={applied}
            className={`flex items-center justify-center gap-1.5 rounded-full border py-2.5 text-sm font-bold transition-colors ${
              applied
                ? "border-line bg-surface-2 text-dim"
                : "border-accent bg-accent/10 text-accent hover:bg-accent/20"
            }`}
          >
            {applied ? (
              <>
                <CheckCircle weight="bold" className="size-4" aria-hidden />
                적용됨
              </>
            ) : (
              "이 전술 적용하기"
            )}
          </button>
          <p className="text-center text-[13px] leading-relaxed text-dim">
            제안일 뿐입니다. 상대 분석을 보고 직접 판단하셔도 좋아요.
          </p>
        </div>
      )}
    </div>
  );
}

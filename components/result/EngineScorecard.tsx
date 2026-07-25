"use client";

// 엔진 성적표 — "이 엔진이 실제를 이만큼 맞힌다"를 한 화면으로. 승부가 갈린 경기마다
// 승자 적중/빗나감을 히트맵으로 보여줘, 당신의 "평행세계"가 근거 위에 있음을 증명한다.
//
// 접근성: 색만으로 뜻을 전하지 않는다 — 빗나감 셀엔 점(모양)을, 그리드엔 요약 aria-label을,
// 각 셀엔 title(경기·결과)을, 범례엔 텍스트를 함께 둔다. 수치는 항상 글자로 보인다.

import { SealCheck } from "@phosphor-icons/react";
import type { Scorecard } from "@/lib/wc2026/scorecard";
import { ENGINE_VALIDATION } from "@/lib/wc2026/validation";

export function EngineScorecard({ scorecard }: { scorecard: Scorecard }) {
  const { matches, decisive, correct, ratePct, cells } = scorecard;
  const missed = decisive - correct;

  return (
    <section className="panel rounded-panel p-5">
      <div className="flex items-center gap-2">
        <SealCheck size={16} weight="bold" aria-hidden className="text-accent" />
        <p className="eyebrow text-accent">엔진 성적표 · 무개입 재현</p>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-dim">
        이 엔진을 실제 2026 월드컵에 무개입(실제 선발)으로 돌렸을 때, 승부가 갈린 경기의
        승자를 얼마나 맞혔는지입니다.
      </p>

      <div className="mt-5 grid gap-6 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center">
        {/* 헤드라인 수치 */}
        <div>
          <p className="display text-6xl font-black leading-none text-gain">
            {ratePct.toFixed(0)}
            <span className="text-2xl">%</span>
          </p>
          <p className="eyebrow mt-1.5 text-dim">승부 갈린 경기 · 승자 재현</p>
          <dl className="mt-4 flex flex-col gap-2 text-[13px]">
            <div className="flex items-center justify-between border-b border-dashed border-line pb-1.5">
              <dt className="text-dim">검증 경기</dt>
              <dd className="stat-num font-bold text-ink">{matches}경기</dd>
            </div>
            <div className="flex items-center justify-between border-b border-dashed border-line pb-1.5">
              <dt className="text-dim">승부 갈린 경기</dt>
              <dd className="stat-num font-bold text-ink">
                {correct} / {decisive}
              </dd>
            </div>
            <div className="flex items-center justify-between border-b border-dashed border-line pb-1.5">
              <dt className="text-dim">팀당 득점 오차</dt>
              <dd className="stat-num font-bold text-ink">{ENGINE_VALIDATION.goalMae.toFixed(2)}골</dd>
            </div>
          </dl>
        </div>

        {/* 히트맵 */}
        <div>
          <div
            role="img"
            aria-label={`승부가 갈린 ${decisive}경기 중 ${correct}경기 승자 적중, ${missed}경기 빗나감`}
            className="grid grid-cols-[repeat(12,minmax(0,1fr))] gap-1 sm:grid-cols-[repeat(15,minmax(0,1fr))]"
          >
            {cells.map((c) => (
              <span
                key={c.id}
                title={`${c.homeCode} ${c.home}-${c.away} ${c.awayCode} · ${c.correct ? "승자 적중" : "빗나감"}`}
                className="relative aspect-square rounded-[3px]"
                style={{
                  background: c.correct ? "var(--color-gain)" : "var(--color-danger)",
                  opacity: c.correct ? 0.85 : 0.92,
                }}
              >
                {!c.correct && (
                  <span
                    aria-hidden
                    className="absolute inset-0 m-auto h-1 w-1 rounded-full"
                    style={{ background: "var(--color-pitch)" }}
                  />
                )}
              </span>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] font-bold text-dim">
            <span className="inline-flex items-center gap-1.5">
              <i aria-hidden className="h-3.5 w-3.5 rounded-[3px]" style={{ background: "var(--color-gain)", opacity: 0.85 }} />
              승자 적중
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i
                aria-hidden
                className="relative h-3.5 w-3.5 rounded-[3px]"
                style={{ background: "var(--color-danger)", opacity: 0.92 }}
              >
                <i
                  className="absolute inset-0 m-auto h-1 w-1 rounded-full"
                  style={{ background: "var(--color-pitch)" }}
                />
              </i>
              빗나감
            </span>
            <span className="stat-num ml-auto text-dim">승부 갈린 {decisive}경기</span>
          </div>
        </div>
      </div>

      <p className="mt-5 rounded-panel border border-line bg-surface-2/40 px-3.5 py-3 text-[13px] leading-relaxed text-dim">
        승/패 두 갈래만 놓고 찍는 무작위의 기준선은 50%입니다. 이 엔진은{" "}
        <b className="text-accent">{ratePct.toFixed(0)}%</b>로 실제 승부처를 그만큼 따라갑니다. 당신의
        &ldquo;평행세계&rdquo;가 상상이 아니라 근거를 갖는 이유입니다.
      </p>
    </section>
  );
}

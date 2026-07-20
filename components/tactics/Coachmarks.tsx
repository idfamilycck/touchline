"use client";

// 첫 진입 온보딩 3단계. localStorage "touchline-onboarding"로 1회만 표시.
// 건너뛰기/다음/시작 버튼. 딤 배경 + 스포트라이트 톤의 카드.

import { useEffect, useState } from "react";

const STORAGE_KEY = "touchline-onboarding";

const STEPS = [
  {
    icon: "🖐️",
    title: "선수를 끌어 배치하세요",
    body: "스쿼드에서 선수를 피치로 드래그하거나, 탭해서 자리를 골라 배치할 수 있어요.",
  },
  {
    icon: "📈",
    title: "승률 변동을 확인하세요",
    body: "라인업·전술을 바꿀 때마다 오른쪽 '분석'에서 승률과 그 근거가 실시간으로 움직여요.",
  },
  {
    icon: "🏁",
    title: "준비되면 경기 시작",
    body: "11명을 모두 배치하면 하단의 '경기 시작' 버튼이 열립니다. 감독석에서 지휘해 보세요.",
  },
];

export function Coachmarks() {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      // localStorage 접근 불가 환경에서는 조용히 표시하지 않는다.
    }
  }, []);

  const finish = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* noop */
    }
    setOpen(false);
  };

  if (!open) return null;
  const cur = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-pitch/80 p-5 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-title"
    >
      <div className="panel w-full max-w-sm rounded-[10px] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-accent">작전실 안내 {step + 1}/{STEPS.length}</span>
          <button
            type="button"
            onClick={finish}
            className="text-[12px] font-bold text-dim underline-offset-2 hover:text-ink hover:underline"
          >
            건너뛰기
          </button>
        </div>

        <div className="mt-5 flex flex-col items-center text-center">
          <span className="text-4xl" aria-hidden>
            {cur.icon}
          </span>
          <h2 id="coach-title" className="display mt-3 text-2xl text-ink">
            {cur.title}
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-dim">{cur.body}</p>
        </div>

        {/* 진행 점 */}
        <div className="mt-5 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === step ? 20 : 8,
                background: i === step ? "var(--color-accent)" : "var(--color-surface-2)",
              }}
            />
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="rounded-full border border-line px-4 py-2.5 text-sm font-bold text-dim hover:text-ink"
            >
              이전
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? finish() : setStep((s) => s + 1))}
            className="flex-1 rounded-full bg-accent py-2.5 text-sm font-black text-accent-ink transition-transform hover:-translate-y-0.5"
          >
            {last ? "시작하기" : "다음"}
          </button>
        </div>
      </div>
    </div>
  );
}

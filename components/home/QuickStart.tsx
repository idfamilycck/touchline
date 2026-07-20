"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";

// 히어로 최상단 퀵스타트: 고민 없이 한 번에 감독석으로.
// startQuick() 이 한국 vs 브라질 · 메트라이프로 셋업을 채운 뒤 작전실로 이동.
export function QuickStart() {
  const router = useRouter();
  const startQuick = useAppStore((s) => s.startQuick);

  const go = () => {
    startQuick();
    router.push("/tactics");
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={go}
        className="group inline-flex items-center gap-3 rounded-full bg-accent px-7 py-4 text-lg font-black text-accent-ink transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
        style={{ boxShadow: "0 0 0 1px rgba(200,255,60,0.5), 0 14px 40px -12px rgba(200,255,60,0.55)" }}
      >
        <span aria-hidden>🇰🇷</span>
        <span>한국 vs 브라질 바로 지휘하기</span>
        <span aria-hidden className="transition-transform duration-150 group-hover:translate-x-1">
          →
        </span>
      </button>
    </div>
  );
}

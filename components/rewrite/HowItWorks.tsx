// 히어로 아래 "이렇게 진행돼요" 3단계. 예전엔 각 스텝에 한 문장씩 설명이 붙어 첫
// 화면이 글로 빽빽했다 — 아이콘 + 짧은 라벨만 남긴 슬림 스트립으로 바꿔 핵심 루프
// (경기 선택 → 지휘봉 잡기 → 역사 변경)를 시각적으로 5초에 잡히게 한다.

import Link from "next/link";
import { ListChecks, ClockCounterClockwise, Strategy, SealCheck, ArrowRight } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { ENGINE_VALIDATION } from "@/lib/wc2026/validation";

const STEPS: Array<{ n: number; Icon: Icon; title: string }> = [
  { n: 1, Icon: ListChecks, title: "경기 선택" },
  { n: 2, Icon: ClockCounterClockwise, title: "지휘봉 잡기" },
  { n: 3, Icon: Strategy, title: "역사 변경" },
];

export function HowItWorks() {
  return (
    <div className="flex flex-col gap-3">
      <ol className="grid grid-cols-3 gap-2 sm:gap-2.5">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className="panel flex flex-col items-center gap-1.5 rounded-panel px-2 py-3 text-center sm:flex-row sm:items-center sm:gap-2.5 sm:px-3.5 sm:py-2.5 sm:text-left"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <s.Icon size={17} weight="bold" aria-hidden />
            </span>
            <p className="flex items-baseline gap-1.5 text-[13px] font-bold text-ink sm:text-sm">
              <span className="stat-num text-accent">{s.n}</span>
              <span>{s.title}</span>
            </p>
          </li>
        ))}
      </ol>

      {/* 신뢰 근거를 한 줄로만. /engine(경기별 성적표)으로 이어 바로 확인 가능. */}
      <Link
        href="/engine"
        className="group flex w-fit items-center gap-2 rounded-control text-[13px] text-dim transition-colors hover:text-ink"
      >
        <SealCheck size={15} weight="bold" aria-hidden className="shrink-0 text-accent" />
        <span>
          실제 {ENGINE_VALIDATION.matches}경기 · 승자{" "}
          <span className="tnum font-bold text-accent">{ENGINE_VALIDATION.decisiveWinRatePct}%</span>{" "}
          재현 검증
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-bold text-accent">
          근거 보기
          <ArrowRight
            size={13}
            weight="bold"
            aria-hidden
            className="transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </Link>
    </div>
  );
}

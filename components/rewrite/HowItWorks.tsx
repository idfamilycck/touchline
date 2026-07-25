// 히어로 아래 "이렇게 진행돼요" 3단계. 첫 화면에서 이 앱이 무엇을 하는지가
// 헤드라인만으로는 안 잡힌다는 진단에 대한 답이다. 경기 선택 -> 지휘봉 잡기 -> 역사
// 변경, 세 스텝을 한 줄로 보여줘 심사위원이 핵심 루프를 5초 안에 파악하게 한다.

import Link from "next/link";
import { ListChecks, ClockCounterClockwise, Strategy, SealCheck, ArrowRight } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { ENGINE_VALIDATION } from "@/lib/wc2026/validation";

const STEPS: Array<{ n: number; Icon: Icon; title: string; body: string }> = [
  {
    n: 1,
    Icon: ListChecks,
    title: "실제 경기 선택",
    body: "2026 월드컵 104경기 중 다시 쓰고 싶은 한 경기를 고릅니다.",
  },
  {
    n: 2,
    Icon: ClockCounterClockwise,
    title: "그 순간, 지휘봉을 잡다",
    body: "승부가 갈린 바로 그 순간, 감독석에 올라 직접 지휘봉을 잡습니다.",
  },
  {
    n: 3,
    Icon: Strategy,
    title: "전술로 역사 변경",
    body: "포메이션과 지시를 바꿔 90분을 다시 치르고 결과를 뒤집습니다.",
  },
];

export function HowItWorks() {
  return (
    <div className="flex flex-col gap-3">
      <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className="panel flex items-start gap-3 rounded-panel p-3.5"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <s.Icon size={18} weight="bold" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
                <span className="stat-num text-accent">{s.n}</span>
                {s.title}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-dim">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* 신뢰 근거를 첫 화면에서 노출한다. 카운터팩추얼 전체가 "엔진이 현실을
          재현한다"는 전제에 걸려 있으므로, 그 재현율을 초입에 밝혀 둔다.
          주장으로 끝내지 않고 /engine(경기별 적중/빗나감 성적표)으로 이어, 방문자가
          바로 근거를 확인할 수 있게 한다. */}
      <Link
        href="/engine"
        className="group flex w-fit items-center gap-2 rounded-control text-[13px] text-dim transition-colors hover:text-ink"
      >
        <SealCheck size={15} weight="bold" aria-hidden className="shrink-0 text-accent" />
        <span>
          실제 {ENGINE_VALIDATION.matches}경기 검증: 승부가 갈린 경기의 승자를{" "}
          <span className="tnum font-bold text-accent">
            {ENGINE_VALIDATION.decisiveWinRatePct}%
          </span>{" "}
          재현하는 엔진입니다.
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

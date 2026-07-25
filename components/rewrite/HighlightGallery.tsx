"use client";

// 명장면 갤러리 — 104경기 앞에서 "뭘 고르지"로 멈추지 않도록, 감정이 가장 크게 걸린
// 순간을 눌러 바로 작전실로 들어가게 한다. 카드 하나가 곧 진입점이라 목록을 훑는
// 단계(경기 -> 팀 -> 순간)를 통째로 건너뛴다.
//
// 문구는 전부 실제 기록이다(lib/wc2026/highlights.ts + highlights.test.ts가 검증).

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "@phosphor-icons/react";
import { useAppStore } from "@/lib/store";
import { highlights, type Highlight } from "@/lib/wc2026/highlights";
import { wc2026TeamId } from "@/lib/wc2026/data";
import { teamById } from "@/lib/data/teams";
import { roundLabelKo } from "@/components/rewrite/match-browser";
import { FlagBadge } from "@/components/ui/FlagBadge";
import { OfficialBoard } from "@/components/ui/OfficialBoard";

const TONE_BAR: Record<Highlight["tone"], string> = {
  kor: "var(--color-accent)",
  final: "var(--color-gold)",
  drama: "var(--color-danger)",
  chance: "var(--color-gain)",
};

function display(code: string) {
  const team = teamById(wc2026TeamId(code));
  return {
    nameKo: team?.nameKo ?? code,
    color1: team?.color1 ?? "#666666",
    color2: team?.color2 ?? "#cccccc",
  };
}

export function HighlightGallery() {
  const router = useRouter();
  const startRewrite = useAppStore((s) => s.startRewrite);
  const reduce = useReducedMotion();
  const list = useMemo(() => highlights(), []);

  if (list.length === 0) return null;

  const open = (h: Highlight) => {
    startRewrite(h.matchId, h.side, { id: h.id, takeoverMinute: h.takeoverMinute });
    router.push("/tactics");
  };

  return (
    <section aria-label="명장면 바로 시작">
      <header className="accent-tab mb-4 pl-4">
        <h2 className="display text-balance text-2xl text-ink sm:text-3xl">
          바로 이 순간부터
        </h2>
        <p className="mt-1.5 text-[13px] text-dim">
          고르기 어렵다면, 승부가 가장 크게 갈린 순간에서 바로 지휘봉을 잡으세요.
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((h, i) => {
          const me = display(h.side);
          const opp = display(h.oppCode);
          return (
            <motion.li
              key={h.id}
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.5, delay: reduce ? 0 : i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="min-w-0"
            >
              <button
                type="button"
                onClick={() => open(h)}
                className="panel group flex h-full w-full flex-col gap-3 rounded-panel border-l-4 p-4 text-left transition-colors duration-150 hover:border-white/25"
                style={{ borderLeftColor: TONE_BAR[h.tone] }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-black uppercase tracking-wide text-dim">
                    {roundLabelKo(h.round)}
                  </span>
                  <OfficialBoard minute={h.takeoverMinute} size="sm" label="부터 지휘" />
                </div>

                <p className="text-base font-black leading-snug text-ink">{h.titleKo}</p>

                {/* 지휘 시작 시점의 실제 상황: 누구로, 누구를 상대로, 몇 대 몇에서 */}
                <div className="flex min-w-0 items-center gap-2">
                  <FlagBadge code={h.side} color1={me.color1} color2={me.color2} size={20} />
                  <span className="truncate text-[13px] font-bold text-ink">{me.nameKo}</span>
                  <span className="stat-num shrink-0 rounded-control bg-surface-2 px-2 py-0.5 text-[13px] font-black text-ink">
                    {h.scoreMe}
                    <span className="px-1 text-dim">:</span>
                    {h.scoreOpp}
                  </span>
                  <span className="truncate text-[13px] font-bold text-dim">{opp.nameKo}</span>
                  <FlagBadge code={h.oppCode} color1={opp.color1} color2={opp.color2} size={20} />
                </div>

                <p className="text-[13px] leading-relaxed text-dim">{h.stakeKo}</p>

                <span className="mt-auto inline-flex items-center gap-1 pt-1 text-[13px] font-black text-accent">
                  지휘봉 잡기
                  <ArrowRight
                    size={13}
                    weight="bold"
                    aria-hidden
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </button>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}

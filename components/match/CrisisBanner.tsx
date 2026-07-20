"use client";

// 위기 배너: 새 crisis 이벤트가 감지되면 상단에 "🚨 감독님, 지시가 필요합니다" 배너를
// 띄운다. 자동 일시정지는 하지 않는다. [작전 변경] 버튼으로 일시정지+시트 오픈.
// 10초 후 자동 소멸(또는 사용자가 작전 변경을 누르면 즉시 사라짐).

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { MatchEvent } from "@/lib/engine/match";

interface CrisisBannerProps {
  events: MatchEvent[];
  onIntervene: () => void;
}

// 마운트 시점의 "가장 최근 crisis" 키. 새로고침 시 이미 지나간 위기 배너를 다시 띄우지
// 않도록, 마운트 이후 새로 추가된 crisis만 트리거하게 커서를 시드한다.
function latestCrisisKey(events: MatchEvent[]): string {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === "crisis") return `${i}-${events[i].minute}`;
  }
  return "";
}

export function CrisisBanner({ events, onIntervene }: CrisisBannerProps) {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState("");
  const lastKeyRef = useRef<string>(latestCrisisKey(events));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let latest: MatchEvent | undefined;
    let idx = -1;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "crisis") {
        latest = events[i];
        idx = i;
        break;
      }
    }
    if (!latest) return;
    const key = `${idx}-${latest.minute}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    setText(latest.textKo);
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 10000);
  }, [events]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleIntervene = () => {
    setVisible(false);
    onIntervene();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -70, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -70, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="fixed inset-x-0 top-0 z-40 px-3 pt-3"
          role="alert"
        >
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3 rounded-[10px] border border-danger/50 bg-danger/15 px-4 py-3 backdrop-blur-md">
            <span className="text-xl" aria-hidden>
              🚨
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-danger">감독님, 지시가 필요합니다</p>
              <p className="truncate text-[11px] text-ink/80">{text}</p>
            </div>
            <button
              type="button"
              onClick={handleIntervene}
              className="shrink-0 rounded-full bg-accent px-4 py-2 text-xs font-black text-accent-ink transition-transform hover:-translate-y-0.5"
            >
              작전 변경
            </button>
            <button
              type="button"
              onClick={() => setVisible(false)}
              aria-label="배너 닫기"
              className="shrink-0 rounded-full px-2 py-1 text-dim hover:text-ink"
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

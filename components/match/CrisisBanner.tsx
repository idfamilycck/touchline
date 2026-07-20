"use client";

// 위기 배너: 새 crisis 이벤트가 감지되면 상단에 "🚨 감독님, 지시가 필요합니다" 배너를
// 띄운다. 자동 일시정지는 하지 않는다. [작전 변경] 버튼으로 일시정지+시트 오픈.
// 10초 후 자동 소멸(또는 사용자가 작전 변경을 누르면 즉시 사라짐).

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Siren, X } from "@phosphor-icons/react";
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
        // 고정 오버레이가 아니라 문서 흐름 안에서 높이를 밀어 연다.
        // 고정으로 두면 어느 모서리에 붙이든 무언가를 덮는다: top-0은 헤더 내비를,
        // top-14는 스코어보드를, bottom-0은 피치 하단의 장면 자막을 가렸다. 경기 화면은
        // 위아래가 이미 꽉 차 있어서 "덮지 않는 자리"가 존재하지 않는다.
        // 흐름 안으로 넣으면 아무것도 가리지 않고, 열고 닫히는 높이 변화만 애니메이션된다
        // (사용자 조작이 아닌 이벤트로 생기는 이동이라 스프링을 짧게 잡아 튐을 줄였다).
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="overflow-hidden"
          role="alert"
        >
          {/* 이 컴포넌트는 페이지의 max-w 컨테이너 바깥에 렌더되므로 좌우 여백을 직접 준다. */}
          <div className="px-4 pt-3 sm:px-5">
            <div className="mx-auto flex w-full max-w-3xl items-center gap-3 rounded-panel border border-danger/50 bg-danger/15 px-4 py-3">
              <span aria-hidden>
                <Siren size={22} weight="bold" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-danger">감독님, 지시가 필요합니다</p>
                <p className="truncate text-[11px] text-ink/80">{text}</p>
              </div>
              <button
                type="button"
                onClick={handleIntervene}
                className="shrink-0 rounded-control bg-accent px-4 py-2 text-xs font-black text-accent-ink transition-transform hover:-translate-y-px active:scale-[0.98]"
              >
                작전 변경
              </button>
              <button
                type="button"
                onClick={() => setVisible(false)}
                aria-label="배너 닫기"
                className="shrink-0 rounded-full px-2 py-1 text-dim hover:text-ink"
              >
                <X size={16} weight="bold" aria-hidden />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

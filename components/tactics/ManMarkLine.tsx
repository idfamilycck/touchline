"use client";

// 맨마킹 지시 시각화: 마커 선수 슬롯에서 상대 방향(피치 상단)으로 향하는
// 애니메이션 점선 + 타깃 링. 좌표계는 슬롯 배치와 동일하게 (x, 100 - y)를 쓰며
// preserveAspectRatio="none"으로 컨테이너에 정확히 겹쳐 슬롯과 정렬된다.

import { motion } from "framer-motion";
import { FORMATIONS } from "@/lib/data/formations";
import type { FormationId } from "@/lib/types";

interface ManMarkLineProps {
  formation: FormationId;
  lineup: Record<string, string>;
  markerId: string;
}

export function ManMarkLine({ formation, lineup, markerId }: ManMarkLineProps) {
  const slots = FORMATIONS[formation].slots;
  const markerSlot = slots.find((s) => lineup[s.id] === markerId);
  if (!markerSlot) return null;

  // 슬롯 좌표(자기 진영 기준, y=0 골라인)를 화면 좌표로 변환: 위가 공격 방향.
  const x = markerSlot.x;
  const y = 100 - markerSlot.y;
  // 상대 방향(상단)으로 향하는 타깃 지점 — 같은 열, 마커보다 위쪽.
  const targetX = x;
  const targetY = Math.max(6, y - 26);

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <motion.line
        x1={x}
        y1={y}
        x2={targetX}
        y2={targetY}
        stroke="var(--color-danger)"
        strokeWidth={0.7}
        strokeDasharray="2 2"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        initial={{ opacity: 0.35 }}
        animate={{ opacity: [0.35, 0.9, 0.35] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle
        cx={targetX}
        cy={targetY}
        r={2.4}
        fill="none"
        stroke="var(--color-danger)"
        strokeWidth={0.7}
        vectorEffect="non-scaling-stroke"
        initial={{ scale: 0.8, opacity: 0.5 }}
        animate={{ scale: [0.8, 1.15, 0.8], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: `${targetX}px ${targetY}px` }}
      />
      <circle cx={targetX} cy={targetY} r={0.5} fill="var(--color-danger)" />
    </svg>
  );
}

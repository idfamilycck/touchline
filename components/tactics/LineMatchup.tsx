"use client";

// 라인별 전력 매치업 — 골키퍼/수비/중원/공격을 우리 vs 상대로 맞대어 보여준다.
//
// WinGauge에 딸려 있던 대결 막대를 독립 패널로 꺼냈다. 게이지(승률 예측)는 없앴지만
// 이 비교는 남긴다 — 승부 확률이 아니라 "어느 라인에서 우리가 밀리는가"라는 전력 구조라,
// 감독이 라인업과 지시를 정할 때 실제로 봐야 하는 정보다. 스카우팅(상대의 실제 기록)이
// "이 팀이 어떻게 하는 팀인가"를 말한다면, 이 패널은 "지금 내 11명으로 붙으면 어디가
// 유리한가"를 말한다.

import type { LineStrengths } from "@/lib/engine/strength";
import { Scales } from "@phosphor-icons/react";

interface LineMatchupProps {
  lines?: { me: LineStrengths; opp: LineStrengths };
}

/** 우세 판정 데드밴드(전력 점수 차). 이 안쪽은 "대등"으로 본다. */
const EVEN_BAND = 2;

const ROWS: Array<{ key: keyof LineStrengths; label: string }> = [
  { key: "gk", label: "골키퍼" },
  { key: "def", label: "수비" },
  { key: "mid", label: "중원" },
  { key: "att", label: "공격" },
];

function DuelRow({ label, me, opp }: { label: string; me: number; opp: number }) {
  const total = me + opp;
  const mePct = total > 0 ? (me / total) * 100 : 50;
  const diff = me - opp;
  const even = Math.abs(diff) <= EVEN_BAND;
  const meLeads = diff > 0;

  // 색만으로 우열을 전달하지 않도록 라벨 옆에 우세 표시를 텍스트로 병기한다.
  const verdict = even ? "대등" : meLeads ? "우세" : "열세";
  const verdictColor = even
    ? "var(--color-dim)"
    : meLeads
      ? "var(--color-gain)"
      : "var(--color-danger)";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[13px]">
        <span className="stat-num text-ink">{Math.round(me)}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="font-bold uppercase tracking-wide text-dim">{label}</span>
          <span className="text-[12px] font-black" style={{ color: verdictColor }}>
            {verdict}
          </span>
        </span>
        <span className="stat-num text-dim">{Math.round(opp)}</span>
      </div>
      <div className="flex h-2 w-full items-center gap-0.5">
        <div className="flex h-full flex-1 justify-end overflow-hidden rounded-l-full bg-surface-2">
          <div
            className="h-full rounded-l-full"
            style={{
              width: `${mePct}%`,
              background: even ? "var(--color-dim)" : meLeads ? "var(--color-accent)" : "var(--color-dim)",
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <div className="flex h-full flex-1 overflow-hidden rounded-r-full bg-surface-2">
          <div
            className="h-full rounded-r-full"
            style={{
              width: `${100 - mePct}%`,
              background: even ? "var(--color-dim)" : !meLeads ? "var(--color-danger)" : "var(--color-dim)",
              transition: "width 0.4s ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function LineMatchup({ lines }: LineMatchupProps) {
  if (!lines) return null;

  // 가장 크게 밀리는 라인 한 곳을 짚어준다 — 라인업 조정의 출발점.
  let worst: { label: string; diff: number } | null = null;
  for (const r of ROWS) {
    const diff = lines.me[r.key] - lines.opp[r.key];
    if (diff < -EVEN_BAND && (worst === null || diff < worst.diff)) {
      worst = { label: r.label, diff };
    }
  }

  return (
    <div className="panel flex flex-col gap-3 rounded-panel p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow flex items-center gap-1.5 text-dim">
          <Scales size={14} weight="bold" aria-hidden />
          라인별 전력
        </p>
        <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider">
          <span className="text-accent">우리</span>
          <span className="text-dim">vs</span>
          <span className="text-danger">상대</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {ROWS.map((r) => (
          <DuelRow key={r.key} label={r.label} me={lines.me[r.key]} opp={lines.opp[r.key]} />
        ))}
      </div>

      <p className="rounded-panel border border-line bg-surface/40 px-3 py-2 text-[12px] leading-relaxed text-dim">
        {worst
          ? `${worst.label}에서 가장 크게 밀립니다. 선수 배치나 지시로 이 라인을 보강해 보세요.`
          : "밀리는 라인이 없습니다. 지금 배치로 정면 승부가 가능합니다."}
      </p>
    </div>
  );
}

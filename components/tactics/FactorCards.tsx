"use client";

// 정보 3계층의 2층: winProbability().rules → 아이콘 + 한 문장 + 델타 칩 카드.
// 조작→반응 1:1 원칙: 마지막 조작으로 새로 뜨거나 효과가 바뀐 카드에만 한 번 펄스.
// 이전 rules 배열과 diff한 뒤, 바뀐 카드 요소를 key remount해 CSS 펄스를 재생한다.

import { useEffect, useRef, useState } from "react";
import type { AppliedRule } from "@/lib/engine/modifiers";

interface FactorCardsProps {
  rules: AppliedRule[];
}

// 델타(공격/수비 배수 보정)를 %로 병기. 우리 관점에서 양수 = 유리(초록), 음수 = 불리(빨강).
function DeltaChip({ label, value }: { label: string; value: number }) {
  if (value === 0) return null;
  const pct = Math.round(value * 100);
  const gain = value > 0;
  return (
    <span
      className="stat-num inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px]"
      style={{
        color: gain ? "var(--color-gain)" : "var(--color-danger)",
        background: gain ? "rgba(59,227,138,0.12)" : "rgba(255,92,122,0.12)",
      }}
    >
      <span aria-hidden>{gain ? "▲" : "▼"}</span>
      {label} {gain ? "+" : "−"}
      {Math.abs(pct)}%
    </span>
  );
}

function ruleSig(r: AppliedRule): string {
  return `${r.id}:${r.deltaAttack}:${r.deltaDefense}:${r.textKo}`;
}

export function FactorCards({ rules }: FactorCardsProps) {
  // 이전 rules 시그니처 맵과 diff해 변경/신규 카드 id를 구한다.
  const prevSigRef = useRef<Map<string, string> | null>(null);
  const [pulsed, setPulsed] = useState<Set<string>>(new Set());
  // 펄스 재생용 nonce: 값이 바뀌면 카드 key가 바뀌어 CSS 애니메이션이 재시작된다.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const cur = new Map(rules.map((r) => [r.id, ruleSig(r)]));
    const prev = prevSigRef.current;
    prevSigRef.current = cur;
    // 첫 렌더는 펄스하지 않는다(초기 상태를 "변경"으로 보지 않음).
    if (prev === null) return;
    const changed = new Set<string>();
    for (const [id, sig] of cur) {
      if (prev.get(id) !== sig) changed.add(id);
    }
    if (changed.size === 0) return;
    setPulsed(changed);
    setNonce((n) => n + 1);
    const t = setTimeout(() => setPulsed(new Set()), 950);
    return () => clearTimeout(t);
  }, [rules]);

  if (rules.length === 0) {
    return (
      <div className="panel rounded-[10px] p-5">
        <p className="eyebrow text-dim">전술 근거</p>
        <p className="mt-3 rounded-[10px] border border-line bg-surface/50 p-3 text-[12px] leading-relaxed text-dim">
          지금은 승률을 크게 흔드는 요인이 없어요. 포메이션·지시·특수 전술을 바꾸면
          그 근거가 여기에 카드로 나타납니다.
        </p>
      </div>
    );
  }

  return (
    <div className="panel rounded-[10px] p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow text-dim">전술 근거</p>
        <span className="stat-num text-[11px] text-dim">{rules.length}개</span>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {rules.map((r) => {
          const isPulsed = pulsed.has(r.id);
          return (
            <li
              key={isPulsed ? `${r.id}-${nonce}` : r.id}
              className={`flex items-start gap-3 rounded-[10px] border border-line bg-surface/50 p-3 ${
                isPulsed ? "touchline-pulse" : ""
              }`}
            >
              <span className="mt-0.5 text-lg leading-none" aria-hidden>
                {r.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] leading-snug text-ink">{r.textKo}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <DeltaChip label="공격" value={r.deltaAttack} />
                  <DeltaChip label="수비" value={r.deltaDefense} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

// 정보 3계층의 2층: 지금 세팅이 발동시킨 전술 규칙 → 아이콘 + 한 문장 + 델타 칩 카드.
// 규칙은 applyModifiers()에서 오며(store의 useTacticRules), 승/무/패 확률과는 무관하다 —
// "무엇이 우리 공격/수비를 얼마나 밀어올리는가"만 말한다.
// 조작→반응 1:1 원칙: 마지막 조작으로 새로 뜨거나 효과가 바뀐 카드에만 한 번 펄스.
// 이전 rules 배열과 diff한 뒤, 바뀐 카드 요소를 key remount해 CSS 펄스를 재생한다.

import { useEffect, useState } from "react";
import type { AppliedRule } from "@/lib/engine/modifiers";
import { RuleIcon } from "@/components/ui/RuleIcon";

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
      className="stat-num inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[13px]"
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
  // 이전 rules 배열/시그니처 맵을 state로 들고 렌더 중 diff한다(ref는 렌더 중
  // 접근·변경이 금지돼 있어 쓸 수 없다 — react-hooks/refs).
  const [prevRules, setPrevRules] = useState<AppliedRule[] | null>(null);
  const [prevSig, setPrevSig] = useState<Map<string, string> | null>(null);
  // 가장 최근 diff에서 나온 변경분. 아래 타이머 이펙트가 "이번 rules 변경이 실제로
  // 펄스를 유발했는지"를 읽어 타이머를 새로 걸지 판단하는 데 쓴다.
  const [lastChanged, setLastChanged] = useState<Set<string> | null>(null);
  const [pulsed, setPulsed] = useState<Set<string>>(new Set());
  // 펄스 재생용 nonce: 값이 바뀌면 카드 key가 바뀌어 CSS 애니메이션이 재시작된다.
  const [nonce, setNonce] = useState(0);

  // rules가 새 참조로 바뀔 때만(개입 등으로 실제 재계산됐을 때) 렌더 중에 이전
  // 시그니처와 diff한다. 이펙트가 아니라 렌더 중 처리해 지연 없이 즉시 반영된다
  // (React 문서 "Adjusting state when a prop changes" 패턴).
  if (rules !== prevRules) {
    const cur = new Map(rules.map((r) => [r.id, ruleSig(r)]));
    setPrevRules(rules);
    setPrevSig(cur);
    // 첫 렌더는 펄스하지 않는다(초기 상태를 "변경"으로 보지 않음).
    if (prevSig === null) {
      setLastChanged(null);
    } else {
      const changed = new Set<string>();
      for (const [id, sig] of cur) {
        if (prevSig.get(id) !== sig) changed.add(id);
      }
      setLastChanged(changed.size > 0 ? changed : null);
      if (changed.size > 0) {
        setPulsed(changed);
        setNonce((n) => n + 1);
      }
    }
  }

  // 펄스 자동 해제: 이번 rules 변경이 실제 펄스를 냈을 때만 950ms 후 비우는 타이머를
  // 건다. rules가 참조만 바뀌고 diff가 없던 경우엔(위 렌더 중 분기가 이미 걸러냄)
  // 새 타이머 없이, 이 이펙트가 다시 실행되며 이전 타이머만 정리된다(원래 동작 유지).
  // setState는 타이머 콜백 안에서만 호출되므로 렌더 동기 setState가 아니다.
  useEffect(() => {
    if (!lastChanged || lastChanged.size === 0) return;
    const t = setTimeout(() => setPulsed(new Set()), 950);
    return () => clearTimeout(t);
  }, [rules, lastChanged]);

  if (rules.length === 0) {
    return (
      <div className="panel rounded-panel p-5">
        <p className="eyebrow text-dim">전술 근거</p>
        <p className="mt-3 rounded-panel border border-line bg-surface/50 p-3 text-[13px] leading-relaxed text-dim">
          지금 세팅에서 특별히 발동 중인 전술 효과가 없어요. 포메이션·지시·특수 전술을
          바꾸면 그 근거가 여기에 카드로 나타납니다.
        </p>
      </div>
    );
  }

  return (
    <div className="panel rounded-panel p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow text-dim">전술 근거</p>
        <span className="stat-num text-[13px] text-dim">{rules.length}개</span>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {rules.map((r) => {
          const isPulsed = pulsed.has(r.id);
          return (
            <li
              key={isPulsed ? `${r.id}-${nonce}` : r.id}
              className={`flex items-start gap-3 rounded-panel border border-line bg-surface/50 p-3 ${
                isPulsed ? "touchline-pulse" : ""
              }`}
            >
              <RuleIcon iconKey={r.iconKey} size={18} className="mt-0.5 shrink-0 text-dim" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-ink">{r.textKo}</p>
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

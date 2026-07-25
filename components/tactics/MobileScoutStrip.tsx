"use client";

// 모바일 전용 상대 요약 스트립.
//
// 데스크톱 분석 열에서는 ScoutingReport가 항상 보이지만 모바일에선 "분석" 탭 뒤에
// 숨는다. 스쿼드/피치 탭에서 라인업을 만지는 동안 상대가 누구인지 잊히면, 전술을
// 상대에 맞춰 짠다는 이 앱의 전제가 화면에서 사라진다. 그래서 탭 스위처 바로 아래에
// 상대의 핵심 한 줄(대회 득실 + 가장 중요한 성향 태그)을 얇게 고정한다.
//
// 이 자리에는 원래 MobileWinStrip(라이브 승률)이 있었다. 킥오프 전 승률 표시를
// 없애면서 같은 자리를 "판단 재료"로 바꿨다.

import { Binoculars } from "@phosphor-icons/react";
import type { OppScouting } from "@/lib/wc2026/scouting";

interface Props {
  scout?: OppScouting;
}

export function MobileScoutStrip({ scout }: Props) {
  if (!scout) return null;

  // 태그 우선순위: 경계(threat) > 기회(weakness). 좁은 폭이라 최대 2개만 싣는다.
  const chips = [
    ...scout.traits.filter((t) => t.tone === "threat"),
    ...scout.traits.filter((t) => t.tone === "weakness"),
  ].slice(0, 2);

  return (
    <div className="mt-2 rounded-control border border-line bg-surface/50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="eyebrow flex shrink-0 items-center gap-1 text-dim">
            <Binoculars size={12} weight="bold" aria-hidden />
            상대
          </span>
          <span className="truncate text-sm font-black text-ink">{scout.nameKo}</span>
          <span className="stat-num shrink-0 text-[12px] text-dim">
            {scout.played}경기 {scout.gf}득 {scout.ga}실
          </span>
        </div>
        {scout.shapeKo && (
          <span className="stat-num shrink-0 rounded-full border border-line bg-surface-2/70 px-2 py-0.5 text-[12px] text-dim">
            {scout.shapeKo}
          </span>
        )}
      </div>

      {chips.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {chips.map((t) => (
            <li
              key={t.id}
              className={`rounded-full border px-2 py-0.5 text-[12px] font-bold ${
                t.tone === "threat"
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-gain/40 bg-gain/10 text-gain"
              }`}
            >
              {t.labelKo}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

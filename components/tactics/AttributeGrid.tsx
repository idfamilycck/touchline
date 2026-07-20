"use client";

// 선수 능력치 전체 프로필 — FM식 촘촘한 데이터 그리드. attrs 8개 + setPiece/aerial/
// penalty/mental 4개, 총 12개 값을 3개 군집(공격 / 수비·피지컬 / 특기)으로 나눠 보여준다.
// 색상(attrColor)만으로 등급을 전달하지 않도록 attrTierKo를 sr-only로 항상 함께 낸다.
// 순수 표시 컴포넌트(스토어 비의존) — 어떤 선수를 보여줄지는 부모(작전실 페이지)가 정한다.

import type { Player } from "@/lib/types";
import { attrColor, attrTierKo } from "./attr-color";
import { POSITION_KO, jerseyOf } from "./tactics-labels";

interface AttributeGridProps {
  player: Player | null | undefined;
  className?: string;
}

interface StatRow {
  key: string;
  label: string;
  value: number;
}

interface Cluster {
  title: string;
  rows: StatRow[];
}

function clustersOf(player: Player): Cluster[] {
  const a = player.attrs;
  return [
    {
      title: "공격",
      rows: [
        { key: "shooting", label: "슈팅", value: a.shooting },
        { key: "passing", label: "패스", value: a.passing },
        { key: "dribbling", label: "드리블", value: a.dribbling },
      ],
    },
    {
      title: "수비 · 피지컬",
      rows: [
        { key: "defending", label: "수비", value: a.defending },
        { key: "pace", label: "스피드", value: a.pace },
        { key: "physical", label: "피지컬", value: a.physical },
        { key: "goalkeeping", label: "GK", value: a.goalkeeping },
        { key: "stamina", label: "체력", value: a.stamina },
      ],
    },
    {
      title: "특기",
      rows: [
        { key: "setPiece", label: "세트피스", value: player.setPiece },
        { key: "aerial", label: "공중볼", value: player.aerial },
        { key: "penalty", label: "PK", value: player.penalty },
        { key: "mental", label: "멘탈", value: player.mental },
      ],
    },
  ];
}

function StatCell({ row }: { row: StatRow }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <dt className="text-[11px] text-dim">{row.label}</dt>
      <dd className="stat-num text-[13px]" style={{ color: attrColor(row.value) }}>
        {row.value}
        <span className="sr-only"> ({attrTierKo(row.value)})</span>
      </dd>
    </div>
  );
}

export function AttributeGrid({ player, className }: AttributeGridProps) {
  if (!player) {
    return (
      <div className={`panel rounded-[10px] p-4 ${className ?? ""}`}>
        <p className="eyebrow text-dim">선수 능력치</p>
        <p className="mt-3 text-[12px] leading-relaxed text-dim">
          스쿼드에서 선수를 선택하면 전체 능력치가 여기에 표시돼요.
        </p>
      </div>
    );
  }

  const primary = player.positions[0];
  const clusters = clustersOf(player);

  return (
    <div className={`panel rounded-[10px] p-4 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow text-dim">선수 능력치</p>
          <p className="mt-0.5 truncate text-sm font-bold text-ink">
            {player.name}
            <span className="stat-num ml-1.5 text-[11px] font-normal text-dim">
              #{jerseyOf(player.id)}
            </span>
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px] font-bold text-dim">
          {POSITION_KO[primary]} · {player.age}세
        </span>
      </div>

      <div className="mt-2 flex flex-col">
        {clusters.map((c) => (
          <section key={c.title} className="data-row py-2">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-accent">
              {c.title}
            </h3>
            <dl className="mt-1 grid grid-cols-2 gap-x-3">
              {c.rows.map((r) => (
                <StatCell key={r.key} row={r} />
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}

"use client";

// 경기 요약(방송식 스탯 시트).
//
// 이전에는 접힌 아코디언 안에 슈팅/유효슈팅/코너/경고 네 줄만 있었다. 복기 화면에서
// 가장 먼저 궁금한 "경기가 어떻게 흘러갔나"에 답하지 못했다. 접힘을 풀고 지표를 늘리되,
// 엔진이 실제로 시뮬레이션한 값만 쓴다.
//
// 점유율에 대하여: 이 엔진은 볼 점유를 시뮬레이션하지 않는다. 없는 측정치를 지어내지
// 않기 위해 "공격 점유(찬스 생성 비중)"라는 다른 이름의 실제 지표를 쓰고, 하단에 그
// 정의를 밝힌다.

import { matchStats, type SideStats } from "@/lib/engine/match-stats";
import type { MatchState } from "@/lib/engine/match";

interface Row {
  label: string;
  me: number;
  opp: number;
  /** 값 표기 방식. 기본은 정수. */
  format?: (v: number) => string;
  /** 낮을수록 좋은 지표(경고 등)는 막대 색을 뒤집지 않고 값만 보여준다. */
  bar?: boolean;
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** 좌우 대비 막대. 두 팀 값의 비율만큼 가운데를 나눠 갖는다. */
function CompareBar({ me, opp }: { me: number; opp: number }) {
  const total = me + opp;
  const meShare = total > 0 ? (me / total) * 100 : 50;
  return (
    <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-surface-2">
      <div className="h-full bg-accent" style={{ width: `${meShare}%` }} />
      <div className="h-full flex-1 bg-danger/70" />
    </div>
  );
}

function StatRow({ row }: { row: Row }) {
  const fmt = row.format ?? ((v: number) => String(v));
  const meLeads = row.me > row.opp;
  const oppLeads = row.opp > row.me;
  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className={`stat-num text-lg ${meLeads ? "text-accent" : "text-ink"}`}>
          {fmt(row.me)}
        </span>
        <span className="text-[13px] text-dim">{row.label}</span>
        <span className={`stat-num text-lg ${oppLeads ? "text-danger" : "text-ink"}`}>
          {fmt(row.opp)}
        </span>
      </div>
      {row.bar !== false && <CompareBar me={row.me} opp={row.opp} />}
    </li>
  );
}

export function MatchSummary({
  match,
  meNameKo,
  oppNameKo,
}: {
  match: MatchState;
  meNameKo: string;
  oppNameKo: string;
}) {
  const s = matchStats(match);

  const conv = (side: SideStats) => (side.conversion === null ? 0 : side.conversion);
  const hasConversion = s.me.onTarget > 0 || s.opp.onTarget > 0;

  const rows: Row[] = [
    { label: "골", me: s.me.goals, opp: s.opp.goals },
    { label: "슈팅", me: s.me.shots, opp: s.opp.shots },
    { label: "유효슈팅", me: s.me.onTarget, opp: s.opp.onTarget },
    { label: "찬스", me: s.me.chances, opp: s.opp.chances },
    { label: "코너킥", me: s.me.corners, opp: s.opp.corners },
    { label: "선방", me: s.me.saves, opp: s.opp.saves },
    { label: "경고", me: s.me.cards, opp: s.opp.cards, bar: false },
  ];
  if (hasConversion) {
    rows.splice(3, 0, {
      label: "결정력",
      me: conv(s.me),
      opp: conv(s.opp),
      format: pct,
    });
  }

  return (
    <section className="panel rounded-panel p-4 sm:p-5" aria-label="경기 요약">
      <p className="eyebrow text-accent">경기 요약</p>
      <h2 className="mt-1 text-lg font-bold text-ink">기록으로 본 90분</h2>

      {/* 팀 이름을 좌우에 한 번만 밝히고, 이하 행은 숫자만 좌우로 읽는다. */}
      <div className="mt-3 flex items-baseline justify-between gap-3 border-b border-line pb-2">
        <span className="truncate text-sm font-bold text-accent">{meNameKo}</span>
        <span className="shrink-0 text-[13px] text-dim">지표</span>
        <span className="truncate text-sm font-bold text-danger">{oppNameKo}</span>
      </div>

      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <StatRow key={r.label} row={r} />
        ))}
      </ul>

      {/* 공격 점유는 별도 블록. 다른 지표와 단위가 달라 같은 표에 섞지 않는다. */}
      <div className="mt-3 rounded-panel border border-line bg-surface-2/50 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="stat-num text-lg text-accent">{s.attackShareMe}%</span>
          <span className="text-[13px] text-dim">공격 점유</span>
          <span className="stat-num text-lg text-danger">{100 - s.attackShareMe}%</span>
        </div>
        <CompareBar me={s.attackShareMe} opp={100 - s.attackShareMe} />
        <p className="mt-2 text-[13px] leading-relaxed text-dim">
          양 팀이 만든 찬스 <span className="tnum text-ink">{s.totalChances}</span>회 중 우리가
          만든 비중입니다. 이 시뮬레이터는 볼 점유 시간을 계산하지 않으므로 중계의 점유율과는
          다른 지표입니다.
        </p>
      </div>
    </section>
  );
}

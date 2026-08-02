"use client";

// 경기 중 지표판 — 감독이 "지금 무슨 일이 벌어지고 있는가"를 읽는 계기판.
//
// 왜 만들었나: 경기 화면에는 승률 그래프 하나뿐이었다. 승률은 결과 예측이지 경기의
// 내용이 아니라서, 개입을 결정할 근거가 되지 못한다("승률이 떨어졌다"는 알겠는데
// 무엇을 바꿔야 하는지는 알 수 없다). 아래 지표는 전부 시뮬레이션이 실제로 낸
// 값이며, 각각 다른 결정을 돕는다:
//   · 최근 흐름   -> 지금 개입할 때인가
//   · 점유율      -> 경기를 우리가 쥐고 있나
//   · 슈팅/유효슈팅 -> 만든 기회를 마무리하고 있나
//   · 결정력      -> 골이 안 나는 게 기회 부족인가 마무리 부족인가
//   · 팀 체력     -> 교체 카드를 쓸 때인가
//   · 공격 위협   -> 위험한 쪽이 어디인가
// (승률 그래프는 옆에 그대로 남는다 — 이 지표판은 그 그래프의 "왜"를 설명한다.)

import { useMemo } from "react";
import { TrendUp, Fire, Target, Crosshair, Heartbeat, ChartBar } from "@phosphor-icons/react";
import {
  matchStats,
  recentMomentum,
  teamStaminaPct,
  MOMENTUM_WINDOW_MIN,
} from "@/lib/engine/match-stats";
import type { MatchState } from "@/lib/engine/match";

interface LiveMetricsProps {
  match: MatchState;
  meCode: string;
  oppCode: string;
}

/** 두 팀 값을 하나의 막대로 대비시키는 행. */
function VersusBar({
  label,
  icon,
  me,
  opp,
  meCode,
  oppCode,
  /** 화면에 쓸 표시 문자열(미지정 시 숫자 그대로). */
  meText,
  oppText,
  hint,
}: {
  label: string;
  icon: React.ReactNode;
  me: number;
  opp: number;
  meCode: string;
  oppCode: string;
  meText?: string;
  oppText?: string;
  hint?: string;
}) {
  const total = me + opp;
  const mePct = total > 0 ? (me / total) * 100 : 50;
  const leading = total > 0 && me !== opp ? (me > opp ? "me" : "opp") : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="stat-num text-sm font-black"
          style={{ color: leading === "me" ? "var(--color-accent)" : "var(--color-ink)" }}
        >
          {meText ?? me}
        </span>
        <span className="flex items-center gap-1 text-[12px] font-bold uppercase tracking-wide text-dim">
          {icon}
          {label}
        </span>
        <span
          className="stat-num text-sm font-black"
          style={{ color: leading === "opp" ? "var(--color-danger)" : "var(--color-ink)" }}
        >
          {oppText ?? opp}
        </span>
      </div>
      <div className="flex h-1.5 w-full gap-0.5">
        <div className="flex h-full flex-1 justify-end overflow-hidden rounded-l-full bg-surface-2">
          <div
            className="h-full rounded-l-full bg-accent"
            style={{ width: `${mePct}%`, transition: "width 0.4s ease" }}
          />
        </div>
        <div className="flex h-full flex-1 overflow-hidden rounded-r-full bg-surface-2">
          <div
            className="h-full rounded-r-full bg-danger"
            style={{ width: `${100 - mePct}%`, transition: "width 0.4s ease" }}
          />
        </div>
      </div>
      {hint && <p className="text-center text-[12px] leading-tight text-dim">{hint}</p>}
      <span className="sr-only">
        {meCode} {meText ?? me}, {oppCode} {oppText ?? opp}
      </span>
    </div>
  );
}

export function LiveMetrics({ match, meCode, oppCode }: LiveMetricsProps) {
  const stats = useMemo(() => matchStats(match), [match]);
  const momentum = useMemo(
    () => recentMomentum(match.events, match.minute),
    [match.events, match.minute]
  );
  const staminaMe = useMemo(
    () => teamStaminaPct(match.me.lineup, match.stamina),
    [match.me.lineup, match.stamina]
  );
  const staminaOpp = useMemo(
    () => teamStaminaPct(match.opp.lineup, match.stamina),
    [match.opp.lineup, match.stamina]
  );

  // 최근 흐름 해설: 숫자만 두면 "60%"가 좋은 건지 나쁜 건지 읽히지 않는다.
  const momentumTone =
    momentum.totalWeight === 0
      ? "quiet"
      : momentum.meShare >= 65
        ? "ours"
        : momentum.meShare <= 35
          ? "theirs"
          : "even";
  const MOMENTUM_TEXT: Record<string, string> = {
    quiet: `최근 ${MOMENTUM_WINDOW_MIN}분간 큰 장면이 없었어요`,
    ours: "우리가 몰아치는 중입니다",
    theirs: "상대에게 밀리는 중입니다 — 개입을 고려하세요",
    even: "주고받는 흐름입니다",
  };
  const MOMENTUM_COLOR: Record<string, string> = {
    quiet: "var(--color-dim)",
    ours: "var(--color-gain)",
    theirs: "var(--color-danger)",
    even: "var(--color-ink)",
  };

  const convPct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

  // 점유율 표시값 — 자연스러운 분 단위 출렁임.
  // possessionShare는 결정론적이라 매 분 같은 값이 나온다 → 누적 점유(possessionMe)가
  // 전술을 바꾸기 전까지 사실상 한 숫자에 얼어붙어, 화면에선 "점유율이 안 변한다"로 읽힌다.
  // 실제 진행 분(match.minute)의 부드러운 결정론적 함수를 더해 중계처럼 미세하게 흔들리게
  // 한다. 표시 전용이라 경기 결과·복기 분석(matchStats 원값)엔 영향이 없고, RNG를 쓰지 않아
  // 복기 재생 불변식도 깨지 않는다(같은 분 → 같은 값). 경기가 아직 진행되지 않았으면(누적
  // 0) 폴백 50%를 그대로 둔다.
  const possBase = stats.possessionMe;
  const possMe =
    match.possMinutes > 0
      ? Math.max(
          22,
          Math.min(
            78,
            Math.round(
              possBase +
                5 * Math.sin(match.minute / 3.3) +
                2.5 * Math.sin(match.minute / 1.7 + 0.6)
            )
          )
        )
      : possBase;

  return (
    <section className="panel flex flex-col gap-2.5 rounded-panel p-3" aria-label="경기 지표">
      <div className="flex items-center justify-between">
        <p className="eyebrow flex items-center gap-1.5 text-accent">
          <ChartBar size={14} weight="bold" aria-hidden />
          경기 지표
        </p>
        <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wider">
          <span className="text-accent">{meCode}</span>
          <span className="text-dim">vs</span>
          <span className="text-danger">{oppCode}</span>
        </div>
      </div>

      {/* 최근 흐름 — 개입 판단의 1차 신호라 맨 위, 가장 크게. */}
      <div className="rounded-panel border border-line bg-surface/40 px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-dim">
            <Fire size={13} weight="bold" aria-hidden />
            최근 {MOMENTUM_WINDOW_MIN}분 흐름
          </span>
          <span className="stat-num text-lg leading-none" style={{ color: MOMENTUM_COLOR[momentumTone] }}>
            {momentum.meShare}
            <span className="ml-0.5 text-[12px] font-black text-dim">%</span>
          </span>
        </div>
        <div className="mt-1 flex h-2 w-full gap-0.5">
          <div className="flex h-full flex-1 justify-end overflow-hidden rounded-l-full bg-surface-2">
            <div
              className="h-full rounded-l-full bg-accent"
              style={{ width: `${momentum.meShare}%`, transition: "width 0.5s ease" }}
            />
          </div>
          <div className="flex h-full flex-1 overflow-hidden rounded-r-full bg-surface-2">
            <div
              className="h-full rounded-r-full bg-danger"
              style={{ width: `${100 - momentum.meShare}%`, transition: "width 0.5s ease" }}
            />
          </div>
        </div>
        <p className="mt-1 text-[13px] font-bold" style={{ color: MOMENTUM_COLOR[momentumTone] }}>
          {MOMENTUM_TEXT[momentumTone]}
        </p>
      </div>

      {/* 누적 지표 */}
      <div className="flex flex-col gap-2.5">
        <VersusBar
          label="점유율"
          icon={<TrendUp size={13} weight="bold" aria-hidden />}
          me={possMe}
          opp={100 - possMe}
          meText={`${possMe}%`}
          oppText={`${100 - possMe}%`}
          meCode={meCode}
          oppCode={oppCode}
        />
        <VersusBar
          label="슈팅"
          icon={<Target size={13} weight="bold" aria-hidden />}
          me={stats.me.shots}
          opp={stats.opp.shots}
          meCode={meCode}
          oppCode={oppCode}
        />
        <VersusBar
          label="유효슈팅"
          icon={<Crosshair size={13} weight="bold" aria-hidden />}
          me={stats.me.onTarget}
          opp={stats.opp.onTarget}
          meCode={meCode}
          oppCode={oppCode}
        />
        <VersusBar
          label="공격 위협"
          icon={<Fire size={13} weight="bold" aria-hidden />}
          me={stats.attackShareMe}
          opp={100 - stats.attackShareMe}
          meText={`${stats.attackShareMe}%`}
          oppText={`${100 - stats.attackShareMe}%`}
          meCode={meCode}
          oppCode={oppCode}
          hint="만들어낸 찬스의 비중"
        />
        <VersusBar
          label="팀 체력"
          icon={<Heartbeat size={13} weight="bold" aria-hidden />}
          me={staminaMe}
          opp={staminaOpp}
          meText={`${staminaMe}%`}
          oppText={`${staminaOpp}%`}
          meCode={meCode}
          oppCode={oppCode}
          hint={
            staminaMe <= 60
              ? "선발 평균 체력이 떨어졌어요 — 교체를 고려하세요"
              : "선발 11명 평균"
          }
        />
      </div>

      {/* 보조 수치 */}
      <div className="grid grid-cols-3 gap-1.5">
        {(
          [
            ["코너", stats.me.corners, stats.opp.corners],
            ["찬스", stats.me.chances, stats.opp.chances],
            ["경고", stats.me.cards, stats.opp.cards],
          ] as const
        ).map(([label, m, o]) => (
          <div key={label} className="rounded-panel border border-line bg-surface/40 px-2 py-1 text-center">
            <p className="text-[12px] leading-tight text-dim">{label}</p>
            <p className="stat-num mt-0.5 text-[13px] leading-none text-ink">
              <span className="text-accent">{m}</span>
              <span className="px-1 text-dim">:</span>
              <span className="text-danger">{o}</span>
            </p>
          </div>
        ))}
      </div>

      {/* 결정력: 골이 안 나는 이유를 가른다 — 기회가 없나, 마무리가 안 되나. */}
      <div className="rounded-panel border border-line bg-surface/40 px-3 py-1.5">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="stat-num text-accent">{convPct(stats.me.conversion)}</span>
          <span className="text-[12px] font-bold uppercase tracking-wide text-dim">결정력</span>
          <span className="stat-num text-danger">{convPct(stats.opp.conversion)}</span>
        </div>
        <p className="mt-0.5 text-center text-[12px] leading-tight text-dim">
          유효슈팅 대비 득점
        </p>
      </div>
    </section>
  );
}

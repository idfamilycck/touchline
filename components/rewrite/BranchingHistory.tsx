"use client";

// 분기하는 역사 — 인수(지휘봉 인계) 순간에서 실제 역사선과 당신의 평행세계선이
// 갈라지는 타임라인. Y축은 득실차(우리 - 상대), X축은 분(인수→종료). 두 선은 인수
// 시점에서 같은 점(그때의 스코어)에서 출발해, 골이 날 때마다 계단으로 갈라진다.
//
// 데이터는 전부 실측/시뮬 기록이다: realGoals는 실제 경기의 인수 이후 골(분·팀),
// myGoals는 내 시뮬의 인수 이후 골(match.events). "다시 쓰기"를 문자 그대로 보여준다.

interface Goal {
  minute: number;
  side: "me" | "opp";
}

interface BranchingHistoryProps {
  takeover: number;
  end: number;
  /** 인수 시점의 스코어(두 선의 공통 출발점). */
  startMe: number;
  startOpp: number;
  realGoals: Goal[];
  myGoals: Goal[];
  meCode: string;
  oppCode: string;
  realFor: number;
  realAgainst: number;
  myFor: number;
  myAgainst: number;
}

const VB_W = 360;
const VB_H = 196;
const PAD_L = 40;
const PAD_R = 14;
const PAD_T = 24;
const PAD_B = 30;

interface StepPoint {
  minute: number;
  margin: number; // 이 분 "이후"의 득실차
}

// 시작 득실차 + 골 목록으로 계단 점열을 만든다(골마다 margin ±1).
function stepsOf(startMargin: number, goals: Goal[], takeover: number, end: number): StepPoint[] {
  const sorted = [...goals].sort((a, b) => a.minute - b.minute);
  const pts: StepPoint[] = [{ minute: takeover, margin: startMargin }];
  let m = startMargin;
  for (const g of sorted) {
    pts.push({ minute: g.minute, margin: m }); // 골 직전까지 수평
    m += g.side === "me" ? 1 : -1;
    pts.push({ minute: g.minute, margin: m }); // 골에서 수직 계단
  }
  pts.push({ minute: end, margin: m });
  return pts;
}

export function BranchingHistory({
  takeover,
  end,
  startMe,
  startOpp,
  realGoals,
  myGoals,
  meCode,
  oppCode,
  realFor,
  realAgainst,
  myFor,
  myAgainst,
}: BranchingHistoryProps) {
  const m0 = startMe - startOpp;
  const span = Math.max(1, end - takeover);

  const realSteps = stepsOf(m0, realGoals, takeover, end);
  const mySteps = stepsOf(m0, myGoals, takeover, end);

  const allMargins = [...realSteps, ...mySteps].map((p) => p.margin);
  const lo = Math.min(...allMargins) - 0.6;
  const hi = Math.max(...allMargins) + 0.6;
  const yspan = Math.max(1, hi - lo);

  const xOf = (min: number) => PAD_L + ((min - takeover) / span) * (VB_W - PAD_L - PAD_R);
  const yOf = (m: number) => PAD_T + ((hi - m) / yspan) * (VB_H - PAD_T - PAD_B);

  const pathOf = (steps: StepPoint[]) =>
    steps.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.minute).toFixed(1)},${yOf(p.margin).toFixed(1)}`).join(" ");

  // 골 마커: 계단의 "이후" 점(홀수 인덱스가 골 직후). 시작/끝 보조점은 제외.
  const goalDots = (steps: StepPoint[], goals: Goal[]) =>
    [...goals]
      .sort((a, b) => a.minute - b.minute)
      .map((g, i) => {
        // stepsOf에서 각 골은 [before, after] 두 점을 추가 → after는 인덱스 2*i+2.
        const after = steps[2 * i + 2];
        return after ? { x: xOf(after.minute), y: yOf(after.margin), side: g.side, minute: g.minute } : null;
      })
      .filter(Boolean) as { x: number; y: number; side: "me" | "opp"; minute: number }[];

  const realDots = goalDots(realSteps, realGoals);
  const myDots = goalDots(mySteps, myGoals);

  const realWord = realFor > realAgainst ? "승리" : realFor < realAgainst ? "패배" : "무";
  const myWord = myFor > myAgainst ? "승리" : myFor < myAgainst ? "패배" : "무";
  // 평행세계 라벨 색은 "실제보다 나아졌나"로 정한다(승/패 절대값이 아니라 대비).
  // 초록=역사 개선 / 빨강=악화 / 회색=동일. 선 자체는 아래에서 시안(=당신)로 고정.
  const realMargin = realFor - realAgainst;
  const myMargin = myFor - myAgainst;
  const myColor =
    myMargin > realMargin ? "var(--color-gain)" : myMargin < realMargin ? "var(--color-danger)" : "var(--color-dim)";

  const zeroY = yOf(0);
  const showZero = lo < 0 && hi > 0;

  return (
    <section className="panel rounded-panel p-4">
      <div className="flex items-center justify-between">
        <p className="eyebrow text-accent">분기하는 역사</p>
        <span className="stat-num text-[13px] text-dim">{takeover}분에 갈라짐</span>
      </div>
      <p className="mt-1 text-[13px] text-dim">
        지휘봉을 잡은 순간부터 실제 역사와 당신의 평행세계가 갈라집니다. 세로축은 득실차.
      </p>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="mt-3 w-full"
        role="img"
        aria-label={`${takeover}분 인수 지점에서 실제 역사(${realFor}-${realAgainst})와 평행세계(${myFor}-${myAgainst})로 갈라지는 득실차 타임라인`}
      >
        {/* 0선(비김) */}
        {showZero && (
          <line x1={PAD_L} y1={zeroY} x2={VB_W - PAD_R} y2={zeroY} stroke="var(--color-line)" strokeWidth="1" strokeDasharray="3 5" />
        )}
        {/* 축 하단(시간) */}
        <line x1={PAD_L} y1={VB_H - PAD_B} x2={VB_W - PAD_R} y2={VB_H - PAD_B} stroke="var(--color-line)" strokeWidth="1" />
        <text x={PAD_L} y={VB_H - PAD_B + 16} fill="var(--color-dim)" fontSize="10" fontWeight="700" textAnchor="middle">{takeover}′</text>
        <text x={VB_W - PAD_R} y={VB_H - PAD_B + 16} fill="var(--color-dim)" fontSize="10" fontWeight="700" textAnchor="middle">{end}′</text>

        {/* 인수 지점 세로 표시 */}
        <line x1={xOf(takeover)} y1={PAD_T - 8} x2={xOf(takeover)} y2={VB_H - PAD_B} stroke="var(--color-line-strong)" strokeWidth="1.5" strokeDasharray="4 5" />
        <circle cx={xOf(takeover)} cy={yOf(m0)} r="4.5" fill="var(--color-accent)" stroke="var(--color-pitch)" strokeWidth="2.5" />
        <text x={xOf(takeover)} y={PAD_T - 12} fill="var(--color-accent)" fontSize="10" fontWeight="900" textAnchor="middle">지휘봉 인계</text>

        {/* 실제 역사 — 중립 회색(무슨 일이 있었나). 승패 판단색은 쓰지 않는다. */}
        <path d={pathOf(realSteps)} fill="none" stroke="var(--color-dim)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
        {realDots.map((d) => (
          <circle key={`r-${d.minute}-${d.side}`} cx={d.x} cy={d.y} r="4" fill="var(--color-dim)" stroke="var(--color-pitch)" strokeWidth="2" />
        ))}

        {/* 당신의 평행세계 — 시안(=당신). 좋고 나쁨은 끝 라벨 색이 말한다. */}
        <path d={pathOf(mySteps)} fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {myDots.map((d) => (
          <circle key={`m-${d.minute}-${d.side}`} cx={d.x} cy={d.y} r="4.5" fill="var(--color-accent)" stroke="var(--color-pitch)" strokeWidth="2" />
        ))}

        {/* 끝 라벨 */}
        <text x={VB_W - PAD_R} y={yOf(realSteps[realSteps.length - 1].margin) - 6} fill="var(--color-dim)" fontSize="11" fontWeight="900" textAnchor="end">
          실제 {realFor}-{realAgainst} {realWord}
        </text>
        <text x={VB_W - PAD_R} y={yOf(mySteps[mySteps.length - 1].margin) + 15} fill={myColor} fontSize="11" fontWeight="900" textAnchor="end">
          평행 {myFor}-{myAgainst} {myWord}
        </text>
      </svg>

      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-bold text-dim">
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="h-1 w-4 rounded-full" style={{ background: "var(--color-dim)" }} />실제 역사
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="h-1 w-4 rounded-full" style={{ background: "var(--color-accent)" }} />당신의 평행세계
        </span>
        <span className="stat-num ml-auto text-dim">
          위 {meCode} 우세 · 아래 {oppCode} 우세
        </span>
      </div>
    </section>
  );
}

"use client";

// 결과 자리표시자 — Task 16에서 실제 경기 요약/타임라인 리뷰 UI로 대체된다.
// 지금은 경기 화면의 종료 → 결과 보기 경로가 404가 나지 않도록 최소 화면만 제공한다.

import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { teamById } from "@/lib/data/teams";

export default function ResultPage() {
  const match = useAppStore((s) => s.match);
  const me = teamById(match?.me.teamId ?? "");
  const opp = teamById(match?.opp.teamId ?? "");

  const won = match ? match.scoreMe > match.scoreOpp : false;
  const draw = match ? match.scoreMe === match.scoreOpp : false;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-5 py-24 text-center">
      <p className="eyebrow text-accent">경기 결과</p>
      {match ? (
        <>
          <div className="stat-num display mt-4 text-6xl text-ink">
            {match.scoreMe} : {match.scoreOpp}
          </div>
          <p className="mt-3 text-lg text-dim">
            {me?.nameKo} vs {opp?.nameKo}
          </p>
          <p
            className="mt-2 text-sm font-bold"
            style={{ color: won ? "var(--color-gain)" : draw ? "var(--color-dim)" : "var(--color-danger)" }}
          >
            {draw ? "무승부" : won ? "승리" : "패배"}
          </p>
        </>
      ) : (
        <h1 className="display mt-4 text-4xl text-ink">결과 없음</h1>
      )}
      <p className="mt-4 max-w-sm text-sm text-dim">상세 결과 화면은 곧 열립니다.</p>
      <Link
        href="/"
        className="mt-8 rounded-full bg-accent px-6 py-3 text-sm font-black text-accent-ink transition-transform hover:-translate-y-0.5"
      >
        새 경기 시작 →
      </Link>
    </main>
  );
}

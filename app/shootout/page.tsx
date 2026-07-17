"use client";

// 승부차기 자리표시자 — Task 16에서 실제 승부차기 UI로 대체된다.
// 지금은 경기 화면의 무승부 → 승부차기 경로가 404가 나지 않도록 최소 화면만 제공한다.

import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { teamById } from "@/lib/data/teams";

export default function ShootoutPage() {
  const match = useAppStore((s) => s.match);
  const me = teamById(match?.me.teamId ?? "");
  const opp = teamById(match?.opp.teamId ?? "");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-5 py-24 text-center">
      <p className="eyebrow text-accent">승부차기</p>
      <h1 className="display mt-4 text-4xl text-ink">승부차기 준비 중</h1>
      {me && opp && (
        <p className="stat-num mt-4 text-lg text-dim">
          {me.nameKo} {match?.scoreMe} : {match?.scoreOpp} {opp.nameKo}
        </p>
      )}
      <p className="mt-4 max-w-sm text-sm text-dim">승부차기 화면은 곧 열립니다.</p>
      <div className="mt-8 flex gap-2">
        <Link
          href="/result"
          className="rounded-full bg-accent px-6 py-3 text-sm font-black text-accent-ink transition-transform hover:-translate-y-0.5"
        >
          결과 보기 →
        </Link>
        <Link
          href="/"
          className="rounded-full border border-line px-6 py-3 text-sm font-bold text-dim transition-colors hover:border-white/25 hover:text-ink"
        >
          홈으로
        </Link>
      </div>
    </main>
  );
}

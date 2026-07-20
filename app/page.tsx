"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { teamById } from "@/lib/data/teams";
import { venueById } from "@/lib/data/venues";
import { QuickStart } from "@/components/home/QuickStart";
import { TeamGrid } from "@/components/home/TeamGrid";
import { VenuePicker } from "@/components/home/VenuePicker";
import { FlagBadge } from "@/components/ui/FlagBadge";
import { Disclaimer } from "@/components/ui/Disclaimer";

// 킥오프 전 방송용 예상 우세 — ELO 로지스틱(감독 개입 전 기준선).
function eloWinPct(myElo: number, oppElo: number): number {
  return Math.round((1 / (1 + Math.pow(10, (oppElo - myElo) / 400))) * 100);
}

export default function Home() {
  const router = useRouter();
  const selectMatchup = useAppStore((s) => s.selectMatchup);

  // 홈 선택은 로컬 상태로 두고, "작전실 입장" 순간에만 스토어에 커밋한다.
  const [myTeamId, setMyTeamId] = useState<string>();
  const [oppTeamId, setOppTeamId] = useState<string>();
  const [venueId, setVenueId] = useState<string>();

  // 2단계 순차 선택 로직
  const handleTeamClick = (id: string) => {
    if (id === myTeamId) {
      setMyTeamId(undefined);
      setOppTeamId(undefined);
      return;
    }
    if (id === oppTeamId) {
      setOppTeamId(undefined);
      return;
    }
    if (!myTeamId) {
      setMyTeamId(id);
      return;
    }
    setOppTeamId(id);
  };

  const myTeam = myTeamId ? teamById(myTeamId) : undefined;
  const oppTeam = oppTeamId ? teamById(oppTeamId) : undefined;
  const venue = venueId ? venueById(venueId) : undefined;
  const ready = Boolean(myTeam && oppTeam && venue);
  const pct = myTeam && oppTeam ? eloWinPct(myTeam.elo, oppTeam.elo) : undefined;
  const favored = pct !== undefined && pct >= 50;

  const enter = () => {
    if (!ready) return;
    selectMatchup(myTeamId!, oppTeamId!, venueId!);
    router.push("/tactics");
  };

  return (
    <main className="flex flex-1 flex-col pb-28">
      {/* ── 히어로 ───────────────────────────────────────── */}
      <section
        aria-label="히어로"
        className="pitch-stripes relative overflow-hidden border-b border-line"
      >
        <div className="mx-auto w-full max-w-5xl px-5 pb-8 pt-10 sm:pt-14">
          <p className="eyebrow text-accent">국가대표 전술 시뮬레이터</p>
          <h1 className="display mt-4 text-5xl text-ink sm:text-7xl">
            당신이<br />감독이라면.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-dim">
            포메이션과 지시 하나로 승부가 뒤집힙니다. 대표팀을 골라 벤치에 앉고,
            90분을 직접 지휘해 보세요.
          </p>
          {/* CTA는 한 줄에 두 개(퀵스타트 + 다시 쓰기)까지만. 히어로에 잔 설명을 덧붙이지 않는다. */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <QuickStart />
            <Link
              href="/rewrite"
              className="group inline-flex items-center gap-2.5 rounded-full border border-line bg-surface px-6 py-3.5 text-sm font-bold text-ink transition-colors duration-150 hover:border-white/30"
            >
              <span>2026 월드컵 다시 쓰기</span>
              <span aria-hidden className="text-accent transition-transform duration-150 group-hover:translate-x-1">
                →
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── 매치업 구성 ──────────────────────────────────── */}
      <section aria-label="매치업 구성" className="mx-auto w-full max-w-5xl px-5 pt-10">
        <header className="lime-tab mb-6 pl-4">
          <p className="eyebrow text-dim">STEP 01 · 매치업</p>
          <h2 className="display mt-1 text-3xl text-ink">누구를 이끌고, 누구를 상대할까</h2>
        </header>
        <TeamGrid myTeamId={myTeamId} oppTeamId={oppTeamId} onSelect={handleTeamClick} />
      </section>

      {/* ── 경기장 선택 ──────────────────────────────────── */}
      <section aria-label="경기장 선택" className="mx-auto w-full max-w-5xl px-5 pt-10">
        <header className="lime-tab mb-6 pl-4">
          <p className="eyebrow text-dim">STEP 02 · 경기장</p>
          <h2 className="display mt-1 text-3xl text-ink">어디에서 맞붙을까</h2>
        </header>
        <VenuePicker venueId={venueId} onSelect={setVenueId} />
      </section>

      {/* ── 하단 고지 ────────────────────────────────────── */}
      <footer className="mx-auto mt-16 w-full max-w-5xl px-5 pb-4">
        <Disclaimer />
      </footer>

      {/* ── 방송 스코어보드(하단 고정) — 시그니처 ─────────── */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-pitch/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
          {myTeam && oppTeam ? (
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center gap-2 text-sm">
                <FlagBadge code={myTeam.code} color1={myTeam.color1} color2={myTeam.color2} size={26} />
                <span className="font-bold text-ink">{myTeam.nameKo}</span>
                <span className="text-dim">vs</span>
                <span className="font-bold text-ink">{oppTeam.nameKo}</span>
                <FlagBadge code={oppTeam.code} color1={oppTeam.color1} color2={oppTeam.color2} size={26} />
                <span className="ml-auto hidden text-xs text-dim sm:inline">
                  {venue ? venue.nameKo : "경기장 미선택"}
                </span>
              </div>
              {/* 예상 우세 바 — 유리 초록↑ / 불리 빨강↓ */}
              <div className="flex items-center gap-2">
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: favored ? "var(--color-gain)" : "var(--color-danger)",
                    }}
                  />
                </div>
                <span
                  className="stat-num text-sm"
                  style={{ color: favored ? "var(--color-gain)" : "var(--color-danger)" }}
                >
                  {favored ? "▲" : "▼"} 예상 우세 {pct}%
                </span>
              </div>
            </div>
          ) : (
            <p className="flex-1 text-sm text-dim">
              내 팀 · 상대 팀 · 경기장을 고르면 작전실이 열립니다.
            </p>
          )}

          <button
            type="button"
            onClick={enter}
            disabled={!ready}
            className="shrink-0 rounded-full px-6 py-3 text-sm font-black transition-colors disabled:cursor-not-allowed"
            style={
              ready
                ? { background: "var(--color-accent)", color: "var(--color-accent-ink)" }
                : { background: "var(--color-surface-2)", color: "var(--color-dim)" }
            }
          >
            작전실 입장 →
          </button>
        </div>
      </div>
    </main>
  );
}

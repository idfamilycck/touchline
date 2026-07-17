"use client";

// 경기 화면 — 재생 루프 + 개입.
// 재생 루프: setInterval(tickMinute, 600/speed). 일시정지/배속 토글, 작전 변경 시트,
// 위기 배너, 하프타임 자동 정지, 종료 처리(무승부→승부차기 제안 / 승패→결과 보기).
// 새로고침 시 match는 sessionStorage로 유지되며 재생은 "일시정지" 상태로 이어진다.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { Scoreboard, minuteLabel } from "@/components/match/Scoreboard";
import { LivePitch } from "@/components/match/LivePitch";
import { CommentaryFeed } from "@/components/match/CommentaryFeed";
import { ProbTimeline } from "@/components/match/ProbTimeline";
import { CrisisBanner } from "@/components/match/CrisisBanner";
import { InterventionSheetPortal } from "@/components/match/InterventionSheet";
import type { Intervention } from "@/lib/engine/match";

const SPEEDS = [1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];

export default function MatchPage() {
  const router = useRouter();
  const match = useAppStore((s) => s.match);
  const tickMinute = useAppStore((s) => s.tickMinute);
  const intervene = useAppStore((s) => s.intervene);

  const hasMatch = useAppStore((s) => Boolean(s.match));
  const finished = useAppStore((s) => s.match?.finished ?? false);

  const [playing, setPlaying] = useState(false); // 새로고침/진입 시 항상 일시정지로 시작
  const [speed, setSpeed] = useState<Speed>(2);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [halftime, setHalftime] = useState(false);
  const halftimeHandledRef = useRef(false);

  // persist(sessionStorage) 재수화 완료 여부. zustand persist는 동기 스토리지라도
  // 첫 렌더 직후(마이크로태스크)에 재수화하므로, 재수화 전에는 match가 undefined다.
  // 이 값을 기다리지 않으면 "새로고침으로 경기 이어보기"가 아직 복원되지 않은
  // match를 없음으로 오인해 홈으로 튕겨버린다.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const p = useAppStore.persist;
    if (!p || p.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = p.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  // 직접 URL 진입(매치 없음) → 홈으로. 단, 재수화가 끝난 뒤에만 판정한다.
  useEffect(() => {
    if (hydrated && !hasMatch) router.replace("/");
  }, [hydrated, hasMatch, router]);

  // 재생 루프. 일시정지/시트오픈/종료 시 정지. speed/finished 변화에만 재생성(틱마다 X).
  useEffect(() => {
    if (!playing || sheetOpen || !hasMatch || finished) return;
    const delay = Math.max(60, Math.round(600 / speed));
    const id = setInterval(() => tickMinute(), delay);
    return () => clearInterval(id);
  }, [playing, sheetOpen, hasMatch, finished, speed, tickMinute]);

  // 하프타임(45분) 자동 일시정지 — 한 번만.
  useEffect(() => {
    if (!match || match.finished) return;
    if (!halftimeHandledRef.current && match.minute >= 45) {
      const hasHT = match.events.some((e) => e.type === "halftime");
      if (hasHT) {
        halftimeHandledRef.current = true;
        setPlaying(false);
        setHalftime(true);
      }
    }
  }, [match]);

  // 종료 시 정지.
  useEffect(() => {
    if (finished) setPlaying(false);
  }, [finished]);

  if (!match) {
    return (
      <main className="flex flex-1 items-center justify-center px-5 py-24 text-center">
        <p className="text-sm text-dim">경기 정보를 불러오는 중…</p>
      </main>
    );
  }

  const openSheet = () => {
    setHalftime(false);
    setPlaying(false);
    setSheetOpen(true);
  };
  const closeSheet = () => setSheetOpen(false);
  const submitIntervention = (iv: Omit<Intervention, "minute">) => {
    intervene(iv);
    setSheetOpen(false);
    if (!match.finished) setPlaying(true); // 지시 전달 → 자동 재개
  };

  const isDraw = match.scoreMe === match.scoreOpp;

  return (
    <main className="flex flex-1 flex-col pb-10">
      <CrisisBanner events={match.events} onIntervene={openSheet} />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-5 sm:px-5">
        {/* 스코어보드 */}
        <Scoreboard
          meTeamId={match.me.teamId}
          oppTeamId={match.opp.teamId}
          scoreMe={match.scoreMe}
          scoreOpp={match.scoreOpp}
          minute={match.minute}
          venueId={match.venueId}
          finished={match.finished}
        />

        {/* 컨트롤 */}
        <div className="panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              disabled={match.finished}
              aria-label={playing ? "일시정지" : "재생"}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-lg text-accent-ink transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            >
              {playing ? "⏸" : "▶"}
            </button>
            <div className="flex items-center gap-1 rounded-full bg-surface-2 p-1" role="group" aria-label="재생 배속">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={speed === s}
                  onClick={() => setSpeed(s)}
                  className={`stat-num rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                    speed === s ? "bg-accent text-accent-ink" : "text-dim hover:text-ink"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-dim sm:inline">
              {match.finished ? "경기가 종료됐습니다" : playing ? `재생 중 · ${minuteLabel(match.minute)}` : "일시정지"}
            </span>
            <button
              type="button"
              onClick={openSheet}
              disabled={match.finished}
              className="rounded-full border border-accent/50 bg-accent/10 px-4 py-2 text-sm font-bold text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              🧠 작전 변경
            </button>
          </div>
        </div>

        {/* 라이브 피치 */}
        <LivePitch events={match.events} meTeamId={match.me.teamId} oppTeamId={match.opp.teamId} />

        {/* 중계 + 승률 타임라인 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CommentaryFeed events={match.events} meTeamId={match.me.teamId} />
          <ProbTimeline
            timeline={match.probTimeline}
            events={match.events}
            interventions={match.interventions}
          />
        </div>
      </div>

      {/* 하프타임 힌트 */}
      <AnimatePresence>
        {halftime && !match.finished && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center px-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60" onClick={() => setHalftime(false)} />
            <motion.div
              initial={{ scale: 0.92, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              className="panel relative w-full max-w-sm rounded-3xl p-6 text-center"
            >
              <p className="eyebrow text-accent">하프타임</p>
              <h2 className="display mt-2 text-2xl text-ink">전반 종료</h2>
              <p className="mt-3 text-sm text-dim">작전을 지시할 좋은 타이밍입니다.</p>
              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setHalftime(false);
                    setPlaying(true);
                  }}
                  className="flex-1 rounded-full border border-line py-3 text-sm font-bold text-ink hover:border-white/25"
                >
                  이어서 재개
                </button>
                <button
                  type="button"
                  onClick={openSheet}
                  className="flex-1 rounded-full bg-accent py-3 text-sm font-black text-accent-ink hover:-translate-y-0.5"
                >
                  작전 변경
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 종료 오버레이 */}
      <AnimatePresence>
        {match.finished && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center px-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="absolute inset-0 bg-black/70" />
            <motion.div
              initial={{ scale: 0.92, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              className="panel relative w-full max-w-sm rounded-3xl p-6 text-center"
            >
              <p className="eyebrow text-accent">경기 종료</p>
              <div className="stat-num display mt-3 text-5xl text-ink">
                {match.scoreMe} : {match.scoreOpp}
              </div>
              {isDraw ? (
                <>
                  <h2 className="mt-4 text-lg font-bold text-ink">무승부입니다</h2>
                  <p className="mt-2 text-sm text-dim">승부차기로 결판내시겠습니까?</p>
                  <div className="mt-6 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => router.push("/shootout")}
                      className="w-full rounded-full bg-accent py-3 text-sm font-black text-accent-ink hover:-translate-y-0.5"
                    >
                      승부차기 →
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push("/result")}
                      className="w-full rounded-full border border-line py-3 text-sm font-bold text-dim hover:text-ink"
                    >
                      결과 보기
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2
                    className="mt-4 text-lg font-black"
                    style={{ color: match.scoreMe > match.scoreOpp ? "var(--color-gain)" : "var(--color-danger)" }}
                  >
                    {match.scoreMe > match.scoreOpp ? "승리했습니다!" : "패배했습니다"}
                  </h2>
                  <button
                    type="button"
                    onClick={() => router.push("/result")}
                    className="mt-6 w-full rounded-full bg-accent py-3 text-sm font-black text-accent-ink hover:-translate-y-0.5"
                  >
                    결과 보기 →
                  </button>
                </>
              )}
              <Link href="/" className="mt-4 inline-block text-[11px] text-dim hover:text-ink">
                홈으로 나가기
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 개입 시트 */}
      <InterventionSheetPortal
        open={sheetOpen}
        meSetup={match.me}
        oppSetup={match.opp}
        subsUsedMe={match.subsUsedMe}
        stamina={match.stamina}
        onSubmit={submitIntervention}
        onClose={closeSheet}
      />
    </main>
  );
}

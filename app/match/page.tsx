"use client";

// 경기 화면 — 하이라이트 점프 재생 + 개입.
// 장면 없는 분은 초고속 스킵, 장면성 이벤트가 나온 분은 자동 정지 후 SceneOverlay 연출.
// 자유 일시정지/작전 변경 시트, 위기 배너, 하프타임 자동 정지, 종료 처리 유지.
// 새로고침 시 match는 sessionStorage로 유지되며 재생은 "일시정지" 상태로 이어진다.
// (스펙: docs/superpowers/specs/2026-07-18-match-highlight-jump-design.md)

import { useEffect, useMemo, useRef, useState } from "react";
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
import { SceneOverlay } from "@/components/match/SceneOverlay";
import {
  sceneEventsAt,
  primaryEvent,
  isAttackScene,
  attackAttribution,
  attackLean,
  shouldStopScene,
  sceneDurationMs,
  sceneChoreoType,
} from "@/components/match/scene";
import { applyModifiers, type AppliedRule } from "@/lib/engine/modifiers";
import { teamById } from "@/lib/data/teams";
import { venueById } from "@/lib/data/venues";
import { h2hOf } from "@/lib/data/h2h";
import type { Intervention, MatchEvent } from "@/lib/engine/match";

// 하이라이트 점프 페이싱: 장면 없는 분은 SKIP_MS 간격으로 빠르게 흘려보내고,
// 정지 대상 장면(슛 전개·위기·카드)이 나온 분에서 장면 길이만큼 자동 정지·연출한다.
const SKIP_MS = 110;

export default function MatchPage() {
  const router = useRouter();
  const match = useAppStore((s) => s.match);
  const tickMinute = useAppStore((s) => s.tickMinute);
  const intervene = useAppStore((s) => s.intervene);
  const mode = useAppStore((s) => s.mode);
  const rewriteContext = useAppStore((s) => s.rewriteContext);

  const hasMatch = useAppStore((s) => Boolean(s.match));
  const finished = useAppStore((s) => s.match?.finished ?? false);

  const [playing, setPlaying] = useState(false); // 새로고침/진입 시 항상 일시정지로 시작
  const [sheetOpen, setSheetOpen] = useState(false);
  const [halftime, setHalftime] = useState(false);
  const [scene, setScene] = useState<MatchEvent[] | null>(null);
  const halftimeHandledRef = useRef(false);
  const halftimeSeededRef = useRef(false);
  // 마지막으로 장면 판정을 마친 분. null이면 아직 시드 전(장면 감지 보류) —
  // 새로고침/재진입 시 이미 지나간 분의 장면을 재연출하지 않기 위한 커서다.
  const sceneSeenRef = useRef<number | null>(null);
  const sceneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // 스킵 루프. 일시정지/시트오픈/종료/장면 연출 중에는 정지.
  useEffect(() => {
    if (!playing || sheetOpen || !hasMatch || finished || scene) return;
    const id = setInterval(() => tickMinute(), SKIP_MS);
    return () => clearInterval(id);
  }, [playing, sheetOpen, hasMatch, finished, scene, tickMinute]);

  // 하프타임·장면 커서 시드: 마운트(재수화 완료) 시점에 이미 지나간 하프타임/장면을
  // 다시 재생하지 않도록 처리 상태를 현재 분 기준으로 초기화한다.
  // 이 효과는 아래 감지 효과보다 먼저 선언돼, 같은 렌더에서 감지보다 먼저 실행된다.
  useEffect(() => {
    if (!hydrated || !match || halftimeSeededRef.current) return;
    halftimeSeededRef.current = true;
    sceneSeenRef.current = match.minute;
    if (match.events.some((e) => e.type === "halftime")) {
      halftimeHandledRef.current = true;
    }
  }, [hydrated, match]);

  // 장면 감지: 방금 진행된 분에 정지 대상 장면이 있으면 스킵을 멈추고 장면 길이만큼 연출.
  useEffect(() => {
    if (!match || sceneSeenRef.current === null) return;
    const m = match.minute;
    if (m <= sceneSeenRef.current) return;
    sceneSeenRef.current = m;
    const evs = sceneEventsAt(match.events, m);
    if (!shouldStopScene(evs)) return;
    setScene(evs);
    if (sceneTimerRef.current) clearTimeout(sceneTimerRef.current);
    sceneTimerRef.current = setTimeout(() => setScene(null), sceneDurationMs(evs));
  }, [match]);

  // 언마운트 시 장면 타이머 정리.
  useEffect(() => () => {
    if (sceneTimerRef.current) clearTimeout(sceneTimerRef.current);
  }, []);

  // 전술 귀속: 현재(개입 반영된) 세팅 기준 발동 규칙. 개입으로 setup이 바뀔 때만 재계산.
  const sideRules = useMemo<{ me: AppliedRule[]; opp: AppliedRule[] }>(() => {
    if (!match) return { me: [], opp: [] };
    const venue = venueById(match.venueId);
    const meTeam = teamById(match.me.teamId);
    const oppTeam = teamById(match.opp.teamId);
    if (!venue || !meTeam || !oppTeam) return { me: [], opp: [] };
    return {
      me: applyModifiers(match.me, match.opp, venue, meTeam, oppTeam, h2hOf(match.me.teamId, match.opp.teamId)).rules,
      opp: applyModifiers(match.opp, match.me, venue, oppTeam, meTeam, h2hOf(match.opp.teamId, match.me.teamId)).rules,
    };
    // match.me/opp는 개입 시에만 교체되는 참조라 이 의존성으로 충분하다.
  }, [match?.me, match?.opp, match?.venueId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 하프타임(45분) 자동 일시정지 — 한 번만. 하프타임 이벤트가 방금 추가된 최신 이벤트이거나
  // 정확히 45분 시점일 때만 트리거한다(마운트 후 뒤늦게 스테일 발동 방지).
  useEffect(() => {
    if (!match || match.finished) return;
    if (halftimeHandledRef.current || match.minute < 45) return;
    const lastEvent = match.events[match.events.length - 1];
    const halftimeIsLatest = lastEvent?.type === "halftime";
    if ((halftimeIsLatest || match.minute === 45) && match.events.some((e) => e.type === "halftime")) {
      halftimeHandledRef.current = true;
      setPlaying(false);
      setHalftime(true);
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
    if (sceneTimerRef.current) clearTimeout(sceneTimerRef.current);
    setScene(null);
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
      <h1 className="sr-only">경기 중계 — 실시간 지휘</h1>
      <CrisisBanner events={match.events} onIntervene={openSheet} />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-5 sm:px-5">
        {mode === "rewrite" && rewriteContext && (
          <p className="inline-flex w-fit max-w-full items-center gap-1.5 truncate self-start rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[11px] font-bold text-accent">
            실제 경기 · {teamById(match.me.teamId)?.nameKo ?? "우리 팀"} vs{" "}
            {teamById(match.opp.teamId)?.nameKo ?? "상대 팀"} · {rewriteContext.takeoverMinute}′부터 지휘
          </p>
        )}
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
            <span className="text-[11px] text-dim">주요 장면 자동 정지 · 나머지는 빠르게 진행돼요</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-dim sm:inline">
              {match.finished
                ? "경기가 종료됐습니다"
                : scene
                  ? `주요 장면 · ${minuteLabel(match.minute)}`
                  : playing
                    ? `빠르게 진행 중 · ${minuteLabel(match.minute)}`
                    : "일시정지"}
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

        {/* 라이브 피치 + 장면 자막 */}
        <div className="relative">
          <LivePitch
            meSetup={match.me}
            oppSetup={match.opp}
            scene={(() => {
              const p = scene ? primaryEvent(scene) : undefined;
              if (!p || !scene) return null;
              return {
                key: `${p.minute}-${p.type}`,
                side: p.side,
                type: p.type,
                choreo: sceneChoreoType(scene),
                playerId: p.playerId,
              };
            })()}
            lean={attackLean(match.events)}
          />
          <SceneOverlay
            sceneEvents={scene ?? []}
            attribution={(() => {
              const p = scene ? primaryEvent(scene) : undefined;
              if (!p || !isAttackScene(p)) return null;
              return attackAttribution(sideRules[p.side]);
            })()}
          />
        </div>

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
        interventions={match.interventions}
        onSubmit={submitIntervention}
        onClose={closeSheet}
      />
    </main>
  );
}

"use client";

// 개입 시트(작전실 축약판): 일시정지 상태에서 열린다. 초안(draft)을 누적한 뒤
// "지시 전달"을 누르면 단 한 번의 intervene() 호출로 제출한다 → 자동 재개.
// 취소하면 초안을 버린다. 스토어의 me(작전실 스냅샷)가 아니라 라이브 로스터
// (match.me)를 기준으로 편집하며, setInstructions가 아니라 intervene()로만 반영한다.
//
// 편집 범위: 선수 교체 · 성향 슬라이더 · 세부 지시 토글 · 맨마킹.
// 포메이션 변경은 제외한다 — Intervention 계약에 lineup 필드가 없어 포메이션만 바꾸면
// 슬롯 재배치가 불가능해 온피치 인원이 어긋나기 때문이다(엔진 applyIntervention은
// autoPlace를 다시 돌리지 않음).

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowsClockwise, X } from "@phosphor-icons/react";
import { FORMATIONS } from "@/lib/data/formations";
import { winProbability } from "@/lib/engine/winprob";
import { playersOf } from "@/lib/data/players";
import { jerseyOf } from "@/components/tactics/tactics-labels";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import type { Intervention } from "@/lib/engine/match";
import type {
  Player,
  SideSetup,
  SpecialInstructions,
  TeamInstructions,
} from "@/lib/types";

const MAX_SUBS = 5;

type SliderKey = "pressing" | "line" | "attacking" | "tempo";
const SLIDERS: { key: SliderKey; label: string; ticks: [string, string, string] }[] = [
  { key: "pressing", label: "압박 강도", ticks: ["약하게", "보통", "강하게"] },
  { key: "line", label: "수비 라인", ticks: ["낮게", "보통", "높게"] },
  { key: "attacking", label: "공격 성향", ticks: ["안정적", "균형", "공격적"] },
  { key: "tempo", label: "경기 템포", ticks: ["느리게", "보통", "빠르게"] },
];

const TOGGLES: {
  key: "buildup" | "focus" | "width" | "marking";
  label: string;
  options: { value: string; label: string }[];
}[] = [
  { key: "buildup", label: "빌드업", options: [{ value: "short", label: "짧게" }, { value: "direct", label: "롱볼" }] },
  { key: "focus", label: "공격 방향", options: [{ value: "left", label: "왼쪽" }, { value: "center", label: "중앙" }, { value: "right", label: "오른쪽" }] },
  { key: "width", label: "폭", options: [{ value: "wide", label: "넓게" }, { value: "narrow", label: "좁게" }] },
  { key: "marking", label: "수비 방식", options: [{ value: "zonal", label: "지역" }, { value: "man", label: "대인" }] },
];

function threat(p: Player): number {
  return p.attrs.shooting * 0.4 + p.attrs.dribbling * 0.3 + p.attrs.pace * 0.3;
}

function startersOf(side: SideSetup, squad: Player[]): Player[] {
  const slots = FORMATIONS[side.instructions.formation].slots;
  return slots
    .map((s) => squad.find((p) => p.id === side.lineup[s.id]))
    .filter((p): p is Player => Boolean(p));
}

function instructionsEqual(a: TeamInstructions, b: TeamInstructions): boolean {
  return (
    a.formation === b.formation &&
    a.pressing === b.pressing &&
    a.line === b.line &&
    a.attacking === b.attacking &&
    a.tempo === b.tempo &&
    a.buildup === b.buildup &&
    a.focus === b.focus &&
    a.width === b.width &&
    a.marking === b.marking &&
    a.offsideTrap === b.offsideTrap
  );
}

function manMarkEqual(a: SpecialInstructions["manMark"], b: SpecialInstructions["manMark"]): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.markerId === b.markerId && a.targetId === b.targetId;
}

function StaminaBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const color = pct >= 60 ? "var(--color-gain)" : pct >= 35 ? "var(--color-accent)" : "var(--color-danger)";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="stat-num text-[13px]" style={{ color }}>
        {pct}
      </span>
    </div>
  );
}

interface InterventionSheetProps {
  meSetup: SideSetup;
  oppSetup: SideSetup;
  venueId: string;
  subsUsedMe: number;
  stamina: Record<string, number>;
  interventions: Intervention[];
  onSubmit: (iv: Omit<Intervention, "minute">) => void;
  onClose: () => void;
}

export function InterventionSheet({
  meSetup,
  oppSetup,
  venueId,
  subsUsedMe,
  stamina,
  interventions,
  onSubmit,
  onClose,
}: InterventionSheetProps) {
  const squad = useMemo(() => playersOf(meSetup.teamId), [meSetup.teamId]);
  const oppSquad = useMemo(() => playersOf(oppSetup.teamId), [oppSetup.teamId]);

  const [subs, setSubs] = useState<Array<{ out: string; in: string }>>([]);
  const [instructions, setInstr] = useState<TeamInstructions>({ ...meSetup.instructions });
  const [special, setSpecial] = useState<SpecialInstructions>({ ...meSetup.special });
  const [outId, setOutId] = useState("");
  const [inId, setInId] = useState("");

  const nameOf = (id: string) => squad.find((p) => p.id === id)?.name ?? id;

  const remainingSubs = MAX_SUBS - subsUsedMe - subs.length;

  const pendingOut = new Set(subs.map((s) => s.out));
  const pendingIn = new Set(subs.map((s) => s.in));
  const currentLineupIds = new Set(Object.values(meSetup.lineup));

  // 과거 개입에서 교체로 빠진 선수(out)는 재투입 불가 — 후보에서 제외한다.
  const subbedOff = useMemo(() => {
    const set = new Set<string>();
    for (const iv of interventions) for (const s of iv.subs ?? []) set.add(s.out);
    return set;
  }, [interventions]);

  const onPitch = startersOf(meSetup, squad).filter((p) => !pendingOut.has(p.id));
  const bench = squad.filter(
    (p) => !currentLineupIds.has(p.id) && !pendingIn.has(p.id) && !subbedOff.has(p.id)
  );

  const oppStarters = useMemo(
    () => [...startersOf(oppSetup, oppSquad)].sort((a, b) => threat(b) - threat(a)),
    [oppSetup, oppSquad]
  );

  const addSub = () => {
    if (!outId || !inId || remainingSubs <= 0) return;
    setSubs((prev) => [...prev, { out: outId, in: inId }]);
    setOutId("");
    setInId("");
  };

  const removeSub = (i: number) => setSubs((prev) => prev.filter((_, idx) => idx !== i));

  const setManMarker = (markerId: string) => {
    if (!markerId) {
      setSpecial((s) => ({ ...s, manMark: undefined }));
      return;
    }
    setSpecial((s) => ({
      ...s,
      manMark: { markerId, targetId: s.manMark?.targetId || oppStarters[0]?.id || "" },
    }));
  };
  const setManTarget = (targetId: string) => {
    setSpecial((s) => {
      if (!s.manMark?.markerId) return s;
      if (!targetId) return { ...s, manMark: undefined };
      return { ...s, manMark: { markerId: s.manMark.markerId, targetId } };
    });
  };

  const hasChanges =
    subs.length > 0 ||
    !instructionsEqual(instructions, meSetup.instructions) ||
    !manMarkEqual(special.manMark, meSetup.special.manMark);

  // 승률 미리보기: 지시를 "전달"하기 전에 그 효과를 보여준다. 감독의 판단이
  // 결과에 어떻게 작용하는지가 이 앱의 핵심인데, 기존 시트는 제출·재개 후에야
  // 승률 변화를 확인할 수 있었다. 여기서 초안(교체·성향·세부지시·맨마킹)을 그대로
  // 반영한 draft 세팅으로 앱의 실시간 게이지와 동일한 winProbability를 돌려,
  // "이렇게 지시하면 승률이 이렇게 된다"를 확정 전에 병기한다.
  const draftMe: SideSetup = useMemo(() => {
    const lineup = { ...meSetup.lineup };
    for (const { out, in: inId } of subs) {
      const slotId = Object.keys(lineup).find((k) => lineup[k] === out);
      if (slotId) lineup[slotId] = inId;
    }
    return { ...meSetup, lineup, instructions, special };
  }, [meSetup, subs, instructions, special]);

  const baseWin = useMemo(
    () => Math.round(winProbability(meSetup, oppSetup, venueId).win * 100),
    [meSetup, oppSetup, venueId]
  );
  const draftWin = useMemo(
    () => Math.round(winProbability(draftMe, oppSetup, venueId).win * 100),
    [draftMe, oppSetup, venueId]
  );
  const winDelta = draftWin - baseWin;

  const submit = () => {
    const iv: Omit<Intervention, "minute"> = { side: "me" };
    if (subs.length > 0) iv.subs = subs;
    if (!instructionsEqual(instructions, meSetup.instructions)) iv.instructions = instructions;
    if (!manMarkEqual(special.manMark, meSetup.special.manMark)) iv.special = special;
    onSubmit(iv);
  };

  // 다이얼로그 접근성: Escape로 닫기 + 포커스를 시트 안에 가두고, 열릴 때 시트로
  // 옮긴 뒤 닫히면 트리거로 되돌린다. 의존성 없이 keydown 리스너 + 포커스 가능
  // 요소 스캔만으로 구현한다.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    const focusable = (): HTMLElement[] =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => el.offsetParent !== null)
        : [];

    (focusable()[0] ?? panel)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <motion.div
        className="absolute inset-0 bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="작전 변경"
        tabIndex={-1}
        initial={{ y: "100%", opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className="panel relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-[10px] sm:rounded-panel"
      >
        {/* 헤더 */}
        <div className="panel-head">
          <div>
            <p className="eyebrow text-accent">작전 변경</p>
            <p className="mt-0.5 text-[13px] text-dim">
              변경 사항을 모아 한 번에 전달합니다 · 남은 교체 {remainingSubs}회
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-control border border-line px-3 py-1.5 text-xs font-bold text-dim hover:text-ink"
          >
            취소
          </button>
        </div>

        {/* 본문 */}
        <div className="flex flex-col gap-6 overflow-y-auto overscroll-contain px-5 py-5">
          {/* 교체 */}
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-accent">선수 교체</h3>
              <span className="stat-num text-[13px] text-dim">남은 교체 {remainingSubs}회</span>
            </div>

            {subs.length > 0 && (
              <ul className="mb-3 flex flex-col gap-1.5">
                {subs.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-panel border border-accent/30 bg-accent/10 px-3 py-2 text-[13px]"
                  >
                    <span className="flex items-center gap-1.5 text-ink">
                      <ArrowsClockwise weight="bold" className="size-3.5 shrink-0" aria-hidden />
                      {nameOf(s.out)} <span className="text-dim">→</span>{" "}
                      <span className="font-bold text-accent">{nameOf(s.in)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSub(i)}
                      aria-label="교체 취소"
                      className="text-dim hover:text-danger"
                    >
                      <X weight="bold" className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[13px] font-bold text-dim">나가는 선수 (체력)</span>
                <select
                  value={outId}
                  onChange={(e) => setOutId(e.target.value)}
                  disabled={remainingSubs <= 0}
                  className="rounded-control border border-line bg-surface-2 px-2 py-2 text-[13px] text-ink disabled:opacity-50"
                >
                  <option value="">선택</option>
                  {onPitch.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · 체력 {Math.round((stamina[p.id] ?? 1) * 100)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[13px] font-bold text-dim">투입할 선수</span>
                <select
                  value={inId}
                  onChange={(e) => setInId(e.target.value)}
                  disabled={remainingSubs <= 0}
                  className="rounded-control border border-line bg-surface-2 px-2 py-2 text-[13px] text-ink disabled:opacity-50"
                >
                  <option value="">선택</option>
                  {bench.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={addSub}
              disabled={!outId || !inId || remainingSubs <= 0}
              className="mt-2 w-full rounded-control border border-line bg-surface-2/60 py-2 text-[13px] font-bold text-ink transition-colors hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              + 교체 추가
            </button>

            {/* 온피치 체력 미리보기 */}
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {startersOf(meSetup, squad).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg bg-surface-2/40 px-2 py-1.5"
                >
                  <PlayerAvatar name={p.name} number={jerseyOf(p.id)} size={22} ring="var(--color-line)" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{p.name}</span>
                  <StaminaBar value={stamina[p.id] ?? 1} />
                </div>
              ))}
            </div>
          </section>

          {/* 성향 슬라이더 */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-accent">성향 조절</h3>
            {SLIDERS.map(({ key, label, ticks }) => {
              const value = instructions[key];
              return (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between">
                    <label htmlFor={`iv-${key}`} className="text-[13px] font-bold text-ink">
                      {label}
                    </label>
                    <span className="stat-num text-[13px] text-accent">{ticks[value - 1]}</span>
                  </div>
                  <input
                    id={`iv-${key}`}
                    type="range"
                    min={1}
                    max={3}
                    step={1}
                    value={value}
                    onChange={(e) =>
                      setInstr((s) => ({ ...s, [key]: Number(e.target.value) as 1 | 2 | 3 }))
                    }
                    className="touchline-range w-full"
                    aria-valuetext={ticks[value - 1]}
                  />
                </div>
              );
            })}
          </section>

          {/* 세부 지시 토글 */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-accent">세부 지시</h3>
            {TOGGLES.map((tg) => (
              <div key={tg.key} className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-ink">{tg.label}</span>
                <div className="flex gap-1">
                  {tg.options.map((opt) => {
                    const active = (instructions[tg.key] as string) === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setInstr((s) => ({ ...s, [tg.key]: opt.value } as TeamInstructions))
                        }
                        className={`rounded-lg border px-2.5 py-1.5 text-[13px] font-bold transition-colors ${
                          active
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-line bg-surface-2/50 text-dim hover:border-white/20"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>

          {/* 맨마킹 */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-accent">맨마킹</h3>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[13px] font-bold text-dim">우리 마커</span>
                <select
                  value={special.manMark?.markerId ?? ""}
                  onChange={(e) => setManMarker(e.target.value)}
                  className="rounded-control border border-line bg-surface-2 px-2 py-2 text-[13px] text-ink"
                >
                  <option value="">선택 안 함</option>
                  {startersOf(meSetup, squad).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[13px] font-bold text-dim">상대 타깃 (위협순)</span>
                <select
                  value={special.manMark?.targetId ?? ""}
                  onChange={(e) => setManTarget(e.target.value)}
                  disabled={!special.manMark?.markerId}
                  className="rounded-control border border-line bg-surface-2 px-2 py-2 text-[13px] text-ink disabled:opacity-50"
                >
                  <option value="">선택 안 함</option>
                  {oppStarters.map((p, i) => (
                    <option key={p.id} value={p.id}>
                      {i === 0 ? "최우선 " : ""}
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        </div>

        {/* 푸터 CTA */}
        <div className="border-t border-line px-5 py-4">
          {/* 지시 효과 미리보기: 확정 전에 예상 승률과 개입 전 대비 변화를 보여준다. */}
          <div className="mb-3 flex items-center justify-between gap-3 rounded-control border border-line bg-surface-2/50 px-3.5 py-2.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] font-bold text-dim">
                {hasChanges ? "이 지시의 예상 승률" : "현재 예상 승률"}
              </span>
              <span
                className="stat-num text-2xl leading-none"
                style={{ color: hasChanges && winDelta !== 0
                  ? winDelta > 0 ? "var(--color-gain)" : "var(--color-danger)"
                  : "var(--color-ink)" }}
              >
                {draftWin}
                <span className="ml-0.5 text-sm font-black text-dim">%</span>
              </span>
            </div>
            {hasChanges && winDelta !== 0 ? (
              <span
                className="stat-num inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[13px]"
                style={{
                  color: winDelta > 0 ? "var(--color-gain)" : "var(--color-danger)",
                  background: winDelta > 0 ? "rgba(59,227,138,0.14)" : "rgba(255,92,122,0.14)",
                }}
                aria-label={`개입 전 ${baseWin}퍼센트 대비 ${winDelta > 0 ? "상승" : "하락"} ${Math.abs(winDelta)}퍼센트포인트`}
              >
                <span aria-hidden>{winDelta > 0 ? "▲" : "▼"}</span>
                {winDelta > 0 ? "+" : "−"}
                {Math.abs(winDelta)}%p
                <span className="ml-1 font-normal text-dim">개입 전 {baseWin}%</span>
              </span>
            ) : (
              <span className="shrink-0 text-[13px] text-dim">지시를 바꾸면 반응해요</span>
            )}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!hasChanges}
            className="w-full rounded-control bg-accent py-3 text-sm font-black text-accent-ink transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
          >
            지시 전달 → 경기 재개
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// AnimatePresence 래핑용 얇은 컨테이너(부모에서 open 여부로 마운트/언마운트).
export function InterventionSheetPortal({
  open,
  ...props
}: InterventionSheetProps & { open: boolean }) {
  return (
    <AnimatePresence>{open && <InterventionSheet {...props} />}</AnimatePresence>
  );
}

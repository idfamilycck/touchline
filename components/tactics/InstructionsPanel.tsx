"use client";

// 전술 패널 탭 1: 팀 지시.
// 포메이션 6종(미니 도형) + 기본 전술 프리셋 7종 + 슬라이더 7종 + 토글 5종.
// 모든 변경은 setInstructions(partial)로 즉시 스토어에 반영 → 승률·근거가 실시간 갱신된다.

import { useAppStore } from "@/lib/store";
import { FORMATIONS } from "@/lib/data/formations";
import { TACTIC_PRESETS } from "@/lib/data/presets";
import type { FormationId, TeamInstructions } from "@/lib/types";

const FORMATION_IDS: FormationId[] = ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "3-4-3", "5-4-1"];

// 미니 포메이션 도형: 슬롯 (x,y)를 축소해 점으로 찍는다(위가 상대 골문).
function MiniShape({ id, active }: { id: FormationId; active: boolean }) {
  const slots = FORMATIONS[id].slots;
  const dot = active ? "var(--color-accent-ink)" : "var(--color-accent)";
  return (
    <svg viewBox="0 0 100 100" className="h-9 w-7" aria-hidden>
      {slots.map((s) => (
        <circle key={s.id} cx={s.x} cy={100 - s.y} r={6} fill={dot} opacity={s.position === "GK" ? 0.5 : 1} />
      ))}
    </svg>
  );
}

type SliderKey =
  | "pressing" | "line" | "attacking" | "tempo"
  | "lineSpacing" | "possession" | "transitionSpeed";
const SLIDERS: { key: SliderKey; label: string; ticks: [string, string, string] }[] = [
  { key: "pressing", label: "압박 강도", ticks: ["약하게", "보통", "강하게"] },
  { key: "line", label: "수비 라인", ticks: ["낮게", "보통", "높게"] },
  { key: "attacking", label: "공격 성향", ticks: ["안정적", "균형", "공격적"] },
  { key: "tempo", label: "경기 템포", ticks: ["느리게", "보통", "빠르게"] },
  { key: "lineSpacing", label: "라인 간격", ticks: ["압축", "균형", "분산"] },
  { key: "possession", label: "점유율 지향성", ticks: ["낮음", "중간", "높음"] },
  { key: "transitionSpeed", label: "전환 속도", ticks: ["느리게", "보통", "빠르게"] },
];

interface ToggleDef<K extends keyof TeamInstructions> {
  key: K;
  label: string;
  hint: string;
  options: { value: TeamInstructions[K]; label: string }[];
}

const TOGGLES: ToggleDef<"buildup" | "focus" | "width" | "marking">[] = [
  {
    key: "buildup",
    label: "빌드업",
    hint: "공을 어떻게 전개할지",
    options: [
      { value: "short", label: "짧은 패스" },
      { value: "balanced", label: "균형" },
      { value: "direct", label: "롱볼" },
    ],
  },
  {
    key: "focus",
    label: "공격 방향",
    hint: "주로 어느 쪽으로 공격할지",
    options: [
      { value: "left", label: "왼쪽" },
      { value: "center", label: "중앙" },
      { value: "right", label: "오른쪽" },
    ],
  },
  {
    key: "width",
    label: "폭",
    hint: "좌우로 얼마나 넓게 벌릴지",
    options: [
      { value: "narrow", label: "좁게" },
      { value: "balanced", label: "균형" },
      { value: "wide", label: "넓게" },
    ],
  },
  {
    key: "marking",
    label: "수비 방식",
    hint: "지역을 지킬지 사람을 붙일지",
    options: [
      { value: "zonal", label: "지역 방어" },
      { value: "balanced", label: "균형" },
      { value: "man", label: "대인 방어" },
    ],
  },
];

export function InstructionsPanel() {
  const instructions = useAppStore((s) => s.me?.instructions);
  const setInstructions = useAppStore((s) => s.setInstructions);
  if (!instructions) return null;

  return (
    // 포메이션(가로 한 줄) → 기본 전술 → 성향 조절 → 세부 지시 순의 단일 세로 흐름.
    // 예전 xl:2열 마소너리는 포메이션 옆에 큰 여백을 남겨 "빈 부분이 많은" 인상을
    // 줬다. 각 구역이 패널 폭을 꽉 채우는 단일 열이라 좌우 빈 공간이 사라진다.
    <div data-keep-selection className="flex flex-col gap-6">
      {/* 포메이션 — 6종을 한 줄로 가로 배열(좁은 화면만 3열 2줄). */}
      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-accent">포메이션</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {FORMATION_IDS.map((id) => {
            const active = instructions.formation === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => setInstructions({ formation: id })}
                className={`flex flex-col items-center gap-1 rounded-panel border px-2 py-2.5 transition-colors ${
                  active ? "border-accent bg-accent/15" : "border-line bg-surface-2/50 hover:border-white/20"
                }`}
              >
                <MiniShape id={id} active={active} />
                <span className={`stat-num text-[13px] ${active ? "text-accent" : "text-dim"}`}>{id}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 기본 전술 프리셋 */}
      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-accent">기본 전술</h2>
        {/* 두 칸씩 배열 — 프리셋이 많아 한 열로 길게 흐르지 않게 한다. */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TACTIC_PRESETS.map((preset) => {
            const active = (Object.keys(preset.values) as (keyof typeof preset.values)[]).every(
              (k) => instructions[k] === preset.values[k]
            );
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => setInstructions(preset.values)}
                className={`rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                  active ? "border-accent bg-accent/15" : "border-line bg-surface-2/50 hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[13px] font-bold ${active ? "text-accent" : "text-ink"}`}>
                    {preset.nameKo}
                  </span>
                  {active && <span className="text-[10px] font-bold text-accent">● 현재</span>}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-dim">{preset.descKo}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* 슬라이더 */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-accent">성향 조절</h2>
        {SLIDERS.map(({ key, label, ticks }) => {
          const value = instructions[key];
          return (
            <div key={key}>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor={`slider-${key}`} className="text-[13px] font-bold text-ink">
                  {label}
                </label>
                <span className="stat-num text-[13px] text-accent">{ticks[value - 1]}</span>
              </div>
              <input
                id={`slider-${key}`}
                type="range"
                min={1}
                max={3}
                step={1}
                value={value}
                onChange={(e) => setInstructions({ [key]: Number(e.target.value) as 1 | 2 | 3 })}
                className="touchline-range w-full"
                aria-valuetext={ticks[value - 1]}
              />
              <div className="mt-1 flex justify-between text-[13px] text-dim">
                {ticks.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* 토글 */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-accent">세부 지시</h2>
        {TOGGLES.map((tg) => (
          <div key={tg.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-bold text-ink">{tg.label}</span>
              <span className="text-[13px] text-dim">{tg.hint}</span>
            </div>
            <div className="flex gap-1.5">
              {tg.options.map((opt) => {
                const active = instructions[tg.key] === opt.value;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setInstructions({ [tg.key]: opt.value } as Partial<TeamInstructions>)}
                    className={`flex-1 rounded-control border py-2 text-[13px] font-bold transition-colors ${
                      active ? "border-accent bg-accent/15 text-accent" : "border-line bg-surface-2/50 text-dim hover:border-white/20"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* 오프사이드 트랩 스위치 */}
        <div className="flex items-center justify-between rounded-panel border border-line bg-surface-2/50 px-3 py-2.5">
          <div>
            <span className="text-[13px] font-bold text-ink">오프사이드 트랩</span>
            <p className="text-[13px] text-dim">라인을 끌어올려 상대를 걸리게 하기</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={instructions.offsideTrap}
            aria-label="오프사이드 트랩"
            onClick={() => setInstructions({ offsideTrap: !instructions.offsideTrap })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              instructions.offsideTrap ? "bg-accent" : "bg-surface-2 ring-1 ring-line"
            }`}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-ink transition-[left]"
              style={{ left: instructions.offsideTrap ? "22px" : "2px" }}
            />
          </button>
        </div>
      </section>
    </div>
  );
}

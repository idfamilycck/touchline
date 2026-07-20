"use client";

// 전술 패널 탭 3: 특수 지시.
// 주장(C)/프리킥(FK)/코너킥(CK) 지정 · 맨마킹(우리 마커 + 상대 타깃, 위협순 정렬) ·
// 코너 장신 수비수 전진 스위치. 모두 setSpecial(partial)로 즉시 반영된다.
// 맨마킹을 걸면 PitchBoard에 ManMarkLine이 그려지고 라인 강도가 감소한다.

import { useAppStore } from "@/lib/store";
import { FORMATIONS } from "@/lib/data/formations";
import { playersOf } from "@/lib/data/players";
import type { Player, SideSetup } from "@/lib/types";

// 상대 위협 점수: 슈팅/드리블/속도 가중 — 우선 마킹할 공격 자원을 위로 정렬.
function threat(p: Player): number {
  return p.attrs.shooting * 0.4 + p.attrs.dribbling * 0.3 + p.attrs.pace * 0.3;
}

function startersOf(side: SideSetup): Player[] {
  const squad = playersOf(side.teamId);
  const slots = FORMATIONS[side.instructions.formation].slots;
  return slots
    .map((s) => squad.find((p) => p.id === side.lineup[s.id]))
    .filter((p): p is Player => Boolean(p));
}

function LabeledSelect({
  label,
  value,
  onChange,
  players,
  placeholder,
}: {
  label: string;
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  players: Player[];
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-bold text-ink">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="rounded-[8px] border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink"
      >
        <option value="">{placeholder}</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SpecialPanel() {
  const me = useAppStore((s) => s.me);
  const opp = useAppStore((s) => s.opp);
  const setSpecial = useAppStore((s) => s.setSpecial);
  if (!me || !opp) return null;

  const myStarters = startersOf(me);
  const oppStarters = [...startersOf(opp)].sort((a, b) => threat(b) - threat(a));
  const special = me.special;

  return (
    <div data-keep-selection className="flex flex-col gap-6">
      {/* 세트피스 담당 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-accent">담당 지정</h2>
        <LabeledSelect
          label="주장 (C)"
          value={special.captainId}
          onChange={(id) => setSpecial({ captainId: id })}
          players={myStarters}
          placeholder="선택 안 함"
        />
        <LabeledSelect
          label="프리킥 (FK)"
          value={special.fkTakerId}
          onChange={(id) => setSpecial({ fkTakerId: id })}
          players={myStarters}
          placeholder="선택 안 함"
        />
        <LabeledSelect
          label="코너킥 (CK)"
          value={special.ckTakerId}
          onChange={(id) => setSpecial({ ckTakerId: id })}
          players={myStarters}
          placeholder="선택 안 함"
        />
      </section>

      {/* 맨마킹 */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-accent">맨마킹</h2>
          <p className="mt-1 text-[10px] text-dim">우리 선수를 상대 위협 선수에게 밀착 배치합니다.</p>
        </div>
        <LabeledSelect
          label="우리 마커"
          value={special.manMark?.markerId}
          onChange={(markerId) => {
            const targetId = special.manMark?.targetId;
            if (markerId && targetId) setSpecial({ manMark: { markerId, targetId } });
            else if (!markerId) setSpecial({ manMark: undefined });
            // 타깃이 아직 없으면 markerId만으로는 확정하지 않는다(둘 다 있어야 지시 성립).
            else setSpecial({ manMark: { markerId, targetId: oppStarters[0]?.id ?? "" } });
          }}
          players={myStarters}
          placeholder="선택 안 함"
        />
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink">상대 타깃 (위협 순)</span>
          <select
            value={special.manMark?.targetId ?? ""}
            onChange={(e) => {
              const targetId = e.target.value || undefined;
              const markerId = special.manMark?.markerId;
              if (markerId && targetId) setSpecial({ manMark: { markerId, targetId } });
              else if (!targetId) setSpecial({ manMark: undefined });
            }}
            disabled={!special.manMark?.markerId}
            className="rounded-[8px] border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink disabled:opacity-50"
          >
            <option value="">선택 안 함</option>
            {oppStarters.map((p, i) => (
              <option key={p.id} value={p.id}>
                {i === 0 ? "⚠ " : ""}
                {p.name} · 위협 {Math.round(threat(p))}
              </option>
            ))}
          </select>
        </label>
        {special.manMark && (
          <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
            맨마킹 활성 — 피치에 마킹 라인이 표시되고 상대 타깃의 기여도가 낮아집니다.
          </p>
        )}
      </section>

      {/* 코너 장신 전진 */}
      <section>
        <div className="flex items-center justify-between rounded-[10px] border border-line bg-surface-2/50 px-3 py-2.5">
          <div>
            <span className="text-[13px] font-bold text-ink">코너킥 시 장신 수비수 전진</span>
            <p className="text-[10px] text-dim">우리 코너에서 키 큰 수비수를 상대 골문 앞으로</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={special.ckBigMenForward}
            aria-label="코너킥 시 장신 수비수 전진"
            onClick={() => setSpecial({ ckBigMenForward: !special.ckBigMenForward })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              special.ckBigMenForward ? "bg-accent" : "bg-surface-2 ring-1 ring-line"
            }`}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-ink transition-all"
              style={{ left: special.ckBigMenForward ? "22px" : "2px" }}
            />
          </button>
        </div>
      </section>
    </div>
  );
}

"use client";

import { VENUES } from "@/lib/data/venues";
import type { Venue } from "@/lib/types";

interface VenuePickerProps {
  venueId?: string;
  onSelect: (venueId: string) => void;
}

// 경기장 특성 아이콘: 고도>1500 🏔 · 기온≥30℃(비돔) 🥵 · 돔 🏟
function venueTraits(v: Venue): { icon: string; label: string }[] {
  const traits: { icon: string; label: string }[] = [];
  if (v.altitude > 1500) traits.push({ icon: "🏔", label: "고지대" });
  if (v.avgTempC >= 30 && !v.dome) traits.push({ icon: "🥵", label: "폭염" });
  if (v.dome) traits.push({ icon: "🏟", label: "돔구장" });
  return traits;
}

export function VenuePicker({ venueId, onSelect }: VenuePickerProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-dim">
        경기장은 전술에 영향을 줍니다 — 고도는 체력을, 기온은 압박 지속을, 돔은 날씨 변수를 바꿉니다.
      </p>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {VENUES.map((v) => {
          const selected = v.id === venueId;
          const traits = venueTraits(v);
          return (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => onSelect(v.id)}
                aria-pressed={selected}
                className="panel relative flex h-full w-full flex-col gap-2 rounded-[10px] p-3 text-left transition-colors duration-150 hover:border-white/25"
                style={{ borderColor: selected ? "var(--color-accent)" : undefined }}
              >
                {selected && <span className="sr-only">선택됨</span>}
                {selected && (
                  <span aria-hidden className="absolute right-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-black text-accent-ink">
                    선택됨
                  </span>
                )}
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-ink">{v.nameKo}</div>
                    <div className="text-[11px] text-dim">{v.cityKo}</div>
                  </div>
                  <div className="flex gap-0.5 text-base leading-none">
                    {traits.map((t) => (
                      <span key={t.label}>
                        <span aria-hidden>{t.icon}</span>
                        <span className="sr-only">{t.label}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-auto flex items-center gap-3 border-t border-line pt-2 text-[11px] text-dim">
                  <span>
                    고도 <span className="stat-num text-ink">{v.altitude}</span>m
                  </span>
                  <span>
                    기온 <span className="stat-num text-ink">{v.avgTempC}</span>℃
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

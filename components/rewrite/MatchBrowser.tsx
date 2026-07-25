"use client";

import { useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Wc2026Match, Wc2026Round } from "@/lib/wc2026/types";
import { wc2026TeamId } from "@/lib/wc2026/data";
import { teamById } from "@/lib/data/teams";
import { sortForBrowser, roundLabelKo, availableGroups } from "@/components/rewrite/match-browser";
import { FlagBadge } from "@/components/ui/FlagBadge";
import { ROUND_LABEL_CLASS, roundTone } from "@/lib/wc2026/stage";

const ROUND_ORDER: Wc2026Round[] = ["group", "r32", "r16", "qf", "sf", "third", "final"];
const ROUND_SET = new Set<string>(ROUND_ORDER);

function parseRound(v: string | null): Wc2026Round | undefined {
  return v && ROUND_SET.has(v) ? (v as Wc2026Round) : undefined;
}

// 렌더 예산: 카드 그리드에서 조밀한 행 리스트로 바뀌며 한 항목의 DOM 비용이 크게
// 줄었으므로 초기 노출을 40행으로 올린다(104경기 전부를 한 번에 그리지는 않는다).
// 나머지는 "더 보기"로 이어붙이고, 필터가 바뀌면 다시 40행부터 시작한다.
const PAGE_SIZE = 40;

interface MatchBrowserProps {
  matches: Wc2026Match[];
  selectedMatchId?: string;
  onSelectMatch: (match: Wc2026Match) => void;
  /** lg 미만에서 선택된 행 바로 아래에 펼칠 상세(2열이 불가능한 폭의 대안 경로). */
  renderInlineDetail?: (match: Wc2026Match) => ReactNode;
}

// wc 팀 코드 → 표시용 한국어 이름/배지 색상. 아직 registerWc2026()이 끝나지
// 않은 극초반 렌더에도 안전하도록 미등록 시 코드/회색으로 폴백한다.
function teamDisplay(code: string) {
  const team = teamById(wc2026TeamId(code));
  return {
    nameKo: team?.nameKo ?? code,
    color1: team?.color1 ?? "#666666",
    color2: team?.color2 ?? "#cccccc",
  };
}

export function MatchBrowser({
  matches,
  selectedMatchId,
  onSelectMatch,
  renderInlineDetail,
}: MatchBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 라운드/조 필터는 URL 쿼리(?round=&group=)가 단일 소스다 — 뒤로/앞으로가기와
  // 딥링크로 그대로 복원된다.
  const roundFilter = parseRound(searchParams.get("round"));
  const groupFilter = searchParams.get("group") ?? undefined;

  function updateQuery(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // 실제 데이터에 존재하는 라운드만 탭으로 노출한다(수집 시점에 따라 특정 라운드가
  // 없으면 "결승" 탭은 숨김).
  const availableRounds = useMemo(() => {
    const present = new Set(matches.map((m) => m.round));
    return ROUND_ORDER.filter((r) => present.has(r));
  }, [matches]);

  // 조별리그 선택 시 노출할 조(A~L) 목록.
  const groups = useMemo(() => availableGroups(matches), [matches]);

  // 라운드를 조별리그가 아닌 곳으로 바꾸면 조 필터를 초기화한다.
  function pickRound(r: Wc2026Round | undefined) {
    updateQuery({ round: r, group: r === "group" ? groupFilter : undefined });
  }
  function pickGroup(g: string | undefined) {
    updateQuery({ group: g });
  }

  const visible = useMemo(
    () => sortForBrowser(matches, roundFilter, roundFilter === "group" ? groupFilter : undefined),
    [matches, roundFilter, groupFilter],
  );

  // 렌더 예산: 필터가 바뀌면 24장부터 다시 시작. 이펙트 대신 렌더 중 이전 필터 키와
  // 비교해 조건부로 초기화한다("Adjusting state when a prop changes" 패턴) — 별도
  // 커밋 없이 같은 렌더에서 바로 반영돼 이펙트보다 한 프레임 빠르다.
  const filterKey = `${roundFilter ?? ""}|${groupFilter ?? ""}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setVisibleCount(PAGE_SIZE);
  }
  const shown = visible.slice(0, visibleCount);

  return (
    <div className="flex flex-col gap-5">
      {/* 라운드 필터 탭 */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => pickRound(undefined)}
          className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-xs font-bold transition-colors sm:min-h-[32px] ${
            roundFilter === undefined ? "bg-accent text-accent-ink" : "bg-surface-2 text-dim"
          }`}
        >
          전체
        </button>
        {/* 선택된 칩은 시안(상호작용 규칙 유지). 선택되지 않은 칩만 라운드 골드 램프로
            물들여, 대진표와 같은 "결승으로 갈수록 진해지는" 위계를 여기서도 읽히게 한다. */}
        {availableRounds.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => pickRound(r)}
            className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-xs font-bold transition-colors sm:min-h-[32px] ${
              roundFilter === r
                ? "bg-accent text-accent-ink"
                : `bg-surface-2 ${ROUND_LABEL_CLASS[roundTone(r)]}`
            }`}
          >
            {roundLabelKo(r)}
          </button>
        ))}
      </div>

      {/* 조 필터(조별리그 선택 시에만) */}
      {roundFilter === "group" && groups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => pickGroup(undefined)}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-3.5 text-[13px] font-bold transition-colors sm:min-h-[28px] sm:min-w-0 ${
              groupFilter === undefined ? "bg-accent/80 text-accent-ink" : "bg-surface text-dim"
            }`}
          >
            전체 조
          </button>
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => pickGroup(g)}
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-3.5 text-[13px] font-bold transition-colors sm:min-h-[28px] sm:min-w-0 ${
                groupFilter === g ? "bg-accent/80 text-accent-ink" : "bg-surface text-dim"
              }`}
            >
              {g}조
            </button>
          ))}
        </div>
      )}

      {/* 경기 행 리스트 — 카드 그리드가 아니라 헤어라인으로만 나뉘는 조밀한 행.
          한 줄에 라운드 · 홈 국기/팀명 · 스코어 · 원정 팀명/국기 · 이벤트 수가 들어간다.
          구분선은 .data-row(border-bottom 하나)만 쓴다 — 행마다 위아래 선을 겹치지 않게. */}
      <div className="overflow-hidden rounded-panel border border-line bg-surface/60">
        {/* 열 이름 — FM식 데이터 표의 머리. 좁은 폭에서는 스코어 열만 남긴다. */}
        <div className="data-head flex items-center gap-2 px-3 py-1.5 sm:gap-3">
          <span className="w-14 shrink-0 sm:w-20">라운드</span>
          <span className="min-w-0 flex-1 text-center">경기</span>
          <span className="hidden w-16 shrink-0 text-right sm:block">이벤트</span>
        </div>

        <ul>
          {shown.map((m) => {
            const home = teamDisplay(m.home);
            const away = teamDisplay(m.away);
            const isKor = m.home === "KOR" || m.away === "KOR";
            const isSelected = m.id === selectedMatchId;

            return (
              <li key={m.id} className="data-row relative min-w-0">
                {/* 선택 표시는 레이아웃을 밀지 않도록 절대 배치한 시안 바로. */}
                {isSelected && (
                  <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-accent" />
                )}
                <button
                  type="button"
                  onClick={() => onSelectMatch(m)}
                  aria-pressed={isSelected}
                  className={`flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left transition-colors duration-150 hover:bg-raised/60 sm:gap-3 ${
                    isSelected ? "bg-raised/70" : ""
                  }`}
                >
                  <span className="flex w-14 shrink-0 flex-col gap-0.5 sm:w-20">
                    <span
                      className={`truncate text-[13px] font-bold uppercase tracking-wider ${ROUND_LABEL_CLASS[roundTone(m.round)]}`}
                    >
                      {roundLabelKo(m.round)}
                    </span>
                    {isKor && (
                      <span className="text-[13px] font-black leading-none text-accent">KOR</span>
                    )}
                  </span>

                  <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
                    <span className="truncate text-right text-sm font-bold text-ink">
                      {home.nameKo}
                    </span>
                    <FlagBadge code={m.home} color1={home.color1} color2={home.color2} size={22} />
                  </span>

                  <span className="stat-num shrink-0 text-base text-ink">
                    {m.scoreHome} : {m.scoreAway}
                  </span>

                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <FlagBadge code={m.away} color1={away.color1} color2={away.color2} size={22} />
                    <span className="truncate text-sm font-bold text-ink">{away.nameKo}</span>
                  </span>

                  <span className="hidden w-16 shrink-0 text-right text-[13px] text-dim sm:block">
                    <span className="tnum">{m.events.length}</span>건
                  </span>
                </button>

                {/* lg 미만: 2열을 쓸 수 없으므로 상세를 이 행 아래에서 그대로 펼친다.
                    lg 이상에서는 display:none이라 접근성 트리에도 오르지 않는다
                    (우측 sticky 컬럼 하나만 남는다). */}
                {isSelected && renderInlineDetail && (
                  <div className="border-t border-line bg-pitch-2/60 px-3 py-4 lg:hidden">
                    {renderInlineDetail(m)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {visible.length > visibleCount && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="mx-auto min-h-[44px] rounded-full border border-line bg-surface-2/60 px-6 text-xs font-bold text-ink transition-colors hover:border-white/25"
        >
          더 보기 · {visible.length - visibleCount}경기 남음
        </button>
      )}

      {visible.length === 0 && (
        <p className="py-8 text-center text-sm text-dim">이 라운드에는 경기가 없습니다.</p>
      )}
    </div>
  );
}

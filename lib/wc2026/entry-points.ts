// lib/wc2026/entry-points.ts
//
// Pure module: builds the list of places a user can enter a real WC2026
// match's rewrite session from — either a fixed preset (full match / first
// half / second half) or "5 minutes before" any recorded event (goal, sub,
// card). Presets are ALWAYS available regardless of the match's events, so
// there is never a dead-end even on a clean win with no cards/subs recorded
// early. No I/O, no mutation, no Math.random.

import type { Wc2026Match, Wc2026Event } from "@/lib/wc2026/types";
import { koreanName } from "@/lib/wc2026/player-names";

export interface EntryPoint {
  id: string;
  category: "preset" | "event";
  takeoverMinute: number; // where the sim resumes from
  endMinute?: number; // session end; undefined = play to natural end (regulation ~90)
  labelKo: string; // primary label
  subKo?: string; // secondary line
  minute?: number; // event minute (event category only)
  emphasis?: boolean; // highlight (our concede / our red / lost lead)
  teamCode?: string; // event's team (event category only) — for badge + team name
  isOurs?: boolean; // teamCode === side (event category only)
  kindKo?: string; // "득점" | "실점" | "자책골" | "교체" | "경고" | "퇴장"
  icon?: string; // "⚽" | "🔄" | "🟨" | "🟥"
  detailKo?: string; // WHO: "손흥민" / "김영권 → 조규성" / "이강인"
}

// 고정 진행 방식 프리셋 — 이벤트 유무와 무관하게 항상 3개를 반환한다. 이것이
// "완승/무카드 경기라 결정적 순간이 없다"는 막다른 화면을 없애는 핵심이다.
export function buildPresets(): EntryPoint[] {
  return [
    {
      id: "preset-full",
      category: "preset",
      takeoverMinute: 0,
      labelKo: "풀경기 지휘",
      subKo: "킥오프부터 90분 전체를 지휘",
    },
    {
      id: "preset-first",
      category: "preset",
      takeoverMinute: 0,
      endMinute: 45,
      labelKo: "전반전 지휘",
      subKo: "킥오프부터 전반 종료(45′)까지",
    },
    {
      id: "preset-second",
      category: "preset",
      takeoverMinute: 45,
      labelKo: "후반전 지휘",
      subKo: "후반 시작(45′)부터 종료까지",
    },
  ];
}

interface EventDetail {
  emphasis: boolean;
  kindKo: string;
  icon: string;
  detailKo: string;
}

// 한국 관객 기준: 로마자 표기(ESPN 원본)를 한글 이름으로 치환한다(매핑이 없으면
// 로마자/원본 문자열 그대로 폴백) — register.ts의 Player.name 치환과 동일한 규칙을
// 이 모듈이 직접 다루는 raw event/lineup 이름 문자열에도 적용한다.
function kr(name: string): string {
  return koreanName(name) ?? name;
}

// playerId -> name 맵을 이용해 이벤트 하나를 "누가 무엇을 했는지" 상세로 변환한다.
// side/opponent 둘 중 하나만 있는 도메인이므로 "side가 아니면 opponent"로 충분하다.
function detailForEvent(ev: Wc2026Event, side: string, nameById: Map<string, string>): EventDetail {
  const isSide = ev.teamCode === side;
  const scorerName = kr(ev.playerName);
  switch (ev.type) {
    case "goal":
      return { icon: "⚽", detailKo: scorerName, kindKo: isSide ? "득점" : "실점", emphasis: !isSide };
    case "pen_goal":
      return {
        icon: "⚽",
        detailKo: `${scorerName} (PK)`,
        kindKo: isSide ? "득점" : "실점",
        emphasis: !isSide,
      };
    case "own_goal":
      // own_goal.teamCode = 자책골을 자기 골문에 넣은(가해) 팀 -> 득점은 상대에 가산.
      return { icon: "⚽", detailKo: scorerName, kindKo: "자책골", emphasis: isSide };
    case "sub": {
      const inName = scorerName;
      const outName = ev.relatedPlayerId ? (nameById.get(ev.relatedPlayerId) ?? ev.relatedPlayerId) : undefined;
      const detailKo = outName ? `${outName} → ${inName}` : inName;
      return { icon: "🔄", detailKo, kindKo: "교체", emphasis: false };
    }
    case "yellow":
      return { icon: "🟨", detailKo: scorerName, kindKo: "경고", emphasis: false };
    case "red":
      return { icon: "🟥", detailKo: scorerName, kindKo: "퇴장", emphasis: isSide };
  }
}

// match.events(90분 이하)를 분 오름차순으로, 각각 "그 시점 5분 전" 진입점으로
// 변환한다. 정규시간(90분) 이후 이벤트(연장전 등)는 제외한다 — 엔진이 정규시간만
// 시뮬레이션하기 때문. 두 팀 라인업(선발+벤치)에서 playerId -> name 맵을 만들어
// 교체 OUT 선수(이름 필드가 없는 relatedPlayerId)를 이 맵으로 해석한다.
export function buildEventEntries(match: Wc2026Match, side: string): EntryPoint[] {
  const nameById = new Map<string, string>();
  for (const lineup of match.lineups) {
    for (const p of lineup.starters) nameById.set(p.playerId, kr(p.name));
    for (const p of lineup.bench) nameById.set(p.playerId, kr(p.name));
  }

  const events = [...match.events]
    .filter((e) => e.minute <= 90)
    .sort((a, b) => a.minute - b.minute);

  return events.map((ev, index) => {
    const takeoverMinute = Math.max(ev.minute - 5, 0);
    const { emphasis, kindKo, icon, detailKo } = detailForEvent(ev, side, nameById);
    const isOurs = ev.teamCode === side;
    return {
      id: `ev-${match.id}-${index}`,
      category: "event",
      takeoverMinute,
      labelKo: `${ev.minute}′ ${detailKo} ${kindKo}`,
      subKo: `이 시점 5분 전(${takeoverMinute}′)부터`,
      minute: ev.minute,
      emphasis,
      teamCode: ev.teamCode,
      isOurs,
      kindKo,
      icon,
      detailKo,
    };
  });
}

// lib/wc2026/register.ts
//
// Wires the WC2026 dataset (data/wc2026/teams.json + matches.json) into the
// engine's existing lookup functions (teamById/playersOf/venueById) so the
// rest of the engine can consume WC teams/players/venues transparently,
// without knowing they came from a different data source.
//
// registerWc2026() is idempotent: it is safe to call many times (e.g. once
// per page/route that needs WC data) and will only do the registration work
// once per process.

import type { Team, Venue } from "@/lib/types";
import { registerTeam } from "@/lib/data/teams";
import { registerPlayers } from "@/lib/data/players";
import { registerVenue, venueById } from "@/lib/data/venues";
import { makeVirtualPlayer } from "@/lib/wc2026/players";
import { wc2026Matches, wc2026TeamId } from "@/lib/wc2026/data";
import teamsJson from "@/data/wc2026/teams.json";

interface Wc2026TeamRow {
  code: string;
  id: string;
  nameKo: string;
  elo: number;
  finishRound: string;
}

const WC_TEAMS = teamsJson as Wc2026TeamRow[];

// 48개 실제 출전국의 국기 색상(hex). 팀 카드가 전부 회색으로 뭉개지지 않도록 최대한
// 실제 국가 색을 반영한다 — 표에 없는 코드는 아래 fallbackColors()가 코드 문자열을
// 해시해 결정적인(매 로드마다 동일한) 비회색 HSL 색상 쌍을 만들어낸다.
const NATION_COLORS: Record<string, { color1: string; color2: string }> = {
  ALG: { color1: "#006233", color2: "#FFFFFF" },
  ARG: { color1: "#75AADB", color2: "#FFFFFF" },
  AUS: { color1: "#00843D", color2: "#FFCD00" },
  AUT: { color1: "#ED2939", color2: "#FFFFFF" },
  BEL: { color1: "#000000", color2: "#FDDA24" },
  BIH: { color1: "#002395", color2: "#FFCD00" },
  BRA: { color1: "#FFDF00", color2: "#009C3B" },
  CAN: { color1: "#FF0000", color2: "#FFFFFF" },
  CIV: { color1: "#F77F00", color2: "#009E60" },
  COD: { color1: "#007FFF", color2: "#F7D618" },
  COL: { color1: "#FCD116", color2: "#003893" },
  CPV: { color1: "#003893", color2: "#CF2027" },
  CRO: { color1: "#FF0000", color2: "#FFFFFF" },
  CUW: { color1: "#002B7F", color2: "#F9E814" },
  CZE: { color1: "#D7141A", color2: "#11457E" },
  ECU: { color1: "#FFDD00", color2: "#034EA2" },
  EGY: { color1: "#CE1126", color2: "#000000" },
  ENG: { color1: "#FFFFFF", color2: "#CE1124" },
  ESP: { color1: "#AA151B", color2: "#F1BF00" },
  FRA: { color1: "#002395", color2: "#ED2939" },
  GER: { color1: "#000000", color2: "#DD0000" },
  GHA: { color1: "#CE1126", color2: "#FCD116" },
  HAI: { color1: "#00209F", color2: "#D21034" },
  IRN: { color1: "#239F40", color2: "#DA0000" },
  IRQ: { color1: "#CE1126", color2: "#000000" },
  JOR: { color1: "#000000", color2: "#007A3D" },
  JPN: { color1: "#000080", color2: "#FFFFFF" },
  KOR: { color1: "#C60C30", color2: "#003478" },
  KSA: { color1: "#006C35", color2: "#FFFFFF" },
  MAR: { color1: "#C1272D", color2: "#006233" },
  MEX: { color1: "#006847", color2: "#CE1126" },
  NED: { color1: "#FF6600", color2: "#FFFFFF" },
  NOR: { color1: "#EF2B2D", color2: "#002868" },
  NZL: { color1: "#000000", color2: "#C0C0C0" },
  PAN: { color1: "#DA121A", color2: "#072357" },
  PAR: { color1: "#D52B1E", color2: "#0038A8" },
  POR: { color1: "#FF0000", color2: "#006600" },
  QAT: { color1: "#8D1B3D", color2: "#FFFFFF" },
  RSA: { color1: "#007A4D", color2: "#FFB612" },
  SCO: { color1: "#005EB8", color2: "#FFFFFF" },
  SEN: { color1: "#00853F", color2: "#FDEF42" },
  SUI: { color1: "#FF0000", color2: "#FFFFFF" },
  SWE: { color1: "#006AA7", color2: "#FECC02" },
  TUN: { color1: "#E70013", color2: "#FFFFFF" },
  TUR: { color1: "#E30A17", color2: "#FFFFFF" },
  URU: { color1: "#6CACE4", color2: "#FFFFFF" },
  USA: { color1: "#B22234", color2: "#3C3B6E" },
  UZB: { color1: "#0099B5", color2: "#1EB53A" },
};

// 표에 없는 코드를 위한 결정적 fallback: 코드 문자열을 해시해 hue를 뽑고, 채도/명도가
// 높은 HSL 두 톤(본색/보색 근처)을 hex로 변환한다. 매 프로세스 로드마다 같은 코드는
// 항상 같은 색을 낸다(회색 placeholder를 대체하는 것이 목적이라 hue만 다르면 충분).
function hashHue(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return h % 360;
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

function fallbackColors(code: string): { color1: string; color2: string } {
  const hue = hashHue(code);
  return {
    color1: hslToHex(hue, 65, 45),
    color2: hslToHex((hue + 150) % 360, 60, 55),
  };
}

// finishRound(대회 최종 성적) -> 팀 카드 하단에 보여줄 한 줄 태그. WC 팀은 H2H 데이터가
// 없어 TeamGrid의 styleTags 폴백 분기가 항상 쓰이므로, 이 태그가 카드 정보의 전부가
// 된다. "final"은 데이터상 우승/준우승을 구분하지 못해(같은 elo로 동률 저장) 안전하게
// "결승 진출"로 통합한다. "third"는 4강에서 3~4위전을 치른 팀(=준결승 진출자)이다.
const FINISH_TAG: Record<string, string> = {
  final: "결승 진출",
  third: "4강",
  qf: "8강",
  r16: "16강",
  r32: "32강",
  group: "조별리그",
};

function formFromElo(elo: number): number {
  return Math.max(1, Math.min(10, Math.round((elo - 1400) / 80)));
}

// 기본 WC 경기장. 실제 경기장별 프로필(고도/기온 등)을 아직 매핑하지 않았으므로
// metlife를 복제한 단일 기본값을 사용한다 (plan상 허용된 단순화).
const WC_DEFAULT_VENUE: Venue = {
  id: "wc_default",
  nameKo: "2026 월드컵 경기장",
  cityKo: "미국/캐나다/멕시코",
  altitude: 200,
  avgTempC: 26,
  dome: false,
  capacity: 75000,
};

let done = false;

export function registerWc2026(): void {
  if (done) return;
  done = true;

  // (a) 팀 등록
  const eloRank = [...WC_TEAMS].sort((a, b) => b.elo - a.elo);
  const rankByCode = new Map<string, number>();
  eloRank.forEach((t, i) => rankByCode.set(t.code, i + 1));
  const eloByCode = new Map<string, number>();

  for (const row of WC_TEAMS) {
    eloByCode.set(row.code, row.elo);
    const colors = NATION_COLORS[row.code] ?? fallbackColors(row.code);
    const team: Team = {
      id: row.id,
      nameKo: row.nameKo,
      code: row.code,
      elo: row.elo,
      fifaRank: rankByCode.get(row.code) ?? 99,
      form: formFromElo(row.elo),
      styleTags: [FINISH_TAG[row.finishRound] ?? row.finishRound],
      color1: colors.color1,
      color2: colors.color2,
    };
    registerTeam(team);
  }

  // (b) 팀별 고유 선수 수집 (playerId 기준 dedup) 후 가상 선수 생성
  const playersByTeam = new Map<string, Map<string, { name: string; position: string }>>();

  for (const match of wc2026Matches()) {
    for (const lineup of match.lineups) {
      const teamId = wc2026TeamId(lineup.teamCode);
      let bucket = playersByTeam.get(teamId);
      if (!bucket) {
        bucket = new Map();
        playersByTeam.set(teamId, bucket);
      }
      for (const p of [...lineup.starters, ...lineup.bench]) {
        if (!bucket.has(p.playerId)) {
          bucket.set(p.playerId, { name: p.name, position: p.position });
        }
      }
    }
  }

  for (const [teamId, bucket] of playersByTeam) {
    const code = teamId.slice(3).toUpperCase(); // "wc_esp" -> "ESP"
    const teamElo = eloByCode.get(code) ?? 1600;
    const players = [...bucket.entries()].map(([playerId, info]) =>
      makeVirtualPlayer({
        id: playerId,
        teamId,
        name: info.name,
        position: info.position,
        teamElo,
      }),
    );
    registerPlayers(teamId, players);
  }

  // (c) 경기장 등록: 기존 venue와 이름이 겹치지 않는 한 기본 WC venue 하나로 충분.
  if (!venueById(WC_DEFAULT_VENUE.id)) {
    registerVenue(WC_DEFAULT_VENUE);
  }
}

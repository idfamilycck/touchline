// 상대(48개국) 시작 전술 프로파일 — 감독을 지정하는 순간 상대의 시작 전술을 고정한다.
//
// 데이터 출처(정직한 하이브리드):
//   · 포메이션  = 실제 대회 라인업에서 추출한 그 나라의 실제 대표 대형(진짜 데이터).
//                 우리 6종(4-3-3 등) 중 가장 가까운 것으로 매핑한다.
//   · 전술 성향 = 각국의 축구 정체성(스페인=점유·하이라인, 이탈리아식 수비블록,
//                 잉글랜드=측면·강압박, 브라질=역습 등 — 안정적인 축구 상식)과 실제
//                 대회 성적을, 이 앱의 전술 축(pressing/line/attacking/tempo/lineSpacing/
//                 possession/transitionSpeed/buildup/focus/width/marking/offsideTrap)에
//                 매핑한 "산정값". 유명국은 정체성으로, 나머지는 ELO 기반으로 산정한다.
//
// 2026 감독 개개인의 실시간 데이터를 지어내지 않는다 — 실제 포메이션(진짜)에
// 국가 축구 정체성 매핑(산정)을 얹어 48개국 전부를 정직하게 커버한다. 화면에는
// styleKo(한 줄 성향)와 estimated(산정 여부)를 함께 노출해 진짜/산정을 구분한다.

import type { FormationId, TeamInstructions } from "@/lib/types";
import { teamById } from "@/lib/data/teams";
import { codeOfTeamId } from "@/lib/wc2026/scouting";

/** formation을 뺀 성향 축들. 프로파일 오버레이의 단위. */
export type TacticAxes = Omit<TeamInstructions, "formation">;

export interface OppTacticProfile {
  instructions: TeamInstructions; // formation + 성향 축 전체
  axes: TacticAxes; // formation 제외(실제 대형을 보존해야 하는 rewrite에서 이것만 얹는다)
  styleKo: string; // 한 줄 성향 요약
  estimated: boolean; // true면 성향이 ELO 기반 산정(정체성 큐레이션 없음)
}

// 실제 대형 라벨 -> 우리 6종 중 가장 가까운 FormationId.
const SHAPE_MAP: Record<string, FormationId> = {
  "4-3-3": "4-3-3", "4-4-2": "4-4-2", "4-2-3-1": "4-2-3-1",
  "3-5-2": "3-5-2", "3-4-3": "3-4-3", "5-4-1": "5-4-1",
  "4-5-1": "4-2-3-1", "4-1-4-1": "4-2-3-1", "4-3-2-1": "4-2-3-1",
  "4-4-1-1": "4-4-2", "4-1-2-3": "4-3-3", "4-2-2-2": "4-4-2",
  "3-4-2-1": "3-4-3", "3-4-1-2": "3-5-2", "3-6-1": "3-5-2",
  "5-3-2": "5-4-1", "5-2-3": "5-4-1", "3-1-4-2": "3-5-2",
};

export function nearestFormation(shape?: string): FormationId | undefined {
  if (!shape) return undefined;
  const s = shape.trim();
  if (SHAPE_MAP[s]) return SHAPE_MAP[s];
  const defenders = s.charCodeAt(0) - 48; // 첫 숫자 = 수비수 수
  if (defenders === 5) return "5-4-1";
  if (defenders === 3) return "3-5-2";
  if (defenders === 4) return "4-2-3-1";
  return undefined;
}

// ── ELO 기반 기본 성향(3단계) — 정체성 큐레이션이 없는 나라의 폴백 ──────────────
function baselineFromElo(elo: number): { formation: FormationId; axes: TacticAxes; styleKo: string } {
  if (elo >= 2000) {
    return {
      formation: "4-3-3",
      styleKo: "점유·전방 압박",
      axes: {
        pressing: 3, line: 3, attacking: 2, tempo: 2,
        buildup: "short", focus: "center", width: "wide", marking: "zonal",
        offsideTrap: true, lineSpacing: 1, possession: 3, transitionSpeed: 2,
      },
    };
  }
  if (elo >= 1850) {
    return {
      formation: "4-2-3-1",
      styleKo: "균형 잡힌 운영",
      axes: {
        pressing: 2, line: 2, attacking: 2, tempo: 2,
        buildup: "balanced", focus: "center", width: "balanced", marking: "zonal",
        offsideTrap: false, lineSpacing: 2, possession: 2, transitionSpeed: 2,
      },
    };
  }
  return {
    formation: "4-4-2",
    styleKo: "수비 조직·빠른 역습",
    axes: {
      pressing: 2, line: 1, attacking: 1, tempo: 2,
      buildup: "direct", focus: "center", width: "balanced", marking: "man",
      offsideTrap: false, lineSpacing: 1, possession: 1, transitionSpeed: 3,
    },
  };
}

// ── 국가 축구 정체성 큐레이션(성향 오버레이) ─────────────────────────────────────
// axes는 부분 오버레이 — 지정한 축만 baseline 위에 덮는다. formation은 실제 대형이
// 없을 때의 선호 대형.
interface Identity { formation?: FormationId; axes: Partial<TacticAxes>; styleKo: string; }

const IDENTITY: Record<string, Identity> = {
  ESP: { formation: "4-3-3", styleKo: "점유·하이라인 (티키타카)", axes: { possession: 3, line: 3, pressing: 3, lineSpacing: 1, tempo: 2, buildup: "short", offsideTrap: true, marking: "zonal" } },
  ARG: { formation: "4-4-2", styleKo: "실리적 조직력·대인 수비", axes: { pressing: 2, line: 2, attacking: 2, transitionSpeed: 2, possession: 2, marking: "man", buildup: "balanced" } },
  BRA: { formation: "4-2-3-1", styleKo: "개인기·빠른 역습", axes: { attacking: 3, transitionSpeed: 3, tempo: 3, possession: 2, width: "wide", buildup: "balanced" } },
  FRA: { formation: "4-3-3", styleKo: "개인 능력·직선 역습", axes: { attacking: 3, transitionSpeed: 3, line: 2, possession: 2, buildup: "direct" } },
  ENG: { formation: "4-3-3", styleKo: "측면 폭·강한 압박", axes: { pressing: 3, tempo: 3, width: "wide", attacking: 2, buildup: "balanced" } },
  GER: { formation: "4-2-3-1", styleKo: "점유·전방 압박", axes: { possession: 3, pressing: 3, line: 3, tempo: 2, buildup: "short", offsideTrap: true } },
  NED: { formation: "4-3-3", styleKo: "점유·넓은 전개", axes: { possession: 3, line: 3, width: "wide", buildup: "short" } },
  POR: { formation: "4-3-3", styleKo: "측면 개인기·창의성", axes: { attacking: 3, width: "wide", possession: 2, transitionSpeed: 2 } },
  BEL: { formation: "4-2-3-1", styleKo: "창의적 공격 조합", axes: { attacking: 2, transitionSpeed: 2, possession: 2 } },
  CRO: { formation: "4-3-3", styleKo: "미드필드 점유·완급 조절", axes: { possession: 3, tempo: 1, line: 2, buildup: "short" } },
  URU: { formation: "4-4-2", styleKo: "투쟁심·강한 대인 수비", axes: { pressing: 2, line: 1, marking: "man", transitionSpeed: 3, attacking: 2 } },
  MEX: { formation: "4-3-3", styleKo: "높은 압박·빠른 템포", axes: { pressing: 3, tempo: 3, possession: 2 } },
  USA: { formation: "4-3-3", styleKo: "활동량·강한 전방 압박", axes: { pressing: 3, transitionSpeed: 3, tempo: 3, line: 2 } },
  JPN: { formation: "4-2-3-1", styleKo: "짧은 패스·조직적 점유", axes: { possession: 3, tempo: 2, line: 2, buildup: "short", lineSpacing: 1 } },
  KOR: { formation: "4-4-2", styleKo: "높은 활동량·빠른 전환", axes: { pressing: 3, tempo: 3, transitionSpeed: 3, line: 2, attacking: 2 } },
  MAR: { formation: "4-3-3", styleKo: "견고한 블록·빠른 역습", axes: { line: 1, pressing: 2, transitionSpeed: 3, marking: "zonal", attacking: 2 } },
  SEN: { formation: "4-3-3", styleKo: "신체 능력·측면 역습", axes: { attacking: 2, transitionSpeed: 3, pressing: 2, width: "wide" } },
  COL: { formation: "4-2-3-1", styleKo: "창의적 공격 전개", axes: { possession: 2, attacking: 2, transitionSpeed: 2 } },
  SUI: { formation: "4-2-3-1", styleKo: "조직적 수비·안정", axes: { line: 1, pressing: 2, marking: "zonal", transitionSpeed: 2 } },
  NOR: { formation: "4-3-3", styleKo: "직선적·타깃 지향", axes: { attacking: 3, transitionSpeed: 3, buildup: "direct", width: "wide" } },
};

/**
 * 상대팀 시작 전술 프로파일. teamIdOrCode와 (있으면) 실제 대회 대형을 받아
 * formation(진짜 우선) + 성향 축(정체성/ELO 산정)을 고정한다.
 */
export function oppTacticProfile(teamIdOrCode: string, realShapeKo?: string): OppTacticProfile {
  const code = codeOfTeamId(teamIdOrCode);
  const elo = teamById(teamIdOrCode)?.elo ?? teamById(`wc_${code.toLowerCase()}`)?.elo ?? 1700;

  const base = baselineFromElo(elo);
  const id = IDENTITY[code];

  const axes: TacticAxes = { ...base.axes, ...(id?.axes ?? {}) };
  const formation: FormationId = nearestFormation(realShapeKo) ?? id?.formation ?? base.formation;
  const styleKo = id?.styleKo ?? base.styleKo;

  return { instructions: { formation, ...axes }, axes, styleKo, estimated: !id };
}

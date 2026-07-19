// 작전실 UI 공용 라벨/헬퍼(순수 데이터 모듈, 스토어 비의존).
// 축구를 잘 모르는 사용자도 이해할 수 있는 친절한 한국어 라벨을 지향한다.

import type { Player, Position, RoleId, SideSetup } from "@/lib/types";
import type { PlayerBadge } from "@/components/ui/PlayerAvatar";

// 탭-투-배치 선택 상태: 스쿼드 행이나 슬롯을 탭하면 이 값이 설정되고,
// fromSlotId가 있으면 슬롯에서 집어든 것(슬롯↔슬롯 스왑), 없으면 벤치/스쿼드에서 집어든 것.
export interface Selection {
  playerId: string;
  fromSlotId?: string;
}

// 포지션 한국어 풀네임(비팬 친화)
export const POSITION_KO: Record<Position, string> = {
  GK: "골키퍼",
  CB: "센터백",
  FB: "풀백",
  DM: "수비형 미드필더",
  CM: "중앙 미드필더",
  AM: "공격형 미드필더",
  WG: "윙어",
  ST: "공격수",
};

// 슬롯 위에 붙는 아주 짧은 포지션 약칭
export const POSITION_SHORT: Record<Position, string> = {
  GK: "GK",
  CB: "CB",
  FB: "FB",
  DM: "DM",
  CM: "CM",
  AM: "AM",
  WG: "WG",
  ST: "ST",
};

// 역할 짧은 라벨(슬롯/스쿼드에 표기)
export const ROLE_SHORT: Record<RoleId, string> = {
  gk_sweeper: "스위퍼",
  gk_traditional: "전통형",
  cb_stopper: "스토퍼",
  cb_cover: "커버형",
  fb_overlap: "오버래핑",
  fb_defensive: "수비형",
  dm_anchor: "앵커",
  dm_regista: "레지스타",
  cm_b2b: "박스투박스",
  cm_deeplying: "딥라잉",
  cm_holding: "홀딩",
  am_playmaker: "플레이메이커",
  am_shadow: "섀도우",
  wg_inverted: "인버티드",
  wg_classic: "클래식",
  st_target: "타겟맨",
  st_false9: "가짜 9번",
  st_poacher: "포처",
};

// 포지션별 "정보 3계층" 요약에 노출할 핵심 스탯 2개(키 + 친절 라벨)
type StatKey =
  | "shooting" | "passing" | "dribbling" | "defending"
  | "pace" | "physical" | "goalkeeping" | "stamina"
  | "aerial" | "setPiece" | "mental" | "penalty";

export const POSITION_STATS: Record<Position, [[StatKey, string], [StatKey, string]]> = {
  GK: [["goalkeeping", "선방"], ["mental", "집중"]],
  CB: [["defending", "수비"], ["physical", "몸싸움"]],
  FB: [["pace", "속도"], ["defending", "수비"]],
  DM: [["defending", "수비"], ["passing", "패스"]],
  CM: [["passing", "패스"], ["stamina", "체력"]],
  AM: [["passing", "패스"], ["dribbling", "드리블"]],
  WG: [["pace", "속도"], ["dribbling", "드리블"]],
  ST: [["shooting", "슈팅"], ["pace", "속도"]],
};

// 모든 스탯의 친절한 한국어 라벨(역할 상세 등 전체 스탯 노출용).
export const STAT_LABELS: Record<StatKey, string> = {
  shooting: "슈팅",
  passing: "패스",
  dribbling: "드리블",
  defending: "수비",
  pace: "속도",
  physical: "피지컬",
  goalkeeping: "선방",
  stamina: "체력",
  aerial: "공중볼",
  setPiece: "세트피스",
  mental: "멘탈",
  penalty: "페널티",
};

// 최상위(top-level) 스탯과 attrs 안의 스탯을 모두 안전하게 읽는다.
export function statValue(player: Player, key: StatKey): number {
  if (key === "aerial" || key === "setPiece" || key === "mental" || key === "penalty") {
    return player[key];
  }
  return player.attrs[key];
}

// id 접미(kor_16 → 16)를 등번호로 사용한다. 데이터에 별도 번호 필드가 없어
// 안정적이고 결정적인 유사 등번호로 활용.
export function jerseyOf(id: string): number {
  const n = Number(id.split("_").pop());
  return Number.isFinite(n) ? n : 0;
}

// 주장(C)/프리킥(FK)/코너킥(CK) 배지를 special 지시에서 도출한다.
// PitchBoard/SquadList 양쪽에서 공유.
export function badgesFor(playerId: string, special: SideSetup["special"]): PlayerBadge[] {
  const b: PlayerBadge[] = [];
  if (special.captainId === playerId) b.push("C");
  if (special.fkTakerId === playerId) b.push("FK");
  if (special.ckTakerId === playerId) b.push("CK");
  return b;
}

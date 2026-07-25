// FIFA 3글자 코드 -> 국기 파일 코드 매핑.
//
// 팀 코드는 FIFA 표기(KOR, GER, NED, KSA…)라 ISO 3166-1 alpha-2와 다르다. 국기 SVG는
// ISO 코드로 정리돼 있으므로(flag-icons 4x3) 여기서 한 번 변환한다. 잉글랜드·스코틀랜드는
// 독립 국가가 아니라 ISO alpha-2가 없어 GB 하위 구분 코드(gb-eng, gb-sct)를 쓴다 —
// 월드컵은 이 둘을 별개 대표팀으로 취급하므로 유니언잭으로 뭉뚱그리면 안 된다.
//
// 대상: 실제 2026 월드컵 48개국 + 레거시 16개국 중 본선에 없는 ITA(이탈리아).
// 새 팀이 추가되면 lib/data/flag-codes.test.ts가 매핑 누락을 잡는다.

export const FIFA_TO_FLAG: Record<string, string> = {
  ALG: "dz", // 알제리
  ARG: "ar", // 아르헨티나
  AUS: "au", // 호주
  AUT: "at", // 오스트리아
  BEL: "be", // 벨기에
  BIH: "ba", // 보스니아 헤르체고비나
  BRA: "br", // 브라질
  CAN: "ca", // 캐나다
  CIV: "ci", // 코트디부아르
  COD: "cd", // 콩고민주공화국
  COL: "co", // 콜롬비아
  CPV: "cv", // 카보베르데
  CRO: "hr", // 크로아티아
  CUW: "cw", // 퀴라소
  CZE: "cz", // 체코
  ECU: "ec", // 에콰도르
  EGY: "eg", // 이집트
  ENG: "gb-eng", // 잉글랜드
  ESP: "es", // 스페인
  FRA: "fr", // 프랑스
  GER: "de", // 독일
  GHA: "gh", // 가나
  HAI: "ht", // 아이티
  IRN: "ir", // 이란
  IRQ: "iq", // 이라크
  ITA: "it", // 이탈리아 (레거시 팀 데이터)
  JOR: "jo", // 요르단
  JPN: "jp", // 일본
  KOR: "kr", // 대한민국
  KSA: "sa", // 사우디아라비아
  MAR: "ma", // 모로코
  MEX: "mx", // 멕시코
  NED: "nl", // 네덜란드
  NOR: "no", // 노르웨이
  NZL: "nz", // 뉴질랜드
  PAN: "pa", // 파나마
  PAR: "py", // 파라과이
  POR: "pt", // 포르투갈
  QAT: "qa", // 카타르
  RSA: "za", // 남아프리카공화국
  SCO: "gb-sct", // 스코틀랜드
  SEN: "sn", // 세네갈
  SUI: "ch", // 스위스
  SWE: "se", // 스웨덴
  TUN: "tn", // 튀니지
  TUR: "tr", // 튀르키예
  URU: "uy", // 우루과이
  USA: "us", // 미국
  UZB: "uz", // 우즈베키스탄
};

/**
 * 팀 코드로 국기 SVG 경로를 돌려준다. 매핑이 없으면 undefined —
 * 호출부(FlagBadge)는 이 경우 기존 색상 배지로 폴백한다.
 */
export function flagSrc(code: string): string | undefined {
  const iso = FIFA_TO_FLAG[(code ?? "").toUpperCase()];
  return iso ? `/flags/${iso}.svg` : undefined;
}

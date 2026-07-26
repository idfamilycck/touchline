// ENGINE_CONSTANTS: λ(기대 득점) 계산과 슈팅 후 골 확률에 쓰이는 매직넘버를 한
// 곳에 모은 튜닝 지점. Task 10(밸런싱 몬테카를로 검증)이 lib/engine/balance.test.ts의
// 4개 통계 임계값(선호팀 승률/평균 총득점/블로아웃 비율/무승부 비율)을 통과시키기
// 위해 이 객체의 값만 조정한다 — winprob.ts/match.ts의 계산식 구조 자체는 그대로다.
// 값을 바꾸면 두 모듈의 동작이 일관되게 바뀌므로, 튜닝은 반드시 이 파일에서만 한다.
export const ENGINE_CONSTANTS = {
  // λ_me = LAMBDA_BASE × (attack/defense)^LAMBDA_ELASTICITY × modMult × eloMult,
  // 이후 [LAMBDA_MIN, LAMBDA_MAX]로 clamp (lib/engine/winprob.ts의 lambdasFromParts)
  // 1.25 -> 1.12: 세트피스 득점(CORNER_GOAL_BASE)·GK의 슈팅 관여·퇴장이 새로 생기며
  // 실현 득점이 올라갔다. 104경기 실측 정규시간 평균 총득점 2.8846에 맞춰 재적합했다
  // (base=1.12에서 2.9135, base=1.08에서 2.7606). elasticity는 재현율 격자에서
  // 1.6이 여전히 최적이라 그대로 둔다.
  LAMBDA_BASE: 1.12,
  LAMBDA_ELASTICITY: 1.6,
  LAMBDA_MIN: 0.2,
  LAMBDA_MAX: 4.0,

  // eloMult(myElo, oppElo) = 1 + clamp(myElo-oppElo, -ELO_DIFF_CAP, ELO_DIFF_CAP) / ELO_DIFF_CAP × ELO_MULT_COEF
  //
  // 0.35 유지. "ELO가 λ에 중복 반영된다"는 가설을 격자 스윕으로 검증했고 기각했다.
  //
  // 가설: 같은 ELO 신호가 세 경로로 λ에 들어가 전력차가 과대 반영된다.
  //   (1) 이 eloMult가 λ에 직접 (±35%)
  //   (2) lib/wc2026/players.ts의 makeVirtualPlayer가 ELO로 전 능력치를 균일 가감
  //       (WC_ELO_ATTR_SPAN, 기본 -10~+10) -> lineStrengths -> λ
  //   (3) lib/wc2026/register.ts의 formFromElo -> form 규칙 (±3%)
  //
  // 실측 결과 (104경기, 승부 갈린 경기 승자 재현율):
  //   a) coef만 낮추기: 0.35 -> 0.25에서 재현율은 80.0%로 동일하지만,
  //      lib/data/teams.ts의 legacy 16팀 밸런스 게이트가 무너진다(ELO 150+ 우위 팀
  //      승률 50.6%, 게이트 하한 55%). legacy 팀은 능력치가 손으로 작성돼 ELO와
  //      독립적이므로 애초에 (2)의 중복이 없고, eloMult가 전력차를 싣는 유일한
  //      장치다. 즉 coef는 WC 팀 문제를 고치는 도구가 아니다.
  //   b) WC_ELO_ATTR_SPAN 낮추기(진짜 중복 경로): coef 0.35 고정에서
  //      span 20 -> 80.0% / span 14 -> 78.7% / span 10 -> 78.7% / span 6 -> 77.3%.
  //      재현율이 단조 하락하고 MAE는 개선되지 않는다(1.073 -> 1.069 -> 1.077).
  //   c) form 경로 제거(WC 팀 form을 중립값으로): 총득점 2.950 -> 2.948,
  //      MAE 0.940 -> 0.941, 재현율 동일. 측정 가능한 효과가 없다.
  //
  // 결론: 세 경로는 구조적으로 같은 신호에서 나오지만 각각 실제 예측력을 갖고 있고,
  // 어느 하나를 줄여도 정확도만 손해다. 재현율은 coef 0.45까지도 계속 오른다
  // (81.3%). LAMBDA_BASE를 1.35에서 낮춘 것은 모델 오류의 무마가 아니라 득점
  // "수준"의 정상적인 캘리브레이션이며, 전력차 "스프레드"와는 다른 축이다.
  ELO_DIFF_CAP: 400,
  ELO_MULT_COEF: 0.35,

  // 슈팅 후 골 확률 = clamp(GOAL_PROB_BASE + (contribution - attAvg) / GOAL_PROB_DIVISOR, GOAL_PROB_MIN, GOAL_PROB_MAX)
  // (lib/engine/match.ts의 processChance)
  GOAL_PROB_BASE: 0.3,
  GOAL_PROB_DIVISOR: 300,
  GOAL_PROB_MIN: 0.03,
  GOAL_PROB_MAX: 0.95,
  // 상대 GK 기여도가 기준선(match.ts의 GK_BASELINE)에서 벗어난 만큼 슈팅 성공률을
  // 깎는 제수. 300(슈터 기여도)보다 크게 잡아 GK의 영향이 슈터의 영향보다 작도록 했다 —
  // GK는 이미 λ 계산에서 oppDef의 20% 가중치로 한 번 반영되므로, 개별 슈팅에서까지
  // 같은 크기로 작용하면 이중 계산이 된다.
  GK_SAVE_DIVISOR: 450,

  // 분당 "찬스" 발생 확률 = (λ/90) × tempoFactor × CHANCE_RATE_SCALE (lib/engine/match.ts의
  // processChance). winProbability(승/무/패 사전 확률)는 outcomeProbs(poisson.ts)를 통해
  // λ 자체를 "경기당 기대 득점"으로 직접 소비하는 반면, runFullMatch의 분당 시뮬레이션은
  // 찬스→슈팅→골로 이어지는 다단 확률 체인(이 3개 상수의 곱)을 거치므로 λ가 그대로
  // 실현 득점 기대값이 되지 않는다(체인을 거치며 크게 감쇠). CHANCE_RATE_SCALE은 이
  // 감쇠를 보정해 "분당 시뮬레이션으로 실현되는 경기당 평균 득점"을 밸런스 목표
  // (1.8~3.6골)에 맞추기 위한 튜닝 전용 배수다 — winProbability의 사전 확률 계산에는
  // 전혀 관여하지 않는다.
  CHANCE_RATE_SCALE: 10.0,
  // 찬스가 슈팅으로 이어질 확률 (lib/engine/match.ts의 processChance)
  SHOT_CONVERSION_PROB: 0.55,

  // REALIZED_GOAL_CALIBRATION: 경기 중 실시간 승률 그래프(probTimeline, match.ts의
  // initMatch/simulateMinute → winProbGivenScore)가 참조하는 보정 계수.
  // winProbGivenScore는 poisson.ts 기반 분석적 모델이라 "남은 λ"를 그대로 잔여
  // 기대 득점으로 취급하지만, 실제 분당 시뮬레이션(찬스→슈팅→골 체인, 바로 위
  // CHANCE_RATE_SCALE 주석 참고)이 실현하는 골은 분석적 λ와 같은 비율로 나오지 않는다.
  //
  // 1.12 -> 0.95로 재도출. GK가 개별 슈팅에 관여하게 되고(GK_SAVE_DIVISOR) LAMBDA_BASE가
  // 1.25에서 1.12로 내려가면서 실현 득점이 분석적 λ보다 오히려 낮아졌다.
  // 도출: lib/engine/balance.test.ts와 동일한 4800회 세트(16×15 매치업 × 20시드,
  // autoPlace 기본 라인업, metlife)에서 실측한
  //   (실현 총득점 평균) ÷ (킥오프 시점 분석적 λ_me+λ_opp 평균)
  //   = 2.27813 ÷ 2.40746 = 0.94628
  // 을 반올림한 값이다.
  //
  // 알려진 한계: 이 비율은 스쿼드 생성 경로에 따라 크게 갈린다. 위 legacy 16팀 세트는
  // 0.95지만, WC 48개국 세트(가상 선수 + 실제 선발 라인업, 104경기)에서 같은 비율을
  // 재면 약 1.27이 나온다. 단일 상수로는 두 경로를 동시에 맞출 수 없어, 다시 쓰기
  // 모드(WC 팀)의 실시간 그래프는 실제 득점 페이스를 약 25% 낮게 본다. 근본 해결은
  // 이 계수를 상수가 아니라 스쿼드/라인업에서 파생시키는 것이며 아직 하지 않았다.
  REALIZED_GOAL_CALIBRATION: 0.95,

  // 코너킥이 골로 이어질 기본 확률 (lib/engine/setpiece.ts의 cornerGoalProb).
  // 키커의 setPiece와 양 팀 공중전 우열이 여기에 가감된다.
  // 세트피스 도입 전 이 엔진의 세트피스 득점은 정확히 0이었다(코너 이벤트가 중계
  // 문구로만 끝났다). 이 값은 경기당 평균 득점을 직접 밀어올리므로 LAMBDA_BASE와
  // 함께 재적합해야 한다.
  CORNER_GOAL_BASE: 0.1,

  // WC 48개국 가상 선수의 능력치를 팀 ELO로 가감하는 폭 (lib/wc2026/players.ts의
  // makeVirtualPlayer). 20이면 전 능력치에 -10~+10을 균일 적용한다.
  //
  // 왜 여기 있나: 이 값은 eloMult(ELO_MULT_COEF)와 같은 신호를 두 번째 경로로 λ에
  // 넣는 지점이라, ELO 가중을 조정할 때 반드시 같이 저울에 올려야 하는 튜닝 파라미터다.
  // 스윕 결과는 ELO_MULT_COEF 주석 참고.
  WC_ELO_ATTR_SPAN: 20,
} as const;

// ENGINE_CONSTANTS: λ(기대 득점) 계산과 슈팅 후 골 확률에 쓰이는 매직넘버를 한
// 곳에 모은 튜닝 지점. Task 10(밸런싱 몬테카를로 검증)이 lib/engine/balance.test.ts의
// 4개 통계 임계값(선호팀 승률/평균 총득점/블로아웃 비율/무승부 비율)을 통과시키기
// 위해 이 객체의 값만 조정한다 — winprob.ts/match.ts의 계산식 구조 자체는 그대로다.
// 값을 바꾸면 두 모듈의 동작이 일관되게 바뀌므로, 튜닝은 반드시 이 파일에서만 한다.
export const ENGINE_CONSTANTS = {
  // λ_me = LAMBDA_BASE × (attack/defense)^LAMBDA_ELASTICITY × modMult × eloMult,
  // 이후 [LAMBDA_MIN, LAMBDA_MAX]로 clamp (lib/engine/winprob.ts의 lambdasFromParts)
  LAMBDA_BASE: 1.35,
  LAMBDA_ELASTICITY: 1.6,
  LAMBDA_MIN: 0.2,
  LAMBDA_MAX: 4.0,

  // eloMult(myElo, oppElo) = 1 + clamp(myElo-oppElo, -ELO_DIFF_CAP, ELO_DIFF_CAP) / ELO_DIFF_CAP × ELO_MULT_COEF
  // 0.15 -> 0.30: 실제 103경기 검증에서 전력차 신호를 키워야 승자를 더 정확히 재현한다.
  // 승부 갈린 경기 승자 재현 70.7% -> 80.0%(lib/engine/validation.test.ts). 0.40까지 가면
  // 81.3%로 미세하게 더 오르지만, 약팀이 늘 지는 과결정론을 피하려 0.30에 멈춘다.
  // balance.test.ts(과열 승률/블로아웃/무승부 비율)는 0.30에서 그대로 통과한다.
  ELO_DIFF_CAP: 400,
  ELO_MULT_COEF: 0.3,

  // 슈팅 후 골 확률 = clamp(GOAL_PROB_BASE + (contribution - attAvg) / GOAL_PROB_DIVISOR, GOAL_PROB_MIN, GOAL_PROB_MAX)
  // (lib/engine/match.ts의 processChance)
  GOAL_PROB_BASE: 0.3,
  GOAL_PROB_DIVISOR: 300,
  GOAL_PROB_MIN: 0.03,
  GOAL_PROB_MAX: 0.95,

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
  // CHANCE_RATE_SCALE 주석 참고)이 실현하는 골은 분석적 λ와 정확히 같은 비율로
  // 나오지 않는다 — 위 두 경로가 원래 독립적으로 튜닝됐기 때문이다. 이 계수는 그
  // 잔여 간극을 실측으로 보정해 "화면에 뜨는 실시간 승률 그래프"가 "실제로
  // 시뮬레이션되는 득점 페이스"와 어긋나지 않게 한다.
  // 도출: lib/engine/balance.test.ts의 4800회 시뮬레이션 세트(16×15 매치업 × 20시드,
  // autoPlace 기본 라인업, metlife)에서 실측한
  //   (실현 총득점 평균) ÷ (킥오프 시점 분석적 λ_me+λ_opp 평균)
  //   = 3.11958... ÷ 2.78845... ≈ 1.1188
  // 을 반올림한 값이다. balance.test.ts에 이 비율이 [CALIBRATION−0.15, CALIBRATION+0.15]
  // 안에 머무는지 확인하는 회귀 테스트가 있다 — CHANCE_RATE_SCALE/SHOT_CONVERSION_PROB/
  // GOAL_PROB_*를 재튜닝해 이 간극이 벌어지면 그 테스트가 실패해 이 상수도 함께
  // 재도출해야 함을 알려준다.
  REALIZED_GOAL_CALIBRATION: 1.12,
} as const;

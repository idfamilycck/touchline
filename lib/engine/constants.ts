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
  ELO_DIFF_CAP: 400,
  ELO_MULT_COEF: 0.15,

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
} as const;

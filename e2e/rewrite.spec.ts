import { test, expect } from "@playwright/test";

// 2026 월드컵 다시 쓰기(rewrite) 모드 E2E 스모크: 전체 유저 여정 한 바퀴.
// 홈 → /rewrite(경기 선택 → 팀 선택 → 결정적 순간 선택) → /tactics(경기 시작) →
// /match(하이라이트 점프 재생 + 하프타임 처리) → 종료 → (무승부면 승부차기 분기) →
// /result에서 "실제 역사 vs 평행세계" 비교(RealVsParallel) 도달.
//
// 주의: free 모드 스모크(smoke.spec.ts)와 동일한 페이싱/하프타임/종료 패턴을 그대로
// 재사용한다(배속 버튼 없음, 시드가 Date.now() 기반이라 무승부/정규종료 분기가 갈릴 수 있음).
//
// 결정적 순간 선택: 일부 매치업×사이드 조합은 "결정적 순간이 없습니다" 폴백만 뜬다
// (완승/무실점 등). 첫 경기의 첫 사이드(홈)가 보통 순간을 갖고 있지만, 데이터가
// 바뀌어도 흔들리지 않도록 첫 몇 개 경기 카드 × 양쪽 사이드를 바운드 루프로 순회해
// 순간 카드가 있는 조합을 찾는다.

test("월드컵 다시 쓰기 → 결정적 순간 선택 → 경기 완주 → 복기(평행세계 비교) 도달", async ({
  page,
}) => {
  // ── 홈(/)이 곧 월드컵 다시 쓰기다(메인 경험). ──────────────
  await page.goto("/");
  await expect(page.getByRole("region", { name: "경기 선택" })).toBeVisible();

  // ── 경기 선택: 첫 몇 경기 × 양쪽 사이드를 순회해 순간이 있는 조합을 찾는다 ──
  // 레이아웃은 마스터-디테일이다: 좌측 region "경기 선택"이 경기 행(ul > li) 목록,
  // 우측 region "선택한 경기"가 사이드 선택 + 결정적 순간을 담는 상세 패널.
  // 상세는 데스크톱(우측 sticky 컬럼)과 모바일(행 아래 인라인) 두 벌이 렌더되지만
  // 한쪽은 항상 display:none이라 접근성 트리에는 하나만 올라온다 — 그래서
  // getByRole로 잡으면 뷰포트와 무관하게 "지금 보이는 상세"가 잡힌다.
  const matchSection = page.getByRole("region", { name: "경기 선택" });
  await expect(matchSection).toBeVisible();
  const matchRows = matchSection.locator("ul > li");
  await expect(matchRows.first()).toBeVisible();

  const detailPanel = page.getByRole("region", { name: "선택한 경기" });
  const momentSection = detailPanel.getByRole("region", { name: "결정적 순간 선택" });

  let picked = false;
  const matchCount = Math.min(await matchRows.count(), 4);
  for (let i = 0; i < matchCount && !picked; i++) {
    const row = matchRows.nth(i);
    await row.locator("button").first().click();

    // 경기 선택은 라우터 쿼리(?match=)로 반영되어 클릭과 렌더 사이에 비동기 틈이
    // 생긴다. 사이드 버튼이 뜰 때까지 명시적으로 기다린 뒤 세어야 한다
    // (count()는 자동 재시도하지 않아, 기다리지 않으면 0으로 읽혀 루프가 헛돈다).
    const sideButtons = detailPanel.getByRole("button", { name: /지휘하기/ });
    if (!(await sideButtons.first().isVisible())) {
      await expect(sideButtons.first()).toBeVisible({ timeout: 5_000 }).catch(() => {});
    }
    const sideCount = await sideButtons.count();
    for (let s = 0; s < sideCount && !picked; s++) {
      await sideButtons.nth(s).click();

      const momentButtons = momentSection.locator("ul button");
      // 순간 카드(진행 방식 프리셋 3개는 항상 존재)가 뜰 때까지 기다린다.
      await expect(momentButtons.first()).toBeVisible();

      if ((await momentButtons.count()) > 0) {
        await momentButtons.first().click();
        picked = true;
      }
    }
  }
  expect(picked, "첫 몇 경기 × 양쪽 사이드 안에서 결정적 순간이 있는 조합을 찾지 못함").toBe(
    true
  );

  // ── 작전실(rewrite 컨텍스트) ──────────────────────────────
  await expect(page).toHaveURL(/\/tactics/);
  // 첫 진입 온보딩 코치마크(딤 오버레이)가 클릭을 가로채므로 건너뛴다.
  await page.getByRole("button", { name: "건너뛰기" }).click();
  // rewrite 모드 전용 컨텍스트 배지("실제 경기 · A vs B · N'부터 지휘"). 가운데
  // 구분점 글리프에 의존하지 않도록 앞뒤 단어만으로 매칭한다.
  await expect(page.getByText(/실제 경기.*부터 지휘/)).toBeVisible();
  // rewrite 모드는 실제 경기 상태(fromRealState)가 라인업을 자동 채워 넣으므로
  // 경기 시작 버튼이 곧바로 활성 상태다.
  const beginBtn = page.getByRole("button", { name: /경기 시작/ });
  await expect(beginBtn).toBeEnabled();
  await beginBtn.click();

  // ── 경기: 하이라이트 점프 재생 + 하프타임 처리 ────────────
  // 배속 버튼은 없다 — 스킵/장면 정지 페이싱이 자동이다.
  await expect(page).toHaveURL(/\/match/);
  await page.getByRole("button", { name: "재생" }).click();

  const resumeBtn = page.getByRole("button", { name: "이어서 재개" });
  // 종료 오버레이에만 있는 유일 요소(스코어보드의 "경기 종료" 배지와 겹치지 않음).
  const endHome = page.getByRole("link", { name: "홈으로 나가기" });

  // 하프타임(자동 정지) 또는 종료 중 먼저 오는 것을 기다린다.
  await expect(resumeBtn.or(endHome)).toBeVisible({ timeout: 45_000 });
  if (await resumeBtn.isVisible()) {
    await resumeBtn.click();
  }

  // ── 종료 오버레이 ────────────────────────────────────────
  await expect(endHome).toBeVisible({ timeout: 45_000 });

  // 무승부 분기: "승부차기 →" 버튼이 노출됨. 아니면 정규종료.
  const shootoutBtn = page.getByRole("button", { name: /승부차기/ });
  const isDraw = await shootoutBtn.isVisible();

  if (isDraw) {
    // ── 승부차기 분기 ──────────────────────────────────────
    await shootoutBtn.click();
    await expect(page).toHaveURL(/\/shootout/);

    // 키커 5인 자동 선택 → 시작.
    await page.getByRole("button", { name: "추천 5인 자동 선택" }).click();
    await page.getByRole("button", { name: /승부차기 시작/ }).click();

    // "차기"를 반복 눌러 모든 킥을 재생 → "결과 보기" 노출까지.
    const seeResult = page.getByRole("button", { name: /결과 보기/ });
    await expect(async () => {
      const kick = page.getByRole("button", { name: "차기", exact: true });
      if (await kick.isVisible()) {
        await kick.click();
      }
      await expect(seeResult).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
    await seeResult.click();
  } else {
    // ── 정규종료 분기: 결과 보기 ───────────────────────────
    await page.getByRole("button", { name: /결과 보기/ }).click();
  }

  // ── 복기(/result) 도달: 실제 역사 vs 평행세계 비교(RealVsParallel) ───────
  await expect(page).toHaveURL(/\/result/);
  await expect(page.getByRole("heading", { name: "경기 복기" })).toBeVisible();
  // RealVsParallel 전용 문구 — rewrite 모드에서만 렌더되는 "실제 역사 vs 평행세계"
  // 비교 카드(내부적으로 compare.ts의 buildCompare가 돌려주는 구조화된 필드
  // myFor/myAgainst/myResultKo 등으로 스코어카드를 그리며, 그 카드의 라벨이
  // "당신의 평행세계"다).
  await expect(page.getByText("실제 역사 vs 평행세계")).toBeVisible();
  await expect(page.getByText("당신의 평행세계")).toBeVisible();
  await expect(page.getByText("실제 역사", { exact: true })).toBeVisible();
});

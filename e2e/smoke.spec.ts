import { test, expect } from "@playwright/test";

// 스모크 E2E: 전체 유저 여정 한 바퀴.
// 매치업 구성(내 팀 → 상대 팀 → 경기장) → 작전실(승률 게이지) → 경기 시작 →
// 재생 → 하프타임 처리 → 종료 → (무승부면 승부차기 분기) → 복기(/result) 도달.
//
// 주의: 앱은 시드-결정적이지만 selectMatchup()은 seed = Date.now()라 매 실행마다
// 정규종료(승/패)와 무승부(승부차기) 분기가 갈릴 수 있다. 두 분기를 모두 처리한다.

test("매치업 구성 → 작전실 → 경기 완주 → 복기 도달", async ({ page }) => {
  // ── 자유 매치업: 팀 2개 + 경기장 선택 후 작전실 입장 ──────────
  // 자유 매치업은 이제 /free 라우트다(홈 /은 월드컵 다시 쓰기).
  await page.goto("/free");
  // 매치업 구성 섹션에는 대륙 필터 버튼도 있으므로 팀 목록(ul[aria-label])으로 좁힌다.
  const teamCards = page
    .getByRole("region", { name: "매치업 구성" })
    .locator('ul[aria-label="팀 목록"] button');
  await teamCards.nth(0).click(); // 내 팀
  await teamCards.nth(1).click(); // 상대 팀
  await page.getByRole("region", { name: "경기장 선택" }).getByRole("button").first().click();
  await page.getByRole("button", { name: /작전실 입장/ }).click();

  // ── 작전실: 승률 게이지 확인 ──────────────────────────────
  await expect(page).toHaveURL(/\/tactics/);
  // 첫 진입 온보딩 코치마크(딤 오버레이)가 클릭을 가로채므로 건너뛴다.
  await page.getByRole("button", { name: "건너뛰기" }).click();
  await expect(page.getByText("라이브 승률 예측")).toBeVisible();
  // selectMatchup은 양 팀 11명을 자동 배치 → 경기 시작 버튼이 활성.
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

  // 하프타임(45분 자동 정지) 또는 종료 중 먼저 오는 것을 기다린다.
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

  // ── 복기(/result) 도달 ───────────────────────────────────
  await expect(page).toHaveURL(/\/result/);
  await expect(page.getByRole("heading", { name: "경기 복기" })).toBeVisible();
  // 결론 한 문장 카드(카운터팩추얼)까지 렌더되는지 확인.
  await expect(page.getByText("결정적 순간")).toBeVisible();
});

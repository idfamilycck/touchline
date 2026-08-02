import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

// 기획서/제출용 스크린샷 재촬영 스펙.
//
// 평소 e2e 스위트에서는 건너뛴다(캡처는 느리고, 회귀 검증이 목적이 아니다).
// 실행:  CAPTURE_DOCS=1 npx playwright test e2e/capture-docs.spec.ts
// PowerShell:  $env:CAPTURE_DOCS=1; npx playwright test e2e/capture-docs.spec.ts
//
// 결과물은 docs/screenshots/ 에 기존 파일명 그대로 덮어쓴다. UI를 손댄 뒤에는
// 반드시 이걸 다시 돌려야 기획서 PDF와 실제 화면이 어긋나지 않는다.

const OUT = path.join(process.cwd(), "docs", "screenshots");

test.skip(!process.env.CAPTURE_DOCS, "CAPTURE_DOCS=1일 때만 실행");

// 기존 자산과 같은 프레이밍: 1280x900 뷰포트 @2x = 2560x1800.
// (Reveal/HeroIntro가 서버·첫 렌더를 최종 상태로 그리므로 캡처 공백은 없다.)
test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

test.describe.configure({ mode: "serial" });

// 개발 서버의 Next 데브툴 배지(좌하단 검은 원)가 화면 구석에 같이 찍혀, 기획서에
// 제품과 무관한 오브젝트가 들어간다. 캡처 동안만 가린다.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const hide = () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }";
      document.head.appendChild(style);
    };
    if (document.head) hide();
    else document.addEventListener("DOMContentLoaded", hide);
  });
});

/** 자유 매치업(/free)에서 팀 2개 + 경기장을 골라 작전실까지 들어간다. */
async function enterTactics(page: Page) {
  await page.goto("/free");
  // 대륙 필터 버튼과 섞이지 않도록 팀 목록으로 좁힌다.
  const teams = page
    .getByRole("region", { name: "매치업 구성" })
    .locator('ul[aria-label="팀 목록"] button');
  await teams.nth(0).click();
  await teams.nth(1).click();
  await page.getByRole("region", { name: "경기장 선택" }).getByRole("button").first().click();
  await page.getByRole("button", { name: /작전실 입장/ }).click();
  await expect(page).toHaveURL(/\/tactics/);
  // 첫 진입 온보딩 코치마크는 캡처를 가리므로 닫는다.
  await page.getByRole("button", { name: "건너뛰기" }).click();
  // 킥오프 전 승률(WinGauge)은 제거됐다. 분석 열의 1층은 이제 상대 스카우팅이다.
  await expect(page.getByText("상대 정보").first()).toBeVisible();
}

test("01 홈(자유 매치업)", async ({ page }) => {
  // 01-home은 기획서에서 "팀 선택" 화면으로 쓰이므로 자유 매치업을 캡처한다.
  await page.goto("/free");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/01-home.png` });
});

test("07 다시 쓰기 경기 브라우저 + 08 결정적 순간", async ({ page }) => {
  // 홈(/)이 곧 다시 쓰기 경험이다.
  await page.goto("/");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/07-rewrite-browser.png` });

  // 경기 카드 하나를 고르고 사이드를 선택하면 "결정적 순간" 카드가 열린다.
  // (홈 상단 "명장면 갤러리" 카드도 li+button이라 반드시 경기 목록으로 좁힌다 —
  //  갤러리 카드를 누르면 곧장 작전실로 넘어가 상세 패널이 열리지 않는다.)
  const card = page.getByRole("list", { name: "경기 목록" }).locator("li").first();
  await card.getByRole("button").first().click();
  const side = page.getByRole("button", { name: /지휘하기/ }).first();
  await expect(side).toBeVisible({ timeout: 10_000 });
  await side.click();

  const moments = page.getByRole("region", { name: "결정적 순간 선택" });
  await expect(moments).toBeVisible({ timeout: 10_000 });
  await moments.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/08-moments.png` });
});

test("09 대회 순위 + 10 대진표", async ({ page }) => {
  // 대회 화면이 탭(?view=group|knockout)으로 갈렸다. 기본은 조별리그.
  await page.goto("/tournament?view=group");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/09-tournament.png` });

  // 대진표는 다른 탭이므로 딥링크로 직접 연다.
  await page.goto("/tournament?view=knockout");
  await page.waitForTimeout(700);

  // 섹션 상단(라운드 라벨 줄)이 화면에 들어오도록 맞춘다. scrollIntoViewIfNeeded는
  // 대진표가 화면보다 훨씬 길어 중간 지점에 걸려 라벨이 잘려 나갔다.
  await page.evaluate(() => {
    const el = document.querySelector('[aria-label="토너먼트 대진표"]');
    if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 80 });
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/10-bracket.png` });
});

test("02 작전실 + 03 추천", async ({ page }) => {
  await enterTactics(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/02-tactics.png` });

  // AI 수석코치 패널: 분석 열 아래쪽에 있으므로 스크롤해서 잡는다.
  const recommend = page.getByRole("button", { name: /수석코치 전술 보기/ });
  await recommend.scrollIntoViewIfNeeded();
  await recommend.click();
  await expect(page.getByText(/적용|승률/).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/03-recommendation.png` });
});

test("04 경기 중계 + 05 개입 시트", async ({ page }) => {
  await enterTactics(page);
  await page.getByRole("button", { name: /경기 시작/ }).click();
  await expect(page).toHaveURL(/\/match/);

  // 몇 분 진행시켜 스코어보드/중계에 내용이 찬 상태로 잡는다.
  await page.getByRole("button", { name: "재생" }).click();
  await page.waitForTimeout(7000);
  await page.getByRole("button", { name: "일시정지" }).click().catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/04-match-live.png` });

  await page.getByRole("button", { name: "작전 변경" }).first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/05-match-intervention.png` });
});

test("11 엔진 성적표", async ({ page }) => {
  await page.goto("/engine");
  // 히트맵은 다음 프레임에 계산되므로 헤드라인이 뜬 뒤 잡는다.
  await expect(page.getByText("엔진 성적표 · 무개입 재현")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600);
  // 좁은 단일 컬럼이라 뷰포트 캡처는 아래가 통째로 빈다. 본문만 요소 캡처한다.
  await page.locator("main").screenshot({ path: `${OUT}/11-engine.png` });
});

test("12 다시 쓰기 복기 - 실제 역사 vs 평행세계 · 분기하는 역사", async ({ page }) => {
  // rewrite 모드로 한 경기를 완주해야만 나오는 화면이라, e2e/rewrite.spec.ts와 같은
  // 경로를 그대로 밟는다(순간 카드가 있는 첫 조합을 바운드 루프로 찾는다).
  await page.goto("/");
  const matchList = page.getByRole("list", { name: "경기 목록" });
  await expect(matchList.locator("li").first()).toBeVisible();
  const detailPanel = page.getByRole("region", { name: "선택한 경기" });
  const momentSection = detailPanel.getByRole("region", { name: "결정적 순간 선택" });

  await matchList.locator("li").first().locator("button").first().click();
  const sideButtons = detailPanel.getByRole("button", { name: /지휘하기/ });
  await expect(sideButtons.first()).toBeVisible({ timeout: 10_000 });
  await sideButtons.first().click();
  const moments = momentSection.locator("ul button");
  await expect(moments.first()).toBeVisible();
  // 후반전 프리셋(3번째)이 있으면 그걸 쓴다 - 분기 구간이 길어 타임라인이 잘 보인다.
  const momentCount = await moments.count();
  await moments.nth(momentCount > 2 ? 2 : 0).click();

  await expect(page).toHaveURL(/\/tactics/);
  // rewrite 모드는 작전실 위에 "지휘봉 인계" 오버레이가 먼저 뜬다(모달이라 클릭을 가로챈다).
  const handoff = page.getByRole("button", { name: /지휘봉 잡기/ });
  await expect(handoff).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(900); // 등장 모션이 끝난 뒤 잡는다
  await page.screenshot({ path: `${OUT}/14-handoff.png` });
  await handoff.click();
  await page.getByRole("button", { name: "건너뛰기" }).click();
  await page.getByRole("button", { name: /경기 시작/ }).click();
  await expect(page).toHaveURL(/\/match/);
  await page.getByRole("button", { name: "재생" }).click();

  const resumeBtn = page.getByRole("button", { name: "이어서 재개" });
  const endHome = page.getByRole("link", { name: "홈으로 나가기" });
  await expect(resumeBtn.or(endHome)).toBeVisible({ timeout: 60_000 });
  if (await resumeBtn.isVisible()) await resumeBtn.click();
  await expect(endHome).toBeVisible({ timeout: 60_000 });

  const shootoutBtn = page.getByRole("button", { name: /승부차기/ });
  if (await shootoutBtn.isVisible()) {
    await shootoutBtn.click();
    await expect(page).toHaveURL(/\/shootout/);
    await page.getByRole("button", { name: "추천 5인 자동 선택" }).click();
    await page.getByRole("button", { name: /승부차기 시작/ }).click();
    const seeResult = page.getByRole("button", { name: /결과 보기/ });
    await expect(async () => {
      const kick = page.getByRole("button", { name: "차기", exact: true });
      if (await kick.isVisible()) await kick.click();
      await expect(seeResult).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 90_000 });
    await seeResult.click();
  } else {
    await page.getByRole("button", { name: /결과 보기/ }).click();
  }

  await expect(page).toHaveURL(/\/result/);
  await expect(page.getByText("실제 역사 vs 평행세계")).toBeVisible({ timeout: 20_000 });
  // 복기 화면은 좁은 단일 컬럼이라 뷰포트 전체를 찍으면 좌우가 검게 비어 기획서에서
  // 쓸모가 없다. 카드 두 장을 각각 요소 캡처한다(실제 vs 평행세계 / 분기하는 역사).
  const sectionWith = (text: string) =>
    page.locator("section").filter({ hasText: text }).last();

  await sectionWith("실제 역사 vs 평행세계").screenshot({ path: `${OUT}/12-real-vs-parallel.png` });
  const branching = sectionWith("분기하는 역사");
  await branching.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await branching.screenshot({ path: `${OUT}/13-branching.png` });
});

test("06 복기", async ({ page }) => {
  await enterTactics(page);
  await page.getByRole("button", { name: /경기 시작/ }).click();
  await expect(page).toHaveURL(/\/match/);
  await page.getByRole("button", { name: "재생" }).click();

  const resumeBtn = page.getByRole("button", { name: "이어서 재개" });
  const endHome = page.getByRole("link", { name: "홈으로 나가기" });
  await expect(resumeBtn.or(endHome)).toBeVisible({ timeout: 60_000 });
  if (await resumeBtn.isVisible()) await resumeBtn.click();
  await expect(endHome).toBeVisible({ timeout: 60_000 });

  const shootoutBtn = page.getByRole("button", { name: /승부차기/ });
  if (await shootoutBtn.isVisible()) {
    await shootoutBtn.click();
    await expect(page).toHaveURL(/\/shootout/);
    await page.getByRole("button", { name: "추천 5인 자동 선택" }).click();
    await page.getByRole("button", { name: /승부차기 시작/ }).click();
    const seeResult = page.getByRole("button", { name: /결과 보기/ });
    await expect(async () => {
      const kick = page.getByRole("button", { name: "차기", exact: true });
      if (await kick.isVisible()) await kick.click();
      await expect(seeResult).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 90_000 });
    await seeResult.click();
  } else {
    await page.getByRole("button", { name: /결과 보기/ }).click();
  }

  await expect(page).toHaveURL(/\/result/);
  await page.waitForTimeout(1000);

  // 복기 전체 흐름은 세로로 길어 풀페이지로 잡는다(README용).
  await page.screenshot({ path: `${OUT}/06-result-counterfactual.png`, fullPage: true });

  // 06-result-top은 기획서에서 class="portrait"로 쓰인다
  // (.cols .shot img.portrait { max-height: 88mm; width: auto }).
  // 가로 캡처를 넣으면 88mm 높이에 맞춰 폭이 125mm까지 벌어져 2단 레이아웃이 터진다.
  // 그래서 이 한 장만 세로 뷰포트로 다시 잡는다(가로세로비 ≈ 0.48, 기존 자산과 동일).
  await page.setViewportSize({ width: 420, height: 880 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/06-result-top.png` });
});

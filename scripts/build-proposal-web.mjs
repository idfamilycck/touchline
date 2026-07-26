// 기획서 웹 페이지 빌드: docs/TOUCHLINE-기획서-source.html -> public/proposal/
//
// 실행:  node scripts/build-proposal-web.mjs
//        (스크린샷을 다시 찍었거나 기획서를 고쳤으면 build-proposal-pdf.mjs와 함께 돌린다)
//
// 예전에는 public/proposal/index.html이 docs 원본을 손으로 복사한 사본이라, 기획서를
// 고쳐도 웹 페이지만 옛 내용으로 남는 사고가 났다. 이제 원본 하나에서 파생시킨다:
//   · 상단 웹바(서비스로 돌아가기 + PDF 내려받기)를 주입하고
//   · 이미지 경로를 절대 경로로 바꾸고(/proposal은 트레일링 슬래시 없이 서빙되므로
//     상대 경로 ./screenshots는 사이트 루트 기준으로 풀려 404가 난다)
//   · 참조된 스크린샷과 PDF를 public/proposal/ 아래로 복사한다.

import path from "node:path";
import fs from "node:fs/promises";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "docs", "TOUCHLINE-기획서-source.html");
const PDF = path.join(ROOT, "docs", "TOUCHLINE-기획서.pdf");
const OUT_DIR = path.join(ROOT, "public", "proposal");
const OUT_SHOTS = path.join(OUT_DIR, "screenshots");

const WEBBAR_CSS = `
  /* ---------- 웹 전용(인쇄 시 숨김) ---------- */
  .webbar {
    position: sticky; top: 0; z-index: 50;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 10px 18px; margin-bottom: 18px;
    background: #0f1319; border-bottom: 1px solid rgba(200,225,255,0.12);
    font-size: 13px;
    /* 표지 카드가 바 아래로 지나가도 제목이 묻히지 않도록 완전 불투명하게 덮는다. */
    box-shadow: 0 1px 0 rgba(0,0,0,0.6);
  }
  .webbar .brand { display: flex; align-items: center; gap: 8px; color: #eef2f8; letter-spacing: -0.01em; font-weight: 700; }
  .webbar .brand i { width: 9px; height: 9px; background: #22d3ee; border-radius: 2px; display: inline-block; }
  .webbar .links { display: flex; align-items: center; gap: 8px; }
  .webbar .links a {
    padding: 7px 12px; border-radius: 8px; border: 1px solid rgba(200,225,255,0.16);
    color: #cdd6e4; font-weight: 700; text-decoration: none;
  }
  .webbar .links a.primary { background: #22d3ee; color: #04222a; border-color: #22d3ee; }
  .webbar .links a:hover { border-color: rgba(34,211,238,0.55); }
  .page-wrap { max-width: 210mm; margin: 0 auto; padding: 0 12px 48px; }
  @media print { .webbar { display: none; } .page-wrap { max-width: none; padding: 0; } }
`;

const WEBBAR_HTML = `<div class="webbar">
  <span class="brand"><i></i>TOUCHLINE 기획서</span>
  <span class="links">
    <a href="/">서비스 열기</a>
    <a class="primary" href="/proposal/TOUCHLINE-기획서.pdf" download>PDF 내려받기</a>
  </span>
</div>
<div class="page-wrap">`;

let html = await fs.readFile(SRC, "utf8");

// 1) 웹바 CSS 주입
html = html.replace("</style>", `${WEBBAR_CSS}</style>`);

// 2) 웹바 + 래퍼 주입
html = html.replace("<body>", `<body>\n${WEBBAR_HTML}`);
html = html.replace("</body>", "</div>\n</body>");

// 3) 이미지 경로: screenshots/x.png -> /proposal/screenshots/x.png
const used = new Set();
html = html.replace(/src="screenshots\/([^"]+)"/g, (_, file) => {
  used.add(file);
  return `src="/proposal/screenshots/${file}"`;
});
if (used.size === 0) throw new Error("스크린샷 참조를 찾지 못했다 — 경로 규칙이 바뀌었는지 확인할 것");

// 4) 산출물 쓰기
await fs.rm(OUT_SHOTS, { recursive: true, force: true });
await fs.mkdir(OUT_SHOTS, { recursive: true });
await fs.writeFile(path.join(OUT_DIR, "index.html"), html, "utf8");
for (const file of used) {
  await fs.copyFile(path.join(ROOT, "docs", "screenshots", file), path.join(OUT_SHOTS, file));
}
await fs.copyFile(PDF, path.join(OUT_DIR, "TOUCHLINE-기획서.pdf"));

console.log(`웹 기획서 생성: public/proposal/index.html`);
console.log(`  스크린샷 ${used.size}장 + PDF 복사 완료`);

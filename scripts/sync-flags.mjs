// public/flags/ 에 필요한 국기 SVG만 복사한다.
//
// flag-icons는 271개국 전부를 담고 있는데 우리가 쓰는 건 49개뿐이라, 패키지를 통째로
// 번들에 넣지 않고 필요한 것만 뽑아 리포에 커밋한다(정적 내보내기라 public/ 파일이
// 그대로 배포된다). flag-icons는 devDependency로만 두고 런타임 의존은 없다.
//
// 실행: node scripts/sync-flags.mjs
// 팀이 추가돼 lib/data/flag-codes.ts에 항목이 늘면 이 스크립트를 다시 돌린다.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "node_modules", "flag-icons", "flags", "4x3");
const OUT_DIR = join(ROOT, "public", "flags");

// flag-codes.ts를 파싱해 필요한 ISO 코드를 뽑는다(빌드 도구 없이 돌려야 하므로
// TS를 import하지 않고 소스에서 값만 읽는다).
const source = readFileSync(join(ROOT, "lib", "data", "flag-codes.ts"), "utf8");
const wanted = [...source.matchAll(/^\s+[A-Z]{3}:\s*"([a-z-]+)"/gm)].map((m) => m[1]);

if (wanted.length === 0) {
  console.error("flag-codes.ts에서 매핑을 하나도 읽지 못했습니다. 형식이 바뀌었나요?");
  process.exit(1);
}

if (!existsSync(SRC_DIR)) {
  console.error(`flag-icons가 설치돼 있지 않습니다: ${SRC_DIR}\n  npm i -D flag-icons`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

// 매핑에서 빠진 국기가 public/에 남아 있으면 지운다(이름이 바뀐 경우 유령 파일 방지).
const keep = new Set(wanted.map((c) => `${c}.svg`));
for (const f of readdirSync(OUT_DIR)) {
  if (f.endsWith(".svg") && !keep.has(f)) {
    rmSync(join(OUT_DIR, f));
    console.log(`  - ${f} (매핑에 없어 제거)`);
  }
}

let copied = 0;
const missing = [];
for (const iso of wanted) {
  const src = join(SRC_DIR, `${iso}.svg`);
  if (!existsSync(src)) {
    missing.push(iso);
    continue;
  }
  writeFileSync(join(OUT_DIR, `${iso}.svg`), readFileSync(src));
  copied += 1;
}

if (missing.length > 0) {
  console.error(`flag-icons에 없는 코드: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`국기 ${copied}개를 public/flags/ 에 동기화했습니다.`);

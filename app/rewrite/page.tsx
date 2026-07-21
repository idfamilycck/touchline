"use client";

// /rewrite — 다시 쓰기 딥링크 진입점(대진표·대회의 ?match= 링크가 여기로 온다).
// 홈(/)과 같은 RewriteExperience를 렌더하되, 다른 화면에서 왔으므로 "처음으로" 링크를 둔다.

import { Suspense } from "react";
import { registerWc2026 } from "@/lib/wc2026/register";
import { RewriteExperience } from "@/components/rewrite/RewriteExperience";

// 모듈 로드 시 1회 등록(idempotent) — 최초 렌더부터 wc 팀 이름을 바로 조회할 수 있도록.
registerWc2026();

export default function RewritePage() {
  return (
    <Suspense
      fallback={
        <main id="main" className="flex flex-1 scroll-mt-14 items-center justify-center px-5 py-24 text-center">
          <p className="text-sm text-dim">불러오는 중…</p>
        </main>
      }
    >
      <RewriteExperience showBackLink />
    </Suspense>
  );
}

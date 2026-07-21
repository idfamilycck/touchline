"use client";

// 홈(/) — 이 앱의 메인은 "2026 월드컵 다시 쓰기"다. 그래서 기본 페이지가 곧 다시 쓰기
// 경험이다. 자유 매치업(직접 두 팀 고르기)은 헤더의 "자유 매치업"(/free)으로 들어간다.
// 딥링크(/rewrite?match=)는 /rewrite가 계속 받는다.

import { Suspense } from "react";
import { registerWc2026 } from "@/lib/wc2026/register";
import { RewriteExperience } from "@/components/rewrite/RewriteExperience";

registerWc2026();

export default function Home() {
  return (
    <Suspense
      fallback={
        <main id="main" className="flex flex-1 scroll-mt-14 items-center justify-center px-5 py-24 text-center">
          <p className="text-sm text-dim">불러오는 중…</p>
        </main>
      }
    >
      <RewriteExperience />
    </Suspense>
  );
}

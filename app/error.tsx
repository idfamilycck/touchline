"use client";

// 런타임 에러 바운더리. 정적 export라 서버가 없으므로 클라이언트에서 예기치 못한
// 예외(예: 조작된 딥링크가 만든 throw)를 잡아 조용한 데드엔드 대신 복구 경로를 준다.

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 개발 중 원인 추적용. 프로덕션 콘솔에도 남지만 사용자 경로는 아래 UI로 복구된다.
    console.error(error);
  }, [error]);

  return (
    <main
      id="main"
      className="flex flex-1 scroll-mt-14 flex-col items-center justify-center px-5 py-24 text-center"
    >
      <p className="eyebrow text-accent">TOUCHLINE</p>
      <h1 className="display mt-4 text-balance text-3xl text-ink sm:text-4xl">
        문제가 생겼어요
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-dim">
        예상치 못한 오류로 이 화면을 표시하지 못했습니다. 다시 시도하거나 홈으로 돌아가세요.
      </p>
      <div className="mt-8 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-control bg-accent px-6 py-3 text-sm font-black text-accent-ink transition-transform hover:-translate-y-0.5"
        >
          다시 시도
        </button>
        <Link
          href="/"
          className="rounded-control border border-line px-6 py-3 text-sm font-bold text-dim transition-colors hover:border-white/25 hover:text-ink"
        >
          홈으로
        </Link>
      </div>
    </main>
  );
}

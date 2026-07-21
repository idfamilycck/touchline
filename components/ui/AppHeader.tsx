"use client";

// 전역 헤더 — 어디서든 홈으로 돌아갈 수 있는 상단 고정 바.
// 데스크톱 기준 56px 한 줄 고정(줄바꿈 없음). 페이지 자체의 히어로/섹션 헤더와는
// 별개로, 앱 전역 내비게이션(워드마크 + 두 개의 보조 링크)만 담당한다.

import Link from "next/link";
import { usePathname } from "next/navigation";

// 메인은 홈(/)의 "월드컵 다시 쓰기". 자유 매치업은 /free로 분리했다.
const NAV = [
  { href: "/", label: "월드컵 다시 쓰기", short: "다시 쓰기" },
  { href: "/free", label: "자유 매치업", short: "자유" },
  { href: "/tournament", label: "대회", short: "대회" },
] as const;

export function AppHeader() {
  const pathname = usePathname();

  // /rewrite 딥링크는 홈과 같은 경험이므로 "월드컵 다시 쓰기" 탭을 활성으로 본다.
  const isActive = (href: string) =>
    pathname === href || (href === "/" && pathname === "/rewrite");

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-line bg-pitch/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-5">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-sm font-black tracking-tight text-ink"
          aria-label="터치라인 홈으로"
        >
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px] bg-accent" />
          {/* 워드마크는 라틴이라 컨덴스드 디스플레이 패밀리가 그대로 먹는다 — 중계 자막 톤. */}
          <span className="font-display text-[15px] tracking-[0.02em]">TOUCHLINE</span>
        </Link>

        <nav aria-label="주요 이동" className="flex shrink-0 items-center gap-1">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  active ? "text-accent" : "text-dim hover:text-ink"
                }`}
              >
                <span className="hidden sm:inline">{item.label}</span>
                <span className="sm:hidden">{item.short}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

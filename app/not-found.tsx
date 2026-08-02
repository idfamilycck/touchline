import Link from "next/link";

// 없는 경로(정적 export의 404). 헤더/스킵링크 레이아웃 안에서 홈 복귀 경로를 준다.
export default function NotFound() {
  return (
    <main
      id="main"
      className="flex flex-1 scroll-mt-14 flex-col items-center justify-center px-5 py-24 text-center"
    >
      <p className="eyebrow text-accent">TOUCHLINE</p>
      <h1 className="display mt-4 text-balance text-4xl text-ink">
        페이지를 찾을 수 없어요
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-dim">
        주소가 바뀌었거나 없는 페이지입니다. 홈에서 다시 시작하세요.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-control bg-accent px-6 py-3 text-sm font-black text-accent-ink transition-transform hover:-translate-y-0.5"
      >
        ← 홈으로
      </Link>
    </main>
  );
}

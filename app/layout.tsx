import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppHeader } from "@/components/ui/AppHeader";

const DESCRIPTION =
  "국가대표 전술 시뮬레이터. 대표팀을 골라 포메이션과 지시를 짜고 90분을 직접 지휘하세요. 모든 능력치는 가상 데이터입니다.";

// 페이지 배경(--color-pitch)과 맞춘 브라우저 크롬 색상(주소창 등).
export const viewport: Viewport = {
  themeColor: "#0f1319",
};

export const metadata: Metadata = {
  // 상대 경로 OG 이미지(/og.png)를 절대 URL로 해석하기 위한 기준값.
  metadataBase: new URL("https://touchline-fc.vercel.app"),
  title: "터치라인, 당신이 감독이라면",
  description: DESCRIPTION,
  openGraph: {
    title: "터치라인, 당신이 감독이라면",
    description: DESCRIPTION,
    images: ["/og.png"],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "터치라인, 당신이 감독이라면",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-3 focus-visible:top-3 focus-visible:z-50 focus-visible:rounded-full focus-visible:bg-accent focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-bold focus-visible:text-accent-ink"
        >
          본문으로 건너뛰기
        </a>
        <AppHeader />
        {children}
      </body>
    </html>
  );
}

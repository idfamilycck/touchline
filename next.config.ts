import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // 개발 인디케이터(좌하단 "N" 배지)를 끈다 — 시연 영상·심사 캡처에 데브툴이
  // 노출되지 않게 한다(프로덕션 빌드에는 원래 없지만 개발 화면 녹화 대비).
  devIndicators: false,
};

export default nextConfig;

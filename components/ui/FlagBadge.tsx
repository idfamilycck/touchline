// 실제 국가 국기 배지.
//
// 예전에는 팀 color1/color2를 사선으로 조합한 자체 배지에 3글자 코드를 얹었다(국기를
// 모사하지 않는다는 초기 지침). 실제 국기로 바꾼다 — 국기 도안은 저작권 대상이 아니고,
// 48개국이 나열되는 화면에서 색 배지는 서로 구분이 안 돼 "어느 나라인지"를 코드 텍스트로
// 다시 읽어야 했다. 국기는 그 자체로 즉시 식별된다.
//
// SVG는 public/flags/ 에 있고 scripts/sync-flags.mjs가 flag-icons에서 필요한 것만
// 뽑아 넣는다(런타임 의존 없음). <img>로 불러오므로 각 SVG 내부의 id가 서로 충돌하지
// 않는다 — 인라인으로 넣었다면 48개 국기의 clipPath id가 한 문서에서 부딪힌다.
//
// 비율은 국기 원본 그대로 4:3을 쓴다. 정사각형에 object-cover로 채우면 좌우가 잘려
// 튀르키예 초승달처럼 중앙에서 벗어난 도안이 훼손된다.

import { flagSrc } from "@/lib/data/flag-codes";

interface FlagBadgeProps {
  code: string;
  /** 국기 매핑이 없는 팀의 폴백 배지 색. */
  color1: string;
  color2: string;
  /** 배지 가로 길이(px). 세로는 4:3 비율로 정해진다. */
  size?: number;
  className?: string;
}

/** 크기에 비례한 모서리 반경. 작은 배지에 큰 반경을 주면 도안이 뭉개진다. */
function radiusOf(size: number): number {
  return Math.max(2, Math.round(size * 0.14));
}

export function FlagBadge({ code, color1, color2, size = 44, className }: FlagBadgeProps) {
  const src = flagSrc(code);
  const height = Math.round((size * 3) / 4);
  const borderRadius = radiusOf(size);

  // 국기가 없는 팀(가상 팀 등)은 기존 색 배지로 폴백한다. 화면이 비어 보이는 것보다
  // 낫고, 팀 색은 항상 존재한다.
  if (!src) {
    return (
      <span
        role="img"
        aria-label={`${code} 팀 배지`}
        className={className}
        style={{
          display: "inline-block",
          width: size,
          height,
          borderRadius,
          background: `linear-gradient(160deg, ${color2} 0%, ${color2} 45%, ${color1} 45%, ${color1} 100%)`,
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.22)",
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height,
        borderRadius,
        overflow: "hidden",
        // 흰색이 들어간 국기(일본·캐나다 등)가 어두운 배경에 녹지 않도록 테두리를 준다.
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.22)",
        flexShrink: 0,
      }}
    >
      {/* next/image가 아니라 <img>: 정적 내보내기라 이미지 최적화가 없고, 원본이
          이미 수 KB SVG라 최적화할 것도 없다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${code} 국기`}
        width={size}
        height={height}
        loading="lazy"
        decoding="async"
        draggable={false}
        style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
      />
    </span>
  );
}

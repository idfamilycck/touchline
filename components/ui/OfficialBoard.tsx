/**
 * 제4심판 보드 — 터치라인의 시그니처.
 *
 * 이 앱의 모든 진입점은 "몇 분부터 지휘할 것인가"로 수렴한다. 실제 경기에서 그
 * 순간을 알리는 물건이 제4심판의 LED 교체 보드다. 그래서 개입 시점(분)은 항상
 * 이 보드 위에 올린다 — 장식이 아니라 그 숫자 자체가 정보다.
 *
 * 브랜드 액센트(앰버)를 LED 발광색으로 그대로 쓴다. 앱의 나머지는 조용히 두고,
 * 과감함은 이 하나에만 쓴다.
 */

interface OfficialBoardProps {
  /** 표시할 경기 시간(분) */
  minute: number;
  /** md: 카드/배지 본문용, sm: 인라인 보조용 */
  size?: "sm" | "md";
  /** 보드 오른쪽에 붙는 짧은 설명(예: "부터 개입") */
  label?: string;
}

export function OfficialBoard({ minute, size = "md", label }: OfficialBoardProps) {
  const md = size === "md";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`relative inline-flex items-center justify-center overflow-hidden rounded-[5px] border border-white/15 bg-[#070b09] ${
          md ? "px-2.5 py-1" : "px-2 py-[3px]"
        }`}
        style={{
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.55)",
        }}
      >
        {/* LED 매트릭스 주사선 — 폰트 추가 없이 발광 표시판의 질감만 낸다 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(255,255,255,0.055) 0 1px, transparent 1px 3px)",
          }}
        />
        <span
          className={`stat-num relative text-accent ${md ? "text-base" : "text-[11px]"}`}
          style={{ textShadow: "0 0 6px rgba(255,176,32,0.5)", letterSpacing: "0.02em" }}
        >
          {minute}′
        </span>
      </span>
      {label && (
        <span className={`font-bold text-dim ${md ? "text-[11px]" : "text-[10px]"}`}>{label}</span>
      )}
    </span>
  );
}

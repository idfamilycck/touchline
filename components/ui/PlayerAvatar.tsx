// 선수 아바타: 이니셜 + 등번호 원형. 주장(C)/프리킥(FK)/코너킥(CK) 미니 배지 옵션.
// 이후 태스크(라인업/작전실)에서 그대로 재사용한다. 스토어 비의존 순수 컴포넌트.

export type PlayerBadge = "C" | "FK" | "CK";

interface PlayerAvatarProps {
  name: string;
  number?: number;
  badges?: PlayerBadge[];
  size?: number;
  /** 팀 대표색(테두리 링). 없으면 라임 액센트 */
  ring?: string;
  className?: string;
}

// 한글/영문 모두: 이름 첫 글자 기준 최대 2글자 이니셜.
function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  // 한글 이름은 성 한 글자만 나오면 어색 → 앞 두 글자
  return trimmed.slice(0, 2);
}

const BADGE_STYLE: Record<PlayerBadge, { bg: string; fg: string; label: string }> = {
  C: { bg: "var(--color-accent)", fg: "var(--color-accent-ink)", label: "C" },
  FK: { bg: "#1c2521", fg: "#eef4f0", label: "FK" },
  CK: { bg: "#1c2521", fg: "#eef4f0", label: "CK" },
};

export function PlayerAvatar({
  name,
  number,
  badges = [],
  size = 48,
  ring = "var(--color-accent)",
  className,
}: PlayerAvatarProps) {
  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <div
        className="flex h-full w-full items-center justify-center rounded-full bg-surface-2 font-black text-ink"
        style={{
          border: `2px solid ${ring}`,
          fontSize: size * 0.32,
          letterSpacing: "-0.03em",
        }}
      >
        {initialsOf(name)}
      </div>

      {number !== undefined && (
        <span
          className="stat-num absolute -right-1 -top-1 flex items-center justify-center rounded-full bg-pitch text-ink"
          style={{
            minWidth: size * 0.42,
            height: size * 0.42,
            fontSize: size * 0.26,
            padding: "0 4px",
            border: "1.5px solid var(--color-line)",
          }}
        >
          {number}
        </span>
      )}

      {badges.length > 0 && (
        <div className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 gap-0.5">
          {badges.map((b) => {
            const s = BADGE_STYLE[b];
            return (
              <span
                key={b}
                className="rounded px-1 text-[9px] font-bold leading-4"
                style={{ background: s.bg, color: s.fg }}
              >
                {s.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

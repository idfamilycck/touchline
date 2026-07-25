"use client";

// 전술 평가 & 보완 패널: 통한 전술 / 발목 잡은 부분 / 이번 경기에서 짚어볼 점.
// 복기(rewrite)는 그 순간에 대한 일회성 what-if라 "다음 경기"가 없다 — 팁은 전부
// 방금 치른 이 경기의 지표를 근거로 한 회고이며, 그렇게 프레이밍한다.
// 내용은 buildTacticsReview(순수 로직)가 엔진 데이터로 생성한다.

import { CheckCircle, Warning, ClipboardText, Binoculars } from "@phosphor-icons/react";
import type { TacticsReview } from "./tactics-review";
import type { AppliedRule } from "@/lib/engine/modifiers";
import { RuleIcon } from "@/components/ui/RuleIcon";

// rule.iconKey는 lib/engine/modifiers.ts가 들려 보내는 시맨틱 키다 — 공용
// RuleIcon이 Phosphor 아이콘으로 매핑한다(근거 카드 3곳이 같은 매핑을 공유).
function RuleRow({ rule, tone }: { rule: AppliedRule; tone: "good" | "bad" }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <RuleIcon iconKey={rule.iconKey} className="mt-0.5 shrink-0 text-dim" />
      <span className={tone === "good" ? "text-ink" : "text-ink"}>
        {rule.textKo}
      </span>
    </li>
  );
}

export function TacticsReviewPanel({ review }: { review: TacticsReview }) {
  return (
    <section className="panel rounded-panel p-5 sm:p-6" aria-label="전술 평가 및 보완">
      <p className="eyebrow text-accent">감독 리포트</p>
      <h2 className="mt-1 text-lg font-bold text-ink">전술 평가 &amp; 보완</h2>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-panel border border-gain/30 bg-gain/5 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-gain">
            <CheckCircle size={16} weight="bold" aria-hidden /> 통한 전술
          </h3>
          {review.worked.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {review.worked.map((r) => (
                <RuleRow key={r.id} rule={r} tone="good" />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-dim">특별히 발동한 플러스 규칙이 없었어요.</p>
          )}
        </div>

        {/* 내 감점이 없는데 이기지 못했으면 카드를 "상대가 앞선 부분"으로 바꿔 단다.
            빈 카드에 "감점 요인 없었어요"만 띄우면 진 사람에게 모순된 화면이 된다. */}
        <div className="rounded-panel border border-danger/30 bg-danger/5 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-danger">
            <Warning size={16} weight="bold" aria-hidden />
            {review.hurt.length > 0 ? "발목 잡은 부분" : "상대가 앞선 부분"}
          </h3>
          {review.hurt.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {review.hurt.map((r) => (
                <RuleRow key={r.id} rule={r} tone="bad" />
              ))}
            </ul>
          ) : review.oppEdge.length > 0 ? (
            <>
              <p className="mt-2 text-xs text-dim">
                내 지시에서 깎인 건 없었어요. 상대 쪽에서 살아 있던 강점입니다.
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {review.oppEdge.map((r) => (
                  <RuleRow key={r.id} rule={r} tone="bad" />
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm text-dim">
              양 팀 모두 전술 보정이 걸리지 않았어요. 결정력 싸움이었습니다.
            </p>
          )}
        </div>
      </div>

      {/* 스카우팅 대조: 경기 전 브리핑에서 본 상대의 실제 대회 기록이 이번 경기에서
          어떻게 나타났는가. 브리핑과 회고가 같은 실측 자료로 이어지는 지점이다. */}
      {review.scoutingRetro.length > 0 && (
        <div className="mt-4 rounded-panel border border-line bg-surface-2/60 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <Binoculars size={16} weight="bold" aria-hidden /> 경기 전 분석은 맞았을까
          </h3>
          <p className="mt-1 text-xs text-dim">
            작전실에서 본 상대의 실제 대회 기록과 이번 경기 결과를 맞대어 봤어요.
          </p>
          <ul className="mt-2.5 flex flex-col gap-2">
            {review.scoutingRetro.map((line) => (
              <li
                key={line.id}
                className="flex items-start gap-2 rounded-panel border border-line bg-surface/40 px-3 py-2"
              >
                <span
                  className="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-black"
                  style={{
                    color: line.favorable ? "var(--color-gain)" : "var(--color-danger)",
                    background: line.favorable
                      ? "rgba(59,227,138,0.14)"
                      : "rgba(255,92,122,0.14)",
                  }}
                >
                  {line.favorable ? "살렸다" : "놓쳤다"}
                </span>
                <span className="text-sm leading-relaxed text-ink">{line.textKo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-panel border border-line bg-surface-2/60 p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <ClipboardText size={16} weight="bold" aria-hidden /> 이번 경기, 짚어볼 점
        </h3>
        <p className="mt-1 text-xs text-dim">
          이 경기에서 이렇게 조정했다면 흐름이 달라졌을 지점이에요.
        </p>
        <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5">
          {review.tips.map((tip) => (
            <li key={tip} className="text-sm leading-relaxed text-ink">
              {tip}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

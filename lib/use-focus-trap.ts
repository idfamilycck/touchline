import { useEffect, type RefObject } from "react";

// 모달 포커스 트랩. aria-modal="true"만으로는 Tab이 배경으로 새어나가므로(WCAG 2.4.3),
// active인 동안 컨테이너 안에서만 Tab이 순환하게 가두고, 열릴 때 첫 요소로 포커스를
// 옮기며, 닫힐 때 직전 포커스를 복원한다. 정적 export 앱이라 별도 라이브러리 없이 둔다.
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const prevFocus = document.activeElement as HTMLElement | null;
    const items = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // 열릴 때 첫 포커서블로 이동(모달 안으로 진입).
    items()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = items();
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement;
      // 컨테이너 밖에 포커스가 있거나 경계를 넘으면 반대편으로 감아 넣는다.
      if (e.shiftKey) {
        if (activeEl === first || !node.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !node.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // 닫힐 때 직전 포커스 복원(모달을 연 트리거로 되돌아간다).
      prevFocus?.focus?.();
    };
  }, [active, ref]);
}

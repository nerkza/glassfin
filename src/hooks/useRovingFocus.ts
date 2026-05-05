import { useEffect, type RefObject } from "react";

/*
  TV / remote keyboard navigation.

  Attach to a container ref. Children that are focusable (button, [tabindex])
  get arrow-key roving focus + Home/End jumps. Enter/Space delegate to the
  native default (so onClick fires for buttons).

  Why this exists:
  - The roadmap calls TV/remote a hard requirement.
  - Native tab order works but feels clunky for grid/rail layouts.
  - This is intentionally small — Phase 4 will add proper focus management
    across cross-rail jumps (down-arrow from rail A → rail B).
*/
export function useRovingFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const onKey = (event: KeyboardEvent) => {
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href]',
        ),
      );
      if (focusables.length === 0) return;
      const current = document.activeElement as HTMLElement | null;
      const index = current ? focusables.indexOf(current) : -1;
      if (index === -1) return;

      let next = index;
      if (event.key === "ArrowRight") next = Math.min(focusables.length - 1, index + 1);
      else if (event.key === "ArrowLeft") next = Math.max(0, index - 1);
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = focusables.length - 1;
      else return;

      event.preventDefault();
      focusables[next]?.focus();
    };

    container.addEventListener("keydown", onKey);
    return () => container.removeEventListener("keydown", onKey);
  }, [ref]);
}

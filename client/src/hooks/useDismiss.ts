import { RefObject, useEffect } from "react";

/**
 * While `open`, calls `close` on Escape or a pointer press outside `ref`
 * (e.g. to fold a dropdown).
 */
export const useDismiss = (
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
) => {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open, ref]);
};

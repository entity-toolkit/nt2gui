import { useEffect, useEffectEvent } from "react";
import { isPlainKey, isTyping } from "../lib/keyboard";

/**
 * Calls `action` when `key` (e.g. "f") is pressed anywhere while `enabled`,
 * except while typing in a text box or with Ctrl/Cmd/Alt held. Letters
 * match either case; a held key's auto-repeat is ignored.
 */
export const useKeyShortcut = (
  key: string,
  action: () => void,
  enabled = true,
) => {
  const run = useEffectEvent((event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== key.toLowerCase()) return;
    if (!isPlainKey(event) || isTyping(event.target)) return;
    event.preventDefault();
    if (!event.repeat) action();
  });
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => run(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
};

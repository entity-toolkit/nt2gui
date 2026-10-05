import { useEffect, useEffectEvent, useRef, useState } from "react";
import { serverErrorMessage } from "../api/http";
import { beginRender, useRenderScope } from "../state/renderActivity";

/** Wait this long after the last change before asking the server to render. */
export const RENDER_DEBOUNCE_MS = 150;

const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

/**
 * Runs `request` whenever `key` changes (null disables it) and keeps only the
 * newest result. Typing in a number box or dragging a slider changes the key
 * many times a second, so a change only fires a request once it has settled
 * for RENDER_DEBOUNCE_MS (the first render isn't delayed), and a newer
 * request aborts the one in flight. The last good result stays visible while
 * a newer one loads.
 */
export const useServerRender = <T>(
  key: string | null,
  request: (signal: AbortSignal) => Promise<T>,
) => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const hasRendered = useRef(false);
  const run = useEffectEvent(request);
  const scope = useRenderScope();

  useEffect(() => {
    if (key === null) {
      hasRendered.current = false;
      setData(null);
      setError(null);
      setIsRendering(false);
      return;
    }
    const controller = new AbortController();
    // Pending from now (including the debounce) until settled: playback waits.
    const done = beginRender(scope);
    setIsRendering(true);
    const timer = setTimeout(
      () => {
        run(controller.signal)
          .then((result) => {
            if (controller.signal.aborted) return;
            hasRendered.current = true;
            setData(result);
            setError(null);
            setIsRendering(false);
            done();
          })
          .catch((err: unknown) => {
            if (controller.signal.aborted || isAbort(err)) return;
            setData(null);
            setError(serverErrorMessage(err));
            setIsRendering(false);
            done();
          });
      },
      hasRendered.current ? RENDER_DEBOUNCE_MS : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
      done();
    };
  }, [key, scope]);

  return { data, error, isRendering };
};

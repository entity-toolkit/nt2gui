import { useEffect, useRef, useState } from "react";
import { serverErrorMessage } from "../services/sessionService";

/**
 * Runs `request` whenever `key` changes (null disables it) and keeps only the
 * newest result: controls such as bin counts or sliders fire requests in
 * quick succession, and older responses may arrive last.
 */
export const useServerRender = <T>(
  key: string | null,
  request: () => Promise<T>,
) => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const latest = useRef(0);
  const requestRef = useRef(request);
  requestRef.current = request;

  useEffect(() => {
    const id = ++latest.current;
    if (key === null) {
      setData(null);
      setError(null);
      setIsRendering(false);
      return;
    }
    setIsRendering(true);
    requestRef
      .current()
      .then((result) => {
        if (id !== latest.current) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (id !== latest.current) return;
        setData(null);
        setError(serverErrorMessage(err));
      })
      .finally(() => {
        if (id === latest.current) setIsRendering(false);
      });
  }, [key]);

  return { data, error, isRendering };
};

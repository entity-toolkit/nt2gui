import { RefObject, useLayoutEffect, useState } from "react";
import { ISize } from "./fitToBox";

/** Tracks an element's content-box size. */
export const useElementSize = (ref: RefObject<HTMLElement | null>): ISize => {
  const [size, setSize] = useState<ISize>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
};

import { useEffect, useRef, useState } from "react";
import { ILineConfig, IRange } from "../global";
import { ILineRender, renderLine } from "../services/fieldService";
import { serverErrorMessage } from "../services/sessionService";

/**
 * Fetches 1D line data whenever its inputs change. Slice sliders fire many
 * requests in a row, so responses that arrive after a newer request was made
 * are dropped.
 */
export const useLineRender = (
  simulationId: string | null,
  config: ILineConfig | null,
  time: number,
  range: IRange | null,
) => {
  const [data, setData] = useState<ILineRender | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const latestRequest = useRef(0);

  // Compare by value: config objects are rebuilt on every state update.
  const configKey = JSON.stringify(config);
  const rangeKey = JSON.stringify(range);

  useEffect(() => {
    const requestId = ++latestRequest.current;
    const parsedConfig = JSON.parse(configKey) as ILineConfig | null;
    if (!simulationId || !parsedConfig || !parsedConfig.axis) {
      setData(null);
      setIsRendering(false);
      return;
    }
    if (!parsedConfig.quantities.length) {
      setData(null);
      setError(null);
      setIsRendering(false);
      return;
    }

    setIsRendering(true);
    renderLine(simulationId, parsedConfig, time, JSON.parse(rangeKey))
      .then((result) => {
        if (requestId !== latestRequest.current) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (requestId !== latestRequest.current) return;
        setData(null);
        setError(serverErrorMessage(err));
      })
      .finally(() => {
        if (requestId === latestRequest.current) setIsRendering(false);
      });
  }, [configKey, rangeKey, simulationId, time]);

  return { data, error, isRendering };
};

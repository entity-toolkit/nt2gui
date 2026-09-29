import { TabNode } from "flexlayout-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type MouseEvent,
  type ChangeEvent,
} from "react";

import {
  IPlotters,
  PlotType,
  DataType,
  IPseudocolorConfig,
  defaultPseudocolorConfig,
  ITimeline,
  ISimulation,
  IZoomWindow,
  ITooltipDatum,
  ILineConfig,
  IRange,
  defaultLineConfig,
} from "../global";
import { useFieldMetadata } from "../hooks/useFieldMetadata";
import { useExpressionDims } from "../hooks/useExpressionDims";
import { withExpressionFields } from "../expressions";
import {
  activeLineRange,
  effectiveAxis,
  quantityDims,
  withSlice,
} from "../lineConfig";
import { pseudocolorSliceDims } from "../pseudocolorConfig";
import SlicedFigure from "./SlicedFigure";
import LineControls from "./LineControls";
import LineFigure from "./LineFigure";
import PseudocolorControls from "./PseudocolorControls";

import PseudocolorPreview from "./PseudocolorPreview";
import PlotContextMenu from "./PlotContextMenu";
import styles from "./Plot.module.css";
import {
  PseudocolorResponse,
  renderPseudocolor,
} from "../services/renderService";

interface IPlotProps {
  node: TabNode;
  plotters: IPlotters;
  timeline: ITimeline;
  simulations: ISimulation[];
  globalViewport: IZoomWindow | null;
  globalTooltip: ITooltipDatum | null;
  onDataTypeChange: (node_id: string, newDataType: DataType) => void;
  onPlotTypeChange: (node_id: string, newPlotType: PlotType) => void;
  onPseudocolorConfigChange: (
    node_id: string,
    config: IPseudocolorConfig,
  ) => void;
  onPlotSimulationChange: (node_id: string, simulationId?: string) => void;
  onGlobalViewportChange: (viewport: IZoomWindow | null) => void;
  onLocalViewportChange: (nodeId: string, viewport: IZoomWindow | null) => void;
  onSyncViewportToggle: (nodeId: string, useGlobal: boolean) => void;
  onGlobalTooltipChange: (tooltip: ITooltipDatum | null) => void;
  globalLineViewports: Record<string, IRange>;
  onLineConfigChange: (nodeId: string, config: ILineConfig) => void;
  onLineRangeChange: (
    nodeId: string,
    axis: string,
    range: IRange | null,
  ) => void;
}

const Plot = (props: IPlotProps) => {
  const node_id = props.node.getId();
  const node_plotter = props.plotters[node_id];
  const node_datatype = node_plotter?.dataType;
  const node_plottype = node_plotter?.plotType;

  const isPseudocolor =
    node_datatype === DataType.Fields && node_plottype === PlotType.Pseudocolor;

  const isLine =
    node_datatype === DataType.Fields && node_plottype === PlotType.Line;
  const needsSimulation = isPseudocolor || isLine;

  const pseudocolorConfig = useMemo(
    () => node_plotter?.pseudocolorConfig ?? defaultPseudocolorConfig,
    [node_plotter?.pseudocolorConfig],
  );

  const useGlobalZoom = node_plotter?.useGlobalViewport ?? true;
  const localViewport = node_plotter?.localViewport ?? null;
  const activeViewport = useGlobalZoom ? props.globalViewport : localViewport;

  const firstSimulationId = props.simulations[0]?.id;
  const selectedSimulationId = useMemo(() => {
    const matching = props.simulations.find(
      (simulation) => simulation.id === node_plotter?.simulationId,
    );

    return matching?.id ?? firstSimulationId ?? null;
  }, [firstSimulationId, node_plotter?.simulationId, props.simulations]);

  const selectedSimulation = useMemo(
    () =>
      props.simulations.find(
        (simulation) => simulation.id === selectedSimulationId,
      ),
    [props.simulations, selectedSimulationId],
  );

  const simulationLabel = selectedSimulation?.path ?? "No simulation";

  const [renderData, setRenderData] = useState<PseudocolorResponse | null>(
    null,
  );
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isZoomMode, setIsZoomMode] = useState(false);
  // Slice sliders fire renders in quick succession; only the latest counts.
  const latestRender = useRef(0);

  useEffect(() => {
    const requestId = ++latestRender.current;
    if (!isPseudocolor) {
      setRenderData(null);
      return;
    }

    if (!selectedSimulationId) {
      setRenderError("Load a simulation to render pseudocolor plots.");
      setRenderData(null);
      return;
    }

    if (
      !pseudocolorConfig.field ||
      !pseudocolorConfig.xCoordinate ||
      !pseudocolorConfig.yCoordinate
    ) {
      setRenderError("Specify field and coordinate names to render the plot.");
      setRenderData(null);
      return;
    }

    setIsRendering(true);
    setRenderError(null);

    renderPseudocolor(
      selectedSimulationId,
      pseudocolorConfig,
      props.timeline.current,
      activeViewport ?? undefined,
    )
      .then((result) => {
        if (requestId !== latestRender.current) return;
        setRenderData(result);
      })
      .catch((error: Error) => {
        if (requestId !== latestRender.current) return;
        setRenderData(null);
        setRenderError(error.message ?? "Failed to render plot");
      })
      .finally(() => {
        if (requestId === latestRender.current) setIsRendering(false);
      });
  }, [
    isPseudocolor,
    selectedSimulationId,
    props.timeline.current,
    pseudocolorConfig,
    activeViewport,
  ]);

  useEffect(() => {
    if (!needsSimulation) {
      return;
    }

    const matchingSimulation = props.simulations.find(
      (simulation) => simulation.id === node_plotter?.simulationId,
    );

    if (matchingSimulation) {
      return;
    }

    if (!props.simulations.length) {
      if (node_plotter?.simulationId) {
        props.onPlotSimulationChange(node_id, undefined);
      }
      return;
    }

    props.onPlotSimulationChange(node_id, props.simulations[0].id);
  }, [
    needsSimulation,
    node_id,
    node_plotter?.simulationId,
    props.onPlotSimulationChange,
    props.simulations,
  ]);

  useEffect(() => {
    if (!menuPosition) return;

    const closeMenu = () => setMenuPosition(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuPosition]);

  const applyViewport = useCallback(
    (viewport: IZoomWindow | null) => {
      if (useGlobalZoom) {
        props.onGlobalViewportChange(viewport);
      } else {
        props.onLocalViewportChange(node_id, viewport);
      }

      setIsZoomMode(false);
    },
    [node_id, props, useGlobalZoom],
  );

  const lineConfig = node_plotter?.lineConfig ?? defaultLineConfig;
  const { metadata: baseMetadata, error: fieldMetadataError } =
    useFieldMetadata(needsSimulation ? selectedSimulationId : null);
  // Custom expressions behave like extra fields once their dims are known.
  const plotExpressions = isLine
    ? lineConfig.expressions
    : pseudocolorConfig.expressions;
  const expressionState = useExpressionDims(
    needsSimulation ? selectedSimulationId : null,
    plotExpressions,
  );
  const fieldMetadata = useMemo(
    () =>
      baseMetadata && expressionState.ready
        ? withExpressionFields(
            baseMetadata,
            expressionState.dims,
            plotExpressions,
          )
        : null,
    [
      baseMetadata,
      expressionState.dims,
      expressionState.ready,
      plotExpressions,
    ],
  );
  const lineAxis = fieldMetadata
    ? effectiveAxis(
        lineConfig.axis,
        quantityDims(fieldMetadata, lineConfig.quantities),
      )
    : "";
  const lineRange = isLine
    ? activeLineRange(node_plotter, props.globalLineViewports, lineAxis)
    : null;

  const applyLineRange = useCallback(
    (range: IRange | null) => {
      if (lineAxis) props.onLineRangeChange(node_id, lineAxis, range);
      setIsZoomMode(false);
    },
    [lineAxis, node_id, props],
  );

  const resetZoom = useCallback(
    () => (isLine ? applyLineRange(null) : applyViewport(null)),
    [applyLineRange, applyViewport, isLine],
  );

  const handleSyncToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      props.onSyncViewportToggle(node_id, event.target.checked);
    },
    [node_id, props],
  );

  const openContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    if (!needsSimulation) {
      return;
    }

    setMenuPosition({ x: event.clientX, y: event.clientY });
  };

  const canZoom =
    (isPseudocolor && !!renderData) ||
    (isLine && !!lineAxis && lineConfig.quantities.length > 0);
  const isZoomed = isLine ? !!lineRange : !!activeViewport;
  const canResetZoom = isZoomed;
  // 1D plots only sync with other 1D plots along the same coordinate.
  const zoomStatusLabel =
    (useGlobalZoom ? "Global zoom" : "Local zoom") +
    (isLine && lineAxis ? ` (${lineAxis})` : "");

  return (
    <div className={styles.plot}>
      <div className={styles.plotBody}>
        <div className={styles.plotToolbar}>
          <div className={styles.toolbarGroup}>
            <button
              type="button"
              className={styles.toolbarButton}
              disabled={!canZoom}
              aria-pressed={isZoomMode}
              onClick={() => setIsZoomMode((prev) => !prev)}
            >
              {isZoomMode ? "Cancel zoom" : "Zoom"}
            </button>
            <button
              type="button"
              className={styles.toolbarButton}
              disabled={!canResetZoom && !canZoom}
              onClick={resetZoom}
            >
              Reset zoom
            </button>
          </div>

          <div className={styles.toolbarGroup}>
            <label className={styles.toolbarToggle}>
              <input
                type="checkbox"
                checked={useGlobalZoom}
                onChange={handleSyncToggle}
              />
              Sync zoom
            </label>
            <span className={styles.toolbarStatus}>
              {zoomStatusLabel}
              {isZoomed ? " • zoomed" : ""}
            </span>
          </div>
        </div>

        <div className={styles.plotFigure} onContextMenu={openContextMenu}>
          {isLine ? (
            !selectedSimulationId ? (
              <div className={styles.figurePlaceholder}>
                <span className={styles.figureTag}>No simulation</span>
                <div>Load a simulation to plot its fields.</div>
              </div>
            ) : fieldMetadataError ? (
              <div className={styles.figureError} role="alert">
                {fieldMetadataError}
              </div>
            ) : !fieldMetadata ? (
              <div className={styles.figurePlaceholder}>
                <span className={styles.figureTag}>Loading fields…</span>
              </div>
            ) : (
              <LineFigure
                simulationId={selectedSimulationId}
                metadata={fieldMetadata}
                config={lineConfig}
                time={props.timeline.current}
                range={lineRange}
                zoomEnabled={isZoomMode}
                onRangeChange={applyLineRange}
                onConfigChange={(config) =>
                  props.onLineConfigChange(node_id, config)
                }
              />
            )
          ) : !isPseudocolor ? (
            <div className={styles.figurePlaceholder}>
              <span className={styles.figureTag}>Pick a renderer</span>
              <div>Select a plot type to request a server render.</div>
            </div>
          ) : (
            <SlicedFigure
              sliceDims={
                fieldMetadata
                  ? pseudocolorSliceDims(fieldMetadata, pseudocolorConfig)
                  : []
              }
              coords={fieldMetadata?.coords ?? {}}
              slices={pseudocolorConfig.slices ?? {}}
              usedSlices={renderData?.slices}
              onSliceChange={(dim, value) =>
                props.onPseudocolorConfigChange(
                  node_id,
                  withSlice(pseudocolorConfig, dim, value),
                )
              }
            >
              {renderError ? (
                <div className={styles.figureError} role="alert">
                  {renderError}
                </div>
              ) : renderData ? (
                <PseudocolorPreview
                  render={renderData}
                  isRefreshing={isRendering}
                  zoomEnabled={isZoomMode}
                  viewport={activeViewport ?? null}
                  onViewportChange={applyViewport}
                  plotId={node_id}
                  globalTooltip={props.globalTooltip}
                  onGlobalTooltipChange={props.onGlobalTooltipChange}
                  xLabel={pseudocolorConfig.xCoordinate}
                  yLabel={pseudocolorConfig.yCoordinate}
                  colorbarLabel={pseudocolorConfig.field}
                />
              ) : (
                <div className={styles.figurePlaceholder}>
                  <span className={styles.figureTag}>Awaiting render</span>
                  <div>
                    {isRendering
                      ? "Rendering pseudocolor preview…"
                      : "Adjust the controls to request a server-side render."}
                  </div>
                </div>
              )}
            </SlicedFigure>
          )}
        </div>
      </div>

      <div className={styles.plotFooter}>
        <div className={styles.plotMeta}>
          <span className={styles.plotBadge}>{node_datatype}</span>
          <span className={styles.plotBadge}>{node_plottype}</span>
          <span className={styles.plotBadge}>
            Simulation: {simulationLabel}
          </span>
        </div>
      </div>

      {menuPosition && (
        <PlotContextMenu
          position={menuPosition}
          simulations={props.simulations}
          selectedSimulationId={selectedSimulationId}
          onSimulationChange={(simulationId) =>
            props.onPlotSimulationChange(node_id, simulationId)
          }
        >
          {isLine ? (
            <LineControls
              simulationId={selectedSimulationId}
              metadata={fieldMetadata}
              metadataError={fieldMetadataError}
              expressionErrors={expressionState.errors}
              config={lineConfig}
              onChange={(config) => props.onLineConfigChange(node_id, config)}
            />
          ) : (
            <PseudocolorControls
              simulationId={selectedSimulationId}
              metadata={fieldMetadata}
              metadataError={fieldMetadataError}
              expressionErrors={expressionState.errors}
              config={pseudocolorConfig}
              onChange={(config) =>
                props.onPseudocolorConfigChange(node_id, config)
              }
            />
          )}
        </PlotContextMenu>
      )}
    </div>
  );
};

export default Plot;

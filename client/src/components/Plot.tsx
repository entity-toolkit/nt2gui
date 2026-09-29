import { TabNode } from "flexlayout-react";
import {
  useEffect,
  useMemo,
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
} from "../global";

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
}

const Plot = (props: IPlotProps) => {
  const node_id = props.node.getId();
  const node_plotter = props.plotters[node_id];
  const node_datatype = node_plotter?.dataType;
  const node_plottype = node_plotter?.plotType;

  const isPseudocolor =
    node_datatype === DataType.Fields && node_plottype === PlotType.Pseudocolor;

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

  useEffect(() => {
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
        setRenderData(result);
      })
      .catch((error: Error) => {
        setRenderData(null);
        setRenderError(error.message ?? "Failed to render plot");
      })
      .finally(() => {
        setIsRendering(false);
      });
  }, [
    isPseudocolor,
    selectedSimulationId,
    props.timeline.current,
    pseudocolorConfig,
    activeViewport,
  ]);

  useEffect(() => {
    if (!isPseudocolor) {
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
    isPseudocolor,
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

  const resetZoom = useCallback(() => applyViewport(null), [applyViewport]);

  const handleSyncToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      props.onSyncViewportToggle(node_id, event.target.checked);
    },
    [node_id, props],
  );

  const openContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    if (!isPseudocolor) {
      return;
    }

    setMenuPosition({ x: event.clientX, y: event.clientY });
  };

  const canZoom = isPseudocolor && !!renderData;
  const canResetZoom = !!activeViewport;
  const zoomStatusLabel = useGlobalZoom ? "Global zoom" : "Local zoom";

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
              {activeViewport ? " • zoomed" : ""}
            </span>
          </div>
        </div>

        <div className={styles.plotFigure} onContextMenu={openContextMenu}>
          {!isPseudocolor ? (
            <div className={styles.figurePlaceholder}>
              <span className={styles.figureTag}>Pick a renderer</span>
              <div>Select a plot type to request a server render.</div>
            </div>
          ) : renderError ? (
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
        </div>
      </div>

      <div className={styles.plotFooter}>
        <div className={styles.plotMeta}>
          <span className={styles.plotBadge}>{node_datatype}</span>
          <span className={styles.plotBadge}>{node_plottype}</span>
          <span className={styles.plotBadge}>Simulation: {simulationLabel}</span>
        </div>
      </div>

      {menuPosition && (
        <PlotContextMenu
          position={menuPosition}
          simulations={props.simulations}
          selectedSimulationId={selectedSimulationId}
          pseudocolorConfig={pseudocolorConfig}
          onSimulationChange={(simulationId) =>
            props.onPlotSimulationChange(node_id, simulationId)
          }
          onConfigChange={(config) =>
            props.onPseudocolorConfigChange(node_id, config)
          }
        />
      )}
    </div>
  );
};

export default Plot;

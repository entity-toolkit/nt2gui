import { ReactNode, useEffect, useState, type MouseEvent } from "react";
import { FigureMessage } from "../components/common/FigureMessage";
import TimeControls from "../components/common/TimeControls";
import { DEFAULT_PLAYBACK_FPS, isTimeSynced, panelTime } from "../lib/playback";
import { isSpatial } from "../state/regions";
import { simulationName } from "../lib/simulations";
import { useRendersPending } from "../state/renderActivity";
import { IPlotter } from "../state/schema";
import { useUi, useUiActions } from "../state/UiContext";
import PlotContextMenu from "./PlotContextMenu";
import styles from "./PlotFrame.module.css";

export interface PlotZoom {
  /** Whether the figure can be zoomed right now. */
  canZoom: boolean;
  isZoomed: boolean;
  reset: () => void;
  /** For kinds whose zoom can be shared between plots (`useGlobalViewport`). */
  sync?: { label: string };
}

export type SelectShape = "lasso" | "box";

/** What the figure should do with a drag, set by the toolbar. */
export interface PlotTools {
  /** Zoom mode: dragging zooms. */
  enabled: boolean;
  /** Select mode: dragging saves a region, drawn with this shape (1D: a range). */
  select: SelectShape | null;
  /** Call after a zoom or a selection: back to plain (pan/hover) mode. */
  done: () => void;
}

/**
 * The select tool of a 2D plot with coordinates `x`, `y` on its axes: lasso
 * or box when both are spatial, a band when one is, none otherwise.
 */
export const imageSelect = (axes: {
  x: string;
  y: string;
}): { shapes?: SelectShape[] } | undefined => {
  const [x, y] = [isSpatial(axes.x), isSpatial(axes.y)];
  if (x && y) return { shapes: ["lasso", "box"] };
  return x || y ? {} : undefined;
};

interface PlotFrameProps {
  nodeId: string;
  plotter: IPlotter;
  zoom: PlotZoom;
  /** Plot-kind settings, shown in the right-click menu below the simulation. */
  controls: ReactNode;
  /**
   * Offers the region select tool (when an axis is spatial). With several
   * `shapes`, the toolbar picks one.
   */
  select?: { shapes?: SelectShape[] };
  /** Whether saved regions are outlined; set to offer the toggle (stored as `showRegions`). */
  showRegions?: boolean;
  /** The figure, told what dragging should do. */
  children: (tools: PlotTools) => ReactNode;
}

/**
 * Everything plots have in common: the zoom and time toolbar, the panel's own
 * timeline when its time isn't synced, the right-click menu with the
 * simulation picker, and the footer. The figure itself comes from the kind.
 */
const PlotFrame = ({
  nodeId,
  plotter,
  zoom,
  controls,
  select,
  showRegions,
  children,
}: PlotFrameProps) => {
  const { simulations, uiState } = useUi();
  const { updatePlotter } = useUiActions();
  const [tool, setTool] = useState<"zoom" | "select" | null>(null);
  const [shape, setShape] = useState<SelectShape>("lasso");
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const simulation = simulations.find((s) => s.id === plotter.simulationId);
  const syncZoom = plotter.useGlobalViewport ?? true;
  const zoomMode = tool === "zoom";
  const shapes = select?.shapes ?? [];
  const selectShape: SelectShape | null =
    tool === "select" && select
      ? shapes.length
        ? shapes.includes(shape)
          ? shape
          : shapes[0]
        : "box"
      : null;
  const syncTime = isTimeSynced(plotter);
  const ownRenderPending = useRendersPending((scope) => scope === nodeId);

  useEffect(() => {
    if (!menuPosition) return;
    const close = () => setMenuPosition(null);
    const onKeyDown = (event: KeyboardEvent) =>
      event.key === "Escape" && close();
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuPosition]);

  const openMenu = (event: MouseEvent) => {
    event.preventDefault();
    setMenuPosition({ x: event.clientX, y: event.clientY });
  };

  const zoomStatus = zoom.sync
    ? `${syncZoom ? "Global" : "Local"} zoom${zoom.sync.label ? ` (${zoom.sync.label})` : ""}${
        zoom.isZoomed ? " • zoomed" : ""
      }`
    : zoom.isZoomed
      ? "Custom range"
      : "Full range";

  return (
    <div className={styles.plot}>
      <div className={styles.plotBody}>
        {/* Which simulation, when there is a choice. */}
        {simulation && simulations.length > 1 && (
          <h3 className={styles.plotTitle} title={simulation.path}>
            {simulationName(simulation)}
          </h3>
        )}
        <div className={styles.plotToolbar}>
          <div className={styles.toolbarGroup}>
            <button
              type="button"
              className={styles.toolbarButton}
              disabled={!zoom.canZoom}
              aria-pressed={zoomMode}
              onClick={() => setTool(zoomMode ? null : "zoom")}
            >
              {zoomMode ? "Cancel zoom" : "Zoom"}
            </button>
            <button
              type="button"
              className={styles.toolbarButton}
              disabled={!zoom.isZoomed}
              onClick={() => {
                zoom.reset();
                setTool(null);
              }}
            >
              Reset zoom
            </button>
            {select && (
              <button
                type="button"
                className={styles.toolbarButton}
                aria-pressed={selectShape !== null}
                title="Drag over the plot to save a spatial region"
                onClick={() => setTool(selectShape !== null ? null : "select")}
              >
                {selectShape !== null ? "Cancel select" : "Select region"}
              </button>
            )}
            {selectShape !== null && shapes.length > 1 && (
              <span
                className={styles.segmented}
                role="group"
                aria-label="Selection shape"
              >
                {shapes.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selectShape === option}
                    onClick={() => setShape(option)}
                  >
                    {option}
                  </button>
                ))}
              </span>
            )}
          </div>
          <div className={styles.toolbarGroup}>
            {zoom.sync && (
              <label className={styles.toolbarToggle}>
                <input
                  type="checkbox"
                  checked={syncZoom}
                  onChange={(event) =>
                    updatePlotter(nodeId, {
                      useGlobalViewport: event.target.checked,
                    })
                  }
                />
                Sync zoom
              </label>
            )}
            {showRegions !== undefined && (
              <label className={styles.toolbarToggle}>
                <input
                  type="checkbox"
                  checked={showRegions}
                  onChange={(event) =>
                    updatePlotter(nodeId, {
                      showRegions: event.target.checked,
                    })
                  }
                />
                Show regions
              </label>
            )}
            <label className={styles.toolbarToggle}>
              <input
                type="checkbox"
                checked={syncTime}
                onChange={({ target: { checked } }) =>
                  updatePlotter(nodeId, (current) =>
                    checked
                      ? { syncTime: true, localTime: undefined }
                      : // Start from the time the panel shows now.
                        {
                          syncTime: false,
                          localTime: panelTime(current, uiState.timeline),
                        },
                  )
                }
              />
              Sync time
            </label>
            <span className={styles.toolbarStatus}>{zoomStatus}</span>
          </div>
        </div>

        <div className={styles.plotFigure} onContextMenu={openMenu}>
          {simulation ? (
            children({
              enabled: zoomMode,
              select: selectShape,
              done: () => setTool(null),
            })
          ) : (
            <FigureMessage tag="No simulation">
              Load a simulation from the sidebar to plot it.
            </FigureMessage>
          )}
        </div>

        {!syncTime && (
          <div className={styles.plotTimeline} aria-label="Panel timeline">
            <TimeControls
              variant="compact"
              timeline={{
                ...uiState.timeline,
                current: panelTime(plotter, uiState.timeline),
              }}
              onTimeChange={(localTime) => updatePlotter(nodeId, { localTime })}
              fps={plotter.localPlaybackFps ?? DEFAULT_PLAYBACK_FPS}
              onFpsChange={(localPlaybackFps) =>
                updatePlotter(nodeId, { localPlaybackFps })
              }
              waiting={ownRenderPending}
            />
          </div>
        )}
      </div>

      {menuPosition && (
        <PlotContextMenu
          position={menuPosition}
          simulations={simulations}
          selectedSimulationId={simulation?.id ?? null}
          onSimulationChange={(simulationId) =>
            updatePlotter(nodeId, { simulationId })
          }
        >
          {simulation && controls}
        </PlotContextMenu>
      )}
    </div>
  );
};

export default PlotFrame;

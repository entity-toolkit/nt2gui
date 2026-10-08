import { ReactNode, useEffect, useState, type MouseEvent } from "react";
import {
  TbLasso,
  TbLassoPolygon,
  TbSquareDashed,
  TbZoomIn,
  TbZoomReset,
} from "react-icons/tb";
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
 * Everything plots have in common: zoom and region tools on top, time below
 * (with the panel's own timeline when its time isn't synced), and the
 * right-click menu with the simulation picker. The figure comes from the kind.
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

  const syncTimeToggle = (
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
  );

  return (
    <div className={styles.plot}>
      <div className={styles.plotBody}>
        <div className={styles.plotToolbar} data-ui-chrome>
          <div className={styles.toolbarGroup} role="group" aria-label="Zoom">
            <button
              type="button"
              className={styles.iconButton}
              disabled={!zoom.canZoom}
              aria-pressed={zoomMode}
              aria-label="Zoom area"
              title="Zoom area"
              onClick={() => setTool(zoomMode ? null : "zoom")}
            >
              <TbZoomIn aria-hidden />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              disabled={!zoom.isZoomed}
              aria-label="Reset zoom"
              title="Reset zoom"
              onClick={() => {
                zoom.reset();
                setTool(null);
              }}
            >
              <TbZoomReset aria-hidden />
            </button>
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
          </div>

          {select && (
            <div
              className={styles.toolbarGroup}
              role="group"
              aria-label="Regions"
            >
              <button
                type="button"
                className={styles.iconButton}
                aria-pressed={selectShape !== null}
                aria-label="Select region for particles"
                title="Select region for particles"
                onClick={() => setTool(selectShape !== null ? null : "select")}
              >
                <TbLassoPolygon aria-hidden />
              </button>
              {selectShape !== null && shapes.length > 1 && (
                <span
                  className={styles.segmented}
                  role="group"
                  aria-label="Selection shape"
                >
                  {shapes.map((option) => {
                    const Icon = option === "lasso" ? TbLasso : TbSquareDashed;
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={selectShape === option}
                        aria-label={option}
                        title={option === "lasso" ? "Lasso" : "Box"}
                        onClick={() => setShape(option)}
                      >
                        <Icon aria-hidden />
                      </button>
                    );
                  })}
                </span>
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
            </div>
          )}

          {/* Which simulation, when there is a choice. */}
          {simulation && simulations.length > 1 && (
            <h3 className={styles.plotTitle} title={simulation.path}>
              {simulationName(simulation)}
            </h3>
          )}
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

        <div
          className={styles.timeBar}
          role="group"
          aria-label="Time"
          data-ui-chrome
        >
          {syncTimeToggle}
          {!syncTime && (
            <div className={styles.plotTimeline} aria-label="Panel timeline">
              <TimeControls
                variant="compact"
                timeline={{
                  ...uiState.timeline,
                  current: panelTime(plotter, uiState.timeline),
                }}
                onTimeChange={(localTime) =>
                  updatePlotter(nodeId, { localTime })
                }
                fps={plotter.localPlaybackFps ?? DEFAULT_PLAYBACK_FPS}
                onFpsChange={(localPlaybackFps) =>
                  updatePlotter(nodeId, { localPlaybackFps })
                }
                waiting={ownRenderPending}
              />
            </div>
          )}
        </div>
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

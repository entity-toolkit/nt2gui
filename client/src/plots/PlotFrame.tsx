import { ReactNode, useEffect, useState, type MouseEvent } from "react";
import { FigureMessage } from "../components/common/FigureMessage";
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

interface PlotFrameProps {
  nodeId: string;
  plotter: IPlotter;
  label: string;
  zoom: PlotZoom;
  /** Plot-kind settings, shown in the right-click menu below the simulation. */
  controls: ReactNode;
  /** The figure. `zoom.enabled` is the toolbar's zoom mode; call `done` after a zoom. */
  children: (zoom: { enabled: boolean; done: () => void }) => ReactNode;
}

/**
 * Everything plots have in common: the zoom toolbar, the right-click menu with
 * the simulation picker, and the footer. The figure itself comes from the kind.
 */
const PlotFrame = ({
  nodeId,
  plotter,
  label,
  zoom,
  controls,
  children,
}: PlotFrameProps) => {
  const { simulations } = useUi();
  const { updatePlotter } = useUiActions();
  const [zoomMode, setZoomMode] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const simulation = simulations.find((s) => s.id === plotter.simulationId);
  const syncZoom = plotter.useGlobalViewport ?? true;

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
        <div className={styles.plotToolbar}>
          <div className={styles.toolbarGroup}>
            <button
              type="button"
              className={styles.toolbarButton}
              disabled={!zoom.canZoom}
              aria-pressed={zoomMode}
              onClick={() => setZoomMode((on) => !on)}
            >
              {zoomMode ? "Cancel zoom" : "Zoom"}
            </button>
            <button
              type="button"
              className={styles.toolbarButton}
              disabled={!zoom.isZoomed}
              onClick={() => {
                zoom.reset();
                setZoomMode(false);
              }}
            >
              Reset zoom
            </button>
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
            <span className={styles.toolbarStatus}>{zoomStatus}</span>
          </div>
        </div>

        <div className={styles.plotFigure} onContextMenu={openMenu}>
          {simulation ? (
            children({ enabled: zoomMode, done: () => setZoomMode(false) })
          ) : (
            <FigureMessage tag="No simulation">
              Load a simulation from the sidebar to plot it.
            </FigureMessage>
          )}
        </div>
      </div>

      <div className={styles.plotFooter}>
        <div className={styles.plotMeta}>
          <span className={styles.plotBadge}>{label}</span>
          <span className={styles.plotBadge}>
            Simulation: {simulation?.path ?? "none"}
          </span>
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

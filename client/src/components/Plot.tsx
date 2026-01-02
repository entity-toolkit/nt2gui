import { TabNode } from "flexlayout-react";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from "react";

import {
  IPlotters,
  PlotType,
  DataType,
  IPseudocolorConfig,
  defaultPseudocolorConfig,
  ITimeline,
  ISimulation,
} from "../global";

import PseudocolorControls from "./PseudocolorControls";
import PseudocolorPreview from "./PseudocolorPreview";
import {
  PseudocolorResponse,
  renderPseudocolor,
} from "../services/renderService";

interface IPlotProps {
  node: TabNode;
  plotters: IPlotters;
  timeline: ITimeline;
  simulations: ISimulation[];
  onDataTypeChange: (node_id: string, newDataType: DataType) => void;
  onPlotTypeChange: (node_id: string, newPlotType: PlotType) => void;
  onPseudocolorConfigChange: (
    node_id: string,
    config: IPseudocolorConfig,
  ) => void;
  onPlotSimulationChange: (node_id: string, simulationId?: string) => void;
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

  const openContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    if (!isPseudocolor) {
      return;
    }

    setMenuPosition({ x: event.clientX, y: event.clientY });
  };

  return (
    <div className="plot">
      <div className="plot-body">
        <div className="plot-figure" onContextMenu={openContextMenu}>
          {!isPseudocolor ? (
            <div className="plot-figure__placeholder">
              <span className="plot-figure__tag">Pick a renderer</span>
              <div>Select a plot type to request a server render.</div>
            </div>
          ) : renderError ? (
            <div className="plot-figure__error" role="alert">
              {renderError}
            </div>
          ) : renderData ? (
            <PseudocolorPreview
              render={renderData}
              isRefreshing={isRendering}
            />
          ) : (
            <div className="plot-figure__placeholder">
              <span className="plot-figure__tag">Awaiting render</span>
              <div>
                {isRendering
                  ? "Rendering pseudocolor preview…"
                  : "Adjust the controls to request a server-side render."}
              </div>
            </div>
          )}
        </div>
        <div className="plot-hint">
          Right-click the plot to configure fields, coordinates, colormap, and
          ranges.
        </div>
      </div>

      <div className="plot-footer">
        <div className="plot-meta">
          <span className="badge">{node_datatype}</span>
          <span className="badge">{node_plottype}</span>
          <span className="badge">Simulation: {simulationLabel}</span>
        </div>
      </div>

      {menuPosition && (
        <div className="plot-contextmenu__overlay">
          <div
            className="plot-contextmenu"
            style={{ top: menuPosition.y, left: menuPosition.x }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="plot-contextmenu__header">Pseudocolor settings</div>
            <div className="form-section">
              <div className="form-row">
                <div className="form-control">
                  <label htmlFor="simulation-select">Simulation</label>
                  <select
                    id="simulation-select"
                    value={selectedSimulationId ?? ""}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      props.onPlotSimulationChange(
                        node_id,
                        event.target.value || undefined,
                      )
                    }
                    disabled={!props.simulations.length}
                  >
                    {props.simulations.length === 0 ? (
                      <option value="">No simulations loaded</option>
                    ) : (
                      props.simulations.map((simulation) => (
                        <option key={simulation.id} value={simulation.id}>
                          {simulation.path}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            </div>
            <PseudocolorControls
              config={pseudocolorConfig}
              onChange={(config) =>
                props.onPseudocolorConfigChange(node_id, config)
              }
            />
            <div className="plot-contextmenu__footer">
              Right-click anywhere on the plot to reopen this menu.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Plot;

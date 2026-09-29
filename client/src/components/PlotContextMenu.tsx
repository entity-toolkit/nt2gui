import { ChangeEvent, ReactNode } from "react";
import { ISimulation } from "../global";
import contextStyles from "./PlotContextMenu.module.css";
import formStyles from "./PseudocolorControls.module.css";

interface PlotContextMenuProps {
  position: { x: number; y: number };
  simulations: ISimulation[];
  selectedSimulationId: string | null;
  onSimulationChange: (simulationId?: string) => void;
  /** Plot-type specific controls, shown below the simulation picker. */
  children: ReactNode;
}

const PlotContextMenu = ({
  position,
  simulations,
  selectedSimulationId,
  onSimulationChange,
  children,
}: PlotContextMenuProps) => (
  <div className={contextStyles.overlay}>
    <div
      className={contextStyles.menu}
      style={{ top: position.y, left: position.x }}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className={`${formStyles.formSection} ${contextStyles.simulationSelect}`}
      >
        <div className={formStyles.formRow}>
          <div className={formStyles.formControl}>
            <label htmlFor="simulation-select">simulation</label>
            <select
              id="simulation-select"
              value={selectedSimulationId ?? ""}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                onSimulationChange(event.target.value || undefined)
              }
              disabled={!simulations.length}
            >
              {simulations.length === 0 ? (
                <option value="">No simulations loaded</option>
              ) : (
                simulations.map((simulation) => (
                  <option key={simulation.id} value={simulation.id}>
                    {simulation.path}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>
      {children}
    </div>
  </div>
);

export default PlotContextMenu;

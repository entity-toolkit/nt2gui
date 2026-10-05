import { ChangeEvent, ReactNode, useId } from "react";
import { FormField } from "../components/common/FormField";
import { simulationName } from "../lib/simulations";
import { ISimulation } from "../state/schema";
import contextStyles from "./PlotContextMenu.module.css";

interface PlotContextMenuProps {
  position: { x: number; y: number };
  simulations: ISimulation[];
  selectedSimulationId: string | null;
  onSimulationChange: (simulationId?: string) => void;
  /** Plot-type specific controls, shown below the simulation picker. */
  children: ReactNode;
}

/**
 * Opens downwards from the click in the upper half of the window and upwards
 * in the lower half, capped to the space available so long menus scroll.
 */
const menuPlacement = ({ x, y }: { x: number; y: number }) => {
  const height = window.innerHeight;
  return y > height / 2
    ? { left: x, top: "auto", bottom: height - y, maxHeight: y - 12 }
    : { left: x, top: y, maxHeight: height - y - 12 };
};

const PlotContextMenu = ({
  position,
  simulations,
  selectedSimulationId,
  onSimulationChange,
  children,
}: PlotContextMenuProps) => {
  const id = useId();
  return (
    <div className={contextStyles.overlay}>
      <div
        className={contextStyles.menu}
        style={menuPlacement(position)}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={contextStyles.simulationSelect}>
          <FormField label="simulation" htmlFor={id}>
            <select
              id={id}
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
                    {simulationName(simulation)}
                  </option>
                ))
              )}
            </select>
          </FormField>
        </div>
        {children}
      </div>
    </div>
  );
};

export default PlotContextMenu;

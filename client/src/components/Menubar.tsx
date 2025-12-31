import React from "react";
import { ISimulation } from "../global";

const menuItems = [
  "Add simulation",
  "Save state",
  "Load state",
  "Settings",
  "Help",
];

interface MenubarProps {
  onAddSimulation: () => void | Promise<void>;
  simulations: ISimulation[];
  onUnloadSimulation: (id: string) => void;
  isLoading: boolean;
}

const Menubar = ({
  onAddSimulation,
  simulations,
  onUnloadSimulation,
  isLoading,
}: MenubarProps) => {
  const handleMenuClick = (item: string) => {
    if (item === "Add simulation") {
      onAddSimulation();
    }
  };

  return (
    <nav className="menubar" aria-label="Application menu">
      <div className="menubar__items">
        {menuItems.map((item) => (
          <button
            key={item}
            type="button"
            className="menubar__button"
            onClick={() => handleMenuClick(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="menubar__simulations" aria-live="polite">
        <div className="menubar__simulations-header">
          <span>Loaded simulations</span>
          {isLoading && <span className="menubar__status">Loading…</span>}
        </div>
        {simulations.length === 0 ? (
          <p className="menubar__empty">No simulations loaded</p>
        ) : (
          <ul className="menubar__simulation-list">
            {simulations.map((simulation) => (
              <li key={simulation.id} className="menubar__simulation-item">
                <span className="menubar__simulation-path">
                  {simulation.path}
                </span>
                <button
                  type="button"
                  className="menubar__unload"
                  onClick={() => onUnloadSimulation(simulation.id)}
                >
                  Unload
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
};

export default Menubar;

import { ISimulation } from "../global";
import React, { useState } from "react";
import { createPortal } from "react-dom";
const menuItems = ["Save state", "Load state", "Settings", "Help"];

interface MenubarProps {
  simulations: ISimulation[];
  onAddSimulation: (path: string) => void | Promise<void>;
  onUnloadSimulation: (id: string) => void;
  isLoading: boolean;
}

const Menubar = ({
  simulations,
  onAddSimulation,
  onUnloadSimulation,
  isLoading,
}: MenubarProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [error, setError] = useState("");

  const handleMenuClick = (item: string) => {
    if (item === "Settings") {
      setIsDialogOpen(true);
    }
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setPathInput("");
    setError("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedPath = pathInput.trim();
    if (!trimmedPath) {
      setError("Simulation path is required");
      return;
    }

    setError("");
    try {
      await onAddSimulation(trimmedPath);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load simulation");
      }
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

      {isDialogOpen &&
        createPortal(
          <div
            className="modal-overlay"
            role="presentation"
            onClick={closeDialog}
          >
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal__header">
                <h2 id="settings-title">Settings</h2>
                <button
                  type="button"
                  className="modal__close"
                  aria-label="Close"
                  onClick={closeDialog}
                >
                  ×
                </button>
              </div>
              <section aria-live="polite">
                <h3 id="settings-subtitle">Simulations</h3>
                <ul className="simulations__list">
                  {simulations.map((simulation) => (
                    <li key={simulation.id} className="simulations__item">
                      <span className="simulations__path">
                        {simulation.path}
                      </span>
                      <button
                        type="button"
                        className="simulations__unload"
                        onClick={() => onUnloadSimulation(simulation.id)}
                      >
                        unload
                      </button>
                    </li>
                  ))}
                </ul>
                <form className="simulations__add" onSubmit={handleSubmit}>
                  <input
                    id="simulation-path"
                    type="text"
                    className="simulations__input"
                    value={pathInput}
                    onChange={(event) => setPathInput(event.target.value)}
                    placeholder="/data/simulations/run-001"
                    autoFocus
                    disabled={isLoading}
                    required
                  />
                  <button
                    type="submit"
                    className="modal__button modal__button--primary"
                    disabled={isLoading}
                  >
                    {isLoading ? "loading..." : "load"}
                  </button>
                </form>
                <div className="simulations__status">
                  {isLoading && <span>loading...</span>}
                  {error && <p className="modal__error">{error}</p>}
                </div>
              </section>
            </div>
          </div>,
          document.body,
        )}
    </nav>
  );
};

export default Menubar;

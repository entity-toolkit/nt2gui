import React, { useState } from "react";
import { createPortal } from "react-dom";
const menuItems = [
  "Add simulation",
  "Save state",
  "Load state",
  "Settings",
  "Help",
];

interface MenubarProps {
  onAddSimulation: (path: string) => void | Promise<void>;
  isLoading: boolean;
}

const Menubar = ({
  onAddSimulation,
  isLoading,
}: MenubarProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [error, setError] = useState("");

  const handleMenuClick = (item: string) => {
    if (item === "Add simulation") {
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
      closeDialog();
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
              aria-labelledby="simulation-modal-title"
              aria-describedby="simulation-modal-description"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal__header">
                <h2 id="simulation-modal-title">Add simulation</h2>
                <button
                  type="button"
                  className="modal__close"
                  aria-label="Close"
                  onClick={closeDialog}
                >
                  ×
                </button>
              </div>
              <p id="simulation-modal-description" className="modal__description">
                Enter the directory path on the server to load the simulation.
              </p>
              <form className="modal__form" onSubmit={handleSubmit}>
                <label className="modal__label" htmlFor="simulation-path">
                  Simulation directory path
                </label>
                <input
                  id="simulation-path"
                  type="text"
                  className="modal__input"
                  value={pathInput}
                  onChange={(event) => setPathInput(event.target.value)}
                  placeholder="/data/simulations/run-001"
                  autoFocus
                  disabled={isLoading}
                  required
                />
                {error && <p className="modal__error">{error}</p>}
                <div className="modal__actions">
                  <button
                    type="button"
                    className="modal__button modal__button--secondary"
                    onClick={closeDialog}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="modal__button modal__button--primary"
                    disabled={isLoading}
                  >
                    {isLoading ? "Loading…" : "Load simulation"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </nav>
  );
};

export default Menubar;

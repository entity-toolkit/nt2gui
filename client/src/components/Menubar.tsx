import { ISimulation } from "../global";
import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useSessionFiles } from "../hooks/useSessionFiles";
import SessionDialog, { SessionDialogMode } from "./SessionDialog";
import SyncStatusBadge from "./SyncStatusBadge";
import { SyncStatus } from "../sync/StateSync";
import styles from "./Menubar.module.css";
const menuItems = ["Save state", "Load state", "Settings", "Help"];

interface MenubarProps {
  sessionFiles: ReturnType<typeof useSessionFiles>;
  syncStatus: SyncStatus;
  simulations: ISimulation[];
  onAddSimulation: (path: string) => void | Promise<void>;
  onUnloadSimulation: (id: string) => void;
  isLoading: boolean;
}

const Menubar = ({
  sessionFiles,
  syncStatus,
  simulations,
  onAddSimulation,
  onUnloadSimulation,
  isLoading,
}: MenubarProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [error, setError] = useState("");
  const [sessionDialog, setSessionDialog] = useState<SessionDialogMode | null>(
    null,
  );

  const handleMenuClick = (item: string) => {
    if (item === "Settings") {
      setIsDialogOpen(true);
    } else if (item === "Save state") {
      setSessionDialog("save");
    } else if (item === "Load state") {
      setSessionDialog("load");
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
    <nav className={styles.menubar} aria-label="Application menu">
      <div className={styles.menuItems}>
        {menuItems.map((item) => (
          <button
            key={item}
            type="button"
            className={styles.menuButton}
            onClick={() => handleMenuClick(item)}
          >
            {item}
          </button>
        ))}
        <div className={styles.menuStatus}>
          <SyncStatusBadge status={syncStatus} />
        </div>
      </div>

      {sessionDialog && (
        <SessionDialog
          mode={sessionDialog}
          sessionFiles={sessionFiles}
          onClose={() => setSessionDialog(null)}
        />
      )}

      {isDialogOpen &&
        createPortal(
          <div className={styles.overlay} role="presentation" onClick={closeDialog}>
            <div
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <h2 id="settings-title" className={styles.modalTitle}>
                  Settings
                </h2>
                <button
                  type="button"
                  className={styles.closeButton}
                  aria-label="Close"
                  onClick={closeDialog}
                >
                  ×
                </button>
              </div>
              <section aria-live="polite">
                <h3 id="settings-subtitle">Simulations</h3>
                <ul className={styles.simulationsList}>
                  {simulations.map((simulation) => (
                    <li key={simulation.id} className={styles.simulationItem}>
                      <span className={styles.simulationPath}>
                        {simulation.path}
                      </span>
                      <button
                        type="button"
                        className={styles.unloadButton}
                        onClick={() => onUnloadSimulation(simulation.id)}
                      >
                        unload
                      </button>
                    </li>
                  ))}
                </ul>
                <form className={styles.addSimulation} onSubmit={handleSubmit}>
                  <input
                    id="simulation-path"
                    type="text"
                    className={styles.pathInput}
                    value={pathInput}
                    onChange={(event) => setPathInput(event.target.value)}
                    placeholder="/data/simulations/run-001"
                    autoFocus
                    disabled={isLoading}
                    required
                  />
                  <button
                    type="submit"
                    className={`${styles.modalButton} ${styles.modalButtonPrimary}`}
                    disabled={isLoading}
                  >
                    {isLoading ? "loading..." : "load"}
                  </button>
                </form>
                <div className={styles.status}>
                  {isLoading && <span>loading...</span>}
                  {error && <p className={styles.error}>{error}</p>}
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

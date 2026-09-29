import { useState } from "react";
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
}

const Menubar = ({ sessionFiles, syncStatus }: MenubarProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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

  const closeDialog = () => setIsDialogOpen(false);

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
          <div
            className={styles.overlay}
            role="presentation"
            onClick={closeDialog}
          >
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
              {/* Simulations moved to the sidebar; settings to come. */}
              <p className={styles.status}>No settings yet.</p>
            </div>
          </div>,
          document.body,
        )}
    </nav>
  );
};

export default Menubar;

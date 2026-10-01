import { useState } from "react";
import { useSessionFiles } from "../../hooks/useSessionFiles";
import { useUi } from "../../state/UiContext";
import Modal from "../common/Modal";
import ServerUrlForm from "../common/ServerUrlForm";
import SessionDialog, { SessionDialogMode } from "./SessionDialog";
import SyncStatusBadge from "./SyncStatusBadge";
import styles from "./Menubar.module.css";

type Dialog = SessionDialogMode | "settings";

const MENU: { label: string; dialog?: Dialog }[] = [
  { label: "Save state", dialog: "save" },
  { label: "Load state", dialog: "load" },
  { label: "Settings", dialog: "settings" },
  { label: "Help" },
];

const Menubar = () => {
  const { syncStatus } = useUi();
  // Lives here (not in the dialog) so "Load" can offer the file just saved.
  const sessionFiles = useSessionFiles();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => setDialog(null);

  return (
    <nav className={styles.menubar} aria-label="Application menu">
      <div className={styles.menuItems}>
        {MENU.map(({ label, dialog: target }) => (
          <button
            key={label}
            type="button"
            className={styles.menuButton}
            onClick={() => target && setDialog(target)}
          >
            {label}
          </button>
        ))}
        <div className={styles.menuStatus}>
          <SyncStatusBadge status={syncStatus} />
        </div>
      </div>

      {(dialog === "save" || dialog === "load") && (
        <SessionDialog
          mode={dialog}
          sessionFiles={sessionFiles}
          onClose={close}
        />
      )}
      {dialog === "settings" && (
        <Modal title="Settings" onClose={close}>
          <ServerUrlForm />
        </Modal>
      )}
    </nav>
  );
};

export default Menubar;

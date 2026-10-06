import { useRef, useState } from "react";
import { TbChevronDown } from "react-icons/tb";
import { apiBaseFor, getServerUrl } from "../../config";
import { useDismiss } from "../../hooks/useDismiss";
import { useSessionFiles } from "../../hooks/useSessionFiles";
import { useUi } from "../../state/UiContext";
import Modal, { modalStyles } from "../common/Modal";
import ServerUrlForm from "../common/ServerUrlForm";
import SessionDialog, { SessionDialogMode } from "./SessionDialog";
import SyncStatusBadge from "./SyncStatusBadge";
import styles from "./Menubar.module.css";

type Dialog = SessionDialogMode | "settings";

/** The API this page talks to, as an absolute URL. */
const currentApiUrl = () => {
  const configured = getServerUrl();
  const url = new URL(apiBaseFor(configured), window.location.href).href;
  return { url, ownServer: !configured };
};

/** "State": save or load the session, each opening its dialog. */
const StateMenu = ({
  onOpen,
}: {
  onOpen: (dialog: SessionDialogMode) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useDismiss(ref, open, () => setOpen(false));

  const choose = (dialog: SessionDialogMode) => {
    setOpen(false);
    onOpen(dialog);
  };

  return (
    <div className={styles.dropdown} ref={ref}>
      <button
        type="button"
        className={styles.menuButton}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((on) => !on)}
      >
        State <TbChevronDown aria-hidden className={styles.caret} />
      </button>
      {open && (
        <div className={styles.dropdownMenu} role="menu" aria-label="State">
          <button type="button" role="menuitem" onClick={() => choose("save")}>
            Save
          </button>
          <button type="button" role="menuitem" onClick={() => choose("load")}>
            Load
          </button>
        </div>
      )}
    </div>
  );
};

const Menubar = () => {
  const { syncStatus } = useUi();
  // Lives here (not in the dialog) so "Load" can offer the file just saved.
  const sessionFiles = useSessionFiles();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => setDialog(null);
  const connection = currentApiUrl();

  return (
    <nav className={styles.menubar} aria-label="Application menu">
      <div className={styles.menuItems}>
        <StateMenu onOpen={setDialog} />
        <button
          type="button"
          className={styles.menuButton}
          onClick={() => setDialog("settings")}
        >
          Settings
        </button>
        <button type="button" className={styles.menuButton}>
          Help
        </button>
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
          <div className={styles.connection} aria-label="Current connection">
            <span className={modalStyles.status}>Connected to</span>
            <code className={styles.connectionUrl}>{connection.url}</code>
            <span className={modalStyles.status}>
              {connection.ownServer
                ? "the server that served this page"
                : "a server set in this browser"}
            </span>
            <SyncStatusBadge status={syncStatus} />
          </div>
          <ServerUrlForm />
        </Modal>
      )}
    </nav>
  );
};

export default Menubar;

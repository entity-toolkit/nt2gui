import { SyncStatus } from "../sync/StateSync";
import styles from "./SyncStatusBadge.module.css";

const SYNC_LABELS: Record<SyncStatus, string> = {
  synced: "Saved",
  saving: "Saving…",
  offline: "Server unreachable — retrying",
  error: "Server rejected the last change",
};

/** Whether the latest UI state has reached the server. */
const SyncStatusBadge = ({ status }: { status: SyncStatus }) => (
  <span className={`${styles.badge} ${styles[status]}`} role="status">
    <span className={styles.dot} aria-hidden="true" />
    {SYNC_LABELS[status]}
  </span>
);

export default SyncStatusBadge;

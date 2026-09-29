import { formatNumber } from "../../lib/format";
import styles from "./figure.module.css";

/** Particles left out because a log axis can't show values <= 0. */
const ExcludedNote = ({ weight }: { weight: number }) =>
  weight > 0 ? (
    <p className={styles.note}>
      Not shown on the log axis (value ≤ 0): weight {formatNumber(weight)}
    </p>
  ) : null;

export default ExcludedNote;

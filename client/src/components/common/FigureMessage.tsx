import { CSSProperties, ReactNode } from "react";
import styles from "./FigureMessage.module.css";

interface FigureMessageProps {
  /** Short status shown as a pill, e.g. "Loading fields…". */
  tag?: string;
  children?: ReactNode;
}

/** Placeholder shown in a plot's figure area instead of a chart. */
export const FigureMessage = ({ tag, children }: FigureMessageProps) => (
  <div className={styles.message}>
    {tag && <span className={styles.tag}>{tag}</span>}
    {children && <div>{children}</div>}
  </div>
);

export const FigureError = ({ children }: { children: ReactNode }) => (
  <div className={styles.error} role="alert">
    {children}
  </div>
);

/** Floating hint that a newer render is on its way. */
export const RefreshingBadge = ({ style }: { style?: CSSProperties }) => (
  <div className={styles.refreshing} style={style} role="status">
    Refreshing…
  </div>
);

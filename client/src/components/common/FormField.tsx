import { ReactNode } from "react";
import styles from "./FormField.module.css";

/** A labelled row of one or more inputs in a settings panel. */
export const FormField = ({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) => (
  <div className={styles.field}>
    <label htmlFor={htmlFor}>{label}</label>
    {children}
  </div>
);

/** Vertical stack of settings (a plot's right-click menu body). */
export const FormStack = ({ children }: { children: ReactNode }) => (
  <div className={styles.stack}>{children}</div>
);

/** A muted note, e.g. while settings are still loading. */
export const FormHint = ({ children }: { children: ReactNode }) => (
  <p className={styles.hint}>{children}</p>
);

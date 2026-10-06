import { ReactNode, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import styles from "./Modal.module.css";

/** Form and button classes for modal content. */
export { styles as modalStyles };

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Extra class for the dialog box (e.g. a wider one). */
  className?: string;
}

/** A dialog over the app; closes on Escape, the × button, or a click outside. */
const Modal = ({ title, onClose, children, className }: ModalProps) => {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={`${styles.modal} ${className ?? ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.close}
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
};

export default Modal;

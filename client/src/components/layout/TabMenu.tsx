import { ReactNode, useRef } from "react";
import { TbCopy, TbMaximize, TbMinimize, TbX } from "react-icons/tb";
import { useDismiss } from "../../hooks/useDismiss";
import styles from "./TabMenu.module.css";

interface TabMenuProps {
  /** Where the tab was right-clicked (viewport pixels). */
  position: { x: number; y: number };
  maximized: boolean;
  onDuplicate: () => void;
  onToggleMaximized: () => void;
  onClose: () => void;
  onDismiss: () => void;
}

/** A panel tab's right-click menu: duplicate, maximize, close. */
const TabMenu = ({
  position,
  maximized,
  onDuplicate,
  onToggleMaximized,
  onClose,
  onDismiss,
}: TabMenuProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useDismiss(ref, true, onDismiss);
  const item = (label: string, icon: ReactNode, action: () => void) => (
    <button
      type="button"
      role="menuitem"
      className={styles.item}
      onClick={() => {
        action();
        onDismiss();
      }}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div
      ref={ref}
      className={styles.menu}
      role="menu"
      aria-label="Panel"
      style={{
        left: Math.min(position.x, window.innerWidth - 200),
        top: Math.min(position.y, window.innerHeight - 140),
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {item("Duplicate", <TbCopy aria-hidden />, onDuplicate)}
      {item(
        maximized ? "Restore (P)" : "Maximize (P)",
        maximized ? <TbMinimize aria-hidden /> : <TbMaximize aria-hidden />,
        onToggleMaximized,
      )}
      {item("Close", <TbX aria-hidden />, onClose)}
    </div>
  );
};

export default TabMenu;

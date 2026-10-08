import { TbArrowsMaximize, TbArrowsMinimize } from "react-icons/tb";
import { useUi, useUiActions } from "../../state/UiContext";
import styles from "./FocusToggle.module.css";

/**
 * Hides every control (menus, sidebar, panel tabs, plot tools, timeline) to
 * leave only the plots, and brings them back. In focus mode it floats in the
 * top right corner, the only control left.
 */
const FocusToggle = ({ floating = false }: { floating?: boolean }) => {
  const { uiState } = useUi();
  const { updateUiState } = useUiActions();
  const focus = uiState.focusMode ?? false;
  const label = focus ? "Show controls" : "Hide controls (plots only)";
  const Icon = focus ? TbArrowsMinimize : TbArrowsMaximize;
  return (
    <button
      type="button"
      className={`${styles.toggle} ${floating ? styles.floating : ""}`}
      aria-pressed={focus}
      aria-label={label}
      title={label}
      onClick={() => updateUiState((prev) => ({ ...prev, focusMode: !focus }))}
    >
      <Icon aria-hidden />
    </button>
  );
};

export default FocusToggle;

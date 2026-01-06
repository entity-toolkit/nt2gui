import styles from "./SelectionMenu.module.css";

type SelectionOption = {
  label: string;
  disabled?: boolean;
  onSelect?: () => void;
};

interface SelectionMenuProps {
  options: SelectionOption[];
  helperText?: string;
}

const SelectionMenu = ({ options, helperText }: SelectionMenuProps) => {
  return (
    <div className={styles.selectionMenu}>
      {options.map(({ label, disabled, onSelect }) => (
        <button
          key={label}
          type="button"
          className={styles.optionButton}
          onClick={onSelect}
          disabled={disabled}
        >
          {label}
        </button>
      ))}
      {helperText && <small className={styles.helperText}>{helperText}</small>}
    </div>
  );
};

export default SelectionMenu;

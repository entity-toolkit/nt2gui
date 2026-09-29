import formStyles from "./PseudocolorControls.module.css";

interface LimitInputsProps {
  id: string;
  label: string;
  min?: number;
  max?: number;
  onChange: (min: number | undefined, max: number | undefined) => void;
}

const parse = (value: string) => (value === "" ? undefined : Number(value));

/** A min/max pair where an empty box means "automatic". */
const LimitInputs = ({ id, label, min, max, onChange }: LimitInputsProps) => (
  <div className={formStyles.formSection}>
    <div className={formStyles.formRow}>
      <div className={formStyles.formControl}>
        <label htmlFor={`${id}-min`}>{label}</label>
        <input
          id={`${id}-min`}
          type="number"
          placeholder="auto"
          aria-label={`${label} minimum`}
          value={min ?? ""}
          onChange={(event) => onChange(parse(event.target.value), max)}
          step="any"
        />
        <input
          id={`${id}-max`}
          type="number"
          placeholder="auto"
          aria-label={`${label} maximum`}
          value={max ?? ""}
          onChange={(event) => onChange(min, parse(event.target.value))}
          step="any"
        />
      </div>
    </div>
  </div>
);

export default LimitInputs;

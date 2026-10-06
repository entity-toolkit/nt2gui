import { DEFAULT_SCALE_POWER, ScaleKind } from "../../state/schema";
import styles from "./ScaleSelect.module.css";

export const SCALE_LABELS: Record<ScaleKind, string> = {
  linear: "linear",
  log: "log",
  power: "sign·|A|^p",
};

interface ScaleSelectProps {
  id?: string;
  /** Accessible name of the select, e.g. "y scale". */
  label: string;
  scale: ScaleKind;
  power?: number;
  /** `power` is the exponent in effect (the default unless one was set). */
  onChange: (scale: ScaleKind, power: number) => void;
}

/**
 * Linear, log, or the sign-preserving power stretch sign(A)·|A|^p, with an
 * input for p when the power scale is chosen.
 */
const ScaleSelect = ({
  id,
  label,
  scale,
  power = DEFAULT_SCALE_POWER,
  onChange,
}: ScaleSelectProps) => (
  <>
    <select
      id={id}
      aria-label={label}
      value={scale}
      onChange={(event) => onChange(event.target.value as ScaleKind, power)}
    >
      {(Object.keys(SCALE_LABELS) as ScaleKind[]).map((kind) => (
        <option key={kind} value={kind}>
          {SCALE_LABELS[kind]}
        </option>
      ))}
    </select>
    {scale === "power" && (
      <label className={styles.power} title="Exponent p of sign(A)·|A|^p">
        p
        <input
          type="number"
          min={0.01}
          step={0.05}
          aria-label={`${label} power`}
          value={power}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (next > 0) onChange(scale, next);
          }}
        />
      </label>
    )}
  </>
);

export default ScaleSelect;

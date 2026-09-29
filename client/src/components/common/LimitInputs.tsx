import { useId } from "react";
import { FormField } from "./FormField";

interface LimitInputsProps {
  label: string;
  min?: number;
  max?: number;
  onChange: (min: number | undefined, max: number | undefined) => void;
}

/** Number input value, or undefined for an empty box. */
export const parseOptionalNumber = (value: string) =>
  value === "" ? undefined : Number(value);

/** A min/max pair where an empty box means "automatic". */
const LimitInputs = ({ label, min, max, onChange }: LimitInputsProps) => {
  const id = useId();
  return (
    <FormField label={label} htmlFor={id}>
      <input
        id={id}
        type="number"
        placeholder="auto"
        aria-label={`${label} minimum`}
        value={min ?? ""}
        onChange={(event) =>
          onChange(parseOptionalNumber(event.target.value), max)
        }
        step="any"
      />
      <input
        type="number"
        placeholder="auto"
        aria-label={`${label} maximum`}
        value={max ?? ""}
        onChange={(event) =>
          onChange(min, parseOptionalNumber(event.target.value))
        }
        step="any"
      />
    </FormField>
  );
};

export default LimitInputs;

import { useId } from "react";
import { FormField } from "../../components/common/FormField";
import { parseOptionalNumber } from "../../components/common/LimitInputs";
import { ISmoothing } from "../../state/schema";

interface SmoothingInputsProps {
  /** The plotted coordinates, each getting a window. */
  dims: string[];
  smoothing?: ISmoothing;
  onChange: (dim: string, width: number | undefined) => void;
}

/**
 * Boxcar smoothing along each plotted coordinate: a window width in that
 * coordinate's units, empty for none.
 */
const SmoothingInputs = ({
  dims,
  smoothing,
  onChange,
}: SmoothingInputsProps) => {
  const id = useId();
  if (!dims.length) return null;
  return (
    <FormField label="smooth" htmlFor={id}>
      {dims.map((dim, index) => (
        <input
          key={dim}
          id={index === 0 ? id : undefined}
          type="number"
          min={0}
          step="any"
          placeholder={`${dim}: off`}
          aria-label={`smoothing window along ${dim}`}
          title={`Moving average over this width along ${dim} (in ${dim} units); empty: off`}
          value={smoothing?.[dim] ?? ""}
          onChange={(event) =>
            onChange(dim, parseOptionalNumber(event.target.value))
          }
        />
      ))}
    </FormField>
  );
};

export default SmoothingInputs;

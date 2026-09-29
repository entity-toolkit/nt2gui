import { IFieldMetadata, ILineConfig } from "../global";
import { effectiveAxis, quantityDims, toggleQuantity } from "../lineConfig";
import LimitInputs from "./LimitInputs";
import QuantityList from "./QuantityList";
import formStyles from "./PseudocolorControls.module.css";
import styles from "./LineControls.module.css";

interface LineControlsProps {
  metadata: IFieldMetadata | null;
  metadataError: string | null;
  config: ILineConfig;
  onChange: (config: ILineConfig) => void;
}

/** What a 1D plot shows: quantities, the axis, and value-axis limits. */
const LineControls = ({
  metadata,
  metadataError,
  config,
  onChange,
}: LineControlsProps) => {
  if (!metadata) {
    return (
      <p className={styles.hint}>
        {metadataError ?? "Loading the simulation's fields…"}
      </p>
    );
  }

  const dims = quantityDims(metadata, config.quantities);
  const axis = effectiveAxis(config.axis, dims);

  return (
    <div className={formStyles.pseudocolorGrid}>
      <QuantityList
        metadata={metadata}
        mode="checkbox"
        selected={config.quantities}
        showVectors
        onToggle={(quantity) =>
          onChange({
            ...config,
            quantities: toggleQuantity(config.quantities, quantity),
          })
        }
      />

      <div className={formStyles.formSection}>
        <div className={formStyles.formRow}>
          <div className={formStyles.formControl}>
            <label htmlFor="line-axis">plot along</label>
            <select
              id="line-axis"
              value={axis}
              disabled={!dims.length}
              onChange={(event) =>
                onChange({ ...config, axis: event.target.value })
              }
            >
              {dims.map((dim) => (
                <option key={dim} value={dim}>
                  {dim}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <LimitInputs
        id="line-y"
        label="min/max"
        min={config.yMin}
        max={config.yMax}
        onChange={(yMin, yMax) => onChange({ ...config, yMin, yMax })}
      />
    </div>
  );
};

export default LineControls;

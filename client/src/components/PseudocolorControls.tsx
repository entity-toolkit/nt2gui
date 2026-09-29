import React from "react";
import { IFieldMetadata, IPseudocolorConfig } from "../global";
import {
  fieldDims,
  isPseudocolorField,
  withCoordinate,
  withField,
} from "../pseudocolorConfig";
import LimitInputs from "./LimitInputs";
import QuantityList from "./QuantityList";
import styles from "./PseudocolorControls.module.css";
import lineStyles from "./LineControls.module.css";

interface PseudocolorControlsProps {
  metadata: IFieldMetadata | null;
  metadataError: string | null;
  config: IPseudocolorConfig;
  onChange: (config: IPseudocolorConfig) => void;
}

const colorMaps = ["viridis", "plasma", "cividis", "turbo", "magma"];

/** What a pseudocolor plot shows: one field, its two axes, and color limits. */
const PseudocolorControls: React.FC<PseudocolorControlsProps> = ({
  metadata,
  metadataError,
  config,
  onChange,
}) => {
  if (!metadata) {
    return (
      <p className={lineStyles.hint}>
        {metadataError ?? "Loading the simulation's fields…"}
      </p>
    );
  }

  const dims = fieldDims(metadata, config.field);
  const axisSelect = (axis: "x" | "y", value: string) => (
    <select
      id={`${axis}-coordinate`}
      aria-label={`${axis} axis`}
      value={value}
      disabled={dims.length < 2}
      onChange={(event) =>
        onChange(withCoordinate(config, axis, event.target.value))
      }
    >
      {/* Keep an unknown saved value visible rather than silently changing it. */}
      {!dims.includes(value) && <option value={value}>{value || "–"}</option>}
      {dims.map((dim) => (
        <option key={dim} value={dim}>
          {dim}
        </option>
      ))}
    </select>
  );

  return (
    <div className={styles.pseudocolorGrid}>
      <QuantityList
        metadata={metadata}
        mode="radio"
        selected={config.field ? [config.field] : []}
        showVectors={false}
        isFieldAvailable={isPseudocolorField}
        onToggle={(field) => onChange(withField(config, field, metadata))}
      />

      <div className={styles.formSection}>
        <div className={styles.formRow}>
          <div className={styles.formControl}>
            <label htmlFor="x-coordinate">x / y</label>
            {axisSelect("x", config.xCoordinate)}
            {axisSelect("y", config.yCoordinate)}
          </div>
        </div>
      </div>

      <LimitInputs
        id="pseudocolor-v"
        label="min/max"
        min={config.vmin}
        max={config.vmax}
        onChange={(vmin, vmax) => onChange({ ...config, vmin, vmax })}
      />

      <div className={styles.formSection}>
        <div className={styles.formRow}>
          <div className={styles.formControl}>
            <label htmlFor="colorbar">colormap</label>
            <select
              id="colorbar"
              value={config.colorMap}
              onChange={(e) => onChange({ ...config, colorMap: e.target.value })}
            >
              {colorMaps.map((map) => (
                <option key={map} value={map}>
                  {map}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PseudocolorControls;

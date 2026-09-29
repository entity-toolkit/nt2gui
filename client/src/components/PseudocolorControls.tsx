import React from "react";
import {
  addExpression,
  normalizeExpression,
  removeExpression,
  withExpressionFields,
} from "../expressions";
import { IFieldMetadata, IPseudocolorConfig } from "../global";
import { checkExpression } from "../hooks/useExpressionDims";
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
  simulationId: string | null;
  /** Includes the plot's custom expressions as fields. */
  metadata: IFieldMetadata | null;
  expressionErrors: Record<string, string>;
  metadataError: string | null;
  config: IPseudocolorConfig;
  onChange: (config: IPseudocolorConfig) => void;
}

const colorMaps = ["viridis", "plasma", "cividis", "turbo", "magma"];

/** What a pseudocolor plot shows: one field, its two axes, and color limits. */
const PseudocolorControls: React.FC<PseudocolorControlsProps> = ({
  simulationId,
  metadata,
  expressionErrors,
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

  const handleAddExpression = async (text: string) => {
    const expression = normalizeExpression(text);
    const field = metadata.fields.find((f) => f.name === expression);
    if (field && !config.expressions?.includes(expression)) {
      if (!isPseudocolorField(field)) {
        return `'${expression}' has fewer than two dimensions`;
      }
      onChange(withField(config, expression, metadata));
      return null;
    }
    if (!simulationId) return "No simulation selected";
    const result = await checkExpression(simulationId, expression);
    if ("error" in result) return result.error;
    if (result.dims.length < 2) {
      return `A 2D plot needs two dimensions; this has ${
        result.dims.join(", ") || "none"
      }`;
    }
    const withNew = withExpressionFields(
      metadata,
      { [expression]: result.dims },
      [expression],
    );
    onChange(
      withField(
        {
          ...config,
          expressions: addExpression(config.expressions, expression),
        },
        expression,
        withNew,
      ),
    );
    return null;
  };

  const handleRemoveExpression = (expression: string) =>
    onChange({
      ...config,
      expressions: removeExpression(config.expressions, expression),
      field: config.field === expression ? "" : config.field,
    });
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
        expressions={config.expressions ?? []}
        expressionErrors={expressionErrors}
        onAddExpression={handleAddExpression}
        onRemoveExpression={handleRemoveExpression}
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
            <label htmlFor="color-scale">color</label>
            <select
              id="color-scale"
              aria-label="color scale"
              value={config.colorScale ?? "linear"}
              onChange={(e) =>
                onChange({
                  ...config,
                  colorScale: e.target.value as "linear" | "log",
                  // Limits valid for one scale (e.g. negative) may not be for the other.
                  vmin: undefined,
                  vmax: undefined,
                })
              }
            >
              <option value="linear">linear</option>
              <option value="log">log</option>
            </select>
            <select
              id="colorbar"
              aria-label="colormap"
              value={config.colorMap}
              onChange={(e) =>
                onChange({ ...config, colorMap: e.target.value })
              }
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

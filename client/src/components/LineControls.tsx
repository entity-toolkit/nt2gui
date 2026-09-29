import {
  addExpression,
  normalizeExpression,
  removeExpression,
} from "../expressions";
import { IFieldMetadata, ILineConfig } from "../global";
import { checkExpression } from "../hooks/useExpressionDims";
import { effectiveAxis, quantityDims, toggleQuantity } from "../lineConfig";
import LimitInputs from "./LimitInputs";
import QuantityList from "./QuantityList";
import formStyles from "./PseudocolorControls.module.css";
import styles from "./LineControls.module.css";

interface LineControlsProps {
  simulationId: string | null;
  /** Includes the plot's custom expressions as fields. */
  metadata: IFieldMetadata | null;
  expressionErrors: Record<string, string>;
  metadataError: string | null;
  config: ILineConfig;
  onChange: (config: ILineConfig) => void;
}

/** What a 1D plot shows: quantities, the axis, and value-axis limits. */
const LineControls = ({
  simulationId,
  metadata,
  expressionErrors,
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
  const select = (quantity: string) =>
    config.quantities.includes(quantity)
      ? config.quantities
      : [...config.quantities, quantity];

  const handleAddExpression = async (text: string) => {
    const expression = normalizeExpression(text);
    const isBuiltIn =
      metadata.fields.some((f) => f.name === expression) ||
      metadata.vectors.some((v) => v.name === expression);
    if (isBuiltIn && !config.expressions?.includes(expression)) {
      onChange({ ...config, quantities: select(expression) });
      return null;
    }
    if (!simulationId) return "No simulation selected";
    const result = await checkExpression(simulationId, expression);
    if ("error" in result) return result.error;
    onChange({
      ...config,
      expressions: addExpression(config.expressions, expression),
      quantities: select(expression),
    });
    return null;
  };

  return (
    <div className={formStyles.pseudocolorGrid}>
      <QuantityList
        metadata={metadata}
        mode="checkbox"
        selected={config.quantities}
        showVectors
        expressions={config.expressions ?? []}
        expressionErrors={expressionErrors}
        onAddExpression={handleAddExpression}
        onRemoveExpression={(expression) =>
          onChange({
            ...config,
            expressions: removeExpression(config.expressions, expression),
            quantities: config.quantities.filter((q) => q !== expression),
          })
        }
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

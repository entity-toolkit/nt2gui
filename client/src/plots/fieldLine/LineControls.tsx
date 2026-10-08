import { useId } from "react";
import { IFieldMetadata } from "../../api/types";
import {
  FormField,
  FormHint,
  FormStack,
} from "../../components/common/FormField";
import LimitInputs from "../../components/common/LimitInputs";
import ScaleSelect from "../../components/common/ScaleSelect";
import {
  addExpression,
  normalizeExpression,
  removeExpression,
} from "../../lib/expressions";
import { ILineConfig } from "../../state/schema";
import { quantityDims, withSmoothing } from "../fields/metadata";
import SmoothingInputs from "../fields/SmoothingInputs";
import QuantityList from "../fields/QuantityList";
import { checkExpression } from "../fields/useFieldMetadata";
import { useUi } from "../../state/UiContext";
import { usedVariables } from "../../state/variables";
import { effectiveAxis, toggleQuantity } from "./config";

interface LineControlsProps {
  simulationId: string;
  /** Includes the plot's custom expressions as fields. */
  metadata: IFieldMetadata | null;
  metadataError: string | null;
  expressionErrors: Record<string, string>;
  config: ILineConfig;
  onChange: (config: ILineConfig) => void;
}

/** What a 1D plot shows: quantities, the axis, and value-axis limits. */
const LineControls = ({
  simulationId,
  metadata,
  metadataError,
  expressionErrors,
  config,
  onChange,
}: LineControlsProps) => {
  const axisId = useId();
  const scaleId = useId();
  const variables = useUi().uiState.fieldVariables ?? [];
  if (!metadata) {
    return (
      <FormHint>{metadataError ?? "Loading the simulation's fields…"}</FormHint>
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
    const result = await checkExpression(
      simulationId,
      expression,
      usedVariables([expression], variables),
    );
    if ("error" in result) return result.error;
    onChange({
      ...config,
      expressions: addExpression(config.expressions, expression),
      quantities: select(expression),
    });
    return null;
  };

  return (
    <FormStack>
      <QuantityList
        simulationId={simulationId}
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

      <FormField label="plot along" htmlFor={axisId}>
        <select
          id={axisId}
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
      </FormField>

      <FormField label="y scale" htmlFor={scaleId}>
        <ScaleSelect
          id={scaleId}
          label="y scale"
          scale={config.yScale ?? "linear"}
          power={config.yPower}
          onChange={(yScale, yPower) =>
            onChange(
              yScale === (config.yScale ?? "linear")
                ? { ...config, yPower }
                : // Limits valid on one scale (e.g. negative) may not be on another.
                  { ...config, yScale, yMin: undefined, yMax: undefined },
            )
          }
        />
      </FormField>

      <SmoothingInputs
        dims={axis ? [axis] : []}
        smoothing={config.smoothing}
        onChange={(dim, width) => onChange(withSmoothing(config, dim, width))}
      />

      <LimitInputs
        label="min/max"
        min={config.yMin}
        max={config.yMax}
        onChange={(yMin, yMax) => onChange({ ...config, yMin, yMax })}
      />
    </FormStack>
  );
};

export default LineControls;

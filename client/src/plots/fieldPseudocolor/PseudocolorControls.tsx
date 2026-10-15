import { useId } from "react";
import { IFieldMetadata } from "../../api/types";
import { COLOR_MAPS } from "../../charts/colors";
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
import { IPseudocolorConfig } from "../../state/schema";
import { coordinateLabel } from "../../state/transforms";
import { withExpressionFields, withSmoothing } from "../fields/metadata";
import SmoothingInputs from "../fields/SmoothingInputs";
import QuantityList from "../fields/QuantityList";
import { checkExpression } from "../fields/useFieldMetadata";
import { useUi } from "../../state/UiContext";
import { usedVariables } from "../../state/variables";
import {
  fieldDims,
  isPseudocolorField,
  withCoordinate,
  withField,
} from "./config";

interface PseudocolorControlsProps {
  simulationId: string;
  /** Includes the plot's custom expressions as fields. */
  metadata: IFieldMetadata | null;
  expressionErrors: Record<string, string>;
  metadataError: string | null;
  config: IPseudocolorConfig;
  onChange: (config: IPseudocolorConfig) => void;
}

/** What a pseudocolor plot shows: one field, its two axes, and color limits. */
const PseudocolorControls = ({
  simulationId,
  metadata,
  expressionErrors,
  metadataError,
  config,
  onChange,
}: PseudocolorControlsProps) => {
  const axesId = useId();
  const colorId = useId();
  const colorMapId = useId();
  const { uiState } = useUi();
  const variables = uiState.fieldVariables ?? [];
  const transforms = uiState.coordinateTransforms ?? {};
  if (!metadata) {
    return (
      <FormHint>{metadataError ?? "Loading the simulation's fields…"}</FormHint>
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
    const result = await checkExpression(
      simulationId,
      expression,
      usedVariables([expression], variables),
      transforms,
    );
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
      id={axis === "x" ? axesId : undefined}
      aria-label={`${axis} axis`}
      value={value}
      disabled={dims.length < 2}
      onChange={(event) =>
        onChange(withCoordinate(config, axis, event.target.value))
      }
    >
      {/* Keep an unknown saved value visible rather than silently changing it. */}
      {!dims.includes(value) && (
        <option value={value}>{coordinateLabel(value) || "–"}</option>
      )}
      {dims.map((dim) => (
        <option key={dim} value={dim}>
          {coordinateLabel(dim)}
        </option>
      ))}
    </select>
  );

  return (
    <FormStack>
      <QuantityList
        simulationId={simulationId}
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

      <FormField label="x / y" htmlFor={axesId}>
        {axisSelect("x", config.xCoordinate)}
        {axisSelect("y", config.yCoordinate)}
      </FormField>

      <SmoothingInputs
        dims={[config.xCoordinate, config.yCoordinate].filter((dim) =>
          dims.includes(dim),
        )}
        smoothing={config.smoothing}
        onChange={(dim, width) => onChange(withSmoothing(config, dim, width))}
      />

      <LimitInputs
        label="min/max"
        min={config.vmin}
        max={config.vmax}
        onChange={(vmin, vmax) => onChange({ ...config, vmin, vmax })}
      />

      <FormField label="color scale" htmlFor={colorId}>
        <ScaleSelect
          id={colorId}
          label="color scale"
          scale={config.colorScale ?? "linear"}
          power={config.colorPower}
          onChange={(colorScale, colorPower) =>
            onChange(
              colorScale === (config.colorScale ?? "linear")
                ? { ...config, colorPower }
                : {
                    ...config,
                    colorScale,
                    // Limits valid for one scale (e.g. negative) may not be for another.
                    vmin: undefined,
                    vmax: undefined,
                  },
            )
          }
        />
      </FormField>

      <FormField label="colormap" htmlFor={colorMapId}>
        <select
          id={colorMapId}
          aria-label="colormap"
          value={config.colorMap}
          onChange={(event) =>
            onChange({ ...config, colorMap: event.target.value })
          }
        >
          {COLOR_MAPS.map((map) => (
            <option key={map} value={map}>
              {map}
            </option>
          ))}
        </select>
      </FormField>
    </FormStack>
  );
};

export default PseudocolorControls;

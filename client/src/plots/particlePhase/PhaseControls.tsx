import { useId } from "react";
import { IParticleMetadata } from "../../api/types";
import { COLOR_MAPS } from "../../charts/colors";
import {
  FormField,
  FormHint,
  FormStack,
} from "../../components/common/FormField";
import LimitInputs from "../../components/common/LimitInputs";
import { addExpression, removeExpression } from "../../lib/expressions";
import { ColorScale, IParticlePhaseConfig } from "../../state/schema";
import {
  AxisControls,
  CustomQuantities,
  SpeciesPicker,
  withoutExpression,
} from "../particles/controls";
import styles from "../particles/controls.module.css";

interface PhaseControlsProps {
  simulationId: string;
  metadata: IParticleMetadata | null;
  metadataError: string | null;
  config: IParticlePhaseConfig;
  onChange: (config: IParticlePhaseConfig) => void;
}

/** Species, the two binned axes, and colors of a phase-space plot. */
const PhaseControls = ({
  simulationId,
  metadata,
  metadataError,
  config,
  onChange,
}: PhaseControlsProps) => {
  const colorId = useId();
  if (!metadata) {
    return (
      <FormHint>
        {metadataError ?? "Loading the simulation's particles…"}
      </FormHint>
    );
  }
  const expressions = config.expressions ?? [];

  return (
    <FormStack>
      <div className={styles.axisRow}>
        <span className={styles.axisLabel}>species</span>
        <SpeciesPicker
          metadata={metadata}
          selected={config.species ?? []}
          onChange={(species) => onChange({ ...config, species })}
        />
      </div>
      <AxisControls
        label="x"
        axis={config.x}
        metadata={metadata}
        expressions={expressions}
        onChange={(x) => onChange({ ...config, x })}
      />
      <AxisControls
        label="y"
        axis={config.y}
        metadata={metadata}
        expressions={expressions}
        onChange={(y) => onChange({ ...config, y })}
      />

      <FormField label="color" htmlFor={colorId}>
        <select
          id={colorId}
          value={config.colorScale ?? "log"}
          onChange={(event) =>
            onChange({
              ...config,
              colorScale: event.target.value as ColorScale,
              // Limits valid for one scale (e.g. 0) may not be for the other.
              vmin: undefined,
              vmax: undefined,
            })
          }
        >
          <option value="log">log</option>
          <option value="linear">linear</option>
        </select>
        <select
          aria-label="colormap"
          value={config.colorMap ?? "viridis"}
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
      <LimitInputs
        label="min/max"
        min={config.vmin}
        max={config.vmax}
        onChange={(vmin, vmax) => onChange({ ...config, vmin, vmax })}
      />

      <CustomQuantities
        simulationId={simulationId}
        expressions={expressions}
        onAdd={(expression) =>
          onChange({
            ...config,
            expressions: addExpression(config.expressions, expression),
          })
        }
        onRemove={(expression) =>
          onChange({
            ...config,
            expressions: removeExpression(config.expressions, expression),
            x: withoutExpression(config.x, expression, metadata, "x"),
            y: withoutExpression(config.y, expression, metadata, "ux"),
          })
        }
      />
    </FormStack>
  );
};

export default PhaseControls;

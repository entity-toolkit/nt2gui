import { useId } from "react";
import { IParticleMetadata } from "../../api/types";
import { seriesColor } from "../../charts/colors";
import {
  FormField,
  FormHint,
  FormStack,
} from "../../components/common/FormField";
import LimitInputs from "../../components/common/LimitInputs";
import { addExpression, removeExpression } from "../../lib/expressions";
import { ColorScale, IParticleHistogramConfig } from "../../state/schema";
import listStyles from "../fields/QuantityList.module.css";
import { seriesPerSpecies, withAxisQuantity } from "../particles/config";
import {
  AxisControls,
  CustomQuantities,
  SpeciesPicker,
  withoutExpression,
} from "../particles/controls";
import styles from "../particles/controls.module.css";

interface HistogramControlsProps {
  simulationId: string;
  metadata: IParticleMetadata | null;
  metadataError: string | null;
  config: IParticleHistogramConfig;
  onChange: (config: IParticleHistogramConfig) => void;
}

/** The binned x axis, one species selection per line, and the value axis. */
const HistogramControls = ({
  simulationId,
  metadata,
  metadataError,
  config,
  onChange,
}: HistogramControlsProps) => {
  const yScaleId = useId();
  if (!metadata) {
    return (
      <FormHint>
        {metadataError ?? "Loading the simulation's particles…"}
      </FormHint>
    );
  }
  const expressions = config.expressions ?? [];
  const setSeries = (series: IParticleHistogramConfig["series"]) =>
    onChange({ ...config, series });

  return (
    <FormStack>
      <AxisControls
        label="x"
        axis={config.x}
        metadata={metadata}
        expressions={expressions}
        onChange={(x) => onChange({ ...config, x })}
      />

      <fieldset className={listStyles.quantities}>
        <legend>lines</legend>
        <ul className={styles.seriesList}>
          {config.series.map((series, index) => (
            <li key={index} className={styles.series}>
              <span
                className={styles.swatch}
                style={{ background: seriesColor(index) }}
                aria-hidden="true"
              />
              <SpeciesPicker
                metadata={metadata}
                selected={series.species}
                onChange={(species) =>
                  setSeries(
                    config.series.map((s, i) =>
                      i === index ? { species } : s,
                    ),
                  )
                }
              />
              {config.series.length > 1 && (
                <button
                  type="button"
                  className={listStyles.remove}
                  aria-label={`Remove line ${index + 1}`}
                  onClick={() =>
                    setSeries(config.series.filter((_, i) => i !== index))
                  }
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className={styles.buttons}>
          <button
            type="button"
            onClick={() => setSeries([...config.series, { species: [] }])}
          >
            + line
          </button>
          <button
            type="button"
            onClick={() => setSeries(seriesPerSpecies(metadata))}
          >
            one line per species
          </button>
        </div>
      </fieldset>

      <FormField label="y scale" htmlFor={yScaleId}>
        <select
          id={yScaleId}
          value={config.yScale ?? "log"}
          onChange={(event) =>
            onChange({ ...config, yScale: event.target.value as ColorScale })
          }
        >
          <option value="log">log</option>
          <option value="linear">linear</option>
        </select>
      </FormField>
      <LimitInputs
        label="y min/max"
        min={config.yMin}
        max={config.yMax}
        onChange={(yMin, yMax) => onChange({ ...config, yMin, yMax })}
      />

      <CustomQuantities
        simulationId={simulationId}
        expressions={expressions}
        onAdd={(expression) =>
          onChange({
            ...config,
            expressions: addExpression(config.expressions, expression),
            x: withAxisQuantity(config.x, expression, metadata),
          })
        }
        onRemove={(expression) =>
          onChange({
            ...config,
            expressions: removeExpression(config.expressions, expression),
            x: withoutExpression(config.x, expression, metadata, "gamma"),
          })
        }
      />
    </FormStack>
  );
};

export default HistogramControls;

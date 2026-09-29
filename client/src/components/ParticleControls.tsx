import { FormEvent, useState } from "react";
import {
  addExpression,
  normalizeExpression,
  removeExpression,
} from "../expressions";
import {
  DEFAULT_PARTICLE_BINS,
  DEFAULT_PARTICLE_POWER,
  IParticleAxis,
  IParticleHistogramConfig,
  IParticleMetadata,
  IParticlePhaseConfig,
  ParticleScale,
} from "../global";
import { checkParticleQuantity } from "../hooks/useParticleMetadata";
import {
  isSpeciesSelected,
  seriesPerSpecies,
  toggleSpecies,
  withAxisQuantity,
  withAxisScale,
} from "../particleConfig";
import { seriesColor } from "./LineChart";
import LimitInputs from "./LimitInputs";
import formStyles from "./PseudocolorControls.module.css";
import listStyles from "./QuantityList.module.css";
import styles from "./ParticleControls.module.css";

const colorMaps = ["viridis", "plasma", "cividis", "turbo", "magma", "inferno"];

const QUANTITY_HINTS: Record<string, string> = {
  gamma: "Lorentz factor √(1+u²)",
  energy: "|u|, energy of massless particles",
  w: "weight",
};

const parseNumber = (value: string) =>
  value === "" ? undefined : Number(value);

// --- species ---------------------------------------------------------------

interface SpeciesPickerProps {
  metadata: IParticleMetadata;
  selected: number[];
  onChange: (species: number[]) => void;
}

/** Chips for each species; nothing deselected means all species. */
const SpeciesPicker = ({
  metadata,
  selected,
  onChange,
}: SpeciesPickerProps) => {
  const all = metadata.species.map((sp) => sp.index);
  return (
    <div className={styles.chips}>
      {metadata.species.map((species) => (
        <label
          key={species.index}
          className={styles.chip}
          title={
            species.mass === null
              ? "mass unknown"
              : species.mass === 0
                ? "massless"
                : `mass ${species.mass}`
          }
        >
          <input
            type="checkbox"
            checked={isSpeciesSelected(selected, species.index)}
            onChange={() =>
              onChange(toggleSpecies(selected, species.index, all))
            }
          />
          {species.label}
          {species.mass === 0 && <span className={styles.chipNote}>m=0</span>}
        </label>
      ))}
    </div>
  );
};

// --- one binned axis ---------------------------------------------------------

interface AxisControlsProps {
  label: string;
  axis: IParticleAxis;
  metadata: IParticleMetadata;
  expressions: string[];
  onChange: (axis: IParticleAxis) => void;
}

const AxisControls = ({
  label,
  axis,
  metadata,
  expressions,
  onChange,
}: AxisControlsProps) => {
  const names = metadata.quantities.map((q) => q.name);
  const known =
    names.includes(axis.quantity) || expressions.includes(axis.quantity);
  return (
    <div className={styles.axis}>
      <div className={styles.axisRow}>
        <span className={styles.axisLabel}>{label}</span>
        <select
          aria-label={`${label} quantity`}
          value={axis.quantity}
          onChange={(event) =>
            onChange(withAxisQuantity(axis, event.target.value, metadata))
          }
        >
          {!known && <option value={axis.quantity}>{axis.quantity}</option>}
          <optgroup label="quantities">
            {metadata.quantities.map((quantity) => (
              <option key={quantity.name} value={quantity.name}>
                {quantity.name}
                {QUANTITY_HINTS[quantity.name]
                  ? ` — ${QUANTITY_HINTS[quantity.name]}`
                  : ""}
              </option>
            ))}
          </optgroup>
          {expressions.length > 0 && (
            <optgroup label="custom">
              {expressions.map((expression) => (
                <option key={expression} value={expression}>
                  {expression}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <div className={styles.axisRow}>
        <select
          aria-label={`${label} scale`}
          value={axis.scale}
          onChange={(event) =>
            onChange(withAxisScale(axis, event.target.value as ParticleScale))
          }
        >
          <option value="linear">linear</option>
          <option value="log">log</option>
          <option value="power">sign·|A|^p</option>
        </select>
        {axis.scale === "power" && (
          <label className={styles.inline}>
            p
            <input
              type="number"
              min={0.01}
              step={0.05}
              value={axis.power ?? DEFAULT_PARTICLE_POWER}
              onChange={(event) => {
                const power = Number(event.target.value);
                if (power > 0) onChange({ ...axis, power });
              }}
            />
          </label>
        )}
        <label className={styles.inline}>
          bins
          <input
            type="number"
            min={1}
            max={2000}
            step={1}
            value={axis.bins ?? DEFAULT_PARTICLE_BINS}
            onChange={(event) => {
              const bins = Math.round(Number(event.target.value));
              if (bins >= 1 && bins <= 2000) onChange({ ...axis, bins });
            }}
          />
        </label>
      </div>
      <div className={styles.axisRow}>
        <span className={styles.inlineLabel}>range</span>
        <input
          type="number"
          step="any"
          placeholder="auto"
          aria-label={`${label} range minimum`}
          value={axis.min ?? ""}
          onChange={(event) =>
            onChange({ ...axis, min: parseNumber(event.target.value) })
          }
        />
        <input
          type="number"
          step="any"
          placeholder="auto"
          aria-label={`${label} range maximum`}
          value={axis.max ?? ""}
          onChange={(event) =>
            onChange({ ...axis, max: parseNumber(event.target.value) })
          }
        />
      </div>
    </div>
  );
};

// --- custom quantities -------------------------------------------------------

interface CustomQuantitiesProps {
  simulationId: string | null;
  expressions: string[];
  onAdd: (expression: string) => void;
  onRemove: (expression: string) => void;
}

const CustomQuantities = ({
  simulationId,
  expressions,
  onAdd,
  onRemove,
}: CustomQuantitiesProps) => {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const expression = normalizeExpression(draft);
    if (!expression || !simulationId) return;
    setBusy(true);
    const problem = await checkParticleQuantity(simulationId, expression);
    setBusy(false);
    setError(problem);
    if (!problem) {
      onAdd(expression);
      setDraft("");
    }
  };

  return (
    <fieldset className={listStyles.quantities}>
      <legend>custom quantities</legend>
      {expressions.length > 0 && (
        <ul className={listStyles.list}>
          {expressions.map((expression) => (
            <li key={expression} className={listStyles.item}>
              <span className={`${listStyles.option} ${listStyles.optionName}`}>
                {expression}
              </span>
              <button
                type="button"
                className={listStyles.remove}
                aria-label={`Remove ${expression}`}
                onClick={() => onRemove(expression)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className={listStyles.addForm} onSubmit={submit}>
        <input
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          placeholder="e.g. (gamma - 1) * w"
          aria-label="Custom particle quantity"
          spellCheck={false}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !draft.trim()}>
          add
        </button>
      </form>
      {error ? (
        <p className={listStyles.addError} role="alert">
          {error}
        </p>
      ) : (
        <p className={listStyles.hint}>
          Combine x, y, z, ux, uy, uz, gamma, energy, w with numpy functions;
          added quantities appear in the axis menus.
        </p>
      )}
    </fieldset>
  );
};

// --- plot panels ---------------------------------------------------------------

interface PanelProps<T> {
  simulationId: string | null;
  metadata: IParticleMetadata | null;
  metadataError: string | null;
  config: T;
  onChange: (config: T) => void;
}

const Loading = ({ error }: { error: string | null }) => (
  <p className={styles.hint}>
    {error ?? "Loading the simulation's particles…"}
  </p>
);

/** Removing a custom quantity also resets any axis using it. */
const withoutExpression = (
  axis: IParticleAxis,
  expression: string,
  metadata: IParticleMetadata,
  fallback: string,
) =>
  axis.quantity === expression
    ? withAxisQuantity(axis, fallback, metadata)
    : axis;

export const ParticleHistogramControls = ({
  simulationId,
  metadata,
  metadataError,
  config,
  onChange,
}: PanelProps<IParticleHistogramConfig>) => {
  if (!metadata) return <Loading error={metadataError} />;
  const expressions = config.expressions ?? [];
  const setSeries = (series: IParticleHistogramConfig["series"]) =>
    onChange({ ...config, series });

  return (
    <div className={formStyles.pseudocolorGrid}>
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

      <div className={formStyles.formSection}>
        <div className={formStyles.formRow}>
          <div className={formStyles.formControl}>
            <label htmlFor="histogram-y-scale">y scale</label>
            <select
              id="histogram-y-scale"
              value={config.yScale ?? "log"}
              onChange={(event) =>
                onChange({
                  ...config,
                  yScale: event.target.value as "linear" | "log",
                })
              }
            >
              <option value="log">log</option>
              <option value="linear">linear</option>
            </select>
          </div>
        </div>
      </div>
      <LimitInputs
        id="histogram-y"
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
    </div>
  );
};

export const ParticlePhaseControls = ({
  simulationId,
  metadata,
  metadataError,
  config,
  onChange,
}: PanelProps<IParticlePhaseConfig>) => {
  if (!metadata) return <Loading error={metadataError} />;
  const expressions = config.expressions ?? [];

  return (
    <div className={formStyles.pseudocolorGrid}>
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

      <div className={formStyles.formSection}>
        <div className={formStyles.formRow}>
          <div className={formStyles.formControl}>
            <label htmlFor="phase-color-scale">color</label>
            <select
              id="phase-color-scale"
              value={config.colorScale ?? "log"}
              onChange={(event) =>
                onChange({
                  ...config,
                  colorScale: event.target.value as "linear" | "log",
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
              {colorMaps.map((map) => (
                <option key={map} value={map}>
                  {map}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <LimitInputs
        id="phase-v"
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
    </div>
  );
};

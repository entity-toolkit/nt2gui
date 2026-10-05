/** Controls shared by the particle plot kinds. */
import { useId } from "react";
import { IParticleMetadata } from "../../api/types";
import ExpressionInput from "../../components/common/ExpressionInput";
import { parseOptionalNumber } from "../../components/common/LimitInputs";
import { normalizeExpression } from "../../lib/expressions";
import { describeRegion, regionColor } from "../../state/regions";
import { useUi } from "../../state/UiContext";
import { formatValue } from "../../lib/format";
import {
  DEFAULT_PARTICLE_BINS,
  DEFAULT_PARTICLE_POWER,
  IParticleAxis,
  ParticleScale,
} from "../../state/schema";
import listStyles from "../fields/QuantityList.module.css";
import {
  isSpeciesSelected,
  toggleSpecies,
  withAxisQuantity,
  withAxisScale,
} from "./config";
import { checkParticleExpression } from "./useParticleMetadata";
import styles from "./controls.module.css";

const QUANTITY_HINTS: Record<string, string> = {
  gamma: "Lorentz factor √(1+u²)",
  energy: "|u|, energy of massless particles",
  w: "weight",
};

// Matches `MAX_PARTICLE_BINS` in nt2gui/session/schema.py.
const MAX_BINS = 2000;

/** Chips for each species; nothing deselected means all species. */
export const SpeciesPicker = ({
  metadata,
  selected,
  onChange,
}: {
  metadata: IParticleMetadata;
  selected: number[];
  onChange: (species: number[]) => void;
}) => {
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

/**
 * Chips for each saved region: only particles inside any checked region
 * count. Nothing checked means no spatial filter.
 */
export const RegionPicker = ({
  selected,
  onChange,
}: {
  selected: string[] | undefined;
  onChange: (regions: string[]) => void;
}) => {
  const regions = useUi().uiState.regions ?? [];
  if (!regions.length) {
    return (
      <span className={styles.chipNote}>
        no saved regions — use “Select region” on a plot with a spatial axis
      </span>
    );
  }
  const checked = selected ?? [];
  return (
    <div className={styles.chips} role="group" aria-label="Regions">
      {regions.map((region) => (
        <label
          key={region.name}
          className={styles.chip}
          title={describeRegion(region, formatValue)}
        >
          <input
            type="checkbox"
            checked={checked.includes(region.name)}
            onChange={() =>
              onChange(
                checked.includes(region.name)
                  ? checked.filter((name) => name !== region.name)
                  : regions
                      .map((r) => r.name)
                      .filter(
                        (name) =>
                          name === region.name || checked.includes(name),
                      ),
              )
            }
          />
          <span
            className={styles.regionDot}
            style={{ background: regionColor(region) }}
            aria-hidden="true"
          />
          {region.name}
        </label>
      ))}
    </div>
  );
};

/** Quantity, scale, bins and range of one binned axis. */
export const AxisControls = ({
  label,
  axis,
  metadata,
  expressions,
  onChange,
}: {
  label: string;
  axis: IParticleAxis;
  metadata: IParticleMetadata;
  expressions: string[];
  onChange: (axis: IParticleAxis) => void;
}) => {
  const id = useId();
  const known =
    metadata.quantities.some((q) => q.name === axis.quantity) ||
    expressions.includes(axis.quantity);
  return (
    <div className={styles.axis}>
      <div className={styles.axisRow}>
        <label className={styles.axisLabel} htmlFor={id}>
          {label}
        </label>
        <select
          id={id}
          value={axis.quantity}
          onChange={(event) =>
            onChange(withAxisQuantity(axis, event.target.value, metadata))
          }
        >
          {!known && <option value={axis.quantity}>{axis.quantity}</option>}
          <optgroup label="quantities">
            {metadata.quantities.map(({ name }) => (
              <option key={name} value={name}>
                {name}
                {QUANTITY_HINTS[name] ? ` — ${QUANTITY_HINTS[name]}` : ""}
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
            max={MAX_BINS}
            step={1}
            value={axis.bins ?? DEFAULT_PARTICLE_BINS}
            onChange={(event) => {
              const bins = Math.round(Number(event.target.value));
              if (bins >= 1 && bins <= MAX_BINS) onChange({ ...axis, bins });
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
            onChange({ ...axis, min: parseOptionalNumber(event.target.value) })
          }
        />
        <input
          type="number"
          step="any"
          placeholder="auto"
          aria-label={`${label} range maximum`}
          value={axis.max ?? ""}
          onChange={(event) =>
            onChange({ ...axis, max: parseOptionalNumber(event.target.value) })
          }
        />
      </div>
    </div>
  );
};

/** The plot's custom quantities; added ones appear in the axis menus. */
export const CustomQuantities = ({
  simulationId,
  expressions,
  onAdd,
  onRemove,
}: {
  simulationId: string;
  expressions: string[];
  onAdd: (expression: string) => void;
  onRemove: (expression: string) => void;
}) => (
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
    <ExpressionInput
      onAdd={async (text) => {
        const expression = normalizeExpression(text);
        const problem = await checkParticleExpression(simulationId, expression);
        if (!problem) onAdd(expression);
        return problem;
      }}
      placeholder="e.g. (gamma - 1) * w"
      label="Custom particle quantity"
      hint="Combine x, y, z, ux, uy, uz, gamma, energy, w with numpy functions; added quantities appear in the axis menus."
    />
  </fieldset>
);

/** Removing a custom quantity resets any axis that used it to `fallback`. */
export const withoutExpression = (
  axis: IParticleAxis,
  expression: string,
  metadata: IParticleMetadata,
  fallback: string,
) =>
  axis.quantity === expression
    ? withAxisQuantity(axis, fallback, metadata)
    : axis;

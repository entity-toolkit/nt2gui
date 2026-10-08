/** Controls shared by the particle plot kinds. */
import { ReactNode, useId, useState } from "react";
import { TbPencil, TbTag } from "react-icons/tb";
import { IParticleMetadata } from "../../api/types";
import ExpressionInput from "../../components/common/ExpressionInput";
import InlineName from "../../components/common/InlineName";
import { useVariables } from "../../hooks/useVariables";
import { parseOptionalNumber } from "../../components/common/LimitInputs";
import ScaleSelect from "../../components/common/ScaleSelect";
import { normalizeExpression } from "../../lib/expressions";
import { describeRegion, regionColor } from "../../state/regions";
import {
  MAX_VARIABLE_NAME,
  parseDefinition,
  usedVariables,
} from "../../state/variables";
import { useUi } from "../../state/UiContext";
import { formatValue } from "../../lib/format";
import { DEFAULT_PARTICLE_BINS, IParticleAxis } from "../../state/schema";
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
  const variables = useUi().uiState.particleVariables ?? [];
  const known =
    metadata.quantities.some((q) => q.name === axis.quantity) ||
    variables.some((v) => v.name === axis.quantity) ||
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
          {variables.length > 0 && (
            <optgroup label="variables">
              {variables.map(({ name, expression }) => (
                <option key={name} value={name}>
                  {name} = {expression}
                </option>
              ))}
            </optgroup>
          )}
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
        <ScaleSelect
          label={`${label} scale`}
          scale={axis.scale}
          power={axis.power}
          onChange={(scale, power) =>
            onChange(
              scale === axis.scale
                ? { ...axis, power }
                : withAxisScale(axis, scale),
            )
          }
        />
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

/**
 * The session's named particle variables (shared by every particle plot;
 * `name = expression` defines one) and the plot's own custom quantities,
 * which can be named to become variables. Both appear in the axis menus.
 */
export const CustomQuantities = ({
  simulationId,
  metadata,
  expressions,
  onAdd,
  onRemove,
}: {
  simulationId: string;
  metadata: IParticleMetadata;
  expressions: string[];
  onAdd: (expression: string) => void;
  onRemove: (expression: string) => void;
}) => {
  const { variables, define, rename, remove, nameExpression } = useVariables(
    "particles",
    simulationId,
    metadata.quantities.map((q) => q.name),
  );
  // The row being (re)named: a variable's name or a custom expression.
  const [editing, setEditing] = useState<string | null>(null);

  const inline = (
    key: string,
    initial: string,
    label: string,
    submit: (name: string) => Promise<string | null>,
  ) => (
    <li key={key} className={listStyles.item}>
      <InlineName
        initial={initial}
        label={label}
        placeholder="name, e.g. uperp"
        maxLength={MAX_VARIABLE_NAME}
        onSubmit={async (name) => {
          const problem = await submit(name);
          if (!problem) setEditing(null);
          return problem;
        }}
        onCancel={() => setEditing(null)}
      />
    </li>
  );

  const row = (
    key: string,
    name: string,
    detail: string | null,
    actions: ReactNode,
  ) => (
    <li key={key} className={listStyles.item} title={detail ?? undefined}>
      <span className={listStyles.option}>
        <span className={listStyles.optionName}>{name}</span>
        {detail && <span className={listStyles.optionDetail}>{detail}</span>}
      </span>
      {actions}
    </li>
  );

  const iconButton = (
    label: string,
    title: string,
    icon: ReactNode,
    onClick: () => void,
  ) => (
    <button
      type="button"
      className={listStyles.remove}
      aria-label={label}
      title={title}
      onClick={onClick}
    >
      {icon}
    </button>
  );

  return (
    <fieldset className={listStyles.quantities}>
      <legend>custom quantities</legend>
      {variables.length > 0 && (
        <>
          <p className={listStyles.groupTitle}>variables (all plots)</p>
          <ul className={listStyles.list} aria-label="Variables">
            {variables.map((variable) =>
              editing === `variable:${variable.name}`
                ? inline(variable.name, variable.name, "Variable name", (to) =>
                    rename(variable.name, to),
                  )
                : row(
                    variable.name,
                    variable.name,
                    `= ${variable.expression}`,
                    <>
                      {iconButton(
                        `Rename ${variable.name}`,
                        "Rename (updates every use)",
                        <TbPencil aria-hidden />,
                        () => setEditing(`variable:${variable.name}`),
                      )}
                      {iconButton(
                        `Remove ${variable.name}`,
                        "Remove",
                        "×",
                        () => remove(variable.name),
                      )}
                    </>,
                  ),
            )}
          </ul>
        </>
      )}
      {expressions.length > 0 && (
        <>
          <p className={listStyles.groupTitle}>this plot</p>
          <ul className={listStyles.list}>
            {expressions.map((expression) =>
              editing === `expression:${expression}`
                ? inline(expression, "", `Name for ${expression}`, (name) =>
                    nameExpression(expression, name),
                  )
                : row(
                    expression,
                    expression,
                    null,
                    <>
                      {iconButton(
                        `Name ${expression}`,
                        "Name it: a variable usable in every plot",
                        <TbTag aria-hidden />,
                        () => setEditing(`expression:${expression}`),
                      )}
                      {iconButton(`Remove ${expression}`, "Remove", "×", () =>
                        onRemove(expression),
                      )}
                    </>,
                  ),
            )}
          </ul>
        </>
      )}
      <ExpressionInput
        onAdd={async (text) => {
          const definition = parseDefinition(text);
          if (definition) {
            return define(definition.name, definition.expression);
          }
          const expression = normalizeExpression(text);
          const problem = await checkParticleExpression(
            simulationId,
            expression,
            usedVariables([expression], variables),
          );
          if (!problem) onAdd(expression);
          return problem;
        }}
        placeholder="e.g. (gamma - 1) * w  or  uperp = sqrt(uy**2 + uz**2)"
        label="Custom particle quantity"
        hint="Combine x, y, z, ux, uy, uz, gamma, energy, w and variables with numpy functions; they appear in the axis menus. Write name = expression to define a variable for every plot."
      />
    </fieldset>
  );
};

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

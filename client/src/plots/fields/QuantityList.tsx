import { useId } from "react";
import { IFieldMetadata } from "../../api/types";
import ExpressionInput from "../../components/common/ExpressionInput";
import styles from "./QuantityList.module.css";

interface QuantityListProps {
  /** Metadata with the custom expressions already added as fields. */
  metadata: IFieldMetadata;
  /** Checkboxes pick any number of quantities, radios exactly one. */
  mode: "checkbox" | "radio";
  selected: string[];
  onToggle: (quantity: string) => void;
  /** Vectors (all components at once) only make sense for some plots. */
  showVectors: boolean;
  /** Fields that can't be shown by this plot type are hidden. */
  isFieldAvailable?: (field: IFieldMetadata["fields"][number]) => boolean;
  /** The plot's custom expressions, in the order they were added. */
  expressions: string[];
  /** Why saved expressions are invalid for this simulation, if they are. */
  expressionErrors: Record<string, string>;
  /** Validates and adds an expression; resolves to an error message, or null. */
  onAddExpression: (text: string) => Promise<string | null>;
  onRemoveExpression: (expression: string) => void;
}

/** Every quantity a simulation offers, plus the plot's custom expressions. */
const QuantityList = ({
  metadata,
  mode,
  selected,
  onToggle,
  showVectors,
  isFieldAvailable = () => true,
  expressions,
  expressionErrors,
  onAddExpression,
  onRemoveExpression,
}: QuantityListProps) => {
  const groupName = useId();

  const custom = new Set(expressions);
  const fields = metadata.fields.filter(
    (field) => !custom.has(field.name) && isFieldAvailable(field),
  );
  const dimsOf = (name: string) =>
    metadata.fields.find((field) => field.name === name)?.dims ?? [];

  const renderOption = (
    name: string,
    detail: string,
    extra?: { error?: string; onRemove?: () => void },
  ) => (
    <li key={name} className={styles.item}>
      <label
        className={`${styles.option} ${extra?.error ? styles.invalid : ""}`}
        title={extra?.error}
      >
        <input
          type={mode}
          name={groupName}
          checked={selected.includes(name)}
          disabled={!!extra?.error}
          onChange={() => onToggle(name)}
        />
        <span className={styles.optionName}>{name}</span>
        <span className={styles.optionDetail}>{extra?.error ?? detail}</span>
      </label>
      {extra?.onRemove && (
        <button
          type="button"
          className={styles.remove}
          aria-label={`Remove ${name}`}
          onClick={extra.onRemove}
        >
          ×
        </button>
      )}
    </li>
  );

  return (
    <fieldset className={styles.quantities}>
      <legend>{mode === "radio" ? "quantity" : "quantities"}</legend>
      {showVectors && metadata.vectors.length > 0 && (
        <>
          <p className={styles.groupTitle}>vectors (all components)</p>
          <ul className={styles.list}>
            {metadata.vectors.map((vector) =>
              renderOption(vector.name, vector.components.join(", ")),
            )}
          </ul>
        </>
      )}
      <p className={styles.groupTitle}>fields</p>
      {fields.length ? (
        <ul className={styles.list}>
          {fields.map((field) =>
            renderOption(field.name, field.dims.join("·")),
          )}
        </ul>
      ) : (
        <p className={styles.empty}>No suitable fields in this simulation.</p>
      )}

      <p className={styles.groupTitle}>custom</p>
      {expressions.length > 0 && (
        <ul className={styles.list}>
          {expressions.map((expression) =>
            renderOption(expression, dimsOf(expression).join("·"), {
              error: expressionErrors[expression],
              onRemove: () => onRemoveExpression(expression),
            }),
          )}
        </ul>
      )}
      <ExpressionInput
        onAdd={onAddExpression}
        placeholder="e.g. sqrt(Ex**2 + Ey**2)"
        label="Custom quantity expression"
        hint="Combine fields and coordinates with + − * / ** and numpy functions (sqrt, exp, log10, sin, arctan2, where, …)."
      />
    </fieldset>
  );
};

export default QuantityList;

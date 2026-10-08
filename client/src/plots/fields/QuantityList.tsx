import { ReactNode, useId, useState } from "react";
import { TbPencil, TbTag } from "react-icons/tb";
import { IFieldMetadata } from "../../api/types";
import ExpressionInput from "../../components/common/ExpressionInput";
import InlineName from "../../components/common/InlineName";
import { useVariables } from "../../hooks/useVariables";
import { useUi } from "../../state/UiContext";
import { MAX_VARIABLE_NAME, parseDefinition } from "../../state/variables";
import styles from "./QuantityList.module.css";

interface QuantityListProps {
  simulationId: string;
  /** Metadata with the variables and custom expressions already added as fields. */
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
  /** Why saved variables or expressions are invalid for this simulation. */
  expressionErrors: Record<string, string>;
  /** Validates and adds an expression; resolves to an error message, or null. */
  onAddExpression: (text: string) => Promise<string | null>;
  onRemoveExpression: (expression: string) => void;
}

/** A row being named: a variable (renamed) or a custom expression (named). */
type Editing = { kind: "variable" | "expression"; key: string } | null;

/**
 * Every quantity a simulation offers, the session's named variables (shared
 * by all plots; `name = expression` defines one), and the plot's own custom
 * expressions, which can be given a name to become variables.
 */
const QuantityList = ({
  simulationId,
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
  const [editing, setEditing] = useState<Editing>(null);

  const custom = new Set(expressions);
  const dataFields = metadata.fields.filter((field) => !custom.has(field.name));
  // Variables are listed among the fields once checked; set them apart.
  const { uiState } = useUi();
  const variableNames = new Set(
    (uiState.fieldVariables ?? []).map((v) => v.name),
  );
  // What a variable can't be called: the data's own quantities.
  const taken = [
    ...dataFields
      .filter((field) => !variableNames.has(field.name))
      .map((field) => field.name),
    ...metadata.vectors.map((vector) => vector.name),
    ...Object.keys(metadata.coords),
  ];
  const actions = useVariables("fields", simulationId, taken);
  const variables = actions.variables;
  const fields = dataFields.filter(
    (field) => !variableNames.has(field.name) && isFieldAvailable(field),
  );
  const fieldOf = (name: string) =>
    metadata.fields.find((field) => field.name === name);
  const dimsOf = (name: string) => fieldOf(name)?.dims ?? [];
  // A variable this plot type can't show (e.g. 1D in a 2D plot).
  const unavailable = (name: string) => {
    const field = fieldOf(name);
    return field && !isFieldAvailable(field)
      ? `Not available here (${field.dims.join("·") || "no dims"})`
      : undefined;
  };

  const renderOption = (
    name: string,
    detail: string,
    extra?: { error?: string; title?: string; actions?: ReactNode },
  ) => (
    <li key={name} className={styles.item}>
      <label
        className={`${styles.option} ${extra?.error ? styles.invalid : ""}`}
        title={extra?.error ?? extra?.title}
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
      {extra?.actions}
    </li>
  );

  const removeButton = (label: string, onClick: () => void) => (
    <button
      type="button"
      className={styles.remove}
      aria-label={label}
      title="Remove"
      onClick={onClick}
    >
      ×
    </button>
  );

  const nameRow = (key: string, children: ReactNode) => (
    <li key={key} className={styles.item}>
      {children}
    </li>
  );

  const addExpression = async (text: string) => {
    const definition = parseDefinition(text);
    if (!definition) return onAddExpression(text);
    const problem = await actions.define(
      definition.name,
      definition.expression,
    );
    if (!problem && !selected.includes(definition.name)) {
      onToggle(definition.name);
    }
    return problem;
  };

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

      {variables.length > 0 && (
        <>
          <p className={styles.groupTitle}>variables (all plots)</p>
          <ul className={styles.list} aria-label="Variables">
            {variables.map((variable) =>
              editing?.kind === "variable" && editing.key === variable.name
                ? nameRow(
                    variable.name,
                    <InlineName
                      initial={variable.name}
                      label="Variable name"
                      maxLength={MAX_VARIABLE_NAME}
                      onSubmit={async (next) => {
                        const problem = await actions.rename(
                          variable.name,
                          next,
                        );
                        if (!problem) setEditing(null);
                        return problem;
                      }}
                      onCancel={() => setEditing(null)}
                    />,
                  )
                : renderOption(variable.name, `= ${variable.expression}`, {
                    error:
                      expressionErrors[variable.name] ??
                      unavailable(variable.name),
                    title: `${variable.name} = ${variable.expression}`,
                    actions: (
                      <>
                        <button
                          type="button"
                          className={styles.remove}
                          aria-label={`Rename ${variable.name}`}
                          title="Rename (updates every use)"
                          onClick={() =>
                            setEditing({
                              kind: "variable",
                              key: variable.name,
                            })
                          }
                        >
                          <TbPencil aria-hidden />
                        </button>
                        {removeButton(`Remove ${variable.name}`, () =>
                          actions.remove(variable.name),
                        )}
                      </>
                    ),
                  }),
            )}
          </ul>
        </>
      )}

      <p className={styles.groupTitle}>custom (this plot)</p>
      {expressions.length > 0 && (
        <ul className={styles.list}>
          {expressions.map((expression) =>
            editing?.kind === "expression" && editing.key === expression
              ? nameRow(
                  expression,
                  <InlineName
                    initial=""
                    label={`Name for ${expression}`}
                    placeholder="name, e.g. edotb"
                    maxLength={MAX_VARIABLE_NAME}
                    onSubmit={async (name) => {
                      const problem = await actions.nameExpression(
                        expression,
                        name,
                      );
                      if (!problem) setEditing(null);
                      return problem;
                    }}
                    onCancel={() => setEditing(null)}
                  />,
                )
              : renderOption(expression, dimsOf(expression).join("·"), {
                  error: expressionErrors[expression],
                  actions: (
                    <>
                      <button
                        type="button"
                        className={styles.remove}
                        aria-label={`Name ${expression}`}
                        title="Name it: a variable usable in every plot"
                        onClick={() =>
                          setEditing({ kind: "expression", key: expression })
                        }
                      >
                        <TbTag aria-hidden />
                      </button>
                      {removeButton(`Remove ${expression}`, () =>
                        onRemoveExpression(expression),
                      )}
                    </>
                  ),
                }),
          )}
        </ul>
      )}
      <ExpressionInput
        onAdd={addExpression}
        placeholder="e.g. sqrt(Ex**2 + Ey**2)  or  edotb = Ex*Bx + Ey*By"
        label="Custom quantity expression"
        hint="Combine fields, coordinates and variables with + − * / ** and numpy functions (sqrt, exp, log10, sin, arctan2, where, …). Write name = expression to define a variable for every plot."
      />
    </fieldset>
  );
};

export default QuantityList;

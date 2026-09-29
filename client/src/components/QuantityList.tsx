import { useId } from "react";
import { IFieldMetadata } from "../global";
import styles from "./QuantityList.module.css";

interface QuantityListProps {
  metadata: IFieldMetadata;
  /** Checkboxes pick any number of quantities, radios exactly one. */
  mode: "checkbox" | "radio";
  selected: string[];
  onToggle: (quantity: string) => void;
  /** Vectors (all components at once) only make sense for some plots. */
  showVectors: boolean;
  /** Fields that can't be shown by this plot type are hidden. */
  isFieldAvailable?: (field: IFieldMetadata["fields"][number]) => boolean;
}

/** Every quantity a simulation offers, with its components or dimensions. */
const QuantityList = ({
  metadata,
  mode,
  selected,
  onToggle,
  showVectors,
  isFieldAvailable = () => true,
}: QuantityListProps) => {
  const groupName = useId();
  const fields = metadata.fields.filter(isFieldAvailable);

  const renderOption = (name: string, detail: string) => (
    <li key={name}>
      <label className={styles.option}>
        <input
          type={mode}
          name={groupName}
          checked={selected.includes(name)}
          onChange={() => onToggle(name)}
        />
        <span className={styles.optionName}>{name}</span>
        <span className={styles.optionDetail}>{detail}</span>
      </label>
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
    </fieldset>
  );
};

export default QuantityList;

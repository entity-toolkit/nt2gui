import { useId } from "react";
import { IconType } from "react-icons";
import { TbAtom, TbCheck, TbWaveSine } from "react-icons/tb";
import { DataType } from "../state/schema";
import { PLOT_KINDS } from "./registry";
import { PickerContext, PlotKind } from "./types";
import styles from "./PlotPicker.module.css";

const DATA_TYPES: { label: string; dataType: DataType; Icon: IconType }[] = [
  { label: "fields", dataType: DataType.Fields, Icon: TbWaveSine },
  { label: "particles", dataType: DataType.Particles, Icon: TbAtom },
];

interface PlotPickerProps {
  /** The chosen data type, or None while it's still to be picked. */
  dataType: DataType;
  context: PickerContext;
  onDataType: (dataType: DataType) => void;
  onPlotKind: (kind: PlotKind) => void;
}

/**
 * What a new panel shows, in two steps on one screen: the data type, then
 * the plot kind below it. Once a data type is chosen its step stays visible
 * (dimmed) so it can be switched, or clicked again to go back.
 */
const PlotPicker = ({
  dataType,
  context,
  onDataType,
  onPlotKind,
}: PlotPickerProps) => {
  const dataHeading = useId();
  const kindHeading = useId();
  const chosen = dataType !== DataType.None;
  const kinds = PLOT_KINDS.filter((kind) => kind.dataType === dataType);

  return (
    <div className={styles.picker}>
      <section
        className={`${styles.step} ${chosen ? styles.done : ""}`}
        aria-labelledby={dataHeading}
      >
        <h3 id={dataHeading} className={styles.heading}>
          <span className={styles.number}>1</span>
          Data
        </h3>
        <div className={styles.dataTypes}>
          {DATA_TYPES.map(({ label, dataType: type, Icon }) => {
            const selected = type === dataType;
            return (
              <button
                key={type}
                type="button"
                className={styles.dataType}
                aria-pressed={selected}
                title={
                  selected
                    ? "Click to choose the data again"
                    : chosen
                      ? `Switch to ${label}`
                      : undefined
                }
                onClick={() => onDataType(selected ? DataType.None : type)}
              >
                <Icon aria-hidden="true" className={styles.icon} />
                {label}
                {selected && (
                  <TbCheck aria-hidden="true" className={styles.check} />
                )}
              </button>
            );
          })}
        </div>
      </section>

      {chosen && (
        <section
          key={dataType}
          className={`${styles.step} ${styles.enter}`}
          aria-labelledby={kindHeading}
        >
          <h3 id={kindHeading} className={styles.heading}>
            <span className={styles.number}>2</span>
            Plot type
          </h3>
          <div className={styles.kinds}>
            {kinds.map((kind) => {
              const reason = kind.unavailable?.(context) ?? null;
              const titleId = `${kindHeading}-${kind.id}`;
              return (
                <button
                  key={kind.id}
                  type="button"
                  className={styles.kind}
                  disabled={reason !== null}
                  title={reason ?? undefined}
                  aria-labelledby={titleId}
                  aria-describedby={`${titleId}-about`}
                  onClick={() => onPlotKind(kind)}
                >
                  <kind.Icon aria-hidden="true" className={styles.kindIcon} />
                  <span className={styles.kindText}>
                    <span id={titleId} className={styles.kindLabel}>
                      {kind.label}
                    </span>
                    <span id={`${titleId}-about`} className={styles.about}>
                      {reason ?? kind.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

export default PlotPicker;

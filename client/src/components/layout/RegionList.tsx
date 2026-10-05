import { formatValue } from "../../lib/format";
import { useRegions } from "../../plots/useRegions";
import {
  MAX_REGION_NAME,
  describeRegion,
  regionColor,
  regionNameProblem,
  withRenamedRegion,
} from "../../state/regions";
import { useUiActions } from "../../state/UiContext";
import EditableName from "../common/EditableName";
import styles from "./SimulationSidebar.module.css";

/**
 * The saved regions particle plots can filter by. Renaming or deleting one
 * updates every plot that uses it.
 */
const RegionList = () => {
  const { regions, remove } = useRegions();
  const { updateUiState } = useUiActions();
  const rename = (name: string, next: string) => {
    const problem = regionNameProblem(regions, name, next);
    if (problem) throw new Error(problem);
    updateUiState((state) => withRenamedRegion(state, name, next));
  };
  return (
    <section className={styles.regions} aria-label="Regions">
      <h3 className={styles.sectionTitle}>Regions</h3>
      {regions.length ? (
        <ul className={styles.regionList}>
          {regions.map((region) => (
            <li key={region.name} className={styles.region}>
              <span
                className={styles.regionSwatch}
                style={{ background: regionColor(region) }}
                aria-hidden="true"
              />
              <div className={styles.cardTitle}>
                <EditableName
                  name={region.name}
                  onRename={(next) => rename(region.name, next)}
                  inputLabel="Region name"
                  maxLength={MAX_REGION_NAME}
                  nameClassName={styles.cardName}
                />
                <span className={styles.detail}>
                  {describeRegion(region, formatValue)}
                </span>
              </div>
              <button
                type="button"
                className={styles.unload}
                aria-label={`Delete ${region.name}`}
                title={`Delete ${region.name}`}
                onClick={() => remove(region.name)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          Use “Select region” on a plot with a spatial axis to save one;
          particle plots can then show only the particles inside.
        </p>
      )}
    </section>
  );
};

export default RegionList;

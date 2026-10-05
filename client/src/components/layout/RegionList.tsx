import { formatValue } from "../../lib/format";
import { useRegions } from "../../plots/useRegions";
import { describeRegion, regionColor } from "../../state/regions";
import styles from "./SimulationSidebar.module.css";

/** The saved regions particle plots can filter by; deleting one unselects it everywhere. */
const RegionList = () => {
  const { regions, remove } = useRegions();
  return (
    <section className={styles.regions} aria-label="Regions">
      <h3 className={styles.sectionTitle}>Regions</h3>
      {regions.length ? (
        <ul className={styles.regionList}>
          {regions.map((region) => (
            <li key={region.name} className={styles.region}>
              <span
                className={styles.regionSwatch}
                style={{ background: regionColor(region.name) }}
                aria-hidden="true"
              />
              <div className={styles.cardTitle}>
                <span className={styles.cardName}>{region.name}</span>
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

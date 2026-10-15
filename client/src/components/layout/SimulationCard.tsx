import { ReactNode, useState } from "react";
import { TbListDetails, TbRefresh } from "react-icons/tb";
import { serverErrorMessage } from "../../api/http";
import { IGridSummary } from "../../api/types";
import EditableName from "../common/EditableName";
import { useSimulationSummary } from "../../hooks/useSimulationSummary";
import { ISimulation } from "../../state/schema";
import {
  formatAxes,
  formatCount,
  formatMass,
  formatNumber,
  formatResolution,
  formatTimes,
} from "../../lib/format";
import { simulationName } from "../../lib/simulations";
import AttributesModal from "./AttributesModal";
import styles from "./SimulationSidebar.module.css";

interface SimulationCardProps {
  simulation: ISimulation;
  onUnload: (id: string) => void;
  /** Rejects (with the server's reason) if the name can't be used. */
  onRename: (id: string, name: string) => Promise<void>;
  /** Re-reads the simulation from disk; rejects with the server's reason. */
  onReload: (id: string) => Promise<void>;
}

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className={styles.section}>
    <h4 className={styles.sectionTitle}>{title}</h4>
    {children}
  </section>
);

const Quantities = ({ names }: { names: string[] }) => (
  <ul className={styles.quantities} aria-label="quantities">
    {names.map((name) => (
      <li key={name}>{name}</li>
    ))}
  </ul>
);

const GridSection = ({
  title,
  grid,
}: {
  title: string;
  grid: IGridSummary;
}) => (
  <Section title={`${title} · ${formatResolution(grid.axes)}`}>
    {formatAxes(grid.axes).map((line) => (
      <p key={line} className={styles.detail}>
        {line}
      </p>
    ))}
    <p className={styles.detail}>{formatTimes(grid.times)}</p>
    <Quantities names={grid.quantities} />
  </Section>
);

/**
 * One loaded simulation and an overview of its fields, particles and
 * spectra; its name can be edited in place.
 */
const SimulationCard = ({
  simulation,
  onUnload,
  onRename,
  onReload,
}: SimulationCardProps) => {
  const { data: summary, error } = useSimulationSummary(simulation.id);
  const name = simulationName(simulation);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [showAttributes, setShowAttributes] = useState(false);

  const reload = async () => {
    setReloading(true);
    setReloadError(null);
    try {
      await onReload(simulation.id);
    } catch (err) {
      setReloadError(serverErrorMessage(err));
    } finally {
      setReloading(false);
    }
  };

  return (
    <li className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitle}>
          <EditableName
            name={name}
            onRename={(next) => onRename(simulation.id, next)}
            inputLabel="Simulation name"
            maxLength={100}
            nameClassName={styles.cardName}
          />
          <span className={styles.cardPath} title={simulation.path}>
            {simulation.path}
          </span>
        </div>
        <button
          type="button"
          className={styles.cardAction}
          aria-label={`Attributes of ${name}`}
          title="Attributes"
          onClick={() => setShowAttributes(true)}
        >
          <TbListDetails aria-hidden />
        </button>
        <button
          type="button"
          className={`${styles.cardAction} ${reloading ? styles.spinning : ""}`}
          aria-label={`Reload ${name}`}
          title="Reload from disk (new outputs)"
          disabled={reloading}
          onClick={() => void reload()}
        >
          <TbRefresh aria-hidden />
        </button>
        <button
          type="button"
          className={styles.unload}
          aria-label={`Unload ${simulation.path}`}
          title="Unload"
          onClick={() => onUnload(simulation.id)}
        >
          ×
        </button>
      </div>

      {reloadError && (
        <p className={styles.error} role="alert">
          {reloadError}
        </p>
      )}
      {showAttributes && (
        <AttributesModal
          simulationId={simulation.id}
          name={name}
          onClose={() => setShowAttributes(false)}
        />
      )}
      {error ? (
        <p className={styles.error}>{error}</p>
      ) : !summary ? (
        <p className={styles.detail}>Reading contents…</p>
      ) : (
        <>
          {summary.fields && (
            <GridSection title="Fields" grid={summary.fields} />
          )}
          {summary.particles && (
            <Section
              title={`Particles · ${summary.particles.species.length} species`}
            >
              <ul className={styles.species}>
                {summary.particles.species.map((species) => (
                  <li key={species.index}>
                    <span className={styles.speciesLabel}>{species.label}</span>
                    <span className={styles.detail}>
                      #{species.index} · {formatMass(species.mass)} ·{" "}
                      {formatCount(species.count)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className={styles.detail}>
                counts at t = {formatNumber(summary.particles.countsAt)}
              </p>
              <p className={styles.detail}>
                {formatTimes(summary.particles.times)}
              </p>
              <Quantities names={summary.particles.quantities} />
            </Section>
          )}
          {summary.spectra && (
            <GridSection title="Spectra" grid={summary.spectra} />
          )}
          {!summary.fields && !summary.particles && !summary.spectra && (
            <p className={styles.detail}>No outputs found.</p>
          )}
        </>
      )}
    </li>
  );
};

export default SimulationCard;

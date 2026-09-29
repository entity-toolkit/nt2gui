import { ReactNode } from "react";
import { IGridSummary, ISimulation } from "../global";
import { useSimulationSummary } from "../hooks/useSimulationSummary";
import {
  formatAxes,
  formatCount,
  formatMass,
  formatNumber,
  formatResolution,
  formatTimes,
} from "../summaryFormat";
import styles from "./SimulationSidebar.module.css";

interface SimulationCardProps {
  simulation: ISimulation;
  onUnload: (id: string) => void;
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

/** One loaded simulation and an overview of its fields, particles and spectra. */
const SimulationCard = ({ simulation, onUnload }: SimulationCardProps) => {
  const { summary, error } = useSimulationSummary(simulation.id);
  const name =
    simulation.path.split("/").filter(Boolean).pop() ?? simulation.path;

  return (
    <li className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitle}>
          <span className={styles.cardName}>{name}</span>
          <span className={styles.cardPath} title={simulation.path}>
            {simulation.path}
          </span>
        </div>
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

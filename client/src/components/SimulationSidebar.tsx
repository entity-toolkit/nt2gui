import { FormEvent, useState } from "react";
import { ISimulation } from "../global";
import SimulationCard from "./SimulationCard";
import styles from "./SimulationSidebar.module.css";

interface SimulationSidebarProps {
  simulations: ISimulation[];
  isLoading: boolean;
  onAddSimulation: (path: string) => Promise<void>;
  onUnloadSimulation: (id: string) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

/** Collapsible left panel: load simulations and see what each contains. */
const SimulationSidebar = ({
  simulations,
  isLoading,
  onAddSimulation,
  onUnloadSimulation,
  collapsed,
  onCollapsedChange,
}: SimulationSidebarProps) => {
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (collapsed) {
    return (
      <aside
        className={`${styles.sidebar} ${styles.collapsed}`}
        aria-label="Simulations"
      >
        <button
          type="button"
          className={styles.toggle}
          aria-label="Show simulations"
          aria-expanded={false}
          title="Show simulations"
          onClick={() => onCollapsedChange(false)}
        >
          ›
        </button>
        <span className={styles.collapsedLabel}>
          Simulations{simulations.length ? ` (${simulations.length})` : ""}
        </span>
      </aside>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = path.trim();
    if (!trimmed) return;
    setError(null);
    try {
      await onAddSimulation(trimmed);
      setPath("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load simulation",
      );
    }
  };

  return (
    <aside className={styles.sidebar} aria-label="Simulations">
      <div className={styles.header}>
        <h2 className={styles.title}>Simulations</h2>
        <button
          type="button"
          className={styles.toggle}
          aria-label="Hide simulations"
          aria-expanded={true}
          title="Hide simulations"
          onClick={() => onCollapsedChange(true)}
        >
          ‹
        </button>
      </div>

      <form className={styles.addForm} onSubmit={submit}>
        <input
          type="text"
          value={path}
          onChange={(event) => {
            setPath(event.target.value);
            setError(null);
          }}
          placeholder="Entity output directory"
          aria-label="Simulation path"
          spellCheck={false}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !path.trim()}>
          {isLoading ? "loading…" : "load"}
        </button>
      </form>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        <p className={styles.hint}>
          A path on the server machine, or <code>demo:run</code> for sample
          data.
        </p>
      )}

      {simulations.length ? (
        <ul className={styles.cards}>
          {simulations.map((simulation) => (
            <SimulationCard
              key={simulation.id}
              simulation={simulation}
              onUnload={onUnloadSimulation}
            />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No simulations loaded yet.</p>
      )}
    </aside>
  );
};

export default SimulationSidebar;

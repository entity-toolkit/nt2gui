import { FormEvent, useId, useState } from "react";
import { serverErrorMessage } from "../../api/http";
import { checkTransforms, fetchTimeline } from "../../api/simulations";
import { ITransformCheck } from "../../api/types";
import { formatRange } from "../../lib/format";
import { simulationName } from "../../lib/simulations";
import {
  TIME,
  TRANSFORMABLE,
  Transforms,
  cleanTransforms,
  timeChanged,
  withTransforms,
} from "../../state/transforms";
import { useUi, useUiActions } from "../../state/UiContext";
import styles from "./TransformEditor.module.css";

const sameTransforms = (a: Transforms, b: Transforms) =>
  JSON.stringify(cleanTransforms(a)) === JSON.stringify(cleanTransforms(b));

/**
 * Session-wide coordinate transforms: an expression per coordinate (and
 * time) in that coordinate, the original `t` and the run's attributes,
 * applied to every simulation. Edits are checked against each loaded
 * simulation before they apply.
 */
const TransformEditor = () => {
  const { uiState, simulations } = useUi();
  const { updateUiState } = useUiActions();
  const saved = uiState.coordinateTransforms ?? {};
  const [draft, setDraft] = useState<Transforms>(saved);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Coordinate -> problem (named by simulation when several are loaded).
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [ranges, setRanges] = useState<ITransformCheck["ranges"]>({});
  const addId = useId();
  const dirty = !sameTransforms(draft, saved);

  // Follow the session's transforms (another tab, a loaded file) unless
  // they were being edited.
  const savedKey = JSON.stringify(saved);
  const [base, setBase] = useState(savedKey);
  if (savedKey !== base) {
    setBase(savedKey);
    if (sameTransforms(draft, JSON.parse(base))) setDraft(saved);
  }

  const used = TRANSFORMABLE.filter((name) => name in draft);
  const free = TRANSFORMABLE.filter((name) => !(name in draft));

  const apply = async (event: FormEvent) => {
    event.preventDefault();
    const next = cleanTransforms(draft);
    setBusy(true);
    setError(null);
    try {
      const checks = await Promise.all(
        simulations.map((simulation) =>
          checkTransforms(simulation.id, next).then((check) => ({
            simulation,
            check,
          })),
        ),
      );
      const found: Record<string, string> = {};
      for (const { simulation, check } of checks) {
        for (const [name, message] of Object.entries(check.errors)) {
          found[name] ??=
            simulations.length > 1
              ? `${simulationName(simulation)}: ${message}`
              : message;
        }
      }
      setProblems(found);
      setRanges(checks[0]?.check.ranges ?? {});
      if (Object.keys(found).length) return;
      // The timeline follows the last loaded simulation (as when loading).
      const reference = simulations[simulations.length - 1];
      const timeline =
        reference && timeChanged(saved, next)
          ? await fetchTimeline(reference.id, next, {
              transforms: saved,
              time: uiState.timeline.current,
            })
          : undefined;
      updateUiState((prev) => withTransforms(prev, next, timeline));
      setDraft(next);
    } catch (err) {
      setError(serverErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const describe = (name: string) => {
    const range = ranges[name];
    return range
      ? `${formatRange(...range.from)} → ${formatRange(...range.to)}`
      : null;
  };

  return (
    <section className={styles.section} aria-label="Coordinate transforms">
      <h3 className={styles.title}>Coordinates</h3>
      <form className={styles.form} onSubmit={apply}>
        {used.length > 0 && (
          <ul className={styles.list}>
            {used.map((name) => (
              <li key={name} className={styles.row}>
                <div className={styles.line}>
                  <label className={styles.name} htmlFor={`${addId}-${name}`}>
                    {name}′ =
                  </label>
                  <input
                    id={`${addId}-${name}`}
                    className={problems[name] ? styles.invalid : undefined}
                    value={draft[name]}
                    spellCheck={false}
                    placeholder={name}
                    aria-label={`Transform of ${name}`}
                    onChange={(event) => {
                      setDraft({ ...draft, [name]: event.target.value });
                      setProblems(({ [name]: _gone, ...rest }) => rest);
                    }}
                  />
                  <button
                    type="button"
                    className={styles.remove}
                    aria-label={`Remove the transform of ${name}`}
                    title="Remove"
                    onClick={() => {
                      const { [name]: _gone, ...rest } = draft;
                      setDraft(rest);
                    }}
                  >
                    ×
                  </button>
                </div>
                {problems[name] ? (
                  <span className={styles.error} role="alert">
                    {problems[name]}
                  </span>
                ) : (
                  !dirty &&
                  describe(name) && (
                    <span className={styles.detail}>{describe(name)}</span>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
        <div className={styles.actions}>
          {free.length > 0 && (
            <>
              <select
                aria-label="Coordinate to transform"
                value={adding || free[0]}
                onChange={(event) => setAdding(event.target.value)}
              >
                {free.map((name) => (
                  <option key={name} value={name}>
                    {name === TIME ? "t (time)" : name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const name = free.includes(adding) ? adding : free[0];
                  setDraft({ ...draft, [name]: name });
                  setAdding("");
                }}
              >
                + transform
              </button>
            </>
          )}
          <span className={styles.spacer} />
          {dirty && (
            <button type="button" onClick={() => setDraft(saved)}>
              revert
            </button>
          )}
          <button
            type="submit"
            className={styles.primary}
            disabled={!dirty || busy}
          >
            {busy ? "checking…" : "apply"}
          </button>
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <p className={styles.detail}>
          For every simulation: field grids, particle positions and time. Use
          the coordinate, the original <code>t</code> and run attributes, e.g.{" "}
          <code>(x - grid.extent[0]) / setup.skin</code>, <code>x - 0.5*t</code>
          , <code>t * setup.omega</code>. Changing positions resets zooms; saved
          regions keep their numbers.
        </p>
      </form>
    </section>
  );
};

export default TransformEditor;

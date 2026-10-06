import {
  FormEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { TbChevronDown, TbTemplate, TbTrash } from "react-icons/tb";
import { serverErrorMessage } from "../../api/http";
import { useDismiss } from "../../hooks/useDismiss";
import { useTemplates } from "../../hooks/useTemplates";
import { simulationName } from "../../lib/simulations";
import { PlotType } from "../../state/schema";
import { useUi } from "../../state/UiContext";
import EditableName from "../common/EditableName";
import styles from "./TemplateMenu.module.css";

// Matches `MAX_TEMPLATE_NAME` in nt2gui/session/templates.py.
const MAX_TEMPLATE_NAME = 64;

/** An action on one template waiting for a second click. */
type Confirming = { name: string; action: "apply" | "delete" } | null;

const savedDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : null;

/**
 * "Templates": save the current panels (layout and plots, without the
 * simulation, times or zoom) under a name, and apply, rename or delete saved
 * ones. Applying replaces every panel and points them at the chosen
 * simulation.
 */
const TemplateMenu = () => {
  const { uiState, simulations } = useUi();
  const { templates, loadError, refresh, save, rename, remove, apply } =
    useTemplates();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const nameId = useId();
  const targetSelectId = useId();
  const [name, setName] = useState("");
  // A taken name the user may choose to replace.
  const [existing, setExisting] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setConfirming(null);
    setExisting(null);
    setError(null);
    setNotice(null);
  }, []);
  useDismiss(ref, open, close);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  // The simulation the panels will show: the chosen one while it's loaded.
  const applyTarget = simulations.some((s) => s.id === target)
    ? target
    : (simulations[0]?.id ?? null);
  const hasPlots = Object.values(uiState.plotters).some(
    (plotter) => plotter.plotType !== PlotType.None,
  );

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (done) setNotice(done);
      return true;
    } catch (err) {
      setError(serverErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent, overwrite = false) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    void run(async () => {
      const result = await save(trimmed, overwrite);
      if (result === "exists") {
        setExisting(trimmed);
        return;
      }
      setExisting(null);
      setName("");
      setNotice(`Saved “${trimmed}”.`);
    });
  };

  const applyNow = (template: string) =>
    void run(async () => {
      await apply(template, applyTarget);
      close();
    });

  return (
    <div className={styles.menu} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Save the panels as a template, or apply one"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <TbTemplate aria-hidden />
        Templates
        <TbChevronDown aria-hidden className={styles.caret} />
      </button>

      {open && (
        <div className={styles.popover} role="dialog" aria-label="Templates">
          <form className={styles.save} onSubmit={(event) => submit(event)}>
            <label htmlFor={nameId} className={styles.label}>
              Save current panels as
            </label>
            <div className={styles.saveRow}>
              <input
                id={nameId}
                type="text"
                value={name}
                maxLength={MAX_TEMPLATE_NAME}
                placeholder="Template name"
                spellCheck={false}
                autoFocus
                onChange={(event) => {
                  setName(event.target.value);
                  setExisting(null);
                  setError(null);
                }}
              />
              <button type="submit" disabled={busy || !name.trim()}>
                Save
              </button>
            </div>
            {existing ? (
              <div className={styles.confirm} role="alert">
                <span>“{existing}” already exists.</span>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={(event) => submit(event, true)}
                >
                  Replace
                </button>
                <button type="button" onClick={() => setExisting(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <p className={styles.hint}>
                Keeps the layout and each panel’s plot settings and value limits
                — not the simulation, times, zoom, slices or regions.
              </p>
            )}
          </form>

          <div className={styles.listHeader}>
            <span className={styles.label}>Saved templates</span>
            {simulations.length > 1 ? (
              <label className={styles.target} htmlFor={targetSelectId}>
                apply to
                <select
                  id={targetSelectId}
                  value={applyTarget ?? ""}
                  onChange={(event) => setTarget(event.target.value)}
                >
                  {simulations.map((simulation) => (
                    <option key={simulation.id} value={simulation.id}>
                      {simulationName(simulation)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className={styles.hint}>
                {simulations.length
                  ? `apply to ${simulationName(simulations[0])}`
                  : "no simulation loaded"}
              </span>
            )}
          </div>

          {loadError ? (
            <p className={styles.error}>{loadError}</p>
          ) : !templates ? (
            <p className={styles.hint}>Loading…</p>
          ) : !templates.length ? (
            <p className={styles.hint}>
              No templates yet. Arrange some panels, then save them above.
            </p>
          ) : (
            <ul className={styles.list} aria-label="Saved templates">
              {templates.map((template) => {
                const pending =
                  confirming?.name === template.name ? confirming.action : null;
                return (
                  <li key={template.name} className={styles.item}>
                    <div className={styles.itemText}>
                      <EditableName
                        name={template.name}
                        onRename={(next) => rename(template.name, next)}
                        inputLabel="Template name"
                        maxLength={MAX_TEMPLATE_NAME}
                        nameClassName={styles.itemName}
                      />
                      <span className={styles.hint}>
                        {template.panels} plot
                        {template.panels === 1 ? "" : "s"}
                        {savedDate(template.savedAt)
                          ? ` · saved ${savedDate(template.savedAt)}`
                          : ""}
                      </span>
                    </div>
                    {pending ? (
                      <div className={styles.confirm}>
                        <span>
                          {pending === "apply"
                            ? "Replace the current panels?"
                            : "Delete this template?"}
                        </span>
                        <button
                          type="button"
                          className={
                            pending === "delete"
                              ? styles.danger
                              : styles.primary
                          }
                          disabled={busy}
                          onClick={() => {
                            setConfirming(null);
                            if (pending === "apply") applyNow(template.name);
                            else void run(() => remove(template.name));
                          }}
                        >
                          {pending === "apply" ? "Apply" : "Delete"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className={styles.itemActions}>
                        <button
                          type="button"
                          className={styles.primary}
                          disabled={busy}
                          aria-label={`Apply ${template.name}`}
                          title="Replace the panels with this template's"
                          onClick={() =>
                            hasPlots
                              ? setConfirming({
                                  name: template.name,
                                  action: "apply",
                                })
                              : applyNow(template.name)
                          }
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          disabled={busy}
                          aria-label={`Delete ${template.name}`}
                          title="Delete"
                          onClick={() =>
                            setConfirming({
                              name: template.name,
                              action: "delete",
                            })
                          }
                        >
                          <TbTrash aria-hidden />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default TemplateMenu;

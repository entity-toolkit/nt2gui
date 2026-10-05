import { KeyboardEvent, useRef, useState } from "react";
import { serverErrorMessage } from "../../api/http";
import styles from "./EditableName.module.css";

interface EditableNameProps {
  name: string;
  /** Saves a new (trimmed, changed) name; rejects or throws with why it can't. */
  onRename: (name: string) => Promise<void> | void;
  /** Accessible name of the text box, e.g. "Simulation name". */
  inputLabel: string;
  maxLength?: number;
  /** Style of the name when not editing. */
  nameClassName?: string;
}

/**
 * A name with a ✎ button (or double-click) to edit it in place: Enter or
 * leaving the box saves, Escape cancels. A refused name keeps the box open
 * with the reason below it.
 */
const EditableName = ({
  name,
  onRename,
  inputLabel,
  maxLength,
  nameClassName,
}: EditableNameProps) => {
  // The name being typed, while editing.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Enter saves, and the box then loses focus: save once.
  const saving = useRef(false);

  const stop = () => {
    setDraft(null);
    setError(null);
  };

  const commit = async () => {
    if (draft === null || saving.current) return;
    const next = draft.trim();
    if (!next || next === name) return stop();
    saving.current = true;
    try {
      await onRename(next);
      stop();
    } catch (err) {
      setError(serverErrorMessage(err));
    } finally {
      saving.current = false;
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") void commit();
    if (event.key === "Escape") stop();
  };

  return (
    <>
      {draft === null ? (
        <span className={styles.row}>
          <span className={nameClassName} onDoubleClick={() => setDraft(name)}>
            {name}
          </span>
          <button
            type="button"
            className={styles.rename}
            aria-label={`Rename ${name}`}
            title="Rename"
            onClick={() => setDraft(name)}
          >
            ✎
          </button>
        </span>
      ) : (
        <input
          className={styles.input}
          aria-label={inputLabel}
          value={draft}
          maxLength={maxLength}
          autoFocus
          spellCheck={false}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => void commit()}
        />
      )}
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </>
  );
};

export default EditableName;

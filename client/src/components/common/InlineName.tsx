import { KeyboardEvent, useRef, useState } from "react";
import { serverErrorMessage } from "../../api/http";
import styles from "./InlineName.module.css";

interface InlineNameProps {
  initial: string;
  /** Accessible name of the box, e.g. "Variable name". */
  label: string;
  placeholder?: string;
  maxLength?: number;
  /** Saves the trimmed name; resolves to why it can't be used, or null. */
  onSubmit: (name: string) => Promise<string | null>;
  onCancel: () => void;
}

/**
 * A name box that replaces a list row while (re)naming it: Enter saves,
 * Escape or leaving the box cancels; a refused name shows why.
 */
const InlineName = ({
  initial,
  label,
  placeholder,
  maxLength,
  onSubmit,
  onCancel,
}: InlineNameProps) => {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const submit = async () => {
    if (busy.current) return;
    const name = draft.trim();
    if (!name || name === initial) return onCancel();
    busy.current = true;
    try {
      const problem = await onSubmit(name);
      if (problem) setError(problem);
    } catch (err) {
      setError(serverErrorMessage(err));
    } finally {
      busy.current = false;
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className={styles.inline}>
      <input
        aria-label={label}
        value={draft}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus
        spellCheck={false}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => !busy.current && !error && onCancel()}
      />
      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : (
        <span className={styles.hint}>Enter to save, Esc to cancel</span>
      )}
    </div>
  );
};

export default InlineName;

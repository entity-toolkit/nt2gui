import { FormEvent, ReactNode, useState } from "react";
import styles from "./ExpressionInput.module.css";

interface ExpressionInputProps {
  /** Validates and adds an expression; resolves to an error message, or null. */
  onAdd: (text: string) => Promise<string | null>;
  placeholder: string;
  label: string;
  hint: ReactNode;
}

/** A text box for adding a custom quantity, showing why one was rejected. */
const ExpressionInput = ({
  onAdd,
  placeholder,
  label,
  hint,
}: ExpressionInputProps) => {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    const problem = await onAdd(draft);
    setBusy(false);
    setError(problem);
    if (!problem) setDraft("");
  };

  return (
    <>
      <form className={styles.form} onSubmit={submit}>
        <input
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          placeholder={placeholder}
          aria-label={label}
          spellCheck={false}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !draft.trim()}>
          add
        </button>
      </form>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        <p className={styles.hint}>{hint}</p>
      )}
    </>
  );
};

export default ExpressionInput;

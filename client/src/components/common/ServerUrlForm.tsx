import { FormEvent, useId, useState } from "react";
import { getServerUrl, normalizeServerUrl, setServerUrl } from "../../config";
import { modalStyles } from "./Modal";
import styles from "./ServerUrlForm.module.css";

/**
 * Which nt2gui server this UI talks to. Saving reloads the page, so caches
 * and the session from the previous server are dropped.
 */
const ServerUrlForm = () => {
  const id = useId();
  const current = getServerUrl();
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState<string | null>(null);

  const apply = (url: string) => {
    setServerUrl(url);
    window.location.reload();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      apply(normalizeServerUrl(draft));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor={id} className={modalStyles.status}>
        Server URL — empty to use the server that served this page
        {current ? "" : " (current)"}
      </label>
      <div className={modalStyles.row}>
        <input
          id={id}
          className={modalStyles.input}
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          placeholder="http://localhost:8765"
          spellCheck={false}
        />
        <button
          type="submit"
          className={`${modalStyles.button} ${modalStyles.primary}`}
        >
          connect
        </button>
        {current && (
          <button
            type="button"
            className={`${modalStyles.button} ${modalStyles.secondary}`}
            onClick={() => apply("")}
          >
            reset
          </button>
        )}
      </div>
      {error && (
        <p className={modalStyles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
};

export default ServerUrlForm;

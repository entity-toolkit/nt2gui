import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ISessionCommandResult } from "../global";
import { useSessionFiles } from "../hooks/useSessionFiles";
import { FileExistsError, serverErrorMessage } from "../services/sessionService";
import { defaultServerSessionPath } from "../sessionFile";
import menuStyles from "./Menubar.module.css";
import styles from "./SessionDialog.module.css";

export type SessionDialogMode = "save" | "load";

interface SessionDialogProps {
  mode: SessionDialogMode;
  sessionFiles: ReturnType<typeof useSessionFiles>;
  onClose: () => void;
}

type Message = { kind: "success" | "error"; text: string; warnings?: string[] };

const SessionDialog = ({ mode, sessionFiles, onClose }: SessionDialogProps) => {
  const isSave = mode === "save";
  const [serverPath, setServerPath] = useState(() =>
    isSave
      ? defaultServerSessionPath(new Date())
      : (sessionFiles.lastServerPath ?? ""),
  );
  const [overwritePath, setOverwritePath] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { isBusy } = sessionFiles;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const reportLoaded = (result: ISessionCommandResult, source: string) =>
    setMessage({
      kind: "success",
      text: `Loaded session from ${source}`,
      warnings: result.warnings?.length ? result.warnings : undefined,
    });

  const reportError = (error: unknown) =>
    setMessage({ kind: "error", text: serverErrorMessage(error) });

  const saveOnServer = async (overwrite: boolean) => {
    setMessage(null);
    setOverwritePath(null);
    try {
      const result = await sessionFiles.saveOnServer(serverPath, overwrite);
      setMessage({ kind: "success", text: `Saved on the server to ${result.path}` });
    } catch (error) {
      if (error instanceof FileExistsError) {
        setOverwritePath(error.path);
      } else {
        reportError(error);
      }
    }
  };

  const handleServerSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!serverPath.trim()) return;
    if (isSave) {
      await saveOnServer(false);
      return;
    }
    setMessage(null);
    try {
      const result = await sessionFiles.loadFromServer(serverPath);
      reportLoaded(result, result.path ?? serverPath);
    } catch (error) {
      reportError(error);
    }
  };

  const handleSaveLocally = async () => {
    setMessage(null);
    try {
      if (await sessionFiles.saveLocally()) {
        setMessage({ kind: "success", text: "Session file saved to this computer" });
      }
    } catch (error) {
      reportError(error);
    }
  };

  const handleLocalFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so picking the same file again still triggers a change.
    event.target.value = "";
    if (!file) return;
    setMessage(null);
    try {
      reportLoaded(await sessionFiles.loadLocalFile(file), file.name);
    } catch (error) {
      reportError(error);
    }
  };

  const title = isSave ? "Save state" : "Load state";

  return createPortal(
    <div className={menuStyles.overlay} role="presentation" onClick={onClose}>
      <div
        className={menuStyles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={menuStyles.modalHeader}>
          <h2 id="session-dialog-title" className={menuStyles.modalTitle}>
            {title}
          </h2>
          <button
            type="button"
            className={menuStyles.closeButton}
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {!isSave && (
          <p className={styles.note}>
            Loading replaces the current layout, plots and loaded simulations.
          </p>
        )}

        <section className={styles.option} aria-labelledby="session-server">
          <h3 id="session-server" className={styles.optionTitle}>
            {isSave ? "On the server" : "From the server"}
          </h3>
          <p className={styles.optionHint}>
            A file on the machine running the server, where the simulation data
            lives. Relative paths start in the server's working directory; ~ is
            expanded.
          </p>
          <form className={menuStyles.addSimulation} onSubmit={handleServerSubmit}>
            <input
              type="text"
              className={menuStyles.pathInput}
              value={serverPath}
              onChange={(event) => {
                setServerPath(event.target.value);
                setOverwritePath(null);
              }}
              placeholder="/path/on/server/session.json"
              aria-label="Session file path on the server"
              disabled={isBusy}
              autoFocus
              required
            />
            <button
              type="submit"
              className={`${menuStyles.modalButton} ${menuStyles.modalButtonPrimary}`}
              disabled={isBusy || !serverPath.trim()}
            >
              {isSave ? "save" : "load"}
            </button>
          </form>
          {overwritePath && (
            <div className={styles.confirm} role="alert">
              <span>{overwritePath} already exists.</span>
              <button
                type="button"
                className={`${menuStyles.modalButton} ${menuStyles.modalButtonSecondary}`}
                onClick={() => saveOnServer(true)}
                disabled={isBusy}
              >
                overwrite
              </button>
            </div>
          )}
        </section>

        <section className={styles.option} aria-labelledby="session-local">
          <h3 id="session-local" className={styles.optionTitle}>
            {isSave ? "On this computer" : "From this computer"}
          </h3>
          <p className={styles.optionHint}>
            {isSave
              ? "Download a session file through the browser."
              : "Open a session file previously saved to this computer."}
          </p>
          {isSave ? (
            <button
              type="button"
              className={`${menuStyles.modalButton} ${menuStyles.modalButtonSecondary}`}
              onClick={handleSaveLocally}
              disabled={isBusy}
            >
              save file…
            </button>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className={styles.hiddenInput}
                onChange={handleLocalFile}
              />
              <button
                type="button"
                className={`${menuStyles.modalButton} ${menuStyles.modalButtonSecondary}`}
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
              >
                open file…
              </button>
            </>
          )}
        </section>

        <div className={menuStyles.status} aria-live="polite">
          {isBusy && <span>working…</span>}
          {message && (
            <div
              className={message.kind === "error" ? menuStyles.error : styles.success}
            >
              <p className={styles.messageText}>{message.text}</p>
              {message.warnings && (
                <ul className={styles.warnings}>
                  {message.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SessionDialog;

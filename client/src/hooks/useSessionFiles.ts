import { useCallback, useState } from "react";
import {
  exportSession,
  importSession,
  loadSessionFromServer,
  saveSessionOnServer,
} from "../api/session";
import { ISessionCommandResult } from "../api/types";
import {
  parseSessionFile,
  saveSessionLocally,
  sessionFileName,
} from "../lib/sessionFile";
import { useUiActions } from "../state/UiContext";

/**
 * Save/load of whole sessions, either as files on the server machine (next to
 * the simulation data) or as files on the user's own machine via the browser.
 * Loading replaces the current session; the result is adopted through the
 * regular state sync so every tab converges on it.
 */
export const useSessionFiles = () => {
  const { runServerCommand, flushState } = useUiActions();
  const [isBusy, setIsBusy] = useState(false);
  // Remembered so "Load" can offer the file that was just saved.
  const [lastServerPath, setLastServerPath] = useState<string | null>(null);

  const track = useCallback(async <T>(task: () => Promise<T>) => {
    setIsBusy(true);
    try {
      return await task();
    } finally {
      setIsBusy(false);
    }
  }, []);

  const rememberPath = useCallback((result: ISessionCommandResult) => {
    if (result.path) setLastServerPath(result.path);
    return result;
  }, []);

  const saveOnServer = useCallback(
    (path: string, overwrite = false) =>
      track(() =>
        runServerCommand(() => saveSessionOnServer(path, overwrite)).then(
          rememberPath,
        ),
      ),
    [rememberPath, runServerCommand, track],
  );

  const loadFromServer = useCallback(
    (path: string) =>
      track(() =>
        runServerCommand(() => loadSessionFromServer(path)).then(rememberPath),
      ),
    [rememberPath, runServerCommand, track],
  );

  /** Resolves to false if the user cancelled the save dialog. */
  const saveLocally = useCallback(
    () =>
      track(async () => {
        await flushState();
        const document = await exportSession();
        return saveSessionLocally(document, sessionFileName(new Date()));
      }),
    [flushState, track],
  );

  const loadLocalFile = useCallback(
    (file: File) =>
      track(async () => {
        const document = parseSessionFile(await file.text());
        return runServerCommand(() => importSession(document));
      }),
    [runServerCommand, track],
  );

  return {
    isBusy,
    lastServerPath,
    saveOnServer,
    loadFromServer,
    saveLocally,
    loadLocalFile,
  };
};

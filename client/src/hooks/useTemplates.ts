import { useCallback, useState } from "react";
import { HttpError, serverErrorMessage } from "../api/http";
import {
  applyTemplate,
  fetchTemplates,
  removeTemplate,
  renameTemplate,
  saveTemplate,
} from "../api/templates";
import { ITemplateSummary } from "../api/types";
import { useUiActions } from "../state/UiContext";

/**
 * The saved templates (loaded on `refresh`) and what can be done with them.
 * Changes resolve once the server has them; failures reject with its reason.
 */
export const useTemplates = () => {
  const { runServerCommand, flushState } = useUiActions();
  const [templates, setTemplates] = useState<ITemplateSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTemplates((await fetchTemplates()).templates);
      setLoadError(null);
    } catch (error) {
      setLoadError(serverErrorMessage(error));
    }
  }, []);

  /**
   * Saves the current panels as `name`. Resolves to "exists" (nothing
   * saved) when the name is taken and `overwrite` isn't set.
   */
  const save = async (name: string, overwrite = false) => {
    // The server saves its copy of the panels: send the latest first.
    await flushState();
    try {
      setTemplates((await saveTemplate(name, overwrite)).templates);
      return "saved" as const;
    } catch (error) {
      if (error instanceof HttpError && error.status === 409 && !overwrite) {
        return "exists" as const;
      }
      throw error;
    }
  };

  return {
    templates,
    loadError,
    refresh,
    save,
    rename: async (name: string, next: string) =>
      setTemplates((await renameTemplate(name, next)).templates),
    remove: async (name: string) =>
      setTemplates((await removeTemplate(name)).templates),
    apply: (name: string, simulationId: string | null) =>
      runServerCommand(() => applyTemplate(name, simulationId)),
  };
};

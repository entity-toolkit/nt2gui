import { apiUrl, requestJson } from "./http";
import { IServerSnapshot, ITemplateSummary } from "./types";

type Listing = { templates: ITemplateSummary[] };

const templateUrl = (name: string, path = "") =>
  apiUrl(`templates/${encodeURIComponent(name)}${path ? `/${path}` : ""}`);

export const fetchTemplates = () => requestJson<Listing>(apiUrl("templates"));

/** Saves the server's current panels as `name` (409 if taken, unless `overwrite`). */
export const saveTemplate = (name: string, overwrite = false) =>
  requestJson<Listing>(apiUrl("templates"), { body: { name, overwrite } });

export const renameTemplate = (name: string, next: string) =>
  requestJson<Listing>(templateUrl(name), {
    method: "PATCH",
    body: { name: next },
  });

export const removeTemplate = (name: string) =>
  requestJson<Listing>(templateUrl(name), { method: "DELETE" });

/** Replaces the panels with the template's, showing `simulationId`. */
export const applyTemplate = (name: string, simulationId: string | null) =>
  requestJson<IServerSnapshot>(templateUrl(name, "apply"), {
    body: { simulationId },
  });

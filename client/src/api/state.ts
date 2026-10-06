import { IUiState } from "../state/schema";
import { HttpError, apiUrl, requestJson } from "./http";
import { IServerSnapshot } from "./types";

/** The server rejected a write because it has a newer revision. */
export class RevisionConflictError extends Error {
  constructor(readonly snapshot: IServerSnapshot) {
    super(`Revision conflict: server is at revision ${snapshot.revision}`);
  }
}

export const fetchState = () => requestJson<IServerSnapshot>(apiUrl("state"));

export const putState = async (
  revision: number,
  state: IUiState,
): Promise<IServerSnapshot> => {
  try {
    return await requestJson<IServerSnapshot>(apiUrl("state"), {
      method: "PUT",
      body: { revision, state },
    });
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) {
      // A conflict carries the current snapshot.
      throw new RevisionConflictError(error.body as IServerSnapshot);
    }
    throw error;
  }
};

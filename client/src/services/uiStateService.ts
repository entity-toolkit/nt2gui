import { SERVER_URL } from "../config";
import { IServerSnapshot, IUiState } from "../global";
import { HttpError, requestJson } from "./http";

/** The server rejected a write because it has a newer revision. */
export class RevisionConflictError extends Error {
  constructor(readonly snapshot: IServerSnapshot) {
    super(`Revision conflict: server is at revision ${snapshot.revision}`);
  }
}

export const fetchState = (): Promise<IServerSnapshot> =>
  requestJson<IServerSnapshot>(`${SERVER_URL}/state`);

export const putState = async (
  revision: number,
  state: IUiState,
): Promise<IServerSnapshot> => {
  try {
    return await requestJson<IServerSnapshot>(`${SERVER_URL}/state`, {
      method: "PUT",
      body: { revision, state },
    });
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) {
      throw new RevisionConflictError(error.body as IServerSnapshot);
    }
    throw error;
  }
};

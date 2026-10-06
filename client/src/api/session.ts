import { HttpError, apiUrl, errorBody, requestJson } from "./http";
import { ISessionCommandResult, ISessionDocument } from "./types";

/** A server-side save would overwrite an existing file. */
export class FileExistsError extends Error {
  constructor(readonly path: string) {
    super(`${path} already exists`);
  }
}

export const saveSessionOnServer = async (
  path: string,
  overwrite = false,
): Promise<ISessionCommandResult> => {
  try {
    return await requestJson<ISessionCommandResult>(apiUrl("session/save"), {
      body: { path, overwrite },
    });
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) {
      throw new FileExistsError(errorBody(error)?.path ?? path);
    }
    throw error;
  }
};

export const loadSessionFromServer = (path: string) =>
  requestJson<ISessionCommandResult>(apiUrl("session/load"), {
    body: { path },
  });

export const exportSession = () =>
  requestJson<ISessionDocument>(apiUrl("session/export"));

export const importSession = (session: ISessionDocument) =>
  requestJson<ISessionCommandResult>(apiUrl("session/import"), {
    body: { session },
  });

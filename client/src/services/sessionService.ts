import { SERVER_URL } from "../config";
import { ISessionCommandResult, ISessionDocument } from "../global";
import { HttpError, requestJson } from "./http";

/** A server-side save would overwrite an existing file. */
export class FileExistsError extends Error {
  constructor(readonly path: string) {
    super(`${path} already exists`);
  }
}

/** Extracts the server's `{error}` message from a failed request. */
export const serverErrorMessage = (error: unknown): string => {
  if (error instanceof HttpError) {
    const body = error.body as { error?: string; path?: string } | null;
    if (body?.error) return body.path ? `${body.error}: ${body.path}` : body.error;
  }
  return error instanceof Error ? error.message : String(error);
};

export const saveSessionOnServer = async (
  path: string,
  overwrite = false,
): Promise<ISessionCommandResult> => {
  try {
    return await requestJson<ISessionCommandResult>(
      `${SERVER_URL}/session/save`,
      { method: "POST", body: { path, overwrite } },
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) {
      const body = error.body as { path?: string } | null;
      throw new FileExistsError(body?.path ?? path);
    }
    throw error;
  }
};

export const loadSessionFromServer = (
  path: string,
): Promise<ISessionCommandResult> =>
  requestJson<ISessionCommandResult>(`${SERVER_URL}/session/load`, {
    method: "POST",
    body: { path },
  });

export const exportSession = (): Promise<ISessionDocument> =>
  requestJson<ISessionDocument>(`${SERVER_URL}/session/export`);

export const importSession = (
  session: ISessionDocument,
): Promise<ISessionCommandResult> =>
  requestJson<ISessionCommandResult>(`${SERVER_URL}/session/import`, {
    method: "POST",
    body: { session },
  });

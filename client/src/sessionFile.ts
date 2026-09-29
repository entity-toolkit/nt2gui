import { ISessionDocument } from "./global";

const pad = (value: number) => String(value).padStart(2, "0");

/** A filesystem-safe timestamp, e.g. `2026-09-28_22-05`. */
export const sessionTimestamp = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_` +
  `${pad(date.getHours())}-${pad(date.getMinutes())}`;

export const sessionFileName = (date: Date) =>
  `nt2gui-session_${sessionTimestamp(date)}.json`;

/** Default location for server-side saves, relative to the server's working directory. */
export const defaultServerSessionPath = (date: Date) =>
  `.nt2gui/saved/${sessionFileName(date)}`;

/**
 * Parses a session file picked by the user. Only the envelope is checked here;
 * the server validates the contents when importing.
 */
export const parseSessionFile = (text: string): ISessionDocument => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The selected file is not valid JSON");
  }
  if (
    typeof raw !== "object" ||
    raw === null ||
    Array.isArray(raw) ||
    typeof (raw as { state?: unknown }).state !== "object" ||
    (raw as { state?: unknown }).state === null
  ) {
    throw new Error("The selected file is not an nt2gui session");
  }
  return raw as ISessionDocument;
};

// The File System Access API is not in TypeScript's DOM lib yet.
type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

/**
 * Saves the session to the user's machine. Uses the native "Save as" dialog
 * where the browser supports it, otherwise a regular download.
 * Resolves to false if the user cancelled.
 */
export const saveSessionLocally = async (
  document: ISessionDocument,
  fileName: string,
): Promise<boolean> => {
  const blob = new Blob([JSON.stringify(document, null, 2)], {
    type: "application/json",
  });

  const picker = (window as { showSaveFilePicker?: SaveFilePicker })
    .showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [
          {
            description: "nt2gui session",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return false;
      }
      throw error;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  return true;
};

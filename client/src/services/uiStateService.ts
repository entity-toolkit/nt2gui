import { SERVER_URL } from "../config";
import { IUiState } from "../global";

type ServerModelResponse = { model?: IUiState };

const postJson = async <T>(url: string, body: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Request failed: ${response.status} ${message}`);
  }

  return response.json();
};

export const fetchExistingUiState = async (): Promise<IUiState | null> => {
  const response = await fetch(`${SERVER_URL}/model_init`);
  if (!response.ok) {
    throw new Error(`Failed to fetch stored model: ${response.status}`);
  }

  const data: ServerModelResponse = await response.json();
  return data.model ?? null;
};

export const initializeUiState = async (
  initialUiState: IUiState,
): Promise<IUiState> => {
  const response = await postJson<ServerModelResponse>(
    `${SERVER_URL}/model_init`,
    {
      model: initialUiState,
    },
  );

  if (!response.model) {
    throw new Error("Server did not return a model during initialization");
  }

  return response.model;
};

export const persistUiState = (uiState: IUiState) => {
  postJson(`${SERVER_URL}/model_sync`, { model: uiState })
    .then(() => {
      console.log("synced ui state to server");
    })
    .catch((error) => {
      console.error("Error syncing ui state to server:", error);
    });
};

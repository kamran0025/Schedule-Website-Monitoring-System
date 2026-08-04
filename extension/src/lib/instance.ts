import { apiClient } from "./apiClient";

const INSTANCE_ID_KEY = "instanceId";
const API_KEY_KEY = "apiKey";

interface Instance {
  instanceId: string;
  apiKey: string;
}

let cached: Instance | null = null;
let pending: Promise<Instance> | null = null;

interface StoredInstance {
  [INSTANCE_ID_KEY]?: string;
  [API_KEY_KEY]?: string;
}

async function readStoredInstance(): Promise<Instance | null> {
  const stored = await chrome.storage.local.get<StoredInstance>([INSTANCE_ID_KEY, API_KEY_KEY]);
  if (stored.instanceId && stored.apiKey) {
    return { instanceId: stored.instanceId, apiKey: stored.apiKey };
  }
  return null;
}

async function registerInstance(): Promise<Instance> {
  const instanceId = crypto.randomUUID();
  const { data } = await apiClient.post<{ instanceId: string; apiKey: string }>("/api/instances", {
    instanceId,
  });
  await chrome.storage.local.set({
    [INSTANCE_ID_KEY]: data.instanceId,
    [API_KEY_KEY]: data.apiKey,
  });
  return { instanceId: data.instanceId, apiKey: data.apiKey };
}

export async function getOrCreateInstance(): Promise<Instance> {
  if (cached) return cached;
  if (pending) return pending;

  pending = (async () => {
    const stored = await readStoredInstance();
    const instance = stored ?? (await registerInstance());
    cached = instance;
    pending = null;
    return instance;
  })();

  return pending;
}

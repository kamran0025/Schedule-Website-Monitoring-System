import axios from "axios";

import { getOrCreateInstance } from "./instance";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use(async (config) => {
  if (config.url?.startsWith("/api/instances")) {
    return config;
  }

  const { instanceId, apiKey } = await getOrCreateInstance();
  config.headers.set("x-instance-id", instanceId);
  config.headers.set("x-api-key", apiKey);
  return config;
});

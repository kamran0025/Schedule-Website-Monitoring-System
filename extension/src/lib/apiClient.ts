import axios from "axios";

const API_BASE_URL = import.meta.env.API_BASE_UR;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

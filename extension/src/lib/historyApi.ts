import { apiClient } from "./apiClient";

export type HistoryStatus = "success" | "failed" | "skipped";

export interface ExecutionHistoryEntry {
  _id: string;
  scheduleId: string;
  status: HistoryStatus;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  contentHash: string | null;
  summary: string | null;
}

export async function listHistory(scheduleId: string): Promise<ExecutionHistoryEntry[]> {
  const { data } = await apiClient.get<ExecutionHistoryEntry[]>(
    `/api/schedules/${scheduleId}/history`,
  );
  return data;
}

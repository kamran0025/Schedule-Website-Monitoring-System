import { apiClient } from "./apiClient";

export type ScheduleStatus = "active" | "paused";

export interface Schedule {
  _id: string;
  instanceId: string;
  email: string;
  url: string;
  intervalMinutes: number;
  status: ScheduleStatus;
  lastRunAt: string | null;
  nextRunAt: string;
  lastContentHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduleInput {
  url: string;
  email: string;
  intervalMinutes: number;
}

const BASE_PATH = "/api/schedules";

export async function listSchedules(): Promise<Schedule[]> {
  const { data } = await apiClient.get<Schedule[]>(BASE_PATH);
  return data;
}

export async function createSchedule(input: CreateScheduleInput): Promise<Schedule> {
  const { data } = await apiClient.post<Schedule>(BASE_PATH, input);
  return data;
}

export async function pauseSchedule(id: string): Promise<Schedule> {
  const { data } = await apiClient.patch<Schedule>(`${BASE_PATH}/${id}/pause`);
  return data;
}

export async function resumeSchedule(id: string): Promise<Schedule> {
  const { data } = await apiClient.patch<Schedule>(`${BASE_PATH}/${id}/resume`);
  return data;
}

export async function deleteSchedule(id: string): Promise<void> {
  await apiClient.delete(`${BASE_PATH}/${id}`);
}

export async function runScheduleNow(id: string): Promise<Schedule> {
  const { data } = await apiClient.post<Schedule>(`${BASE_PATH}/${id}/run`);
  return data;
}

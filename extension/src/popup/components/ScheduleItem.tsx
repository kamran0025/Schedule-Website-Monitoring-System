import { useState } from "react";

import { extractErrorMessage } from "../../lib/errors";
import { listHistory, type ExecutionHistoryEntry } from "../../lib/historyApi";
import {
  deleteSchedule,
  pauseSchedule,
  resumeSchedule,
  runScheduleNow,
  type Schedule,
} from "../../lib/scheduleApi";
import { useToast } from "../../lib/toast";
import Spinner from "./Spinner";

type Action = "pause" | "resume" | "delete" | "run";

interface ScheduleItemProps {
  schedule: Schedule;
  onChanged: (schedule: Schedule) => void;
  onDeleted: (id: string) => void;
}

const ACTION_TOAST: Record<Action, string> = {
  pause: "Schedule paused",
  resume: "Schedule resumed",
  delete: "Schedule deleted",
  run: "Run triggered",
};

function formatRelative(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (Math.abs(diffMinutes) < 1) return "now";
  const future = diffMinutes > 0;
  const abs = Math.abs(diffMinutes);
  const value = abs < 60 ? `${abs}m` : `${Math.round(abs / 60)}h`;
  return future ? `in ${value}` : `${value} ago`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusColor(status: ExecutionHistoryEntry["status"]): string {
  if (status === "success") return "text-green-600 dark:text-green-400";
  if (status === "failed") return "text-red-600 dark:text-red-400";
  return "text-slate-400";
}

function ScheduleItem({ schedule, onChanged, onDeleted }: ScheduleItemProps) {
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ExecutionHistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const toast = useToast();

  async function run(action: Action) {
    setError(null);
    setPendingAction(action);
    try {
      if (action === "pause") onChanged(await pauseSchedule(schedule._id));
      else if (action === "resume") onChanged(await resumeSchedule(schedule._id));
      else if (action === "run") onChanged(await runScheduleNow(schedule._id));
      else if (action === "delete") {
        await deleteSchedule(schedule._id);
        onDeleted(schedule._id);
      }
      toast.success(ACTION_TOAST[action]);
    } catch (err) {
      const message = extractErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && history === null) {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        setHistory(await listHistory(schedule._id));
      } catch (err) {
        setHistoryError(extractErrorMessage(err));
      } finally {
        setHistoryLoading(false);
      }
    }
  }

  const isPaused = schedule.status === "paused";

  return (
    <li className="rounded border border-slate-200 p-2 dark:border-slate-700">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className="truncate text-sm font-medium text-slate-900 dark:text-slate-100"
            title={schedule.url}
          >
            {schedule.url}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            every {schedule.intervalMinutes}m ·{" "}
            <span
              className={
                isPaused
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-green-600 dark:text-green-400"
              }
            >
              {schedule.status}
            </span>
            {" · next run "}
            {formatRelative(schedule.nextRunAt)}
          </p>
        </div>
      </div>

      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {isPaused ? (
          <ActionButton
            label="Resume"
            busy={pendingAction === "resume"}
            disabled={pendingAction !== null}
            onClick={() => run("resume")}
          />
        ) : (
          <ActionButton
            label="Pause"
            busy={pendingAction === "pause"}
            disabled={pendingAction !== null}
            onClick={() => run("pause")}
          />
        )}
        <ActionButton
          label="Run Now"
          busy={pendingAction === "run"}
          disabled={pendingAction !== null}
          onClick={() => run("run")}
        />
        <ActionButton
          label={historyOpen ? "Hide History" : "History"}
          busy={false}
          disabled={pendingAction !== null}
          onClick={toggleHistory}
        />
        <ActionButton
          label="Delete"
          busy={pendingAction === "delete"}
          disabled={pendingAction !== null}
          onClick={() => run("delete")}
          variant="danger"
        />
      </div>

      {historyOpen && (
        <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
          {historyLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-slate-500 dark:text-slate-400">
              <Spinner className="h-3 w-3" />
              Loading history...
            </div>
          ) : historyError ? (
            <p className="text-xs text-red-600 dark:text-red-400">{historyError}</p>
          ) : history && history.length === 0 ? (
            <p className="py-1 text-xs text-slate-500 dark:text-slate-400">No executions yet.</p>
          ) : (
            <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto">
              {history?.map((entry) => (
                <li key={entry._id} className="text-xs text-slate-600 dark:text-slate-300">
                  <span className={statusColor(entry.status)}>{entry.status}</span> ·{" "}
                  {formatTimestamp(entry.startedAt)}
                  {entry.error && (
                    <span className="block truncate text-red-500 dark:text-red-400">
                      {entry.error}
                    </span>
                  )}
                  {entry.summary && !entry.error && (
                    <span className="block truncate text-slate-500 dark:text-slate-400">
                      {entry.summary}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

interface ActionButtonProps {
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  variant?: "default" | "danger";
}

function ActionButton({ label, busy, disabled, onClick, variant = "default" }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
        variant === "danger"
          ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      }`}
    >
      {busy ? <Spinner className="h-3 w-3" /> : label}
    </button>
  );
}

export default ScheduleItem;

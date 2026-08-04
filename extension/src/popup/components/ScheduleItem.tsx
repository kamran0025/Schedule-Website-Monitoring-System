import { useState } from "react";

import { extractErrorMessage } from "../../lib/errors";
import {
  deleteSchedule,
  pauseSchedule,
  resumeSchedule,
  runScheduleNow,
  type Schedule,
} from "../../lib/scheduleApi";

type Action = "pause" | "resume" | "delete" | "run";

interface ScheduleItemProps {
  schedule: Schedule;
  onChanged: (schedule: Schedule) => void;
  onDeleted: (id: string) => void;
}

function formatRelative(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (Math.abs(diffMinutes) < 1) return "now";
  const future = diffMinutes > 0;
  const abs = Math.abs(diffMinutes);
  const value = abs < 60 ? `${abs}m` : `${Math.round(abs / 60)}h`;
  return future ? `in ${value}` : `${value} ago`;
}

function ScheduleItem({ schedule, onChanged, onDeleted }: ScheduleItemProps) {
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setPendingAction(null);
    }
  }

  const isPaused = schedule.status === "paused";

  return (
    <li className="rounded border border-slate-200 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900" title={schedule.url}>
            {schedule.url}
          </p>
          <p className="text-xs text-slate-500">
            every {schedule.intervalMinutes}m ·{" "}
            <span className={isPaused ? "text-amber-600" : "text-green-600"}>
              {schedule.status}
            </span>
            {" · next run "}
            {formatRelative(schedule.nextRunAt)}
          </p>
        </div>
      </div>

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      <div className="mt-2 flex gap-1.5">
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
          label="Delete"
          busy={pendingAction === "delete"}
          disabled={pendingAction !== null}
          onClick={() => run("delete")}
          variant="danger"
        />
      </div>
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
          ? "border-red-200 text-red-600 hover:bg-red-50"
          : "border-slate-200 text-slate-700 hover:bg-slate-50"
      }`}
    >
      {busy ? "..." : label}
    </button>
  );
}

export default ScheduleItem;

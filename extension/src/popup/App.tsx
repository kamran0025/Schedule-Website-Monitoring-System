import { useEffect, useMemo, useState } from "react";

import { apiClient } from "../lib/apiClient";
import { extractErrorMessage } from "../lib/errors";
import { listSchedules, type Schedule, type ScheduleStatus } from "../lib/scheduleApi";
import ScheduleForm from "./components/ScheduleForm";
import ScheduleList from "./components/ScheduleList";
import Spinner from "./components/Spinner";

type BackendStatus = "checking" | "online" | "offline";
type StatusFilter = "all" | ScheduleStatus;

const STATUS_FILTERS: StatusFilter[] = ["all", "active", "paused"];

function App() {
  const [status, setStatus] = useState<BackendStatus>("checking");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    apiClient
      .get("/health")
      .then(() => setStatus("online"))
      .catch(() => setStatus("offline"));

    refreshSchedules();
  }, []);

  async function refreshSchedules() {
    setLoading(true);
    setLoadError(null);
    try {
      setSchedules(await listSchedules());
    } catch (err) {
      setLoadError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function handleCreated(schedule: Schedule) {
    setSchedules((current) => [schedule, ...current]);
  }

  function handleChanged(schedule: Schedule) {
    setSchedules((current) => current.map((s) => (s._id === schedule._id ? schedule : s)));
  }

  function handleDeleted(id: string) {
    setSchedules((current) => current.filter((s) => s._id !== id));
  }

  const filteredSchedules = useMemo(() => {
    const query = search.trim().toLowerCase();
    return schedules.filter((schedule) => {
      if (statusFilter !== "all" && schedule.status !== statusFilter) return false;
      if (query && !schedule.url.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [schedules, search, statusFilter]);

  return (
    <div className="flex max-h-140 flex-col gap-4 bg-white p-4 font-sans dark:bg-slate-900">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Universal Newsletter
        </h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Backend:{" "}
          <span
            className={
              status === "online"
                ? "text-green-600 dark:text-green-400"
                : status === "offline"
                  ? "text-red-600 dark:text-red-400"
                  : "text-slate-400"
            }
          >
            {status}
          </span>
        </p>
      </div>

      <ScheduleForm onCreated={handleCreated} />

      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Subscriptions
          </h2>
          {schedules.length > 0 && (
            <div className="flex gap-1">
              {STATUS_FILTERS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setStatusFilter(option)}
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${
                    statusFilter === option
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>

        {schedules.length > 0 && (
          <input
            type="search"
            placeholder="Search by URL..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-slate-500 dark:text-slate-400">
            <Spinner />
            Loading subscriptions...
          </div>
        ) : loadError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
        ) : (
          <ScheduleList
            schedules={filteredSchedules}
            hasAnySchedules={schedules.length > 0}
            onChanged={handleChanged}
            onDeleted={handleDeleted}
          />
        )}
      </div>
    </div>
  );
}

export default App;

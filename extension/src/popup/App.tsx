import { useEffect, useState } from "react";

import { apiClient } from "../lib/apiClient";
import { extractErrorMessage } from "../lib/errors";
import { listSchedules, type Schedule } from "../lib/scheduleApi";
import ScheduleForm from "./components/ScheduleForm";
import ScheduleList from "./components/ScheduleList";

type BackendStatus = "checking" | "online" | "offline";

function App() {
  const [status, setStatus] = useState<BackendStatus>("checking");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="flex max-h-140 flex-col gap-4 p-4 font-sans">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Universal Newsletter</h1>
        <p className="mt-1 text-xs text-slate-500">
          Backend:{" "}
          <span
            className={
              status === "online"
                ? "text-green-600"
                : status === "offline"
                  ? "text-red-600"
                  : "text-slate-400"
            }
          >
            {status}
          </span>
        </p>
      </div>

      <ScheduleForm onCreated={handleCreated} />

      <div className="flex flex-col gap-2 overflow-y-auto">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Subscriptions
        </h2>
        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : loadError ? (
          <p className="text-sm text-red-600">{loadError}</p>
        ) : (
          <ScheduleList
            schedules={schedules}
            onChanged={handleChanged}
            onDeleted={handleDeleted}
          />
        )}
      </div>
    </div>
  );
}

export default App;

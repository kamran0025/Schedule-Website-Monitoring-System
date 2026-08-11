import { useState, type FormEvent } from "react";

import { extractErrorMessage } from "../../lib/errors";
import { createSchedule, type Schedule } from "../../lib/scheduleApi";
import { useToast } from "../../lib/toast";
import { validatePageUrl } from "../../lib/validateUrl";

const MIN_INTERVAL_MINUTES = 3;
const DEFAULT_INTERVAL_MINUTES = 60;

interface ScheduleFormProps {
  onCreated: (schedule: Schedule) => void;
}

function ScheduleForm({ onCreated }: ScheduleFormProps) {
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(DEFAULT_INTERVAL_MINUTES);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const urlError = validatePageUrl(url);
    if (urlError) {
      setError(urlError);
      return;
    }

    if (intervalMinutes < MIN_INTERVAL_MINUTES) {
      setError(`Interval must be at least ${MIN_INTERVAL_MINUTES} minutes`);
      return;
    }

    setSubmitting(true);
    try {
      const schedule = await createSchedule({ url, email, intervalMinutes });
      onCreated(schedule);
      toast.success("Subscribed");
      setUrl("");
      setEmail("");
      setIntervalMinutes(DEFAULT_INTERVAL_MINUTES);
    } catch (err) {
      const message = extractErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
        Page URL
        <input
          type="url"
          required
          placeholder="https://example.com/blog"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
        Email
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
        Check every (minutes)
        <input
          type="number"
          required
          min={MIN_INTERVAL_MINUTES}
          value={intervalMinutes}
          onChange={(event) => setIntervalMinutes(Number(event.target.value))}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </label>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="mt-1 rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        {submitting ? "Subscribing..." : "Subscribe"}
      </button>
    </form>
  );
}

export default ScheduleForm;

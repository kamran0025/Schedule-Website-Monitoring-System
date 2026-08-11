import type { Schedule } from "../../lib/scheduleApi";
import ScheduleItem from "./ScheduleItem";

interface ScheduleListProps {
  schedules: Schedule[];
  hasAnySchedules: boolean;
  onChanged: (schedule: Schedule) => void;
  onDeleted: (id: string) => void;
}

function ScheduleList({ schedules, hasAnySchedules, onChanged, onDeleted }: ScheduleListProps) {
  if (schedules.length === 0) {
    return (
      <p className="rounded border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        {hasAnySchedules
          ? "No subscriptions match your search."
          : "No subscriptions yet — add a URL above to get started."}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {schedules.map((schedule) => (
        <ScheduleItem
          key={schedule._id}
          schedule={schedule}
          onChanged={onChanged}
          onDeleted={onDeleted}
        />
      ))}
    </ul>
  );
}

export default ScheduleList;

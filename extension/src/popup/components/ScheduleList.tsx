import type { Schedule } from "../../lib/scheduleApi";
import ScheduleItem from "./ScheduleItem";

interface ScheduleListProps {
  schedules: Schedule[];
  onChanged: (schedule: Schedule) => void;
  onDeleted: (id: string) => void;
}

function ScheduleList({ schedules, onChanged, onDeleted }: ScheduleListProps) {
  if (schedules.length === 0) {
    return <p className="text-sm text-slate-500">No subscriptions yet.</p>;
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

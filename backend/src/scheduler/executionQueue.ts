export interface ExecutionJob {
  scheduleId: string;
  url: string;
}

export type ExecutionJobHandler = (job: ExecutionJob) => void | Promise<void>;

// In-process stand-in for the Phase 6 BullMQ queue: same enqueue/process shape,
// so swapping the internals for a real Redis-backed queue won't touch call sites
// in scheduler.ts.
class InMemoryExecutionQueue {
  private handler: ExecutionJobHandler | null = null;

  process(handler: ExecutionJobHandler): void {
    this.handler = handler;
  }

  async enqueue(job: ExecutionJob): Promise<void> {
    if (!this.handler) {
      console.warn(`No execution handler registered yet; dropping job for schedule ${job.scheduleId}`);
      return;
    }
    await this.handler(job);
  }
}

export const executionQueue = new InMemoryExecutionQueue();

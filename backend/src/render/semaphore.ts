export class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.available = permits;
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return this.makeRelease();
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    return this.makeRelease();
  }

  // A queued waiter is woken by directly handing it the checked-out permit
  // (the "else" branch below never runs for it), so the handoff can't race
  // with a concurrent acquire() sneaking in between release and resume.
  private makeRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) {
        next();
      } else {
        this.available += 1;
      }
    };
  }
}

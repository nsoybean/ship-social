const { withState } = require("./store");
const { id } = require("./utils/id");

class JobQueue {
  constructor({ handlers, pollIntervalMs = 1000 }) {
    this.handlers = handlers;
    this.pollIntervalMs = pollIntervalMs;
    this.timer = null;
    this.processing = false;
  }

  enqueue(type, payload, options = {}) {
    const now = Date.now();
    const delayMs = Number(options.delayMs || 0);
    const maxAttempts = Number(options.maxAttempts || 3);

    const job = {
      id: id("job"),
      type,
      payload,
      status: "queued",
      attempts: 0,
      maxAttempts,
      runAt: new Date(now + delayMs).toISOString(),
      lockedAt: null,
      lastError: null,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString()
    };

    withState((state) => {
      state.jobs.push(job);
    });

    return job;
  }

  start() {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        // eslint-disable-next-line no-console
        console.error("queue tick failed", error);
      });
    }, this.pollIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick() {
    if (this.processing) {
      return;
    }

    this.processing = true;
    const now = Date.now();

    const claimed = withState((state) => {
      const candidates = state.jobs
        .filter((job) => job.status === "queued" && new Date(job.runAt).getTime() <= now)
        .sort((a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime());

      if (candidates.length === 0) {
        return null;
      }

      const job = state.jobs.find((item) => item.id === candidates[0].id);
      if (!job) {
        return null;
      }

      job.status = "running";
      job.attempts += 1;
      job.lockedAt = new Date(now).toISOString();
      job.updatedAt = new Date(now).toISOString();

      return { ...job };
    });

    if (!claimed) {
      this.processing = false;
      return;
    }

    try {
      const handler = this.handlers[claimed.type];
      if (!handler) {
        throw new Error(`No handler registered for ${claimed.type}`);
      }

      await handler(claimed);
      withState((state) => {
        const job = state.jobs.find((item) => item.id === claimed.id);
        if (!job) {
          return;
        }

        job.status = "done";
        job.lastError = null;
        job.lockedAt = null;
        job.updatedAt = new Date().toISOString();
      });
    } catch (error) {
      withState((state) => {
        const job = state.jobs.find((item) => item.id === claimed.id);
        if (!job) {
          return;
        }

        const retryable = job.attempts < job.maxAttempts;
        if (retryable) {
          const backoffMs = Math.min(120000, Math.pow(2, job.attempts) * 1000);
          job.status = "queued";
          job.runAt = new Date(Date.now() + backoffMs).toISOString();
        } else {
          job.status = "failed";
        }

        job.lastError = error instanceof Error ? error.message : String(error);
        job.lockedAt = null;
        job.updatedAt = new Date().toISOString();
      });
    } finally {
      this.processing = false;
    }
  }
}

module.exports = {
  JobQueue
};

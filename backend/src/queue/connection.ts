import { Redis } from "ioredis";

import { env } from "../config/env.js";

// BullMQ manages retries for its own blocking commands, so it requires
// maxRetriesPerRequest: null on any connection handed to it.
export function createRedisConnection(): Redis {
  return new Redis(env.redisUrl, { maxRetriesPerRequest: null });
}

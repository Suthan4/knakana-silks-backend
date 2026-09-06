import { Redis, RedisOptions } from "ioredis";

/**
 * 🛠️ Redis Connection Configuration & Singleton Factory
 * Features:
 * - Multi-source configuration (.env variables or URL)
 * - Exponential backoff retry strategy
 * - Fail-fast maxRetriesPerRequest for minimal latency on cache misses/downtime
 * - Auto-reconnection on transient failovers
 * - Resilient error handling preventing app crashes
 */

const getRedisConfig = (): { url?: string; options: RedisOptions } => {
  const host = process.env.REDIS_HOST || "localhost";
  const port = parseInt(process.env.REDIS_PORT || "6379", 10);
  const password = process.env.REDIS_PASSWORD || undefined;
  const url = process.env.REDIS_URL;

  const commonOptions: RedisOptions = {
    maxRetriesPerRequest: 1, // Fail fast on cache operations so DB fallback is instantaneous
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times: number) => {
      // Exponential backoff with 2000ms max delay
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    reconnectOnError: (err: Error) => {
      const targetErrors = ["READONLY", "ETIMEDOUT", "ECONNRESET"];
      return targetErrors.some((target) => err.message.includes(target));
    },
  };

  if (url) {
    return {
      url,
      options: commonOptions,
    };
  }

  return {
    options: {
      ...commonOptions,
      host,
      port,
      password: password || undefined,
    },
  };
};

class RedisClientSingleton {
  private static instance: Redis | null = null;
  private static isConnected: boolean = false;

  public static getInstance(): Redis {
    if (!RedisClientSingleton.instance) {
      const config = getRedisConfig();

      if (config.url) {
        RedisClientSingleton.instance = new Redis(config.url, config.options);
      } else {
        RedisClientSingleton.instance = new Redis(config.options);
      }

      RedisClientSingleton.setupEventListeners(RedisClientSingleton.instance);
    }

    return RedisClientSingleton.instance;
  }

  public static getStatus(): { isConnected: boolean; status: string } {
    if (!RedisClientSingleton.instance) {
      return { isConnected: false, status: "not_initialized" };
    }
    return {
      isConnected: RedisClientSingleton.isConnected,
      status: RedisClientSingleton.instance.status,
    };
  }

  private static setupEventListeners(client: Redis) {
    client.on("connect", () => {
      console.log("🔌 Redis Connection Established");
    });

    client.on("ready", () => {
      RedisClientSingleton.isConnected = true;
      console.log("✅ Redis Client Ready for Operations");
    });

    client.on("error", (error: Error) => {
      RedisClientSingleton.isConnected = false;
      // Suppress spammy offline connection refusal messages in dev if desired
      console.error("❌ Redis Error:", error.message);
    });

    client.on("close", () => {
      RedisClientSingleton.isConnected = false;
      console.warn("⚠️  Redis Connection Closed");
    });

    client.on("reconnecting", (delay: number) => {
      RedisClientSingleton.isConnected = false;
      console.log(`🔄 Redis Reconnecting in ${delay}ms...`);
    });

    client.on("end", () => {
      RedisClientSingleton.isConnected = false;
      console.warn("🛑 Redis Connection Terminated");
    });
  }
}

export const redisClient = RedisClientSingleton.getInstance();
export const getRedisClient = (): Redis => RedisClientSingleton.getInstance();
export const getRedisStatus = () => RedisClientSingleton.getStatus();
export const isRedisReady = (): boolean => RedisClientSingleton.getStatus().isConnected;


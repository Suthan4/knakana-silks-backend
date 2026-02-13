import { Redis } from "ioredis";


/**
 * 🔥 Central Cache Service
 * Production-ready Redis cache management with:
 * - Single key operations
 * - Pattern-based deletion (safe SCAN)
 * - TTL management
 * - Error handling
 */
class CacheService {
  private redis: Redis;
  private defaultTTL = 3600; // 1 hour default

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: 3,
      retryStrategy: (times:number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: (err:Error) => {
        const targetError = "READONLY";
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
    });

    this.redis.on("error", (error) => {
      console.error("❌ Redis Connection Error:", error);
    });

    this.redis.on("connect", () => {
      console.log("✅ Redis Connected Successfully");
    });
  }

  /**
   * Get cached value by key
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      console.error(`❌ Cache GET error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set cache with optional TTL (in seconds)
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const expiryTime = ttl || this.defaultTTL;
      await this.redis.set(key, JSON.stringify(value), "EX", expiryTime);
      console.log(`✅ Cache SET: ${key} (TTL: ${expiryTime}s)`);
    } catch (error) {
      console.error(`❌ Cache SET error for key ${key}:`, error);
    }
  }

  /**
   * Delete single key
   */
  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      console.log(`🗑️  Cache DEL: ${key}`);
    } catch (error) {
      console.error(`❌ Cache DEL error for key ${key}:`, error);
    }
  }

  /**
   * Delete multiple keys
   */
  async delMultiple(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    try {
      await this.redis.del(...keys);
      console.log(`🗑️  Cache DEL Multiple: ${keys.length} keys`);
    } catch (error) {
      console.error(`❌ Cache DEL Multiple error:`, error);
    }
  }

  /**
   * ⭐ Delete by pattern using SCAN (production-safe)
   * NEVER uses KEYS command which blocks Redis
   */
  async delByPattern(pattern: string): Promise<number> {
    let cursor = "0";
    let deletedCount = 0;

    try {
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          100 // Batch size
        );

        cursor = nextCursor;

        if (keys.length > 0) {
          await this.redis.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== "0");

      console.log(`🗑️  Cache DEL Pattern: ${pattern} (${deletedCount} keys)`);
      return deletedCount;
    } catch (error) {
      console.error(`❌ Cache DEL Pattern error for ${pattern}:`, error);
      return deletedCount;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`❌ Cache EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get TTL of a key (in seconds)
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      console.error(`❌ Cache TTL error for key ${key}:`, error);
      return -1;
    }
  }

  /**
   * Flush all cache (use with extreme caution)
   */
  async flushAll(): Promise<void> {
    try {
      await this.redis.flushall();
      console.warn("⚠️  Cache FLUSH ALL - All keys deleted");
    } catch (error) {
      console.error("❌ Cache FLUSH ALL error:", error);
    }
  }

  /**
   * Get Redis client for advanced operations
   */
  getClient(): Redis {
    return this.redis;
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
    console.log("👋 Redis Connection Closed");
  }
}

// Export singleton instance
export const cacheService = new CacheService();
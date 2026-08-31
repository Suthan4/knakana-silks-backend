import { redisClient } from "@/config/redis.config.js";
import { Redis } from "ioredis";
import { injectable } from "tsyringe";

export type CacheSource = "HIT" | "MISS";

export interface CacheResult<T> {
  data: T;
  source: CacheSource;
}

/**
 * 🔥 Central Production-Ready Cache-Aside Service
 * Features:
 * - Generic getOrSet and getOrSetWithMeta (tracks HIT/MISS cache source)
 * - Safe JSON serialization & deserialization
 * - Wildcard non-blocking invalidation (SCAN + Pipeline)
 * - Zero-downtime graceful fallback on Redis outages
 * - Single and multi-key deletion
 */

@injectable()
export class CacheService {
  private redis: Redis;
  private defaultTTL = 600; // 10 minutes default (600 seconds)

  constructor() {
    this.redis = redisClient;
  }

  /**
   * Helper to check if Redis is currently able to receive commands
   */
  private isAvailable(): boolean {
    return this.redis.status === "ready" || this.redis.status === "connect";
  }

  /**
   * Get cached value by key with safe JSON parsing
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) return null;

    try {
      const data = await this.redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error: any) {
      console.error(`❌ [Cache GET error] Key "${key}":`, error.message);
      return null;
    }
  }

  /**
   * Set cache with optional TTL (in seconds)
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    if (!this.isAvailable() || value === undefined) return;

    try {
      const expiryTime = ttl !== undefined ? ttl : this.defaultTTL;
      const serialized = JSON.stringify(value);
      await this.redis.set(key, serialized, "EX", expiryTime);
    } catch (error: any) {
      console.error(`❌ [Cache SET error] Key "${key}":`, error.message);
    }
  }

  /**
   * ⚡ Generic Cache-Aside Pattern with Metadata Tracking (HIT / MISS)
   * Checks cache first; if hit, returns data with source="HIT".
   * If cache miss or Redis error occurs, executes `fetchFn`, caches result, and returns data with source="MISS".
   */
  async getOrSetWithMeta<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<CacheResult<T>> {
    try {
      const cached = await this.get<T>(key);
      if (cached !== null && cached !== undefined) {
        return { data: cached, source: "HIT" };
      }
    } catch (error: any) {
      console.warn(`⚠️ [Cache Bypass] Redis error on GET "${key}", falling back to DB:`, error.message);
    }

    // Cache miss or Redis unavailable -> fetch fresh data from database
    const freshData = await fetchFn();

    // Cache the fresh data asynchronously if valid
    if (freshData !== null && freshData !== undefined && this.isAvailable()) {
      this.set(key, freshData, ttl).catch((err) => {
        console.error(`❌ [Cache SET Background error] Key "${key}":`, err.message);
      });
    }

    return { data: freshData, source: "MISS" };
  }

  /**
   * ⚡ Generic Cache-Aside Pattern
   * Returns data directly (convenience wrapper around getOrSetWithMeta)
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const { data } = await this.getOrSetWithMeta<T>(key, fetchFn, ttl);
    return data;
  }

  /**
   * Delete single key
   */
  async del(key: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await this.redis.del(key);
    } catch (error: any) {
      console.error(`❌ [Cache DEL error] Key "${key}":`, error.message);
    }
  }

  /**
   * Delete multiple keys using Redis pipelining
   */
  async delMultiple(keys: string[]): Promise<void> {
    if (!this.isAvailable() || !keys || keys.length === 0) return;

    try {
      const pipeline = this.redis.pipeline();
      keys.forEach((key) => pipeline.del(key));
      await pipeline.exec();
    } catch (error: any) {
      console.error(`❌ [Cache DEL Multiple error]:`, error.message);
    }
  }

  /**
   * ⭐ High-Performance Pattern Invalidation using SCAN + Redis Pipelining
   * - Uses non-blocking SCAN with batching to avoid locking the Redis event loop.
   * - Uses Redis Pipelining (pipeline + synchronous await per batch) to minimize network round-trips.
   */
  async invalidatePattern(pattern: string): Promise<number> {
    if (!this.isAvailable()) return 0;

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

        if (keys && keys.length > 0) {
          const pipeline = this.redis.pipeline();
          keys.forEach((key) => pipeline.del(key));
          const results = await pipeline.exec();

          if (results) {
            for (const [err, count] of results) {
              if (!err) {
                deletedCount += typeof count === "number" ? count : 1;
              } else if (err) {
                console.error(`❌ [Pipeline DEL error]:`, err.message);
              }
            }
          }
        }
      } while (cursor !== "0");

      return deletedCount;
    } catch (error: any) {
      console.error(`❌ [Cache Invalidate Pattern error] Pattern "${pattern}":`, error.message);
      return deletedCount;
    }
  }

  /**
   * Alias for invalidatePattern for backwards compatibility
   */
  async delByPattern(pattern: string): Promise<number> {
    return this.invalidatePattern(pattern);
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error: any) {
      console.error(`❌ [Cache EXISTS error] Key "${key}":`, error.message);
      return false;
    }
  }

  /**
   * Get TTL of a key (in seconds)
   */
  async ttl(key: string): Promise<number> {
    if (!this.isAvailable()) return -1;

    try {
      return await this.redis.ttl(key);
    } catch (error: any) {
      console.error(`❌ [Cache TTL error] Key "${key}":`, error.message);
      return -1;
    }
  }

  /**
   * Flush all cache (use with caution)
   */
  async flushAll(): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await this.redis.flushall();
      console.warn("⚠️  [Cache FLUSH ALL] All cache keys cleared");
    } catch (error: any) {
      console.error("❌ [Cache FLUSH ALL error]:", error.message);
    }
  }

  /**
   * Get Redis client instance
   */
  getClient(): Redis {
    return this.redis;
  }

  /**
   * Close Redis connection gracefully
   */
  async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
      console.log("👋 Redis Connection Closed");
    } catch (error: any) {
      console.error("❌ Redis disconnect error:", error.message);
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();
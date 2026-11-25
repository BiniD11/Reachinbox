import IORedis, { RedisOptions } from 'ioredis';
import { config } from '../config';
import logger from './logger';

const isProductionMissingRedis =
  config.nodeEnv === 'production' && !config.redis.url && !process.env.REDIS_HOST;

if (isProductionMissingRedis) {
  logger.error(
    'REDIS_URL is not set! Please set REDIS_URL in your Render Environment Variables.'
  );
}

const commonOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    if (isProductionMissingRedis) {
      return Math.min(times * 5000, 60000); // avoid log spam if env var is missing
    }
    return Math.min(times * 50, 2000);
  },
};

function createRedisClient(): IORedis {
  if (config.redis.url) {
    const useTls = config.redis.url.startsWith('rediss://');
    return new IORedis(config.redis.url, {
      ...commonOptions,
      ...(useTls ? { tls: { rejectUnauthorized: false } } : {}),
    });
  }

  return new IORedis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    ...commonOptions,
  });
}

export const redis = createRedisClient();
export const redisForBullMQ = createRedisClient();

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => {
  if (!isProductionMissingRedis) {
    logger.error('Redis error:', err);
  }
});

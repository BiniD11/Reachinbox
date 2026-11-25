import IORedis from 'ioredis';
import { config } from '../config';
import logger from './logger';

const redisConfig = config.redis.url
  ? config.redis.url
  : {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    };

export const redis = typeof redisConfig === 'string'
  ? new IORedis(redisConfig, { maxRetriesPerRequest: null, enableReadyCheck: false })
  : new IORedis(redisConfig);

export const redisForBullMQ = typeof redisConfig === 'string'
  ? new IORedis(redisConfig, { maxRetriesPerRequest: null, enableReadyCheck: false })
  : new IORedis(redisConfig);

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error('Redis error:', err));

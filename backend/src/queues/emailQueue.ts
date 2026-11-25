import { Queue } from 'bullmq';
import { redisForBullMQ } from '../lib/redis';

export const EMAIL_QUEUE_NAME = 'email-jobs';
export const EMAIL_SEND_QUEUE_NAME = 'email-sends';

export const emailJobQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection: redisForBullMQ,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

export const emailSendQueue = new Queue(EMAIL_SEND_QUEUE_NAME, {
  connection: redisForBullMQ,
  defaultJobOptions: {
    removeOnComplete: { count: 5000 },
    removeOnFail: { count: 10000 },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

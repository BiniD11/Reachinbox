import { Worker, Job } from 'bullmq';
import { redisForBullMQ, redis } from '../lib/redis';
import { config } from '../config';
import { createTransporter, getPreviewUrl, getEtherealAccount } from '../lib/ethereal';
import { indexEmail, updateEmailIndex } from '../lib/elasticsearch';
import { notifySlackRateLimit } from '../services/slackService';
import logger from '../lib/logger';
import prisma from '../lib/prisma';
import { EMAIL_QUEUE_NAME, EMAIL_SEND_QUEUE_NAME, emailSendQueue } from './emailQueue';

export interface EmailJobData {
  jobId: string;
  userId: string;
  senderId: string;
  subject: string;
  body: string;
  recipients: string[];
  delayBetween: number;
  hourlyLimit: number;
}

export interface EmailSendData {
  logId: string;
  jobId: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  senderEmail: string;
  senderName: string;
}

// Rate limiting: Redis-backed per-sender hourly counter
async function checkAndIncrementRateLimit(
  senderId: string,
  userId: string,
  hourlyLimit: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = new Date();
  const hourWindow = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
  const key = `rate:${senderId}:${hourWindow}`;
  
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, 3600);
  const results = await pipeline.exec();
  
  const count = (results?.[0]?.[1] as number) || 0;
  const resetAt = new Date();
  resetAt.setUTCMinutes(0, 0, 0);
  resetAt.setUTCHours(resetAt.getUTCHours() + 1);
  
  if (count > hourlyLimit) {
    // Notify Slack if rate limit hit
    if (count === hourlyLimit + 1) {
      notifySlackRateLimit(userId, senderId, hourlyLimit).catch(err => 
        logger.error('Failed to send Slack notification:', err)
      );
    }
    // Decrement since we over-counted
    await redis.decr(key);
    return { allowed: false, remaining: 0, resetAt: resetAt.getTime() };
  }
  
  return { allowed: true, remaining: hourlyLimit - count, resetAt: resetAt.getTime() };
}

// Email job worker: expands recipients into individual send jobs
export const emailJobWorker = new Worker(
  EMAIL_QUEUE_NAME,
  async (job: Job<EmailJobData>) => {
    const { jobId, recipients, senderId, userId, subject, body, delayBetween } = job.data;
    
    logger.info(`Processing email job ${jobId} with ${recipients?.length || 0} recipients`);
    
    try {
      // Update job status to PROCESSING
      await prisma.emailJob.update({
        where: { id: jobId },
        data: { status: 'PROCESSING', startedAt: new Date() },
      });
      
      // Get sender info with fallback
      const jobRecord = await prisma.emailJob.findUnique({
        where: { id: jobId },
        include: { sender: true },
      });
      
      let sender: any = jobRecord?.sender;
      if (!sender && senderId) {
        sender = await prisma.emailSender.findUnique({ where: { id: senderId } });
      }
      if (!sender) {
        const ethereal = await getEtherealAccount();
        sender = await prisma.emailSender.create({
          data: {
            userId: userId || jobRecord?.userId || '',
            email: ethereal.user,
            name: 'ReachInbox Sender',
            host: ethereal.smtp.host,
            port: ethereal.smtp.port,
            secure: ethereal.smtp.secure,
            user: ethereal.user,
            password: ethereal.pass,
          },
        });
        await prisma.emailJob.update({
          where: { id: jobId },
          data: { senderId: sender.id },
        });
      }
      
      const safeRecipients = recipients || (jobRecord?.recipients as string[]) || [];

      // Create email logs and schedule individual sends
      for (let i = 0; i < safeRecipients.length; i++) {
        const recipient = safeRecipients[i];
        
        // Create a log entry
        const log = await prisma.emailLog.create({
          data: {
            jobId,
            recipient,
            subject,
            status: 'PENDING',
          },
        });
        
        // Schedule individual email send with delay
        const delay = i * (delayBetween || 2000);
        const sendData: EmailSendData = {
          logId: log.id,
          jobId,
          userId: userId || jobRecord?.userId || '',
          senderId: sender.id,
          recipient,
          subject,
          body,
          senderEmail: sender.email,
          senderName: sender.name,
        };
        
        await emailSendQueue.add(
          `send-${log.id}`,
          sendData,
          {
            delay,
            jobId: log.id, // Use log ID as BullMQ job ID for idempotency
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 5000 },
          }
        );
        
        // Index in Elasticsearch
        await indexEmail({
          id: log.id,
          jobId,
          userId: userId || jobRecord?.userId || '',
          recipient,
          subject,
          body,
          status: 'PENDING',
          scheduledAt: new Date(Date.now() + delay),
          senderEmail: sender.email,
          createdAt: log.createdAt,
        });
      }
      
      logger.info(`Email job ${jobId}: scheduled ${safeRecipients.length} individual sends`);
      return { scheduled: safeRecipients.length };
    } catch (err: any) {
      logger.error(`Error in emailJobWorker for job ${jobId}:`, err);
      await prisma.emailJob.update({
        where: { id: jobId },
        data: { status: 'FAILED' },
      });
      throw err;
    }
  },
  {
    connection: redisForBullMQ,
    concurrency: config.rateLimit.workerConcurrency,
  }
);

// Email send worker: sends individual emails with rate limiting
export const emailSendWorker = new Worker(
  EMAIL_SEND_QUEUE_NAME,
  async (job: Job<EmailSendData>) => {
    const { logId, jobId, userId, senderId, recipient, subject, body, senderEmail, senderName } = job.data;
    
    // Check rate limit (Redis-backed per-sender per-hour)
    const { allowed, resetAt } = await checkAndIncrementRateLimit(
      senderId,
      userId,
      config.rateLimit.maxEmailsPerHourPerSender
    );
    
    if (!allowed) {
      // Delay until next hour window
      const delayMs = resetAt - Date.now() + 1000;
      logger.warn(`Rate limit hit for sender ${senderId}. Rescheduling in ${delayMs}ms`);
      
      await emailSendQueue.add(
        `send-${logId}-retry`,
        job.data,
        {
          delay: delayMs,
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        }
      );
      
      return { rescheduled: true, delayMs };
    }
    
    // Get sender config with fallback
    let sender = senderId ? await prisma.emailSender.findUnique({ where: { id: senderId } }) : null;
    if (!sender) {
      const jobRecord = await prisma.emailJob.findUnique({
        where: { id: jobId },
        include: { sender: true },
      });
      sender = jobRecord?.sender || null;
    }
    
    try {
      const transporter = await createTransporter(
        sender ? {
          host: sender.host,
          port: sender.port,
          secure: sender.secure,
          user: sender.user,
          password: sender.password,
        } : undefined
      );
      
      const info = await transporter.sendMail({
        from: `"${senderName || 'ReachInbox'}" <${senderEmail || sender?.email}>`,
        to: recipient,
        subject,
        html: body,
      });
      
      const previewUrl = getPreviewUrl(info);
      
      // Update log
      await prisma.emailLog.update({
        where: { id: logId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          messageId: info.messageId,
        },
      });
      
      // Update job sent count
      await prisma.emailJob.update({
        where: { id: jobId },
        data: { sentCount: { increment: 1 } },
      });
      
      // Update Elasticsearch
      await updateEmailIndex(logId, { status: 'SENT', sentAt: new Date() });
      
      logger.info(`Email sent to ${recipient}. Preview: ${previewUrl}`);
      return { sent: true, messageId: info.messageId, previewUrl };
      
    } catch (error: any) {
      logger.error(`Failed to send email to ${recipient}:`, error);
      
      await prisma.emailLog.update({
        where: { id: logId },
        data: { status: 'FAILED', error: error.message },
      });
      
      await prisma.emailJob.update({
        where: { id: jobId },
        data: { failedCount: { increment: 1 } },
      });
      
      await updateEmailIndex(logId, { status: 'FAILED' });
      
      throw error;
    }
  },
  {
    connection: redisForBullMQ,
    concurrency: config.rateLimit.workerConcurrency,
    limiter: {
      max: 1,
      duration: config.rateLimit.minDelayBetweenSendsMs,
    },
  }
);

// Watch for job completion to update parent job status
emailSendWorker.on('completed', async (job) => {
  const { jobId } = job.data;
  
  const jobRecord = await prisma.emailJob.findUnique({
    where: { id: jobId },
  });
  
  if (!jobRecord) return;
  
  const totalDone = jobRecord.sentCount + jobRecord.failedCount;
  if (totalDone >= jobRecord.totalEmails && jobRecord.status === 'PROCESSING') {
    await prisma.emailJob.update({
      where: { id: jobId },
      data: { 
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
    logger.info(`Job ${jobId} marked as COMPLETED (${jobRecord.sentCount} sent, ${jobRecord.failedCount} failed)`);
  }
});

emailJobWorker.on('failed', async (job, err) => {
  logger.error(`Email job failed: ${job?.id}`, err);
  if (job?.data?.jobId) {
    await prisma.emailJob.update({
      where: { id: job.data.jobId },
      data: { status: 'FAILED' },
    }).catch(() => {});
  }
});

emailSendWorker.on('failed', async (job, err) => {
  logger.error(`Email send failed: ${job?.id}`, err);
  if (job?.data?.jobId) {
    const jobRecord = await prisma.emailJob.findUnique({ where: { id: job.data.jobId } });
    if (jobRecord && (jobRecord.sentCount + jobRecord.failedCount >= jobRecord.totalEmails)) {
      await prisma.emailJob.update({
        where: { id: job.data.jobId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      }).catch(() => {});
    }
  }
});

// Auto-recover any jobs stuck in PROCESSING that haven't dispatched their sends
export async function recoverStuckJobs() {
  try {
    const stuckJobs = await prisma.emailJob.findMany({
      where: {
        status: 'PROCESSING',
      },
      include: { sender: true },
    });

    for (const job of stuckJobs) {
      if (job.sentCount + job.failedCount >= job.totalEmails && job.totalEmails > 0) {
        await prisma.emailJob.update({
          where: { id: job.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        continue;
      }

      logger.info(`Checking stuck job ${job.id} (sent: ${job.sentCount}/${job.totalEmails})`);
      const recipients = (job.recipients as string[]) || [];
      if (!recipients.length) continue;

      let sender = job.sender;
      if (!sender) {
        const ethereal = await getEtherealAccount();
        sender = await prisma.emailSender.create({
          data: {
            userId: job.userId,
            email: ethereal.user,
            name: 'ReachInbox Sender',
            host: ethereal.smtp.host,
            port: ethereal.smtp.port,
            secure: ethereal.smtp.secure,
            user: ethereal.user,
            password: ethereal.pass,
          },
        });
        await prisma.emailJob.update({
          where: { id: job.id },
          data: { senderId: sender.id },
        });
      }

      // Check existing logs
      const existingLogs = await prisma.emailLog.findMany({
        where: { jobId: job.id },
      });

      if (existingLogs.length === 0) {
        // Expand and schedule sends
        for (let i = 0; i < recipients.length; i++) {
          const recipient = recipients[i];
          const log = await prisma.emailLog.create({
            data: {
              jobId: job.id,
              recipient,
              subject: job.subject,
              status: 'PENDING',
            },
          });
          const delay = i * (job.delayBetween || 2000);
          await emailSendQueue.add(
            `send-${log.id}`,
            {
              logId: log.id,
              jobId: job.id,
              userId: job.userId,
              senderId: sender.id,
              recipient,
              subject: job.subject,
              body: job.body,
              senderEmail: sender.email,
              senderName: sender.name,
            },
            {
              delay,
              jobId: log.id,
              removeOnComplete: { count: 1000 },
              removeOnFail: { count: 5000 },
            }
          );
        }
        logger.info(`Recovered and queued ${recipients.length} sends for job ${job.id}`);
      } else {
        // Re-queue pending logs that were never sent
        const pendingLogs = existingLogs.filter(l => l.status === 'PENDING');
        for (let i = 0; i < pendingLogs.length; i++) {
          const log = pendingLogs[i];
          await emailSendQueue.add(
            `send-${log.id}`,
            {
              logId: log.id,
              jobId: job.id,
              userId: job.userId,
              senderId: sender.id,
              recipient: log.recipient,
              subject: log.subject,
              body: job.body,
              senderEmail: sender.email,
              senderName: sender.name,
            },
            {
              delay: i * (job.delayBetween || 2000),
              jobId: log.id,
              removeOnComplete: { count: 1000 },
              removeOnFail: { count: 5000 },
            }
          );
        }
        if (pendingLogs.length > 0) {
          logger.info(`Re-queued ${pendingLogs.length} pending sends for job ${job.id}`);
        }
      }
    }
  } catch (err) {
    logger.error('Error recovering stuck jobs:', err);
  }
}

logger.info('Email workers started');

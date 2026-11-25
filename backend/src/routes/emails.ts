import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { emailJobQueue } from '../queues/emailQueue';
import { searchEmails } from '../lib/elasticsearch';
import { getEtherealAccount } from '../lib/ethereal';
import logger from '../lib/logger';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Schedule a new email job
router.post('/schedule', authMiddleware, upload.single('recipients'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      senderId,
      senderEmail,
      senderName,
      subject,
      body,
      scheduledAt,
      delayBetween = 2000,
      hourlyLimit = 200,
      recipients: recipientsJson,
    } = req.body;
    
    let recipients: string[] = [];
    
    // Parse recipients from uploaded file or JSON body
    if (req.file) {
      const content = req.file.buffer.toString('utf-8');
      recipients = parseRecipients(content);
    } else if (recipientsJson) {
      recipients = JSON.parse(recipientsJson);
    }
    
    if (!recipients.length) {
      res.status(400).json({ error: 'No valid recipients found' });
      return;
    }

    let finalSenderId = senderId;

    // If user typed a sender email directly
    if (!finalSenderId && (senderEmail || req.body.fromEmail)) {
      const email = ((senderEmail || req.body.fromEmail) as string).trim();
      let sender = await prisma.emailSender.findFirst({
        where: { userId: req.user!.id, email },
      });

      if (!sender) {
        const ethereal = await getEtherealAccount();
        sender = await prisma.emailSender.create({
          data: {
            userId: req.user!.id,
            email,
            name: senderName || email.split('@')[0],
            host: ethereal.smtp.host,
            port: ethereal.smtp.port,
            secure: ethereal.smtp.secure,
            user: ethereal.user,
            password: ethereal.pass,
          },
        });
      }
      finalSenderId = sender.id;
    }

    if (!finalSenderId) {
      // Fallback: use first existing sender or create ethereal sender automatically
      let defaultSender = await prisma.emailSender.findFirst({
        where: { userId: req.user!.id },
      });
      if (!defaultSender) {
        const ethereal = await getEtherealAccount();
        defaultSender = await prisma.emailSender.create({
          data: {
            userId: req.user!.id,
            email: ethereal.user,
            name: 'ReachInbox Sender',
            host: ethereal.smtp.host,
            port: ethereal.smtp.port,
            secure: ethereal.smtp.secure,
            user: ethereal.user,
            password: ethereal.pass,
          },
        });
      }
      finalSenderId = defaultSender.id;
    }
    
    const scheduleTime = new Date(scheduledAt);
    const delay = Math.max(0, scheduleTime.getTime() - Date.now());
    
    // Create the job in DB
    const job = await prisma.emailJob.create({
      data: {
        userId: req.user!.id,
        senderId: finalSenderId,
        subject,
        body,
        recipients,
        scheduledAt: scheduleTime,
        status: 'PENDING',
        totalEmails: recipients.length,
        delayBetween: parseInt(delayBetween),
        hourlyLimit: parseInt(hourlyLimit),
      },
    });
    
    // Add to BullMQ with delay
    const bullJob = await emailJobQueue.add(
      `job-${job.id}`,
      {
        jobId: job.id,
        userId: req.user!.id,
        senderId: finalSenderId,
        subject,
        body,
        recipients,
        delayBetween: parseInt(delayBetween),
        hourlyLimit: parseInt(hourlyLimit),
      },
      {
        delay,
        jobId: job.id, // Use DB job ID for idempotency
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      }
    );
    
    // Update with bull job ID
    await prisma.emailJob.update({
      where: { id: job.id },
      data: { bullJobId: bullJob.id },
    });
    
    res.json({
      message: 'Email job scheduled successfully',
      jobId: job.id,
      recipientCount: recipients.length,
      scheduledAt: scheduleTime.toISOString(),
    });
  } catch (err: any) {
    logger.error('Schedule email error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all scheduled/pending jobs
router.get('/scheduled', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    const [jobs, total] = await Promise.all([
      prisma.emailJob.findMany({
        where: {
          userId: req.user!.id,
          status: { in: ['PENDING', 'PROCESSING', 'PAUSED'] },
        },
        include: { sender: { select: { email: true, name: true } } },
        orderBy: { scheduledAt: 'asc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.emailJob.count({
        where: {
          userId: req.user!.id,
          status: { in: ['PENDING', 'PROCESSING', 'PAUSED'] },
        },
      }),
    ]);
    
    res.json({ jobs, total, page: parseInt(page as string), limit: parseInt(limit as string) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get sent emails (logs)
router.get('/sent', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    const [logs, total] = await Promise.all([
      prisma.emailLog.findMany({
        where: {
          job: { userId: req.user!.id },
          status: { in: ['SENT', 'FAILED'] },
        },
        include: {
          job: {
            include: { sender: { select: { email: true, name: true } } },
          },
        },
        orderBy: { sentAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.emailLog.count({
        where: {
          job: { userId: req.user!.id },
          status: { in: ['SENT', 'FAILED'] },
        },
      }),
    ]);
    
    res.json({ logs, total, page: parseInt(page as string), limit: parseInt(limit as string) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get a specific job
router.get('/jobs/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const job = await prisma.emailJob.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: {
        sender: { select: { email: true, name: true } },
        emailLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    
    res.json({ job });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Search emails via Elasticsearch
router.get('/search', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { q, status } = req.query as { q: string; status?: string };
    const results = await searchEmails(req.user!.id, q || '', status);
    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel a job
router.delete('/jobs/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const job = await prisma.emailJob.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    
    if (job.bullJobId) {
      const bullJob = await emailJobQueue.getJob(job.bullJobId);
      if (bullJob) await bullJob.remove();
    }
    
    await prisma.emailJob.update({
      where: { id: job.id },
      data: { status: 'FAILED' },
    });
    
    res.json({ message: 'Job cancelled' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function parseRecipients(content: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = content.match(emailRegex) || [];
  return [...new Set(matches)]; // Deduplicate
}

export default router;

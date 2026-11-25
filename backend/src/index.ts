import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { config } from './config';
import logger from './lib/logger';
import { initElasticsearch } from './lib/elasticsearch';
import { emailJobQueue, emailSendQueue } from './queues/emailQueue';
import { recoverStuckJobs } from './queues/emailWorker'; // Start workers and import recovery

import authRoutes from './routes/auth';
import emailRoutes from './routes/emails';
import senderRoutes from './routes/senders';

const app = express();

// Middleware
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.initialize());

// Bull Board Dashboard
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(emailJobQueue as any) as any,
    new BullMQAdapter(emailSendQueue as any) as any,
  ],
  serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());

// Routes
app.use('/auth', authRoutes);
app.use('/emails', emailRoutes);
app.use('/senders', senderRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Manual trigger to recover/resume any stuck processing jobs
app.post('/emails/recover', async (req, res) => {
  try {
    await recoverStuckJobs();
    res.json({ message: 'Recovery triggered successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
async function bootstrap() {
  await initElasticsearch();
  await recoverStuckJobs();
  
  app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port}`);
    logger.info(`Bull Board: http://localhost:${config.port}/admin/queues`);
  });
}

bootstrap().catch(err => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});

export default app;

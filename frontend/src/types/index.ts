export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  slackToken?: string;
  slackTeamId?: string;
}

export interface EmailSender {
  id: string;
  email: string;
  name: string;
  host?: string;
  port?: number;
  createdAt: string;
}

export interface EmailJob {
  id: string;
  userId: string;
  senderId: string;
  subject: string;
  body: string;
  recipients: string[];
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PAUSED';
  totalEmails: number;
  sentCount: number;
  failedCount: number;
  delayBetween: number;
  hourlyLimit: number;
  createdAt: string;
  sender?: { email: string; name: string };
}

export interface EmailLog {
  id: string;
  jobId: string;
  recipient: string;
  subject: string;
  sentAt?: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  messageId?: string;
  error?: string;
  createdAt: string;
  job?: EmailJob;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

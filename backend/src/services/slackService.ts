import axios from 'axios';
import { config } from '../config';
import prisma from '../lib/prisma';
import logger from '../lib/logger';

export async function notifySlackRateLimit(
  userId: string,
  senderId: string,
  limit: number
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.slackWebhook && !user?.slackToken) {
      logger.info(`No Slack configured for user ${userId}, skipping notification`);
      return;
    }
    
    const sender = await prisma.emailSender.findUnique({ where: { id: senderId } });
    const message = {
      text: `⚠️ *Email Rate Limit Reached*`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `⚠️ *Email Rate Limit Reached*\n\nSender *${sender?.email || senderId}* has hit the hourly limit of *${limit} emails*.\n\nFuture emails have been rescheduled for the next hour window.`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `🕐 Time: ${new Date().toISOString()} | Limit: ${limit} emails/hour`,
            },
          ],
        },
      ],
    };
    
    if (user.slackWebhook) {
      await axios.post(user.slackWebhook, message);
      logger.info(`Slack notification sent via webhook for user ${userId}`);
    } else if (user.slackToken) {
      // Use Slack API if we have a token but no webhook
      await axios.post(
        'https://slack.com/api/chat.postMessage',
        {
          ...message,
          channel: '#email-alerts',
        },
        {
          headers: {
            Authorization: `Bearer ${user.slackToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      logger.info(`Slack notification sent via API for user ${userId}`);
    }
  } catch (err) {
    logger.error('Failed to send Slack notification:', err);
  }
}

export async function getSlackAuthUrl(userId: string): Promise<string> {
  const scopes = ['incoming-webhook', 'chat:write', 'chat:write.public'].join(',');
  const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
  
  return `https://slack.com/oauth/v2/authorize?client_id=${config.slack.clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(config.slack.redirectUri)}&state=${state}`;
}

export async function handleSlackCallback(code: string, state: string): Promise<void> {
  const { userId } = JSON.parse(Buffer.from(state, 'base64').toString());
  
  const response = await axios.post(
    'https://slack.com/api/oauth.v2.access',
    new URLSearchParams({
      client_id: config.slack.clientId,
      client_secret: config.slack.clientSecret,
      code,
      redirect_uri: config.slack.redirectUri,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  
  const data = response.data;
  if (!data.ok) throw new Error(data.error);
  
  await prisma.user.update({
    where: { id: userId },
    data: {
      slackToken: data.access_token,
      slackWebhook: data.incoming_webhook?.url,
      slackTeamId: data.team?.id,
    },
  });
}

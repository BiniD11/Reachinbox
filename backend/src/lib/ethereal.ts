import nodemailer from 'nodemailer';
import logger from './logger';

let etherealAccount: { user: string; pass: string; smtp: any } | null = null;

export async function getEtherealAccount() {
  if (etherealAccount) return etherealAccount;
  
  const account = await nodemailer.createTestAccount();
  etherealAccount = {
    user: account.user,
    pass: account.pass,
    smtp: account.smtp,
  };
  
  logger.info(`Ethereal account created: ${account.user}`);
  return etherealAccount;
}

export async function createTransporter(senderConfig?: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}) {
  if (senderConfig) {
    return nodemailer.createTransport({
      host: senderConfig.host,
      port: senderConfig.port,
      secure: senderConfig.secure,
      auth: {
        user: senderConfig.user,
        pass: senderConfig.password,
      },
    });
  }
  
  const account = await getEtherealAccount();
  return nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: {
      user: account.user,
      pass: account.pass,
    },
  });
}

export function getPreviewUrl(info: nodemailer.SentMessageInfo): string {
  return nodemailer.getTestMessageUrl(info) || '';
}

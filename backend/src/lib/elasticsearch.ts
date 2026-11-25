import { Client } from '@elastic/elasticsearch';
import { config } from '../config';
import logger from './logger';

export const esClient = new Client({
  node: config.elasticsearch.node,
});

export async function initElasticsearch() {
  try {
    const indexName = config.elasticsearch.index;
    
    const indexExists = await esClient.indices.exists({ index: indexName });
    
    if (!indexExists) {
      await esClient.indices.create({
        index: indexName,
        body: {
          mappings: {
            properties: {
              id: { type: 'keyword' },
              jobId: { type: 'keyword' },
              userId: { type: 'keyword' },
              recipient: { type: 'keyword' },
              subject: { 
                type: 'text',
                fields: { keyword: { type: 'keyword' } }
              },
              body: { type: 'text' },
              status: { type: 'keyword' },
              sentAt: { type: 'date' },
              scheduledAt: { type: 'date' },
              senderEmail: { type: 'keyword' },
              createdAt: { type: 'date' },
            }
          }
        }
      });
      logger.info(`Elasticsearch index '${indexName}' created`);
    } else {
      logger.info(`Elasticsearch index '${indexName}' already exists`);
    }
  } catch (err) {
    logger.error('Elasticsearch init error:', err);
  }
}

export async function indexEmail(doc: {
  id: string;
  jobId: string;
  userId: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  sentAt?: Date;
  scheduledAt?: Date;
  senderEmail: string;
  createdAt: Date;
}) {
  try {
    await esClient.index({
      index: config.elasticsearch.index,
      id: doc.id,
      document: doc,
    });
  } catch (err) {
    logger.error('Failed to index email in Elasticsearch:', err);
  }
}

export async function updateEmailIndex(id: string, doc: Partial<{
  status: string;
  sentAt: Date;
}>) {
  try {
    await esClient.update({
      index: config.elasticsearch.index,
      id,
      doc,
    });
  } catch (err) {
    logger.error('Failed to update email in Elasticsearch:', err);
  }
}

export async function searchEmails(userId: string, query: string, status?: string) {
  try {
    const must: any[] = [
      { term: { userId } }
    ];
    
    if (query) {
      must.push({
        multi_match: {
          query,
          fields: ['subject', 'body', 'recipient'],
        }
      });
    }
    
    if (status) {
      must.push({ term: { status } });
    }
    
    const result = await esClient.search({
      index: config.elasticsearch.index,
      body: {
        query: { bool: { must } },
        sort: [{ createdAt: { order: 'desc' } }],
        size: 100,
      }
    });
    
    return result.hits.hits.map((hit: any) => hit._source);
  } catch (err) {
    logger.warn('Elasticsearch search failed or not configured, using PostgreSQL fallback');
    
    // Fallback to PostgreSQL via Prisma for environments like Render without external Elasticsearch
    try {
      const where: any = {
        job: { userId },
      };
      if (status) {
        where.status = status;
      }
      if (query) {
        where.OR = [
          { subject: { contains: query, mode: 'insensitive' } },
          { recipient: { contains: query, mode: 'insensitive' } },
        ];
      }
      
      const prismaClient = (await import('./prisma')).default;
      const logs = await prismaClient.emailLog.findMany({
        where,
        include: { job: { include: { sender: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return logs.map(l => ({
        id: l.id,
        jobId: l.jobId,
        userId,
        recipient: l.recipient,
        subject: l.subject,
        body: l.job.body,
        status: l.status,
        sentAt: l.sentAt,
        senderEmail: l.job.sender?.email || '',
        createdAt: l.createdAt,
      }));
    } catch (fallbackErr) {
      logger.error('PostgreSQL fallback search error:', fallbackErr);
      return [];
    }
  }
}

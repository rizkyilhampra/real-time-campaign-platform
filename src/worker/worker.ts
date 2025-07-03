import { Worker } from 'bullmq';
import {
  jidNormalizedUser,
  AnyMessageContent,
} from '@whiskeysockets/baileys';
import {
  MESSAGE_QUEUE_NAME,
  FILE_PROCESS_QUEUE_NAME,
  addMessageJob,
} from '../shared/jobs';
import { redis, redisPublisher, redisSubscriber } from '../shared/redis';
import logger from '../shared/logger';
import { FileProcessJobData, MessageJobData, Recipient } from '../shared/types';
import { sessionManager } from './services/SessionManager';
import fs from 'fs/promises';
import XLSX from 'xlsx';
import { getRecipientsFromDB } from '../api/controllers/campaign.controller';
import { scheduleCampaignJobs } from './services/CampaignScheduler';

const setupCommandListener = () => {
  const commandSubscriber = redisSubscriber.duplicate();
  commandSubscriber.subscribe('session:command', (err) => {
    if (err) {
      logger.error({ err }, 'Failed to subscribe to session:command channel');
      return;
    }
    logger.info('Subscribed to session:command channel');
  });

  commandSubscriber.on('message', async (channel, message) => {
    if (channel !== 'session:command') return;

    try {
      const { command, sessionId } = JSON.parse(message);
      logger.info({ command, sessionId }, 'Received command for session');

      if (command === 'connect') {
        await sessionManager.createSession(sessionId);
      } else if (command === 'logout') {
        await sessionManager.logoutSession(sessionId);
      }
    } catch (e) {
      logger.error({ err: e }, 'Failed to process command from redis');
    }
  });
};

const processMessageJob = async (job: { data: MessageJobData }) => {
  const { blastId, sessionId, recipient, message, media } = job.data;
  logger.info(
    { blastId, sessionId, to: recipient.phone, hasMedia: !!media },
    'Processing message job'
  );

  const session = await sessionManager.getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found or not connected.`);
  }

  try {
    const jid = jidNormalizedUser(`${recipient.phone}@s.whatsapp.net`);

    if (media) {
      const mediaBuffer = Buffer.from(media.buffer);
      const { mimetype, filename } = media;

      let hasCaption = true;
      let mediaContent:
        | { image: Buffer }
        | { video: Buffer }
        | { audio: Buffer }
        | { document: Buffer; fileName: string };

      if (mimetype.startsWith('image/')) {
        mediaContent = { image: mediaBuffer };
      } else if (mimetype.startsWith('video/')) {
        mediaContent = { video: mediaBuffer };
      } else if (mimetype.startsWith('audio/')) {
        mediaContent = { audio: mediaBuffer };
        hasCaption = false;
      } else {
        mediaContent = { document: mediaBuffer, fileName: filename };
      }

      const messageOptions: AnyMessageContent = {
        ...mediaContent,
        mimetype: mimetype,
        ...(hasCaption && { caption: message }),
      };

      await session.sendMessage(jid, messageOptions);
    } else {
      await session.sendMessage(jid, { text: message });
    }
    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Failed to send message');
    throw error;
  }
};

const worker = new Worker<MessageJobData>(
  MESSAGE_QUEUE_NAME,
  processMessageJob,
  {
    connection: redis,
    concurrency: 5,
    limiter: {
      max: 5,
      duration: 1000,
    },
  }
);

worker.on('completed', async (job, result) => {
  logger.info({ jobId: job.id, result }, 'Job completed');
  const { blastId, recipient } = job.data;
  const payload = JSON.stringify({ blastId, status: 'SENT', recipient });
  await redisPublisher.publish('blast:progress', payload);

  const remainingJobs = await redis.decr(`blast:${blastId}:remaining`);
  if (remainingJobs === 0) {
    await redisPublisher.publish(
      'blast:completed',
      JSON.stringify({ blastId })
    );
    await redis.del(`blast:${blastId}:remaining`);
  }
});

worker.on('failed', async (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Job failed');
  if (job) {
    const { blastId, recipient } = job.data;
    const payload = JSON.stringify({ blastId, status: 'FAILED', recipient });
    await redisPublisher.publish('blast:progress', payload);

  }
});

logger.info('Worker process started and listening for jobs.');

setupCommandListener();
scheduleCampaignJobs();

const gracefulShutdown = async (signal: string) => {
  logger.warn(`Received ${signal}. Shutting down gracefully...`);

  await worker.close();
  logger.info('BullMQ worker closed.');

  const sessions = sessionManager.getSessionsState();
  for (const sessionState of sessions) {
    logger.info(`Disconnecting session: ${sessionState.id}`);
    const session = await sessionManager.getSession(sessionState.id);
    session?.end(new Error('Graceful shutdown initiated'));
  }
  logger.info('All sessions disconnected.');

  await redis.quit();
  await redisSubscriber.quit();
  await redisPublisher.quit();
  logger.info('Redis connections closed.');

  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

const processFileJob = async (job: { data: FileProcessJobData }) => {
  const { blastId, sessionId, message, filePath, campaignId, media } = job.data;
  logger.info({ blastId, filePath }, 'Processing blast file');

  try {
    const recipients: Recipient[] = [];
    const fileBuffer = await fs.readFile(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('Invalid Excel file: No sheets found');
    }
    const ws = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
      defval: '',
    });

    recipients.push(
      ...rows
        .map((row: Record<string, any>): Recipient => {
          const normalised: Record<string, string> = {};
          for (const [k, v] of Object.entries(row)) {
            normalised[k.toLowerCase()] = String(v);
          }
          return {
            phone: (normalised['phone'] || '').trim(),
            name: (normalised['name'] || '').trim(),
          } as Recipient;
        })
        .filter((r: Recipient) => r.phone)
    );

    if (campaignId) {
      const campaignRecipients = await getRecipientsFromDB(campaignId);
      recipients.push(...campaignRecipients);
    }

    // Deduplicate recipients, giving priority to the Excel file data.
    const recipientMap = new Map<string, Recipient>();
    if (campaignId) {
      const campaignRecipients = await getRecipientsFromDB(campaignId);
      for (const recipient of campaignRecipients) {
        recipientMap.set(recipient.phone, recipient);
      }
    }
    for (const recipient of recipients) {
      recipientMap.set(recipient.phone, recipient);
    }
    const uniqueRecipients = Array.from(recipientMap.values());

    if (uniqueRecipients.length === 0) {
      logger.warn({ blastId }, 'No unique recipients found in file or campaign');
      return;
    }

    for (const recipient of uniqueRecipients) {
      await addMessageJob({
        blastId,
        sessionId,
        recipient,
        message: message.replace('{name}', recipient.name),
        media,
      });
    }

    await redis.set(`blast:${blastId}:remaining`, uniqueRecipients.length);
    const startedPayload = JSON.stringify({
      blastId,
      recipientCount: uniqueRecipients.length,
    });
    await redisPublisher.publish('blast:started', startedPayload);
    logger.info(
      { blastId, recipientCount: uniqueRecipients.length },
      'Enqueued message jobs from file'
    );
  } catch (error) {
    logger.error({ err: error, blastId }, 'Failed to process blast file');
    throw error;
  } finally {
    await fs.unlink(filePath);
  }
};

const fileWorker = new Worker<FileProcessJobData>(
  FILE_PROCESS_QUEUE_NAME,
  processFileJob,
  {
    connection: redis,
    concurrency: 5, // Lower concurrency for file processing
  }
);

fileWorker.on('failed', async (job, err) => {
  logger.error({ jobId: job?.id, err }, 'File processing job failed');
});

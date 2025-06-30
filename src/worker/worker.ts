import { Worker } from 'bullmq';
import {
  jidNormalizedUser,
  AnyMessageContent,
} from '@whiskeysockets/baileys';
import { MESSAGE_QUEUE_NAME } from '../shared/jobs';
import { redis, redisPublisher, redisSubscriber } from '../shared/redis';
import logger from '../shared/logger';
import { MessageJobData } from '../shared/types';
import { sessionManager } from './services/SessionManager';
import { scheduleCampaignJobs } from './services/CampaignScheduler';

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
    concurrency: 10,
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

redisSubscriber.subscribe('session:command', (err) => {
  if (err) {
    logger.error({ err }, 'Failed to subscribe to session commands');
    return;
  }
  logger.info('Subscribed to session:command channel.');
});

redisSubscriber.on('message', (channel, message) => {
  if (channel === 'session:command') {
    try {
      const { command, sessionId } = JSON.parse(message);
      if (command === 'connect') {
        logger.info(`Received connect command for session: ${sessionId}`);
        sessionManager.createSession(sessionId, true);
      } else if (command === 'logout') {
        logger.info(`Received logout command for session: ${sessionId}`);
        sessionManager.logoutSession(sessionId);
      }
    } catch (e) {
      logger.error({ err: e }, 'Could not parse session command');
    }
  }
});

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

scheduleCampaignJobs();

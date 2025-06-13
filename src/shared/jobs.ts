import { Queue } from 'bullmq';
import { redis } from './redis';
import { MessageJobData } from './types';

export const MESSAGE_QUEUE_NAME = 'message-blast-queue';

export const messageQueue = new Queue(MESSAGE_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

export const addMessageJob = (data: MessageJobData) => {
  return messageQueue.add(`message-to-${data.recipient.phone}`, data);
};

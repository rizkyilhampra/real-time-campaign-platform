import { Queue } from 'bullmq';
import { redis } from './redis';
import { FileProcessJobData, MessageJobData } from './types';

export const MESSAGE_QUEUE_NAME = 'message-blast-queue';
export const FILE_PROCESS_QUEUE_NAME = 'file-process-queue';

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

export const fileProcessQueue = new Queue(FILE_PROCESS_QUEUE_NAME, {
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

export const addFileProcessJob = (data: FileProcessJobData) => {
  return fileProcessQueue.add(`process-file-${data.blastId}`, data);
};

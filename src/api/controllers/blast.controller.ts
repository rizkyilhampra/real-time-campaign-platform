import { Request, Response } from 'express';
import Boom from '@hapi/boom';
import { v4 as uuidv4 } from 'uuid';
import { addMessageJob, addFileProcessJob } from '../../shared/jobs';
import logger from '../../shared/logger';
import { Recipient } from '../../shared/types';
import fs from 'fs/promises';
import path from 'path';
import XLSX from 'xlsx';
import { getRecipientsFromDB } from './campaign.controller';
import { redis } from '../../shared/redis';

interface UploadedFiles {
  recipientsFile?: Express.Multer.File[];
  media?: Express.Multer.File[];
}

export const initiateBlast = async (req: Request, res: Response) => {
  const { campaignId, sessionId, message } = req.body;

  const files = req.files as UploadedFiles;
  const recipientsFile = files?.recipientsFile?.[0];
  const mediaFile = files?.media?.[0];

  if (!sessionId || !message || (!campaignId && !recipientsFile)) {
    const { payload } = Boom.badRequest(
      'Provide sessionId, message and either campaignId or an Excel file of recipients.'
    ).output;
    return res.status(payload.statusCode).json(payload);
  }

  const blastId = uuidv4();

  try {
    const sessionStatus = await redis.get(`session:${sessionId}:status`);
    if (sessionStatus !== 'CONNECTED') {
      throw Boom.badRequest(
        `Session ${sessionId} is not connected. Please connect the session before sending messages.`
      );
    }

    const mediaJobData = mediaFile
      ? {
          buffer: mediaFile.buffer,
          filename: mediaFile.originalname,
          mimetype: mediaFile.mimetype,
        }
      : undefined;

    if (recipientsFile) {
      const uploadsDir = path.join(__dirname, '..', '..', '..', 'uploads');
      await fs.mkdir(uploadsDir, { recursive: true });
      const filePath = path.join(uploadsDir, `${blastId}-${recipientsFile.originalname}`);
      await fs.writeFile(filePath, recipientsFile.buffer);

      await addFileProcessJob({
        blastId,
        sessionId,
        message,
        filePath,
        campaignId,
        media: mediaJobData,
      });

      logger.info(
        {
          blastId,
          campaignId,
          sessionId,
          filePath,
        },
        'File processing job enqueued'
      );
      return res.status(202).json({
        blastId,
        message: 'Blast file has been enqueued for processing.',
      });
    }

    // --- Handle campaign-only blasts ---
    const recipients = await getRecipientsFromDB(campaignId);
    if (recipients.length === 0) {
      throw Boom.notFound('No recipients found for the given campaignId');
    }

    for (const recipient of recipients) {
      await addMessageJob({
        blastId,
        sessionId,
        recipient,
        message: message.replace('{name}', recipient.name),
        media: mediaJobData,
      });
    }

    await redis.set(`blast:${blastId}:remaining`, recipients.length);
    logger.info(
      {
        blastId,
        campaignId,
        sessionId,
        recipientCount: recipients.length,
      },
      'Blast enqueued'
    );

    res.status(202).json({
      blastId,
      message: 'Blast has been enqueued.',
      recipientCount: recipients.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to initiate blast');
    if (Boom.isBoom(error)) {
      const { payload } = error.output;
      return res.status(payload.statusCode).json(payload);
    }
    const { payload } = Boom.internal('Failed to initiate blast.').output;
    res.status(payload.statusCode).json(payload);
  }
};

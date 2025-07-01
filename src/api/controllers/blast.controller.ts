import { Request, Response } from 'express';
import Boom from '@hapi/boom';
import { v4 as uuidv4 } from 'uuid';
import { addMessageJob } from '../../shared/jobs';
import logger from '../../shared/logger';
import { Recipient } from '../../shared/types';
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

    let recipients: Recipient[] = [];

    if (recipientsFile) {
      try {
        const workbook = XLSX.read(recipientsFile.buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          throw new Error('Invalid Excel file: No sheets found');
        }
        const ws = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
          defval: '',
        });

        if (rows.length === 0 && !req.body.campaignId) {
          throw Boom.badRequest('Excel file is empty and no campaignId provided');
        }

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
      } catch (err) {
        logger.warn({ err }, 'Failed to parse recipients Excel file');
        if (Boom.isBoom(err)) {
          const { payload } = err.output;
          return res.status(payload.statusCode).json(payload);
        }
        const { payload } = Boom.badRequest('Invalid Excel file').output;
        return res.status(payload.statusCode).json(payload);
      }
    }

    if (campaignId) {
      const campaignRecipients = await getRecipientsFromDB(campaignId);
      recipients.push(...campaignRecipients);
    }

    if (recipients.length === 0) {
      const { payload } = Boom.notFound('No recipients found').output;
      return res.status(payload.statusCode).json(payload);
    }

    const uniqueRecipients = Array.from(
      new Map(recipients.map((r) => [r.phone, r])).values()
    );

    const mediaJobData = mediaFile
      ? {
          buffer: mediaFile.buffer,
          filename: mediaFile.originalname,
          mimetype: mediaFile.mimetype,
        }
      : undefined;

    for (const recipient of uniqueRecipients) {
      await addMessageJob({
        blastId,
        sessionId,
        recipient,
        message: message.replace('{name}', recipient.name),
        media: mediaJobData,
      });
    }

    logger.info(
      {
        blastId,
        campaignId,
        sessionId,
        recipientCount: uniqueRecipients.length,
      },
      'Blast enqueued'
    );

    await redis.set(`blast:${blastId}:remaining`, uniqueRecipients.length);
    res.status(202).json({
      blastId,
      message: 'Blast has been enqueued.',
      recipientCount: uniqueRecipients.length,
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

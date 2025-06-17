import { Request, Response } from 'express';
import Boom from '@hapi/boom';
import { v4 as uuidv4 } from 'uuid';
import { addMessageJob } from '../../shared/jobs';
import logger from '../../shared/logger';
import { Recipient } from '../../shared/types';
import XLSX from 'xlsx';

const getRecipientsFromDB = async (
  campaignId: string
): Promise<Recipient[]> => {
  const MOCK_CAMPAIGNS: { [key: string]: Recipient[] } = {
    'october-promo': [
      { name: 'Alice', phone: '1234567890' },
      { name: 'Bob', phone: '0987654321' },
      { name: 'Charlie', phone: '1122334455' },
    ],
    'new-user-welcome': [{ name: 'David', phone: '5544332211' }],
  };
  if (!MOCK_CAMPAIGNS[campaignId]) {
    throw Boom.notFound(`Campaign with ID '${campaignId}' not found.`);
  }
  return MOCK_CAMPAIGNS[campaignId];
};

export const initiateBlast = async (req: Request, res: Response) => {
  const { campaignId, sessionId, message } = req.body;
  const file = (req as Request & { file?: Express.Multer.File }).file;

  if (!sessionId || !message || (!campaignId && !file)) {
    const { payload } = Boom.badRequest(
      'Provide sessionId, message and either campaignId or an Excel file of recipients.'
    ).output;
    return res.status(payload.statusCode).json(payload);
  }

  const blastId = uuidv4();

  try {
    let recipients: Recipient[] = [];

    if (file) {
      try {
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const ws = workbook.Sheets[workbook.SheetNames[0]];
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
      } catch (err) {
        logger.warn({ err }, 'Failed to parse recipients Excel file');
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

    for (const recipient of uniqueRecipients) {
      await addMessageJob({
        blastId,
        sessionId,
        recipient,
        message: message.replace('{name}', recipient.name),
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
    res.status(202).json({ blastId });
  } catch (error) {
    logger.error({ err: error }, 'Failed to initiate blast');
    if (Boom.isBoom(error)) {
      const { payload } = error.output;
      return res.status(payload.statusCode).json(payload);
    }
    const { payload } = Boom.internal().output;
    res.status(payload.statusCode).json(payload);
  }
};

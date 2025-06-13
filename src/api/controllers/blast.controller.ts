import { Request, Response } from 'express';
import Boom from '@hapi/boom';
import { v4 as uuidv4 } from 'uuid';
import { addMessageJob } from '../../shared/jobs';
import logger from '../../shared/logger';
import { Recipient } from '../../shared/types';

// Using the same mock function from campaign controller
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

  if (!campaignId || !sessionId || !message) {
    const { payload } = Boom.badRequest(
      'Missing required fields: campaignId, sessionId, message'
    ).output;
    return res.status(payload.statusCode).json(payload);
  }

  const blastId = uuidv4();

  try {
    const recipients = await getRecipientsFromDB(campaignId);

    for (const recipient of recipients) {
      await addMessageJob({
        blastId,
        sessionId,
        recipient,
        message: message.replace('{name}', recipient.name),
      });
    }

    logger.info(
      { blastId, campaignId, sessionId, recipientCount: recipients.length },
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

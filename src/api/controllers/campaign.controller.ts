import { Request, Response } from 'express';
import Boom from '@hapi/boom';
import { Recipient } from '../../shared/types';
import { redis } from '../../shared/redis';
import logger from '../../shared/logger';

const MARKETING_PROMO_CAMPAIGN_ID = 'marketing-promo';
const MARKETING_PROMO_CACHE_KEY = `campaign:${MARKETING_PROMO_CAMPAIGN_ID}:recipients`;

const MOCK_CAMPAIGNS: {
  [key: string]: { name: string; recipients: Recipient[] };
} = {
  'october-promo': {
    name: 'October Promo',
    recipients: [
      { name: 'Alice', phone: '1234567890' },
      { name: 'Bob', phone: '0987654321' },
      { name: 'Charlie', phone: '1122334455' },
    ],
  },
  'new-user-welcome': {
    name: 'New User Welcome',
    recipients: [{ name: 'David', phone: '5544332211' }],
  },
};

const getRecipientsFromDB = async (
  campaignId: string
): Promise<Recipient[]> => {
  if (campaignId === MARKETING_PROMO_CAMPAIGN_ID) {
    const cachedRecipients = await redis.get(MARKETING_PROMO_CACHE_KEY);
    if (cachedRecipients) {
      return JSON.parse(cachedRecipients);
    } else {
      logger.warn(`No cached recipients found for campaign: ${campaignId}. Returning empty array.`);
      return [];
    }
  }

  if (!MOCK_CAMPAIGNS[campaignId]) {
    throw Boom.notFound(`Campaign with ID '${campaignId}' not found.`);
  }

  return MOCK_CAMPAIGNS[campaignId].recipients;
};

export const getCampaigns = async (_req: Request, res: Response) => {
  // In a real app, you'd fetch this from a DB and it might have more metadata
  const staticCampaigns = Object.entries(MOCK_CAMPAIGNS).map(
    ([id, data]) => ({
      id,
      name: data.name,
    })
  );

  const dynamicCampaigns = [
    { id: MARKETING_PROMO_CAMPAIGN_ID, name: 'Marketing Promo' },
  ];

  const allCampaigns = [...dynamicCampaigns, ...staticCampaigns];

  res.json(allCampaigns);
};

export const getCampaignRecipients = async (req: Request, res: Response) => {
  const { campaignId } = req.query;

  if (!campaignId || typeof campaignId !== 'string') {
    const { payload } = Boom.badRequest(
      'Query parameter "campaignId" is required.'
    ).output;
    return res.status(payload.statusCode).json(payload);
  }

  try {
    const recipients = await getRecipientsFromDB(campaignId);
    res.json(recipients);
  } catch (error) {
    if (Boom.isBoom(error)) {
      const { payload } = error.output;
      return res.status(payload.statusCode).json(payload);
    }
    const { payload } = Boom.internal().output;
    res.status(payload.statusCode).json(payload);
  }
};

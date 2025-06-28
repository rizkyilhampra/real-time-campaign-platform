import request from 'supertest';
import express, { Request, Response } from 'express';
import { getCampaigns, getCampaignRecipients } from './campaign.controller';
import { redis } from '../../shared/redis';

jest.mock('../../shared/redis', () => ({
  redis: {
    get: jest.fn(),
  },
}));

jest.mock('../../shared/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const app = express();
app.get('/campaigns', (req: Request, res: Response) => getCampaigns(req, res));
app.get('/campaigns/recipients', (req: Request, res: Response) =>
  getCampaignRecipients(req, res)
);

describe('Campaign Controller', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCampaigns', () => {
    it('should be defined', () => {
      expect(getCampaigns).toBeDefined();
    });

    it('should return a list of all campaigns', async () => {
      const res = await request(app).get('/campaigns');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: 'marketing-promo', name: 'Marketing Promo' },
        { id: 'october-promo', name: 'October Promo' },
        { id: 'new-user-welcome', name: 'New User Welcome' },
      ]);
    });
  });

  describe('getCampaignRecipients', () => {
    it('should be defined', () => {
      expect(getCampaignRecipients).toBeDefined();
    });

    it('should return 400 if campaignId is missing', async () => {
      const res = await request(app).get('/campaigns/recipients');
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        'Query parameter "campaignId" is required.'
      );
    });

    it('should return recipients for a valid campaignId', async () => {
      const res = await request(app)
        .get('/campaigns/recipients')
        .query({ campaignId: 'october-promo' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { name: 'Alice', phone: '1234567890' },
        { name: 'Bob', phone: '0987654321' },
        { name: 'Charlie', phone: '1122334455' },
      ]);
    });

    it('should return cached recipients if available', async () => {
      const cachedRecipients = [{ name: 'Cached User', phone: '5555555555' }];
      (redis.get as jest.Mock).mockResolvedValue(
        JSON.stringify(cachedRecipients)
      );

      const res = await request(app)
        .get('/campaigns/recipients')
        .query({ campaignId: 'marketing-promo' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(cachedRecipients);
      expect(redis.get).toHaveBeenCalledWith(
        'campaign:marketing-promo:recipients'
      );
    });

    it('should return an empty array if marketing campaign is not cached', async () => {
      (redis.get as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .get('/campaigns/recipients')
        .query({ campaignId: 'marketing-promo' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      expect(redis.get).toHaveBeenCalledWith(
        'campaign:marketing-promo:recipients'
      );
    });

    it('should return 404 for a non-existent campaignId', async () => {
      const res = await request(app)
        .get('/campaigns/recipients')
        .query({ campaignId: 'non-existent' });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Campaign with ID 'non-existent' not found.");
    });
  });
}); 
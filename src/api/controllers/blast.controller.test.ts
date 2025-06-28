import request from 'supertest';
import express, { Request, Response } from 'express';
import multer from 'multer';
import { initiateBlast } from './blast.controller';

jest.mock('../../shared/jobs', () => ({
  addMessageJob: jest.fn(),
}));

jest.mock('../../shared/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const app = express();
app.use(express.json());
const upload = multer();
app.post(
  '/blasts',
  upload.fields([
    { name: 'recipientsFile', maxCount: 1 },
    { name: 'media', maxCount: 1 },
  ]),
  (req: Request, res: Response) => initiateBlast(req, res)
);

describe('Blast Controller', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(initiateBlast).toBeDefined();
  });

  it('should return 400 if required parameters are missing', async () => {
    const res = await request(app).post('/blasts').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      'Provide sessionId, message and either campaignId or an Excel file of recipients.'
    );
  });

  it('should initiate a blast with a campaignId', async () => {
    const { addMessageJob } = require('../../shared/jobs');
    const res = await request(app).post('/blasts').send({
      campaignId: 'october-promo',
      sessionId: 'test-session',
      message: 'Hello {name}',
    });

    expect(res.status).toBe(202);
    expect(res.body.blastId).toBeDefined();
    expect(addMessageJob).toHaveBeenCalledTimes(6);
    expect(addMessageJob).toHaveBeenCalledWith({
      blastId: expect.any(String),
      sessionId: 'test-session',
      recipient: { name: 'Alice', phone: '1234567890' },
      message: 'Hello Alice',
      media: undefined,
    });
  });

  it('should initiate a blast with an Excel file', async () => {
    const { addMessageJob } = require('../../shared/jobs');
    const xlsx = require('xlsx');

    const recipients = [
      { Name: 'Test User 1', Phone: '1111111111' },
      { Name: 'Test User 2', Phone: '2222222222' },
    ];
    const ws = xlsx.utils.json_to_sheet(recipients);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Recipients');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const res = await request(app)
      .post('/blasts')
      .field('sessionId', 'test-session')
      .field('message', 'Hello {name}')
      .attach('recipientsFile', buffer, 'recipients.xlsx');

    expect(res.status).toBe(202);
    expect(res.body.blastId).toBeDefined();
    expect(addMessageJob).toHaveBeenCalledTimes(4);
    expect(addMessageJob).toHaveBeenCalledWith({
      blastId: expect.any(String),
      sessionId: 'test-session',
      recipient: { name: 'Test User 1', phone: '1111111111' },
      message: 'Hello Test User 1',
      media: undefined,
    });
  });

  it('should merge recipients from campaignId and Excel file, and deduplicate', async () => {
    const { addMessageJob } = require('../../shared/jobs');
    const xlsx = require('xlsx');

    // This recipient is a duplicate of one in the 'october-promo' campaign
    const recipients = [
      { Name: 'Alice', Phone: '1234567890' },
      { Name: 'New User', Phone: '3333333333' },
    ];
    const ws = xlsx.utils.json_to_sheet(recipients);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Recipients');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const res = await request(app)
      .post('/blasts')
      .field('sessionId', 'test-session')
      .field('campaignId', 'october-promo')
      .field('message', 'Hello {name}')
      .attach('recipientsFile', buffer, 'recipients.xlsx');

    expect(res.status).toBe(202);
    expect(res.body.blastId).toBeDefined();
    // 3 from campaign + 1 new from excel = 4 unique recipients
    // 4 recipients * 2 calls per recipient = 8
    expect(addMessageJob).toHaveBeenCalledTimes(8);
  });

  it('should return 400 for an invalid Excel file', async () => {
    const buffer = Buffer.from('this is not an excel file');

    const res = await request(app)
      .post('/blasts')
      .field('sessionId', 'test-session')
      .field('message', 'Hello {name}')
      .attach('recipientsFile', buffer, 'recipients.xlsx');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      'Excel file is empty and no campaignId provided'
    );
  });

  it('should return 404 if no recipients are found', async () => {
    const res = await request(app).post('/blasts').send({
      campaignId: 'non-existent-campaign',
      sessionId: 'test-session',
      message: 'Hello {name}',
    });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe(
      "Campaign with ID 'non-existent-campaign' not found."
    );
  });

  it('should return 400 if the excel file has no recipients and no campaignId', async () => {
    const xlsx = require('xlsx');

    const recipients: any[] = [];
    const ws = xlsx.utils.json_to_sheet(recipients);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Recipients');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const res = await request(app)
      .post('/blasts')
      .field('sessionId', 'test-session')
      .field('message', 'Hello {name}')
      .attach('recipientsFile', buffer, 'recipients.xlsx');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      'Excel file is empty and no campaignId provided'
    );
  });
}); 
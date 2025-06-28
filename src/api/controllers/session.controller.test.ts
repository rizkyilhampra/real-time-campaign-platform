import request from 'supertest';
import express from 'express';
import {
  getSessions,
  connectSession,
  logoutSession,
} from './session.controller';
import { redis, redisPublisher } from '../../shared/redis';
import config from '../../shared/config';

jest.mock('../../shared/redis', () => ({
  redis: {
    get: jest.fn(),
  },
  redisPublisher: {
    publish: jest.fn(),
  },
}));

jest.mock('../../shared/config', () => ({
  sessionIds: ['test-session-1', 'test-session-2'],
}));

jest.mock('../../shared/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

const app = express();
app.get('/sessions', getSessions);
app.post('/sessions/:sessionId/connect', connectSession);
app.post('/sessions/:sessionId/logout', logoutSession);

describe('Session Controller', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSessions', () => {
    it('should be defined', () => {
      expect(getSessions).toBeDefined();
    });

    it('should return the status of all sessions', async () => {
      (redis.get as jest.Mock)
        .mockResolvedValueOnce('CONNECTED')
        .mockResolvedValueOnce(null);

      const res = await request(app).get('/sessions');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: 'test-session-1', status: 'CONNECTED' },
        { id: 'test-session-2', status: 'DISCONNECTED' },
      ]);
      expect(redis.get).toHaveBeenCalledWith('session:test-session-1:status');
      expect(redis.get).toHaveBeenCalledWith('session:test-session-2:status');
    });
  });

  describe('connectSession', () => {
    it('should be defined', () => {
      expect(connectSession).toBeDefined();
    });

    it('should publish a connect command for a valid session', async () => {
      const res = await request(app).post('/sessions/test-session-1/connect');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Connection process initiated');
      expect(redisPublisher.publish).toHaveBeenCalledWith(
        'session:command',
        JSON.stringify({ command: 'connect', sessionId: 'test-session-1' })
      );
    });

    it('should return 404 for a non-configured session', async () => {
      const res = await request(app).post('/sessions/non-existent/connect');
      expect(res.status).toBe(404);
      expect(res.body.message).toContain(
        "Session with ID 'non-existent' is not configured."
      );
    });
  });

  describe('logoutSession', () => {
    it('should be defined', () => {
      expect(logoutSession).toBeDefined();
    });

    it('should publish a logout command for a valid session', async () => {
      const res = await request(app).post('/sessions/test-session-1/logout');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Logout process initiated');
      expect(redisPublisher.publish).toHaveBeenCalledWith(
        'session:command',
        JSON.stringify({ command: 'logout', sessionId: 'test-session-1' })
      );
    });

    it('should return 404 for a non-configured session', async () => {
      const res = await request(app).post('/sessions/non-existent/logout');
      expect(res.status).toBe(404);
      expect(res.body.message).toContain(
        "Session with ID 'non-existent' is not configured."
      );
    });
  });
}); 
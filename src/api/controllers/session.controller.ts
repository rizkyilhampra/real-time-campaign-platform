import { Request, Response } from 'express';
import Boom from '@hapi/boom';
import { redis, redisPublisher } from '../../shared/redis';
import config from '../../shared/config';
import { SessionState, SessionStatus } from '../../shared/types';
import logger from '../../shared/logger';

export const getSessions = async (_req: Request, res: Response) => {
  const sessionIds = config.sessionIds;
  const states: SessionState[] = [];

  for (const id of sessionIds) {
    const status = (await redis.get(
      `session:${id}:status`
    )) as SessionStatus | null;
    states.push({ id, status: status || 'DISCONNECTED' });
  }

  res.json(states);
};

export const connectSession = async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  if (!config.sessionIds.includes(sessionId)) {
    const { payload } = Boom.notFound(
      `Session with ID '${sessionId}' is not configured.`
    ).output;
    return res.status(payload.statusCode).json(payload);
  }

  try {
    await redisPublisher.publish(
      'session:command',
      JSON.stringify({ command: 'connect', sessionId })
    );
    logger.info(`Published connect command for session: ${sessionId}`);
    res.status(202).json({
      message: `Connection process initiated for session ${sessionId}. Check WebSocket for QR code.`,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to publish connect command');
    const { payload } = Boom.internal(
      'Could not send command to worker.'
    ).output;
    res.status(payload.statusCode).json(payload);
  }
};

export const logoutSession = async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  if (!config.sessionIds.includes(sessionId)) {
    const { payload } = Boom.notFound(
      `Session with ID '${sessionId}' is not configured.`
    ).output;
    return res.status(payload.statusCode).json(payload);
  }

  try {
    await redisPublisher.publish(
      'session:command',
      JSON.stringify({ command: 'logout', sessionId })
    );
    logger.info(`Published logout command for session: ${sessionId}`);
    res.status(200).json({
      message: `Logout process initiated for session ${sessionId}.`,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to publish logout command');
    const { payload } = Boom.internal('Could not send command to worker.').output;
    res.status(payload.statusCode).json(payload);
  }
};

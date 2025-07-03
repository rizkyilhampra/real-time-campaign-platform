import { Request, Response } from 'express';
import Boom from '@hapi/boom';
import { redis, redisPublisher } from '../../shared/redis';
import { SessionState, SessionStatus } from '../../shared/types';
import logger from '../../shared/logger';
import * as sessionRepository from '../../shared/services/session.repository';

export const getSessions = async (_req: Request, res: Response) => {
  const configs = await sessionRepository.getSessionConfigs();
  const states: SessionState[] = [];

  for (const config of configs) {
    const status = (await redis.get(
      `session:${config.id}:status`
    )) as SessionStatus | null;
    states.push({ ...config, status: status || 'DISCONNECTED' });
  }

  res.json(states);
};

export const connectSession = async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = await sessionRepository.getSessionConfig(sessionId);

  if (!session) {
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
  const session = await sessionRepository.getSessionConfig(sessionId);

  if (!session) {
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

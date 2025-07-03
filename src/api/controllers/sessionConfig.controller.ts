import { Request, Response } from 'express';
import Boom from '@hapi/boom';
import * as sessionRepository from '../../shared/services/session.repository';

export const getSessions = async (req: Request, res: Response) => {
  const sessions = await sessionRepository.getSessionConfigs();
  res.json(sessions);
};

export const getSession = async (req: Request, res: Response) => {
  const { id } = req.params;
  const session = await sessionRepository.getSessionConfig(id);
  if (!session) {
    throw Boom.notFound('Session not found');
  }
  res.json(session);
};

export const createSession = async (req: Request, res: Response) => {
  const session = req.body;
  await sessionRepository.createSessionConfig(session);
  res.status(201).json(session);
};

export const updateSession = async (req: Request, res: Response) => {
  const { id } = req.params;
  const session = req.body;
  await sessionRepository.updateSessionConfig(id, session);
  res.json({ id, ...session });
};

export const deleteSession = async (req: Request, res: Response) => {
  const { id } = req.params;
  await sessionRepository.deleteSessionConfig(id);
  res.status(204).send();
};
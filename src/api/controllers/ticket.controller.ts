import { Request, Response } from 'express';
import Boom from '@hapi/boom';
import { createTicket } from '../services/TicketManager';

export const generateTicket = async (req: Request, res: Response) => {
  const { blastId } = req.query;

  if (!blastId || typeof blastId !== 'string') {
    throw Boom.badRequest('A valid blastId must be provided as a query parameter.');
  }

  // In a real application, you would add authentication and authorization here
  // to ensure the user has permission to access this blastId.
  // For this example, we'll assume the user is authorized.

  const ticket = await createTicket(blastId);
  res.json({ ticket });
};
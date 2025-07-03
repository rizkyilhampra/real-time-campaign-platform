import { randomBytes } from 'crypto';
import { redis } from '../../shared/redis';

const TICKET_EXPIRY_SECONDS = 30;

export const createTicket = async (blastId: string): Promise<string> => {
  const ticket = randomBytes(16).toString('hex');
  const key = `ws-ticket:${ticket}`;
  await redis.set(key, blastId, 'EX', TICKET_EXPIRY_SECONDS);
  return ticket;
};

export const validateTicket = async (ticket: string): Promise<string | null> => {
  const key = `ws-ticket:${ticket}`;
  const blastId = await redis.get(key);
  if (blastId) {
    // Tickets are single-use, so delete it after validation
    await redis.del(key);
  }
  return blastId;
};
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';

import logger from '../../shared/logger';
import { redis, redisPublisher } from '../../shared/redis';
import { SessionState, SessionStatus } from '../../shared/types';
import config from '../../shared/config';

type Session = WASocket & { id: string };

class SessionManager {
  private sessions: Map<string, Session> = new Map();

  constructor() {
    config.sessionIds.forEach((id) => this.createSession(id, false));
  }

  public async getSession(sessionId: string): Promise<Session | undefined> {
    return this.sessions.get(sessionId);
  }

  public getSessionsState(): SessionState[] {
    const states: SessionState[] = [];
    this.sessions.forEach((session) => {
      let status: SessionStatus = 'DISCONNECTED';
      if (session.ws.isOpen) {
        status = 'CONNECTED';
      } else if (session.ws.isConnecting) {
        status = 'CONNECTING';
      }

      states.push({ id: session.id, status });
    });
    return states;
  }

  public async createSession(sessionId: string, forceCreate = true) {
    if (this.sessions.has(sessionId) && !forceCreate) {
      return;
    }

    const { state, saveCreds } = await useMultiFileAuthState(
      path.join(__dirname, '..', '..', '..', 'sessions', sessionId)
    );

    const socket = makeWASocket({
      auth: state,
      logger: logger as any,
      printQRInTerminal: false,
    });

    const session = Object.assign(socket, { id: sessionId });
    this.sessions.set(sessionId, session);

    this.registerEventHandlers(session);

    session.ev.on('creds.update', saveCreds);
  }

  private registerEventHandlers(session: Session) {
    session.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      const { id: sessionId } = session;

      if (qr) {
        logger.info(`QR code available for session: ${sessionId}`);
        await this.publishQR(sessionId, qr);
      }

      if (connection === 'open') {
        logger.info(`Session ${sessionId} connected successfully.`);
        await this.publishStatus(sessionId, 'CONNECTED');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        logger.warn(
          `Session ${sessionId} disconnected. Reason: ${
            DisconnectReason[
              statusCode as unknown as keyof typeof DisconnectReason
            ] || 'Unknown'
          }. Reconnecting: ${shouldReconnect}`
        );
        await this.publishStatus(sessionId, 'DISCONNECTED');
        if (shouldReconnect) {
          this.createSession(sessionId, true);
        } else {
          this.sessions.delete(sessionId);
          logger.error(
            `Session ${sessionId} logged out. Please re-authenticate.`
          );
        }
      }
    });
  }

  private async publishQR(sessionId: string, qr: string) {
    const payload = JSON.stringify({ sessionId, qr });
    await redisPublisher.publish('qr:update', payload);
    await redis.set(`session:${sessionId}:status`, 'AWAITING_QR');
  }

  private async publishStatus(sessionId: string, status: SessionStatus) {
    await redis.set(`session:${sessionId}:status`, status);
    const payload = JSON.stringify({ sessionId, status });
    await redisPublisher.publish('session:status', payload);
  }
}

export const sessionManager = new SessionManager();

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs/promises';

import logger, { baileysLogger } from '../../shared/logger';
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
      logger: baileysLogger as any,
      printQRInTerminal: false,
    });

    const session = Object.assign(socket, { id: sessionId });
    this.sessions.set(sessionId, session);

    this.registerEventHandlers(session);

    session.ev.on('creds.update', saveCreds);
  }

  public async logoutSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`Logout called for non-existing session: ${sessionId}`);
      return;
    }

    try {
      await session.logout();
      this.sessions.delete(sessionId);
      await this.publishStatus(sessionId, 'LOGGED_OUT');
      logger.info(`Session ${sessionId} logged out successfully.`);
    } catch (err) {
      if (!(err instanceof Error && err.message === 'Intentional Logout')) {
        logger.error({ err }, `Failed to logout session ${sessionId}`);
      }
    }
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
        const reason =
          DisconnectReason[
            statusCode as unknown as keyof typeof DisconnectReason
          ] || 'Unknown';

        const shouldReconnect =
          statusCode !== DisconnectReason.loggedOut &&
          statusCode !== DisconnectReason.connectionReplaced;

        if (statusCode === DisconnectReason.loggedOut) {
          logger.warn(`Session ${sessionId} logged out.`);
          const sessionDir = path.join(
            __dirname,
            '..',
            '..',
            '..',
            'sessions',
            sessionId
          );
          try {
            await fs.rm(sessionDir, { recursive: true, force: true });
          } catch (err) {
            logger.error({ err }, `Failed to delete session directory for ${sessionId}`);
          }
          this.sessions.delete(sessionId);
          await this.publishStatus(sessionId, 'DISCONNECTED');
          return;
        }

        if (statusCode === DisconnectReason.restartRequired) {
          logger.warn(`Session ${sessionId} requires restart. Reconnecting...`);
          await this.publishStatus(sessionId, 'CONNECTING');
          this.createSession(sessionId, true);
          return;
        }

        if (
          statusCode === DisconnectReason.timedOut ||
          statusCode === DisconnectReason.connectionLost
        ) {
          logger.warn(`Session ${sessionId} timed out. Attempting to reconnect.`);
          await this.publishStatus(sessionId, 'TIMEOUT');
          setTimeout(() => this.createSession(sessionId, true), 5000);
          return;
        }

        logger.warn(
          `Session ${sessionId} disconnected. Reason: ${reason}. Reconnecting: ${shouldReconnect}.`
        );
        await this.publishStatus(sessionId, 'DISCONNECTED');
        if (shouldReconnect) {
          setTimeout(() => this.createSession(sessionId, true), 5000);
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

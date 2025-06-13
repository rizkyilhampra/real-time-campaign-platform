import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { parse } from 'url';
import logger from '../../shared/logger';
import { redisSubscriber } from '../../shared/redis';

export class WebSocketManager {
  private wss: WebSocketServer;
  private server: Server;

  constructor(server: Server) {
    this.server = server;
    this.wss = new WebSocketServer({ noServer: true });
  }

  public init() {
    this.server.on('upgrade', (request, socket, head) => {
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request);
      });
    });

    this.wss.on('connection', (ws: WebSocket, request) => {
      const { query } = parse(request.url || '', true);
      const { blastId, sessionId } = query;

      (ws as any).blastId = blastId;
      (ws as any).sessionId = sessionId;

      logger.info({ blastId, sessionId }, 'WebSocket client connected.');

      ws.on('close', () => {
        logger.info({ blastId, sessionId }, 'WebSocket client disconnected.');
      });
    });

    this.listenToRedisChannels();
  }

  private listenToRedisChannels() {
    redisSubscriber.subscribe(
      'blast:progress',
      'qr:update',
      'session:status',
      (err) => {
        if (err) {
          logger.error({ err }, 'Failed to subscribe to Redis channels');
        }
      }
    );

    redisSubscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);

        if (channel === 'blast:progress') {
          this.broadcastToBlasts(data.blastId, {
            type: 'blast_progress',
            ...data,
          });
        } else if (channel === 'qr:update') {
          this.broadcastToSessions(data.sessionId, {
            type: 'qr_update',
            ...data,
          });
        } else if (channel === 'session:status') {
          this.broadcastToSessions(data.sessionId, {
            type: 'session_status',
            ...data,
          });
        }
      } catch (e) {
        logger.error({ err: e }, 'Failed to parse message from Redis');
      }
    });
  }

  private broadcastToBlasts(blastId: string, data: any) {
    this.wss.clients.forEach((client) => {
      if (
        client.readyState === WebSocket.OPEN &&
        (client as any).blastId === blastId
      ) {
        client.send(JSON.stringify(data));
      }
    });
  }

  private broadcastToSessions(sessionId: string, data: any) {
    this.wss.clients.forEach((client) => {
      if (
        client.readyState === WebSocket.OPEN &&
        (client as any).sessionId === sessionId
      ) {
        client.send(JSON.stringify(data));
      }
    });
  }
}

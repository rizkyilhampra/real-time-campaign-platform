import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { parse } from 'url';
import logger from '../../shared/logger';
import { redisSubscriber } from '../../shared/redis';
import { validateTicket } from './TicketManager';

interface WebSocketWithId extends WebSocket {
  blastId?: string;
  sessionId?: string;
}

export class WebSocketManager {
  private wss: WebSocketServer;
  private server: Server;
  private redisSubscriber: typeof redisSubscriber;

  constructor(server: Server) {
    this.server = server;
    this.wss = new WebSocketServer({ noServer: true });
    this.redisSubscriber = redisSubscriber.duplicate();
  }

  public init() {
    this.server.on('upgrade', async (request, socket, head) => {
      const { query } = parse(request.url || '', true);
      const ticket = query.ticket as string;
      const sessionId = query.sessionId as string;

      this.wss.handleUpgrade(request, socket, head, async (ws) => {
        const wsWithId = ws as WebSocketWithId;

        if (ticket) {
          const blastId = await validateTicket(ticket);
          if (!blastId) {
            logger.warn('WebSocket upgrade request with invalid ticket. Destroying socket.');
            ws.close(1008, 'Invalid ticket');
            return;
          }
          wsWithId.blastId = blastId;
        } else if (sessionId) {
          wsWithId.sessionId = sessionId;
        }

        this.wss.emit('connection', wsWithId, request);
      });
    });

    this.wss.on('connection', (ws: WebSocketWithId, request) => {
      logger.info({ blastId: ws.blastId, sessionId: ws.sessionId }, 'WebSocket client connected.');

      ws.on('close', () => {
        logger.info(`WebSocket client disconnected.`);
      });
    });

    this.start();
  }

  private start() {
    this.redisSubscriber.on('message', (channel, message) => {
      const parsedMessage = JSON.parse(message);
      const [type, id] = channel.split(':');

      if (type === 'blast') {
        const event =
          id === 'progress'
            ? 'blast:progress'
            : id === 'completed'
              ? 'blast:completed'
              : 'blast:started';
        const payload = { event, payload: parsedMessage };

        this.wss.clients.forEach((client: WebSocket) => {
          const clientWithId = client as WebSocketWithId;
          if (clientWithId.blastId === parsedMessage.blastId) {
            clientWithId.send(JSON.stringify(payload));
          }
        });
      } else if (type === 'session' || type === 'qr') {
        const payload = { event: channel, payload: parsedMessage };
        this.wss.clients.forEach((client: WebSocket) => {
          const clientWithId = client as WebSocketWithId;
          if (clientWithId.sessionId === parsedMessage.sessionId) {
            clientWithId.send(JSON.stringify(payload));
            return;
          }

          if (!clientWithId.blastId && !clientWithId.sessionId) {
            clientWithId.send(JSON.stringify(payload));
          }
        });
      }
    });

    this.redisSubscriber.subscribe(
      'session:status',
      'qr:update',
      'blast:progress',
      'blast:completed',
      'blast:started'
    );
  }
}

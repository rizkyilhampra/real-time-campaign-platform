import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { parse } from 'url';
import logger from '../../shared/logger';
import { redisSubscriber } from '../../shared/redis';
import { IncomingMessage } from 'http';

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
        const event = id === 'progress' ? 'blast:progress' : 'blast:completed';
        const payload = { event, payload: parsedMessage };

        this.wss.clients.forEach((client: WebSocket) => {
          const clientWithId = client as WebSocketWithId;
          if (clientWithId.blastId === parsedMessage.blastId) {
            clientWithId.send(JSON.stringify(payload));
          }
        });
      } else {
        const payload = { event: channel, payload: parsedMessage };
        this.wss.clients.forEach((client: WebSocket) => {
          const clientWithId = client as WebSocketWithId;
          if (!clientWithId.blastId) {
            clientWithId.send(JSON.stringify(payload));
          }
        });
      }
    });

    this.redisSubscriber.subscribe(
      'session:status',
      'qr:update',
      'blast:progress',
      'blast:completed'
    );
  }
}

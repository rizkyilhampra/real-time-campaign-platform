import express from 'express';
import http from 'http';
import cors from 'cors';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import config from '../shared/config';
import logger from '../shared/logger';
import { messageQueue } from '../shared/jobs';
import apiRoutes from './routes';
import { WebSocketManager } from './services/WebSocketManager';

const app = express();
const server = http.createServer(app);
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(messageQueue)],
  serverAdapter: serverAdapter,
});

app.use(cors());
app.use(express.json());
app.use('/admin/queues', serverAdapter.getRouter());
app.use('/api', apiRoutes);

const wss = new WebSocketManager(server);
wss.init();

server.listen(config.port, () => {
  logger.info(`API Server running on http://localhost:${config.port}`);
  logger.info(
    `Bull Dashboard available at http://localhost:${config.port}/admin/queues`
  );
  logger.info(`API docs available at http://localhost:${config.port}/api/docs`);
});

export default server;

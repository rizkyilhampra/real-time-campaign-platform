import IORedis from 'ioredis';
import config from './config';
import logger from './logger';

const redisConfig = {
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: null,
};

const connection = new IORedis(redisConfig);
const subscriber = new IORedis(redisConfig);
const publisher = new IORedis(redisConfig);

connection.on('connect', () => logger.info('Redis connected.'));
connection.on('error', (err) =>
  logger.error({ err }, 'Redis connection error')
);

export const redis = connection;
export const redisSubscriber = subscriber;
export const redisPublisher = publisher;

import dotenv from 'dotenv';

dotenv.config();

const config = {
  port: process.env.PORT || 3000,
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  sessionIds: process.env.SESSION_IDS?.split(',') || ['default'],
  db: {
    host: process.env.DB_HOST || '192.168.1.4',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pendaftaran_pasien',
    port: parseInt(process.env.DB_PORT || '3306', 10),
  },
  app: {
    port: parseInt(process.env.PORT || '8081', 10),
  },
};

export default config;

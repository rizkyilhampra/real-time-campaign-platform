import mysql from 'mysql2/promise';
import config from './config';
import logger from './logger';

const dbConfig = {
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  port: config.db.port,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const pool = mysql.createPool(dbConfig);

pool.getConnection()
  .then(conn => {
    logger.info('Database connection pool created successfully.');
    conn.release();
  })
  .catch(err => {
    logger.error({ err }, 'Failed to create database connection pool.');
  });


export default pool; 
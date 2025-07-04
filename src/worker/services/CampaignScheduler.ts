import cron from 'node-cron';
import { RowDataPacket } from 'mysql2';
import logger from '../../shared/logger';
import db from '../../shared/database';
import { redis } from '../../shared/redis';
import { Recipient } from '../../shared/types';

const PICARE_CAMPAIGN_ID = 'picare';
const PICARE_CACHE_KEY = `campaign:${PICARE_CAMPAIGN_ID}:recipients`;
const timezone = process.env.TZ || 'Asia/Jakarta';

const fetchAndCachePicareRecipients = async (): Promise<void> => {
  logger.info('Fetching picare recipients from the database...');
  let conn;
  try {
    const query = `
      SELECT T1.Nama as name, T1.no_wa as phone
      FROM daftar_pasien T1
      INNER JOIN (
          SELECT no_wa, MAX(insert_at) as max_insert_at
          FROM daftar_pasien
          WHERE
              LOWER(Nama) NOT LIKE '%test%'
              AND no_wa IS NOT NULL AND no_wa != ''
          GROUP BY no_wa
      ) T2
      ON T1.no_wa = T2.no_wa AND T1.insert_at = T2.max_insert_at
    `;
    conn = await db.getConnection();
    const [rows] = await conn.query<(Recipient & RowDataPacket)[]>(query);

    if (rows.length > 0) {
      await redis.set(PICARE_CACHE_KEY, JSON.stringify(rows), 'EX', 60 * 60 * 25);
      logger.info(`Successfully cached ${rows.length} picare recipients.`);
    } else {
      logger.warn('No picare recipients found in the database. The cache will not be updated.');
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch and cache picare recipients.');
  } finally {
    if (conn) conn.release();
  }
};

export const scheduleCampaignJobs = () => {
  cron.schedule(
    '0 2 * * *',
    () => {
      logger.info('Running scheduled job: fetchAndCachePicareRecipients');
      fetchAndCachePicareRecipients();
    },
    {
      timezone: timezone,
    }
  );

  logger.info('Running initial job: fetchAndCachePicareRecipients');
  fetchAndCachePicareRecipients();

  logger.info('Campaign scheduler initialized.');
};

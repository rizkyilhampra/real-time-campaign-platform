import cron from 'node-cron';
import { RowDataPacket } from 'mysql2';
import logger from '../../shared/logger';
import db from '../../shared/database';
import { redis } from '../../shared/redis';
import { Recipient } from '../../shared/types';

const MARKETING_PROMO_CAMPAIGN_ID = 'marketing-promo';
const MARKETING_PROMO_CACHE_KEY = `campaign:${MARKETING_PROMO_CAMPAIGN_ID}:recipients`;

const fetchAndCacheMarketingRecipients = async (): Promise<void> => {
  logger.info('Fetching marketing recipients from the database...');
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
              AND NIK NOT LIKE '%test%'
              AND Alamat NOT LIKE '%test%'
              AND Poli_tujuan NOT LIKE '%test%'
              AND Nama NOT LIKE '%asd%'
              AND NIK NOT LIKE '%asd%'
              AND Alamat NOT LIKE '%asd%'
              AND Poli_tujuan NOT LIKE '%asd%'
              AND no_wa IS NOT NULL AND no_wa != ''
          GROUP BY no_wa
      ) T2
      ON T1.no_wa = T2.no_wa AND T1.insert_at = T2.max_insert_at
    `;
    conn = await db.getConnection();
    const [rows] = await conn.query<(Recipient & RowDataPacket)[]>(query);
    
    if (rows.length > 0) {
      // Cache expires in 25 hours, giving some buffer before the next 2am run
      await redis.set(MARKETING_PROMO_CACHE_KEY, JSON.stringify(rows), 'EX', 60 * 60 * 25);
      logger.info(`Successfully cached ${rows.length} marketing recipients.`);
    } else {
      logger.warn('No marketing recipients found in the database. The cache will not be updated.');
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch and cache marketing recipients.');
  } finally {
    if (conn) conn.release();
  }
};

export const scheduleCampaignJobs = () => {
  // Run every day at 2:00 AM
  cron.schedule('0 2 * * *', () => {
    logger.info('Running scheduled job: fetchAndCacheMarketingRecipients');
    fetchAndCacheMarketingRecipients();
  });

  // Also run once on startup
  logger.info('Running initial job: fetchAndCacheMarketingRecipients');
  fetchAndCacheMarketingRecipients();

  logger.info('Campaign scheduler initialized.');
}; 
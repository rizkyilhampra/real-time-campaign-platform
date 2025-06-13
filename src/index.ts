import logger from './shared/logger';

const start = async () => {
  const processType = process.argv[2];

  if (processType === 'api') {
    logger.info('Starting API server...');
    await import('./api/server');
  } else if (processType === 'worker') {
    logger.info('Starting Worker process...');
    await import('./worker/worker');
  } else {
    logger.error('Invalid process type specified. Use "api" or "worker".');
    process.exit(1);
  }
};

start();

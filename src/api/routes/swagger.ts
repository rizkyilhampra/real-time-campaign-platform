import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Real-Time Campaign Messaging API',
      version: '1.0.0',
      description: 'API documentation for the campaign messaging platform.',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
  },
  apis: ['./src/api/routes/index.ts'],
};

const specs = swaggerJsdoc(options);

export const swaggerDocs = [swaggerUi.serve, swaggerUi.setup(specs)];

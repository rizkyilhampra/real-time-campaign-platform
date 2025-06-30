import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import pkg from './../../../package.json';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: pkg.name,
      version: pkg.version,
      description: pkg.description,
    },
    servers: [
      {
        url: 'http://localhost:3000',
      },
    ],
  },
  apis: [
    process.env.NODE_ENV === 'production'
      ? './dist/api/routes/index.js'
      : './src/api/routes/index.ts',
  ],
};

const specs = swaggerJsdoc(options);

export const swaggerDocs = [swaggerUi.serve, swaggerUi.setup(specs)];

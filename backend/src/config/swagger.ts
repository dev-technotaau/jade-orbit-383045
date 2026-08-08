import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Hire Adda API',
      version: '1.0.0',
      description: 'Job Portal & Recruitment Platform API Documentation',
      contact: {
        name: 'API Support',
        email: 'support@hireadda.in',
      },
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Auth - MFA', description: 'Multi-factor authentication' },
      { name: 'Candidates', description: 'Candidate profiles and search' },
      { name: 'Employers', description: 'Employer profiles and dashboard' },
      { name: 'Jobs', description: 'Job listings and management' },
      { name: 'Applications', description: 'Job applications' },
      { name: 'Verifications', description: 'Identity and document verification' },
      { name: 'Admin', description: 'Admin panel and user management' },
      { name: 'Super Admin', description: 'Super admin operations' },
      { name: 'Notifications', description: 'Notification management' },
      { name: 'Devices', description: 'Device token management' },
      { name: 'Drafts', description: 'Form draft saving' },
      { name: 'Sessions', description: 'Session management' },
      { name: 'Saved Candidates', description: 'Employer saved candidates' },
      { name: 'Saved Searches', description: 'Saved search filters' },
      { name: 'Reports', description: 'Report generation and export' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);

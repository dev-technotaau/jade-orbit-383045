// Trigger CI/CD rebuild: refresh GHCR credentials after VPS reboot
import app from './app';
import logger from './config/logger';
import { initTelemetry } from './config/telemetry';
import { initializeServices, shutdownServices } from './config/service-init';
import { initializeWorkers, closeAllWorkers } from './jobs';

// Initialize OpenTelemetry (must be before other imports that need tracing)
initTelemetry();

const PORT: number = parseInt(process.env.PORT || '5000', 10);

// Main startup function
const startServer = async () => {
  // Initialize all services and display status dashboard
  await initializeServices();

  // Leader election: only one instance runs BullMQ workers
  await initializeWorkers();

  // Start HTTP server
  const server = app.listen(PORT, () => {
    logger.info(`🚀 Server is running on http://localhost:${PORT}`);
    logger.info(`📚 API Docs available at http://localhost:${PORT}/api-docs`);
  });

  // Initialize Socket.io
  const { initSocket } = await import('./socket');
  initSocket(server);

  // Graceful shutdown
  const gracefulShutdown = async () => {
    logger.info('Received kill signal, shutting down gracefully');

    server.close(async () => {
      logger.info('HTTP server closed');

      // Shutdown all services and workers
      await closeAllWorkers();
      await shutdownServices();

      logger.info('All connections closed. Exiting.');
      process.exit(0);
    });

    // Force close after 10s
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
};

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Rejection:', reason);
  // Let the process continue — Sentry will capture it
});

// Catch uncaught exceptions — these are fatal
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception — shutting down:', error);
  process.exit(1);
});

// Start the server
startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

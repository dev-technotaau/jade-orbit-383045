// Trigger CI/CD rebuild: refresh GHCR credentials after VPS reboot
import app from './app';
import logger from './config/logger';
import { env } from './config/env';
import {
  initializeServices,
  shutdownServices,
  startSearchIndexBuild,
} from './config/service-init';
import { initializeWorkers, closeAllWorkers } from './jobs';
import { captureWaException, initErrorReporting } from './utils/whatsapp-metrics';

// Error reporting. A no-op unless SENTRY_DSN is set, and done here at module
// scope rather than inside startServer() so the process-level handlers below
// can already report — a boot-time throw is exactly what needs tracking.
initErrorReporting();

// Read through env.ts so the value is the validated one; PORT was declared in
// the schema but still read raw here, so the schema default never applied.
const PORT: number = parseInt(env.PORT, 10);

/** Hard deadline for a graceful shutdown before we force-exit. */
const SHUTDOWN_TIMEOUT_MS = parseInt(env.SHUTDOWN_TIMEOUT_MS, 10);

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
    // Only once the port is bound: this can be a long GIN build on a large
    // table, and holding the port closed for it fails the deploy outright.
    startSearchIndexBuild();
  });

  // Initialize Socket.io
  const { initSocket } = await import('./socket');
  initSocket(server);

  /**
   * Graceful shutdown.
   *
   * The order here is load-bearing. `server.close()` waits for every open
   * connection to end, and Socket.IO holds upgraded connections open forever —
   * so with a single operator tab open, its callback never fired, workers were
   * never closed, and the 10s timer hard-killed the process instead. Every
   * restart then killed the campaign worker mid-batch and the inbound worker
   * mid-event.
   *
   * So: stop taking new work first, drain the workers regardless of HTTP state,
   * then close sockets and the listener.
   */
  let shuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (shuttingDown) return; // a second SIGTERM must not race the first
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully`);

    // Hard deadline. Generous enough for a campaign batch to finish its
    // in-flight send (Meta calls have their own timeouts well under this) but
    // still inside a typical 30s orchestrator grace period.
    const forceExit = setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref(); // don't let the timer itself hold the loop open

    try {
      // 1. Stop accepting new HTTP connections (existing ones keep serving).
      server.close(() => logger.info('HTTP server closed'));

      // 2. Drain BullMQ. This is the part that actually matters: a worker closed
      //    cleanly finishes its active job and returns the rest to the queue.
      await closeAllWorkers();

      // 3. Now cut the realtime connections that would otherwise pin the server.
      try {
        const { closeSocket } = await import('./socket');
        await closeSocket();
      } catch (e) {
        logger.warn(`Socket.IO close skipped: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 4. Kill any remaining keep-alive HTTP sockets (Node 18.2+).
      server.closeAllConnections?.();

      await shutdownServices();
      logger.info('All connections closed. Exiting.');
      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      logger.error('Error during graceful shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
};

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Rejection:', reason);
  // Report as well as log. A rejection nobody awaited is precisely the failure
  // that leaves no other trace — no failed request, no failed job, no alert —
  // so the log line was the only record that it ever happened.
  void captureWaException(reason, { handler: 'unhandledRejection' });
  // Let the process continue — the error is already logged
});

// Catch uncaught exceptions — these are fatal
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception — shutting down:', error);
  // Report BEFORE exiting. process.exit() is immediate and would kill the
  // in-flight report, so the one class of error that takes the whole process
  // down would also be the only class that never reached the error tracker.
  // captureWaException bounds its own network call and never rejects, so this
  // always settles and the exit still happens.
  void (async () => {
    await captureWaException(error, { handler: 'uncaughtException', fatal: true });
    process.exit(1);
  })();
});

// Start the server
startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

import { EventEmitter } from 'events';
import logger from '../config/logger';

/**
 * Global Event Emitter
 * Use this singleton to dispatch and listen to application-wide events.
 */
class AppEventEmitter extends EventEmitter {}

export const eventEmitter = new AppEventEmitter();

eventEmitter.on('error', (err) => {
  logger.error('Unhandled Event Error:', err);
});

export default eventEmitter;

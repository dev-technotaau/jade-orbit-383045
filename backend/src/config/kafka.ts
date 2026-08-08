import fs from 'fs';
import type { Consumer, Producer } from 'kafkajs';
import { Kafka, logLevel } from 'kafkajs';
import path from 'path';
import { env } from './env';
import logger from './logger';

let kafka: Kafka | null = null;
let producer: Producer | null = null;
let consumer: Consumer | null = null;

try {
  const brokers = env.KAFKA_BROKERS ? env.KAFKA_BROKERS.split(',') : ['localhost:9092'];

  const kafkaConfig: any = {
    clientId: env.KAFKA_CLIENT_ID,
    brokers: brokers,
    logLevel: logLevel.ERROR,
  };

  // Add SASL authentication if username/password are present
  if (env.KAFKA_USERNAME && env.KAFKA_PASSWORD) {
    // Load Aiven CA certificate from committed cert file
    const caPath = path.resolve(__dirname, '../../certs/aiven-ca.pem');
    const caCert = fs.existsSync(caPath) ? fs.readFileSync(caPath, 'utf-8') : null;

    if (caCert) {
      kafkaConfig.ssl = { ca: [caCert] };
      logger.info('🔐 Kafka TLS: Using Aiven CA certificate from certs/aiven-ca.pem');
    } else {
      kafkaConfig.ssl = true;
      logger.warn('⚠️ Kafka TLS: CA cert file not found at certs/aiven-ca.pem — using default CAs');
    }

    kafkaConfig.sasl = {
      mechanism:
        (env.KAFKA_SASL_MECHANISM as 'plain' | 'scram-sha-256' | 'scram-sha-512') || 'plain',
      username: env.KAFKA_USERNAME,
      password: env.KAFKA_PASSWORD,
    };
  }

  kafka = new Kafka(kafkaConfig);
  logger.info(`✅ Kafka client initialized with brokers: ${brokers.join(', ')}`);

  producer = kafka.producer();
  consumer = kafka.consumer({ groupId: 'hire-adda-backend-group' });
} catch (error) {
  logger.error('❌ Kafka initialization failed:', error);
}

export const connectKafka = async () => {
  if (!producer || !consumer) return;

  try {
    await producer.connect();
    logger.info('✅ Kafka Producer connected');

    // Example subscription (can be moved to a separate worker)
    // await consumer.connect();
    // await consumer.subscribe({ topic: 'test-topic', fromBeginning: true });
    // logger.info('✅ Kafka Consumer connected');
  } catch (error) {
    logger.error('❌ Failed to connect to Kafka:', error);
  }
};

export { consumer, kafka, producer };

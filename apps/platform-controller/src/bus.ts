import { MessageBus } from '@edi/shared/mq';
import { config } from './config.js';

export const bus = new MessageBus(config.amqpUrl, 'platform-controller');

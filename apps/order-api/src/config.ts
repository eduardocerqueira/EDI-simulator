const env = (k: string, d: string) => process.env[k] ?? d;
export const config = {
  port: Number(env('PORT', '4100')),
  jwtSecret: env('JWT_SECRET', 'dev-order-secret-change-me'),
  amqpUrl: env('AMQP_URL', 'amqp://edi:edi@localhost:5672'),
  integrationApiKey: env('INTEGRATION_API_KEY', 'integration-key-change-me'),
  paymentTermsDays: Number(env('PAYMENT_TERMS_DAYS', '30')),
  seedPassword: env('SEED_CUSTOMER_PASSWORD', 'password123'),
};

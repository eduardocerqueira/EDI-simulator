/**
 * Contracts between the services.
 *
 *  distributor-api ──REST (JSON)──▶ order-api      POST /api/integration/inventory
 *  distributor-api ──AMQP──▶ exchange "edi.events"   (routing keys edi.*)
 *  order-api       ──AMQP──▶ exchange "order.events" (routing keys order.*, bill.*, customer.*)
 */

export const EXCHANGES = {
  edi: 'edi.events',
  orders: 'order.events',
  deadLetter: 'dlx',
} as const;

export const QUEUES = {
  /** Distributor notification center: every EDI failure / rejection. */
  distributorNotifications: 'distributor.notifications',
  /** Distributor replica of customers, orders and bills. */
  distributorOrderEvents: 'distributor.order-events',
  /** Audit tap that receives everything (handy in the RabbitMQ UI). */
  audit: 'audit.all',
  deadLetter: 'dead-letter',
} as const;

export const ROUTING_KEYS = {
  fileReceived: 'edi.file.received',
  interchangeAccepted: 'edi.interchange.accepted',
  interchangeRejected: 'edi.interchange.rejected',
  validationFailed: 'edi.validation.failed',
  businessRejected: 'edi.business.rejected',
  transactionIngested: 'edi.transaction.ingested',
  transactionFailed: 'edi.transaction.failed',
  deliveryFailed: 'edi.delivery.failed',
  deliverySucceeded: 'edi.delivery.succeeded',
  ackSent: 'edi.ack.sent',
  orderCreated: 'order.created',
  orderCancelled: 'order.cancelled',
  billPaid: 'bill.paid',
  customerRegistered: 'customer.registered',
} as const;

export interface EdiEvent {
  eventId: string;
  occurredAt: string;
  routingKey: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  title: string;
  message: string;
  partner?: string;
  interchangeId?: string;
  interchangeControlNumber?: string;
  transactionId?: string;
  transactionType?: string;
  fileName?: string;
  errors?: Array<{ code: string; x12Code?: string; message: string }>;
}

/** Body of POST /api/integration/inventory on the order-api. */
export interface InventorySyncPayload {
  deliveryId: string;
  transactionId: string;
  transactionType: '832' | '846' | '856';
  envelope: {
    interchangeControlNumber: string;
    groupControlNumber: string;
    transactionControlNumber: string;
    senderId: string;
    receivedAt: string;
  };
  producer: { code: string; name: string; isaId: string };
  items: Array<{
    upc: string;
    sku: string;
    name: string;
    category: string;
    uom: string;
    price: number;
    quantityAvailable: number;
  }>;
}

export interface CustomerSnapshot {
  id: string;
  name: string;
  email: string;
  company?: string | null;
  createdAt: string;
}

export interface OrderSnapshot {
  id: string;
  orderNumber: string;
  status: 'PLACED' | 'CANCELLED';
  subtotal: number;
  total: number;
  createdAt: string;
  cancelledAt?: string | null;
  items: Array<{ upc: string; sku: string; name: string; quantity: number; unitPrice: number; lineTotal: number }>;
}

export interface BillSnapshot {
  id: string;
  billNumber: string;
  orderId: string;
  amount: number;
  status: 'OPEN' | 'PAID' | 'CANCELLED';
  issuedAt: string;
  dueDate: string;
  paidAt?: string | null;
}

export interface OrderEvent {
  eventId: string;
  occurredAt: string;
  type: 'order.created' | 'order.cancelled' | 'bill.paid' | 'customer.registered';
  customer: CustomerSnapshot;
  order?: OrderSnapshot;
  bill?: BillSnapshot;
}

export const PAYMENT_TERMS_DAYS = 30;

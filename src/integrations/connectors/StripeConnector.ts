/**
 * Stripe Connector - Payments, Subscriptions, Customers
 * API Key authentication with comprehensive webhook handling
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface StripeConfig {
  secretKey: string;
  webhookSecret?: string;
  apiVersion?: string;
}

export interface StripeCustomer {
  id: string;
  email: string | null;
  name: string | null;
  description: string | null;
  phone: string | null;
  address: StripeAddress | null;
  metadata: Record<string, string>;
  created: number;
  defaultSource: string | null;
  invoiceSettings: {
    defaultPaymentMethod: string | null;
    footer: string | null;
  };
}

export interface StripeAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  metadata: Record<string, string>;
  images: string[];
  defaultPrice: string | null;
  created: number;
  updated: number;
}

export interface StripePrice {
  id: string;
  product: string;
  active: boolean;
  currency: string;
  unitAmount: number | null;
  unitAmountDecimal: string | null;
  type: 'one_time' | 'recurring';
  recurring: {
    interval: 'day' | 'week' | 'month' | 'year';
    intervalCount: number;
    usageType: 'metered' | 'licensed';
  } | null;
  metadata: Record<string, string>;
  created: number;
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
  items: {
    data: Array<{
      id: string;
      price: StripePrice;
      quantity: number;
    }>;
  };
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  canceledAt: number | null;
  endedAt: number | null;
  trialStart: number | null;
  trialEnd: number | null;
  defaultPaymentMethod: string | null;
  latestInvoice: string | null;
  metadata: Record<string, string>;
  created: number;
}

export interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'requires_capture' | 'canceled' | 'succeeded';
  clientSecret: string;
  customer: string | null;
  paymentMethod: string | null;
  receiptEmail: string | null;
  description: string | null;
  metadata: Record<string, string>;
  created: number;
}

export interface StripeInvoice {
  id: string;
  customer: string;
  subscription: string | null;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  amountDue: number;
  amountPaid: number;
  amountRemaining: number;
  currency: string;
  dueDate: number | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  lines: {
    data: Array<{
      id: string;
      amount: number;
      description: string | null;
      quantity: number;
    }>;
  };
  created: number;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
  mode: 'payment' | 'setup' | 'subscription';
  customer: string | null;
  customerEmail: string | null;
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
  status: 'open' | 'complete' | 'expired';
  successUrl: string;
  cancelUrl: string;
  expiresAt: number;
  created: number;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
  created: number;
}

export interface CreateCustomerOptions {
  email: string;
  name?: string;
  description?: string;
  phone?: string;
  address?: StripeAddress;
  metadata?: Record<string, string>;
  paymentMethod?: string;
}

export interface CreateSubscriptionOptions {
  customer: string;
  items: Array<{ price: string; quantity?: number }>;
  paymentBehavior?: 'default_incomplete' | 'error_if_incomplete' | 'allow_incomplete';
  trialPeriodDays?: number;
  trialEnd?: number;
  cancelAtPeriodEnd?: boolean;
  metadata?: Record<string, string>;
  defaultPaymentMethod?: string;
}

export interface CreateCheckoutSessionOptions {
  mode: 'payment' | 'setup' | 'subscription';
  successUrl: string;
  cancelUrl: string;
  lineItems?: Array<{
    price: string;
    quantity: number;
  }>;
  customer?: string;
  customerEmail?: string;
  clientReferenceId?: string;
  metadata?: Record<string, string>;
  allowPromotionCodes?: boolean;
  billingAddressCollection?: 'auto' | 'required';
  shippingAddressCollection?: {
    allowedCountries: string[];
  };
}

// ============================================================================
// STRIPE CONNECTOR CLASS
// ============================================================================

export class StripeConnector extends EventEmitter {
  private secretKey: string;
  private webhookSecret?: string;
  private apiVersion: string;

  private readonly API_BASE = 'https://api.stripe.com/v1';

  constructor(config: StripeConfig) {
    super();
    this.secretKey = config.secretKey;
    this.webhookSecret = config.webhookSecret;
    this.apiVersion = config.apiVersion || '2023-10-16';
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: Record<string, unknown>;
      idempotencyKey?: string;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, idempotencyKey } = options;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.secretKey}`,
      'Stripe-Version': this.apiVersion,
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const response = await fetch(`${this.API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? this.encodeBody(body) : undefined
    });

    const data = await response.json();

    if (data.error) {
      const error = new Error(`Stripe error: ${data.error.message}`);
      (error as unknown as { stripeError: unknown }).stripeError = data.error;
      throw error;
    }

    return data;
  }

  private encodeBody(obj: Record<string, unknown>, prefix = ''): string {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;

      const encodedKey = prefix ? `${prefix}[${key}]` : key;

      if (typeof value === 'object' && !Array.isArray(value)) {
        parts.push(this.encodeBody(value as Record<string, unknown>, encodedKey));
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'object') {
            parts.push(this.encodeBody(item as Record<string, unknown>, `${encodedKey}[${index}]`));
          } else {
            parts.push(`${encodedKey}[${index}]=${encodeURIComponent(String(item))}`);
          }
        });
      } else {
        parts.push(`${encodedKey}=${encodeURIComponent(String(value))}`);
      }
    }

    return parts.join('&');
  }

  // ==========================================================================
  // CUSTOMER OPERATIONS
  // ==========================================================================

  async createCustomer(options: CreateCustomerOptions): Promise<StripeCustomer> {
    const data = await this.request<Record<string, unknown>>('/customers', {
      method: 'POST',
      body: {
        email: options.email,
        name: options.name,
        description: options.description,
        phone: options.phone,
        address: options.address,
        metadata: options.metadata,
        payment_method: options.paymentMethod,
        invoice_settings: options.paymentMethod ? {
          default_payment_method: options.paymentMethod
        } : undefined
      }
    });

    this.emit('customer_created', { customerId: data.id });
    return this.transformCustomer(data);
  }

  async getCustomer(customerId: string): Promise<StripeCustomer> {
    const data = await this.request<Record<string, unknown>>(`/customers/${customerId}`);
    return this.transformCustomer(data);
  }

  async updateCustomer(customerId: string, updates: Partial<CreateCustomerOptions>): Promise<StripeCustomer> {
    const data = await this.request<Record<string, unknown>>(`/customers/${customerId}`, {
      method: 'POST',
      body: {
        email: updates.email,
        name: updates.name,
        description: updates.description,
        phone: updates.phone,
        address: updates.address,
        metadata: updates.metadata
      }
    });

    return this.transformCustomer(data);
  }

  async listCustomers(options?: {
    email?: string;
    limit?: number;
    startingAfter?: string;
    endingBefore?: string;
  }): Promise<{ data: StripeCustomer[]; hasMore: boolean }> {
    const params = new URLSearchParams();
    if (options?.email) params.set('email', options.email);
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.startingAfter) params.set('starting_after', options.startingAfter);
    if (options?.endingBefore) params.set('ending_before', options.endingBefore);

    const data = await this.request<{ data: Array<Record<string, unknown>>; has_more: boolean }>(
      `/customers?${params}`
    );

    return {
      data: data.data.map(c => this.transformCustomer(c)),
      hasMore: data.has_more
    };
  }

  async deleteCustomer(customerId: string): Promise<void> {
    await this.request(`/customers/${customerId}`, { method: 'DELETE' });
    this.emit('customer_deleted', { customerId });
  }

  private transformCustomer(data: Record<string, unknown>): StripeCustomer {
    const address = data.address as Record<string, unknown> | null;
    const invoiceSettings = data.invoice_settings as Record<string, unknown>;

    return {
      id: data.id as string,
      email: data.email as string | null,
      name: data.name as string | null,
      description: data.description as string | null,
      phone: data.phone as string | null,
      address: address ? {
        line1: address.line1 as string | null,
        line2: address.line2 as string | null,
        city: address.city as string | null,
        state: address.state as string | null,
        postalCode: address.postal_code as string | null,
        country: address.country as string | null
      } : null,
      metadata: (data.metadata as Record<string, string>) || {},
      created: data.created as number,
      defaultSource: data.default_source as string | null,
      invoiceSettings: {
        defaultPaymentMethod: invoiceSettings?.default_payment_method as string | null,
        footer: invoiceSettings?.footer as string | null
      }
    };
  }

  // ==========================================================================
  // PRODUCT OPERATIONS
  // ==========================================================================

  async createProduct(options: {
    name: string;
    description?: string;
    active?: boolean;
    images?: string[];
    metadata?: Record<string, string>;
    defaultPriceData?: {
      currency: string;
      unitAmount: number;
      recurring?: { interval: 'day' | 'week' | 'month' | 'year'; intervalCount?: number };
    };
  }): Promise<StripeProduct> {
    const data = await this.request<Record<string, unknown>>('/products', {
      method: 'POST',
      body: {
        name: options.name,
        description: options.description,
        active: options.active,
        images: options.images,
        metadata: options.metadata,
        default_price_data: options.defaultPriceData ? {
          currency: options.defaultPriceData.currency,
          unit_amount: options.defaultPriceData.unitAmount,
          recurring: options.defaultPriceData.recurring
        } : undefined
      }
    });

    return this.transformProduct(data);
  }

  async getProduct(productId: string): Promise<StripeProduct> {
    const data = await this.request<Record<string, unknown>>(`/products/${productId}`);
    return this.transformProduct(data);
  }

  async listProducts(options?: {
    active?: boolean;
    limit?: number;
    startingAfter?: string;
  }): Promise<{ data: StripeProduct[]; hasMore: boolean }> {
    const params = new URLSearchParams();
    if (options?.active !== undefined) params.set('active', options.active.toString());
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.startingAfter) params.set('starting_after', options.startingAfter);

    const data = await this.request<{ data: Array<Record<string, unknown>>; has_more: boolean }>(
      `/products?${params}`
    );

    return {
      data: data.data.map(p => this.transformProduct(p)),
      hasMore: data.has_more
    };
  }

  private transformProduct(data: Record<string, unknown>): StripeProduct {
    return {
      id: data.id as string,
      name: data.name as string,
      description: data.description as string | null,
      active: data.active as boolean,
      metadata: (data.metadata as Record<string, string>) || {},
      images: (data.images as string[]) || [],
      defaultPrice: data.default_price as string | null,
      created: data.created as number,
      updated: data.updated as number
    };
  }

  // ==========================================================================
  // PRICE OPERATIONS
  // ==========================================================================

  async createPrice(options: {
    product: string;
    currency: string;
    unitAmount: number;
    recurring?: {
      interval: 'day' | 'week' | 'month' | 'year';
      intervalCount?: number;
      usageType?: 'metered' | 'licensed';
    };
    active?: boolean;
    metadata?: Record<string, string>;
  }): Promise<StripePrice> {
    const data = await this.request<Record<string, unknown>>('/prices', {
      method: 'POST',
      body: {
        product: options.product,
        currency: options.currency,
        unit_amount: options.unitAmount,
        recurring: options.recurring ? {
          interval: options.recurring.interval,
          interval_count: options.recurring.intervalCount,
          usage_type: options.recurring.usageType
        } : undefined,
        active: options.active,
        metadata: options.metadata
      }
    });

    return this.transformPrice(data);
  }

  async getPrice(priceId: string): Promise<StripePrice> {
    const data = await this.request<Record<string, unknown>>(`/prices/${priceId}`);
    return this.transformPrice(data);
  }

  async listPrices(options?: {
    product?: string;
    active?: boolean;
    type?: 'one_time' | 'recurring';
    limit?: number;
    startingAfter?: string;
  }): Promise<{ data: StripePrice[]; hasMore: boolean }> {
    const params = new URLSearchParams();
    if (options?.product) params.set('product', options.product);
    if (options?.active !== undefined) params.set('active', options.active.toString());
    if (options?.type) params.set('type', options.type);
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.startingAfter) params.set('starting_after', options.startingAfter);

    const data = await this.request<{ data: Array<Record<string, unknown>>; has_more: boolean }>(
      `/prices?${params}`
    );

    return {
      data: data.data.map(p => this.transformPrice(p)),
      hasMore: data.has_more
    };
  }

  private transformPrice(data: Record<string, unknown>): StripePrice {
    const recurring = data.recurring as Record<string, unknown> | null;

    return {
      id: data.id as string,
      product: data.product as string,
      active: data.active as boolean,
      currency: data.currency as string,
      unitAmount: data.unit_amount as number | null,
      unitAmountDecimal: data.unit_amount_decimal as string | null,
      type: data.type as 'one_time' | 'recurring',
      recurring: recurring ? {
        interval: recurring.interval as 'day' | 'week' | 'month' | 'year',
        intervalCount: recurring.interval_count as number,
        usageType: recurring.usage_type as 'metered' | 'licensed'
      } : null,
      metadata: (data.metadata as Record<string, string>) || {},
      created: data.created as number
    };
  }

  // ==========================================================================
  // SUBSCRIPTION OPERATIONS
  // ==========================================================================

  async createSubscription(options: CreateSubscriptionOptions): Promise<StripeSubscription> {
    const data = await this.request<Record<string, unknown>>('/subscriptions', {
      method: 'POST',
      body: {
        customer: options.customer,
        items: options.items.map(item => ({
          price: item.price,
          quantity: item.quantity
        })),
        payment_behavior: options.paymentBehavior,
        trial_period_days: options.trialPeriodDays,
        trial_end: options.trialEnd,
        cancel_at_period_end: options.cancelAtPeriodEnd,
        metadata: options.metadata,
        default_payment_method: options.defaultPaymentMethod
      }
    });

    this.emit('subscription_created', { subscriptionId: data.id, customerId: options.customer });
    return this.transformSubscription(data);
  }

  async getSubscription(subscriptionId: string): Promise<StripeSubscription> {
    const data = await this.request<Record<string, unknown>>(`/subscriptions/${subscriptionId}`);
    return this.transformSubscription(data);
  }

  async updateSubscription(
    subscriptionId: string,
    updates: {
      items?: Array<{
        id?: string;
        price?: string;
        quantity?: number;
        deleted?: boolean;
      }>;
      cancelAtPeriodEnd?: boolean;
      defaultPaymentMethod?: string;
      metadata?: Record<string, string>;
      trialEnd?: number | 'now';
      prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
    }
  ): Promise<StripeSubscription> {
    const data = await this.request<Record<string, unknown>>(`/subscriptions/${subscriptionId}`, {
      method: 'POST',
      body: {
        items: updates.items,
        cancel_at_period_end: updates.cancelAtPeriodEnd,
        default_payment_method: updates.defaultPaymentMethod,
        metadata: updates.metadata,
        trial_end: updates.trialEnd,
        proration_behavior: updates.prorationBehavior
      }
    });

    this.emit('subscription_updated', { subscriptionId });
    return this.transformSubscription(data);
  }

  async cancelSubscription(
    subscriptionId: string,
    options?: {
      cancelAtPeriodEnd?: boolean;
      invoiceNow?: boolean;
      prorate?: boolean;
    }
  ): Promise<StripeSubscription> {
    if (options?.cancelAtPeriodEnd) {
      return this.updateSubscription(subscriptionId, { cancelAtPeriodEnd: true });
    }

    const data = await this.request<Record<string, unknown>>(`/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      body: {
        invoice_now: options?.invoiceNow,
        prorate: options?.prorate
      }
    });

    this.emit('subscription_canceled', { subscriptionId });
    return this.transformSubscription(data);
  }

  async listSubscriptions(options?: {
    customer?: string;
    status?: string;
    limit?: number;
    startingAfter?: string;
  }): Promise<{ data: StripeSubscription[]; hasMore: boolean }> {
    const params = new URLSearchParams();
    if (options?.customer) params.set('customer', options.customer);
    if (options?.status) params.set('status', options.status);
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.startingAfter) params.set('starting_after', options.startingAfter);

    const data = await this.request<{ data: Array<Record<string, unknown>>; has_more: boolean }>(
      `/subscriptions?${params}`
    );

    return {
      data: data.data.map(s => this.transformSubscription(s)),
      hasMore: data.has_more
    };
  }

  private transformSubscription(data: Record<string, unknown>): StripeSubscription {
    const items = data.items as { data: Array<Record<string, unknown>> };

    return {
      id: data.id as string,
      customer: data.customer as string,
      status: data.status as StripeSubscription['status'],
      items: {
        data: items.data.map(item => ({
          id: item.id as string,
          price: this.transformPrice(item.price as Record<string, unknown>),
          quantity: item.quantity as number
        }))
      },
      currentPeriodStart: data.current_period_start as number,
      currentPeriodEnd: data.current_period_end as number,
      cancelAtPeriodEnd: data.cancel_at_period_end as boolean,
      canceledAt: data.canceled_at as number | null,
      endedAt: data.ended_at as number | null,
      trialStart: data.trial_start as number | null,
      trialEnd: data.trial_end as number | null,
      defaultPaymentMethod: data.default_payment_method as string | null,
      latestInvoice: data.latest_invoice as string | null,
      metadata: (data.metadata as Record<string, string>) || {},
      created: data.created as number
    };
  }

  // ==========================================================================
  // CHECKOUT SESSION OPERATIONS
  // ==========================================================================

  async createCheckoutSession(options: CreateCheckoutSessionOptions): Promise<StripeCheckoutSession> {
    const data = await this.request<Record<string, unknown>>('/checkout/sessions', {
      method: 'POST',
      body: {
        mode: options.mode,
        success_url: options.successUrl,
        cancel_url: options.cancelUrl,
        line_items: options.lineItems?.map(item => ({
          price: item.price,
          quantity: item.quantity
        })),
        customer: options.customer,
        customer_email: options.customerEmail,
        client_reference_id: options.clientReferenceId,
        metadata: options.metadata,
        allow_promotion_codes: options.allowPromotionCodes,
        billing_address_collection: options.billingAddressCollection,
        shipping_address_collection: options.shippingAddressCollection
      }
    });

    return this.transformCheckoutSession(data);
  }

  async getCheckoutSession(sessionId: string): Promise<StripeCheckoutSession> {
    const data = await this.request<Record<string, unknown>>(`/checkout/sessions/${sessionId}`);
    return this.transformCheckoutSession(data);
  }

  private transformCheckoutSession(data: Record<string, unknown>): StripeCheckoutSession {
    return {
      id: data.id as string,
      url: data.url as string,
      mode: data.mode as 'payment' | 'setup' | 'subscription',
      customer: data.customer as string | null,
      customerEmail: data.customer_email as string | null,
      paymentStatus: data.payment_status as 'paid' | 'unpaid' | 'no_payment_required',
      status: data.status as 'open' | 'complete' | 'expired',
      successUrl: data.success_url as string,
      cancelUrl: data.cancel_url as string,
      expiresAt: data.expires_at as number,
      created: data.created as number
    };
  }

  // ==========================================================================
  // PAYMENT INTENT OPERATIONS
  // ==========================================================================

  async createPaymentIntent(options: {
    amount: number;
    currency: string;
    customer?: string;
    paymentMethod?: string;
    confirm?: boolean;
    receiptEmail?: string;
    description?: string;
    metadata?: Record<string, string>;
    automaticPaymentMethods?: { enabled: boolean };
  }): Promise<StripePaymentIntent> {
    const data = await this.request<Record<string, unknown>>('/payment_intents', {
      method: 'POST',
      body: {
        amount: options.amount,
        currency: options.currency,
        customer: options.customer,
        payment_method: options.paymentMethod,
        confirm: options.confirm,
        receipt_email: options.receiptEmail,
        description: options.description,
        metadata: options.metadata,
        automatic_payment_methods: options.automaticPaymentMethods
      }
    });

    return this.transformPaymentIntent(data);
  }

  async getPaymentIntent(paymentIntentId: string): Promise<StripePaymentIntent> {
    const data = await this.request<Record<string, unknown>>(`/payment_intents/${paymentIntentId}`);
    return this.transformPaymentIntent(data);
  }

  async confirmPaymentIntent(paymentIntentId: string, options?: {
    paymentMethod?: string;
    returnUrl?: string;
  }): Promise<StripePaymentIntent> {
    const data = await this.request<Record<string, unknown>>(`/payment_intents/${paymentIntentId}/confirm`, {
      method: 'POST',
      body: {
        payment_method: options?.paymentMethod,
        return_url: options?.returnUrl
      }
    });

    return this.transformPaymentIntent(data);
  }

  async cancelPaymentIntent(paymentIntentId: string): Promise<StripePaymentIntent> {
    const data = await this.request<Record<string, unknown>>(`/payment_intents/${paymentIntentId}/cancel`, {
      method: 'POST'
    });

    return this.transformPaymentIntent(data);
  }

  private transformPaymentIntent(data: Record<string, unknown>): StripePaymentIntent {
    return {
      id: data.id as string,
      amount: data.amount as number,
      currency: data.currency as string,
      status: data.status as StripePaymentIntent['status'],
      clientSecret: data.client_secret as string,
      customer: data.customer as string | null,
      paymentMethod: data.payment_method as string | null,
      receiptEmail: data.receipt_email as string | null,
      description: data.description as string | null,
      metadata: (data.metadata as Record<string, string>) || {},
      created: data.created as number
    };
  }

  // ==========================================================================
  // INVOICE OPERATIONS
  // ==========================================================================

  async listInvoices(options?: {
    customer?: string;
    subscription?: string;
    status?: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
    limit?: number;
    startingAfter?: string;
  }): Promise<{ data: StripeInvoice[]; hasMore: boolean }> {
    const params = new URLSearchParams();
    if (options?.customer) params.set('customer', options.customer);
    if (options?.subscription) params.set('subscription', options.subscription);
    if (options?.status) params.set('status', options.status);
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.startingAfter) params.set('starting_after', options.startingAfter);

    const data = await this.request<{ data: Array<Record<string, unknown>>; has_more: boolean }>(
      `/invoices?${params}`
    );

    return {
      data: data.data.map(i => this.transformInvoice(i)),
      hasMore: data.has_more
    };
  }

  async getInvoice(invoiceId: string): Promise<StripeInvoice> {
    const data = await this.request<Record<string, unknown>>(`/invoices/${invoiceId}`);
    return this.transformInvoice(data);
  }

  private transformInvoice(data: Record<string, unknown>): StripeInvoice {
    const lines = data.lines as { data: Array<Record<string, unknown>> };

    return {
      id: data.id as string,
      customer: data.customer as string,
      subscription: data.subscription as string | null,
      status: data.status as StripeInvoice['status'],
      amountDue: data.amount_due as number,
      amountPaid: data.amount_paid as number,
      amountRemaining: data.amount_remaining as number,
      currency: data.currency as string,
      dueDate: data.due_date as number | null,
      hostedInvoiceUrl: data.hosted_invoice_url as string | null,
      invoicePdf: data.invoice_pdf as string | null,
      lines: {
        data: lines.data.map(line => ({
          id: line.id as string,
          amount: line.amount as number,
          description: line.description as string | null,
          quantity: line.quantity as number
        }))
      },
      created: data.created as number
    };
  }

  // ==========================================================================
  // WEBHOOK HANDLING
  // ==========================================================================

  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    if (!this.webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    const parts = signature.split(',').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const timestamp = parts['t'];
    const v1Signature = parts['v1'];

    if (!timestamp || !v1Signature) {
      return false;
    }

    // Check timestamp is within 5 minutes
    const timestampInt = parseInt(timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestampInt) > 300) {
      return false;
    }

    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedPayload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(v1Signature),
      Buffer.from(expectedSignature)
    );
  }

  parseWebhookEvent(payload: string | Buffer, signature: string): WebhookEvent {
    if (!this.verifyWebhookSignature(payload, signature)) {
      throw new Error('Invalid webhook signature');
    }

    const data = JSON.parse(payload.toString());
    const event: WebhookEvent = {
      id: data.id,
      type: data.type,
      data: data.data,
      created: data.created
    };

    this.emit('webhook', event);

    // Emit specific events
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        this.emit(event.type.replace(/\./g, '_'), event.data.object);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed':
        this.emit(event.type.replace(/\./g, '_'), event.data.object);
        break;
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
        this.emit(event.type.replace(/\./g, '_'), event.data.object);
        break;
      case 'checkout.session.completed':
        this.emit('checkout_session_completed', event.data.object);
        break;
    }

    return event;
  }

  // ==========================================================================
  // BILLING PORTAL
  // ==========================================================================

  async createBillingPortalSession(options: {
    customer: string;
    returnUrl: string;
    flowData?: {
      type: 'payment_method_update' | 'subscription_cancel' | 'subscription_update' | 'subscription_update_confirm';
      subscriptionCancel?: { subscription: string };
      subscriptionUpdate?: { subscription: string };
    };
  }): Promise<{ id: string; url: string }> {
    const data = await this.request<{ id: string; url: string }>('/billing_portal/sessions', {
      method: 'POST',
      body: {
        customer: options.customer,
        return_url: options.returnUrl,
        flow_data: options.flowData
      }
    });

    return { id: data.id, url: data.url };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createStripeConnector(config: StripeConfig): StripeConnector {
  return new StripeConnector(config);
}

export default StripeConnector;

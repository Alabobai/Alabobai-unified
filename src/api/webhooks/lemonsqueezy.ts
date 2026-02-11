/**
 * Alabobai LemonSqueezy Webhook Handler
 * Ultra Agent V4.0 - Payment Event Processing
 *
 * This webhook handler processes all subscription events from LemonSqueezy:
 * - subscription_created: New subscription started
 * - subscription_updated: Plan changed, payment method updated
 * - subscription_cancelled: User cancelled (still active until period end)
 * - subscription_expired: Subscription ended
 * - subscription_payment_success: Monthly payment succeeded
 * - subscription_payment_failed: Payment failed
 * - order_created: Initial order completed
 */

import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

interface LemonSqueezyWebhookEvent {
  meta: {
    event_name: string;
    webhook_id: string;
    custom_data?: {
      user_id?: string;
    };
  };
  data: {
    id: string;
    type: string;
    attributes: {
      store_id: number;
      customer_id: number;
      order_id?: number;
      product_id: number;
      variant_id: number;
      product_name: string;
      variant_name: string;
      user_name: string;
      user_email: string;
      status: string;
      status_formatted: string;
      pause?: any;
      cancelled: boolean;
      trial_ends_at?: string;
      billing_anchor: number;
      first_subscription_item?: {
        id: number;
        subscription_id: number;
        price_id: number;
        quantity: number;
        created_at: string;
        updated_at: string;
      };
      urls: {
        update_payment_method: string;
        customer_portal: string;
      };
      renews_at: string;
      ends_at?: string;
      created_at: string;
      updated_at: string;
      test_mode: boolean;
    };
    relationships: {
      store: { data: { id: string; type: string } };
      customer: { data: { id: string; type: string } };
      order: { data: { id: string; type: string } };
      product: { data: { id: string; type: string } };
      variant: { data: { id: string; type: string } };
    };
  };
}

interface WebhookResponse {
  success: boolean;
  message: string;
  event?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const LEMONSQUEEZY_WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET || '';

// ============================================================================
// SIGNATURE VERIFICATION
// ============================================================================

/**
 * Verify the webhook signature from LemonSqueezy
 * CRITICAL: Always verify signatures to prevent spoofed webhooks
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  if (!LEMONSQUEEZY_WEBHOOK_SECRET) {
    console.error('[Webhook] Missing LEMONSQUEEZY_WEBHOOK_SECRET');
    return false;
  }

  try {
    const hmac = crypto.createHmac('sha256', LEMONSQUEEZY_WEBHOOK_SECRET);
    const digest = hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  } catch (error) {
    console.error('[Webhook] Signature verification error:', error);
    return false;
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle new subscription created
 */
async function handleSubscriptionCreated(
  data: LemonSqueezyWebhookEvent['data'],
  customData?: { user_id?: string }
): Promise<void> {
  const attrs = data.attributes;
  const userId = customData?.user_id;

  console.log('[Webhook] Subscription created:', {
    subscriptionId: data.id,
    userId,
    email: attrs.user_email,
    productName: attrs.product_name,
    status: attrs.status
  });

  // TODO: Implement your database logic here
  // Example with a hypothetical database:
  /*
  await db.subscriptions.create({
    id: data.id,
    userId: userId,
    customerId: String(attrs.customer_id),
    email: attrs.user_email,
    status: attrs.status,
    productId: String(attrs.product_id),
    variantId: String(attrs.variant_id),
    currentPeriodEnd: new Date(attrs.renews_at),
    cancelAtPeriodEnd: false,
    updatePaymentMethodUrl: attrs.urls.update_payment_method,
    customerPortalUrl: attrs.urls.customer_portal,
    createdAt: new Date(attrs.created_at),
    testMode: attrs.test_mode
  });

  // Grant access to the user
  await db.users.update({
    where: { id: userId },
    data: {
      subscriptionStatus: 'active',
      subscriptionId: data.id
    }
  });

  // Send welcome email
  await sendEmail({
    to: attrs.user_email,
    template: 'subscription-welcome',
    data: {
      userName: attrs.user_name,
      productName: attrs.product_name
    }
  });
  */
}

/**
 * Handle subscription updated (plan change, payment method update, etc.)
 */
async function handleSubscriptionUpdated(
  data: LemonSqueezyWebhookEvent['data']
): Promise<void> {
  const attrs = data.attributes;

  console.log('[Webhook] Subscription updated:', {
    subscriptionId: data.id,
    status: attrs.status,
    renewsAt: attrs.renews_at
  });

  // TODO: Update subscription in your database
  /*
  await db.subscriptions.update({
    where: { id: data.id },
    data: {
      status: attrs.status,
      currentPeriodEnd: new Date(attrs.renews_at),
      updatePaymentMethodUrl: attrs.urls.update_payment_method,
      updatedAt: new Date()
    }
  });
  */
}

/**
 * Handle subscription cancelled
 * Note: User still has access until the end of the billing period
 */
async function handleSubscriptionCancelled(
  data: LemonSqueezyWebhookEvent['data']
): Promise<void> {
  const attrs = data.attributes;

  console.log('[Webhook] Subscription cancelled:', {
    subscriptionId: data.id,
    endsAt: attrs.ends_at,
    email: attrs.user_email
  });

  // TODO: Mark subscription as cancelling (not yet expired)
  /*
  await db.subscriptions.update({
    where: { id: data.id },
    data: {
      status: 'cancelled',
      cancelAtPeriodEnd: true,
      endsAt: attrs.ends_at ? new Date(attrs.ends_at) : null,
      updatedAt: new Date()
    }
  });

  // Send cancellation confirmation email
  await sendEmail({
    to: attrs.user_email,
    template: 'subscription-cancelled',
    data: {
      userName: attrs.user_name,
      accessUntil: attrs.ends_at || attrs.renews_at
    }
  });
  */
}

/**
 * Handle subscription expired (access should be revoked)
 */
async function handleSubscriptionExpired(
  data: LemonSqueezyWebhookEvent['data']
): Promise<void> {
  const attrs = data.attributes;

  console.log('[Webhook] Subscription expired:', {
    subscriptionId: data.id,
    email: attrs.user_email
  });

  // TODO: Revoke access
  /*
  await db.subscriptions.update({
    where: { id: data.id },
    data: {
      status: 'expired',
      updatedAt: new Date()
    }
  });

  // Update user access
  const subscription = await db.subscriptions.findUnique({
    where: { id: data.id },
    select: { userId: true }
  });

  if (subscription?.userId) {
    await db.users.update({
      where: { id: subscription.userId },
      data: {
        subscriptionStatus: 'expired',
        subscriptionId: null
      }
    });
  }

  // Send expiration email with reactivation offer
  await sendEmail({
    to: attrs.user_email,
    template: 'subscription-expired',
    data: {
      userName: attrs.user_name,
      reactivateUrl: `${process.env.APP_URL}/#pricing`
    }
  });
  */
}

/**
 * Handle successful payment
 */
async function handlePaymentSuccess(
  data: LemonSqueezyWebhookEvent['data']
): Promise<void> {
  const attrs = data.attributes;

  console.log('[Webhook] Payment successful:', {
    subscriptionId: data.id,
    renewsAt: attrs.renews_at
  });

  // TODO: Record payment and extend access
  /*
  await db.payments.create({
    subscriptionId: data.id,
    status: 'paid',
    paidAt: new Date(),
    nextBillingDate: new Date(attrs.renews_at)
  });

  // Ensure subscription is active
  await db.subscriptions.update({
    where: { id: data.id },
    data: {
      status: 'active',
      currentPeriodEnd: new Date(attrs.renews_at),
      updatedAt: new Date()
    }
  });
  */
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(
  data: LemonSqueezyWebhookEvent['data']
): Promise<void> {
  const attrs = data.attributes;

  console.log('[Webhook] Payment failed:', {
    subscriptionId: data.id,
    email: attrs.user_email
  });

  // TODO: Handle failed payment
  /*
  await db.subscriptions.update({
    where: { id: data.id },
    data: {
      status: 'past_due',
      updatedAt: new Date()
    }
  });

  // Send payment failed email with update payment link
  await sendEmail({
    to: attrs.user_email,
    template: 'payment-failed',
    data: {
      userName: attrs.user_name,
      updatePaymentUrl: attrs.urls.update_payment_method
    }
  });
  */
}

/**
 * Handle initial order created
 */
async function handleOrderCreated(
  data: LemonSqueezyWebhookEvent['data'],
  customData?: { user_id?: string }
): Promise<void> {
  const attrs = data.attributes;
  const userId = customData?.user_id;

  console.log('[Webhook] Order created:', {
    orderId: data.id,
    userId,
    email: attrs.user_email,
    productName: attrs.product_name
  });

  // Note: For subscriptions, subscription_created is more important
  // This event is useful for one-time purchases or initial order tracking
}

// ============================================================================
// MAIN WEBHOOK HANDLER
// ============================================================================

/**
 * Main webhook handler - processes all LemonSqueezy events
 */
export async function handleLemonSqueezyWebhook(
  rawBody: string,
  signature: string
): Promise<WebhookResponse> {
  // Verify signature
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error('[Webhook] Invalid signature');
    return {
      success: false,
      message: 'Invalid signature'
    };
  }

  // Parse the event
  let event: LemonSqueezyWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch (error) {
    console.error('[Webhook] Failed to parse webhook body:', error);
    return {
      success: false,
      message: 'Invalid JSON body'
    };
  }

  const eventName = event.meta.event_name;
  const customData = event.meta.custom_data;

  console.log(`[Webhook] Processing event: ${eventName}`);

  try {
    switch (eventName) {
      case 'subscription_created':
        await handleSubscriptionCreated(event.data, customData);
        break;

      case 'subscription_updated':
        await handleSubscriptionUpdated(event.data);
        break;

      case 'subscription_cancelled':
        await handleSubscriptionCancelled(event.data);
        break;

      case 'subscription_expired':
        await handleSubscriptionExpired(event.data);
        break;

      case 'subscription_payment_success':
        await handlePaymentSuccess(event.data);
        break;

      case 'subscription_payment_failed':
        await handlePaymentFailed(event.data);
        break;

      case 'order_created':
        await handleOrderCreated(event.data, customData);
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${eventName}`);
    }

    return {
      success: true,
      message: 'Webhook processed successfully',
      event: eventName
    };
  } catch (error) {
    console.error(`[Webhook] Error processing ${eventName}:`, error);
    return {
      success: false,
      message: `Error processing event: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// ============================================================================
// EXPRESS/HONO/NEXT.JS ROUTE HANDLER EXAMPLE
// ============================================================================

/**
 * Example Express.js route handler
 * Adapt this for your framework (Hono, Next.js, etc.)
 */
export async function webhookRouteHandler(req: any, res: any): Promise<void> {
  // Get raw body - IMPORTANT: Don't use body parsers for webhook routes
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

  // Get signature from header
  const signature = req.headers['x-signature'] || req.headers['X-Signature'] || '';

  if (!signature) {
    res.status(401).json({ error: 'Missing signature' });
    return;
  }

  const result = await handleLemonSqueezyWebhook(rawBody, signature);

  if (result.success) {
    res.status(200).json(result);
  } else {
    res.status(400).json(result);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get subscription status from LemonSqueezy status string
 */
export function mapSubscriptionStatus(
  lsStatus: string
): 'active' | 'cancelled' | 'expired' | 'past_due' | 'paused' {
  const statusMap: Record<string, 'active' | 'cancelled' | 'expired' | 'past_due' | 'paused'> = {
    'active': 'active',
    'on_trial': 'active',
    'paused': 'paused',
    'past_due': 'past_due',
    'unpaid': 'past_due',
    'cancelled': 'cancelled',
    'expired': 'expired'
  };

  return statusMap[lsStatus] || 'expired';
}

/**
 * Check if a subscription grants access
 */
export function hasAccess(status: string): boolean {
  return ['active', 'on_trial', 'past_due'].includes(status);
}

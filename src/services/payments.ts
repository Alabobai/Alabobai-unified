/**
 * Alabobai Payment Service
 * LemonSqueezy Integration for Global Payments
 *
 * Why LemonSqueezy:
 * - Merchant of Record: They handle ALL tax compliance globally
 * - Automatic VAT/GST/Sales Tax in 100+ countries
 * - You receive clean revenue, they handle taxes
 * - Works for customers in any country
 * - No need to register for VAT in EU, GST in Australia, etc.
 */

import crypto from 'crypto';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LEMONSQUEEZY_API_KEY = process.env.LEMONSQUEEZY_API_KEY || '';
const LEMONSQUEEZY_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID || '';
const LEMONSQUEEZY_WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET || '';

const LEMONSQUEEZY_API_URL = 'https://api.lemonsqueezy.com/v1';

// ============================================================================
// PRICING CONFIGURATION
// ============================================================================

export const PRICING = {
  monthly: {
    name: 'Alabobai Pro',
    price: 9900, // $99.00 in cents
    interval: 'month',
    description: 'All 12 departments, unlimited requests',
    features: [
      'All 12 AI departments',
      'Unlimited requests',
      'Complete document generation',
      'Code and app building',
      'Priority support',
      'Works in any country',
      'No per-task fees',
      'Cancel anytime'
    ]
  },
  yearly: {
    name: 'Alabobai Pro (Annual)',
    price: 99000, // $990.00 in cents (save $198/year)
    interval: 'year',
    description: 'All features, 2 months free',
    features: [
      'Everything in monthly',
      'Save $198/year',
      '2 months free',
      'Priority onboarding'
    ]
  }
};

// ============================================================================
// TYPES
// ============================================================================

interface LemonSqueezyWebhookEvent {
  meta: {
    event_name: string;
    webhook_id: string;
  };
  data: {
    id: string;
    type: string;
    attributes: Record<string, any>;
  };
}

interface Subscription {
  id: string;
  userId: string;
  customerId: string;
  status: 'active' | 'cancelled' | 'expired' | 'past_due' | 'paused';
  planId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
}

// ============================================================================
// API HELPERS
// ============================================================================

async function lemonSqueezyRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: Record<string, any>
): Promise<any> {
  const response = await fetch(`${LEMONSQUEEZY_API_URL}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${LEMONSQUEEZY_API_KEY}`,
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LemonSqueezy API error: ${response.status} - ${error}`);
  }

  return response.json();
}

// ============================================================================
// CHECKOUT
// ============================================================================

/**
 * Create a checkout URL for a customer
 * Customer is redirected to LemonSqueezy's hosted checkout
 */
export async function createCheckout(options: {
  variantId: string; // LemonSqueezy product variant ID
  email: string;
  userId: string;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<{ checkoutUrl: string }> {
  const data = await lemonSqueezyRequest('/checkouts', 'POST', {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: {
          email: options.email,
          custom: {
            user_id: options.userId
          }
        },
        checkout_options: {
          embed: false,
          media: false,
          logo: true
        },
        product_options: {
          enabled_variants: [options.variantId],
          redirect_url: options.successUrl || `${process.env.APP_URL}/app?welcome=true`,
          receipt_link_url: `${process.env.APP_URL}/app/billing`
        }
      },
      relationships: {
        store: {
          data: {
            type: 'stores',
            id: LEMONSQUEEZY_STORE_ID
          }
        },
        variant: {
          data: {
            type: 'variants',
            id: options.variantId
          }
        }
      }
    }
  });

  return {
    checkoutUrl: data.data.attributes.url
  };
}

/**
 * Get checkout URL directly using product variant ID
 * Simpler method that redirects to LemonSqueezy's hosted page
 */
export function getCheckoutUrl(variantId: string, email?: string, userId?: string): string {
  let url = `https://${process.env.LEMONSQUEEZY_STORE_SLUG || 'alabobai'}.lemonsqueezy.com/checkout/buy/${variantId}`;

  const params = new URLSearchParams();
  if (email) params.append('checkout[email]', email);
  if (userId) params.append('checkout[custom][user_id]', userId);

  const paramString = params.toString();
  if (paramString) {
    url += `?${paramString}`;
  }

  return url;
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

/**
 * Get subscription details
 */
export async function getSubscription(subscriptionId: string): Promise<any> {
  const data = await lemonSqueezyRequest(`/subscriptions/${subscriptionId}`);
  return data.data;
}

/**
 * Cancel subscription (at period end)
 */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await lemonSqueezyRequest(`/subscriptions/${subscriptionId}`, 'DELETE');
}

/**
 * Resume a paused subscription
 */
export async function resumeSubscription(subscriptionId: string): Promise<void> {
  await lemonSqueezyRequest(`/subscriptions/${subscriptionId}`, 'PATCH', {
    data: {
      type: 'subscriptions',
      id: subscriptionId,
      attributes: {
        cancelled: false
      }
    }
  });
}

/**
 * Update subscription payment method
 * Returns URL for customer to update their payment method
 */
export async function getUpdatePaymentMethodUrl(subscriptionId: string): Promise<string> {
  const data = await lemonSqueezyRequest(`/subscriptions/${subscriptionId}`);
  return data.data.attributes.urls.update_payment_method;
}

/**
 * Get customer portal URL
 * Customers can manage their subscription here
 */
export async function getCustomerPortalUrl(customerId: string): Promise<string> {
  const data = await lemonSqueezyRequest(`/customers/${customerId}`);
  return data.data.attributes.urls.customer_portal;
}

// ============================================================================
// WEBHOOK HANDLING
// ============================================================================

/**
 * Verify webhook signature from LemonSqueezy
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const hmac = crypto.createHmac('sha256', LEMONSQUEEZY_WEBHOOK_SECRET);
  const digest = hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

/**
 * Handle webhook events from LemonSqueezy
 */
export async function handleWebhook(
  event: LemonSqueezyWebhookEvent,
  callbacks: {
    onSubscriptionCreated?: (data: any) => Promise<void>;
    onSubscriptionUpdated?: (data: any) => Promise<void>;
    onSubscriptionCancelled?: (data: any) => Promise<void>;
    onSubscriptionExpired?: (data: any) => Promise<void>;
    onPaymentSuccess?: (data: any) => Promise<void>;
    onPaymentFailed?: (data: any) => Promise<void>;
  }
): Promise<void> {
  const eventName = event.meta.event_name;
  const data = event.data;

  console.log(`[Payments] Webhook received: ${eventName}`);

  switch (eventName) {
    case 'subscription_created':
      if (callbacks.onSubscriptionCreated) {
        await callbacks.onSubscriptionCreated(data);
      }
      break;

    case 'subscription_updated':
      if (callbacks.onSubscriptionUpdated) {
        await callbacks.onSubscriptionUpdated(data);
      }
      break;

    case 'subscription_cancelled':
      if (callbacks.onSubscriptionCancelled) {
        await callbacks.onSubscriptionCancelled(data);
      }
      break;

    case 'subscription_expired':
      if (callbacks.onSubscriptionExpired) {
        await callbacks.onSubscriptionExpired(data);
      }
      break;

    case 'order_created':
    case 'subscription_payment_success':
      if (callbacks.onPaymentSuccess) {
        await callbacks.onPaymentSuccess(data);
      }
      break;

    case 'subscription_payment_failed':
      if (callbacks.onPaymentFailed) {
        await callbacks.onPaymentFailed(data);
      }
      break;

    default:
      console.log(`[Payments] Unhandled webhook event: ${eventName}`);
  }
}

// ============================================================================
// USAGE CHECK
// ============================================================================

/**
 * Check if user has active subscription
 */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  // This would query your database
  // For now, return placeholder
  // In production: Check user's subscription status in your database
  return false;
}

/**
 * Get user's subscription status
 */
export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  // This would query your database
  // For now, return placeholder
  return null;
}

// ============================================================================
// SETUP INSTRUCTIONS
// ============================================================================

/**
 * LemonSqueezy Setup Checklist:
 *
 * 1. Create account at lemonsqueezy.com
 *
 * 2. Create your store
 *    - Set store name: "Alabobai"
 *    - Set store slug: "alabobai"
 *
 * 3. Create product:
 *    - Name: "Alabobai Pro"
 *    - Price: $99/month
 *    - Type: Subscription
 *
 * 4. Get your credentials:
 *    - API Key: Settings > API
 *    - Store ID: Settings > Store > Store ID
 *    - Variant ID: Products > Your Product > Variants
 *
 * 5. Set up webhooks:
 *    - URL: https://alabobai.com/api/webhooks/lemonsqueezy
 *    - Events: All subscription and order events
 *    - Get webhook secret
 *
 * 6. Add to .env:
 *    LEMONSQUEEZY_API_KEY=your_api_key
 *    LEMONSQUEEZY_STORE_ID=your_store_id
 *    LEMONSQUEEZY_WEBHOOK_SECRET=your_webhook_secret
 *    LEMONSQUEEZY_VARIANT_ID=your_variant_id
 *
 * 7. Tax handling (automatic):
 *    - LemonSqueezy handles VAT (EU), GST (AU/NZ), Sales Tax (US)
 *    - They are the Merchant of Record
 *    - You receive net revenue after taxes
 *
 * 8. Payouts:
 *    - Set up your bank account in LemonSqueezy dashboard
 *    - Payouts are made weekly or monthly (your choice)
 *    - They handle currency conversion
 */

export const SETUP_CHECKLIST = `
LemonSqueezy Setup for Alabobai Inc.

Environment Variables Needed:
─────────────────────────────
LEMONSQUEEZY_API_KEY=lmsq_xxxxxxxxxxxxxxxx
LEMONSQUEEZY_STORE_ID=12345
LEMONSQUEEZY_STORE_SLUG=alabobai
LEMONSQUEEZY_VARIANT_ID=67890
LEMONSQUEEZY_WEBHOOK_SECRET=whsec_xxxxxxxx
APP_URL=https://alabobai.com

Webhook Endpoint:
─────────────────
POST /api/webhooks/lemonsqueezy

Required Webhook Events:
────────────────────────
- subscription_created
- subscription_updated
- subscription_cancelled
- subscription_expired
- subscription_payment_success
- subscription_payment_failed
- order_created
`;

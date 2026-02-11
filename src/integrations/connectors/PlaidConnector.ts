/**
 * Plaid Connector - Bank Connections, Transactions, Balances
 * Secure financial data integration with Link token flow
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export type PlaidEnvironment = 'sandbox' | 'development' | 'production';

export type PlaidProduct =
  | 'assets'
  | 'auth'
  | 'balance'
  | 'identity'
  | 'investments'
  | 'liabilities'
  | 'payment_initiation'
  | 'transactions'
  | 'credit_details'
  | 'income'
  | 'income_verification'
  | 'deposit_switch'
  | 'standing_orders'
  | 'transfer'
  | 'employment'
  | 'recurring_transactions';

export interface PlaidCredentials {
  accessToken: string;
  itemId: string;
  institutionId: string;
  institutionName: string;
  consentExpirationTime?: string;
}

export interface PlaidInstitution {
  institutionId: string;
  name: string;
  products: PlaidProduct[];
  countryCodes: string[];
  url?: string;
  primaryColor?: string;
  logo?: string;
  routingNumbers?: string[];
  oauth: boolean;
}

export interface PlaidAccount {
  accountId: string;
  name: string;
  officialName: string | null;
  type: 'investment' | 'credit' | 'depository' | 'loan' | 'brokerage' | 'other';
  subtype: string | null;
  mask: string | null;
  balances: {
    available: number | null;
    current: number | null;
    limit: number | null;
    isoCurrencyCode: string | null;
    unofficialCurrencyCode: string | null;
  };
  verificationStatus?: 'pending_automatic_verification' | 'pending_manual_verification' | 'manually_verified' | 'verification_expired' | 'verification_failed';
}

export interface PlaidTransaction {
  transactionId: string;
  accountId: string;
  amount: number;
  isoCurrencyCode: string | null;
  unofficialCurrencyCode: string | null;
  category: string[] | null;
  categoryId: string | null;
  checkNumber: string | null;
  date: string;
  datetime: string | null;
  authorizedDate: string | null;
  authorizedDatetime: string | null;
  location: {
    address: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
    lat: number | null;
    lon: number | null;
    storeNumber: string | null;
  };
  name: string;
  merchantName: string | null;
  paymentChannel: 'online' | 'in store' | 'other';
  paymentMeta: {
    byOrderOf: string | null;
    payee: string | null;
    payer: string | null;
    paymentMethod: string | null;
    paymentProcessor: string | null;
    ppdId: string | null;
    reason: string | null;
    referenceNumber: string | null;
  };
  pending: boolean;
  pendingTransactionId: string | null;
  accountOwner: string | null;
  transactionCode: string | null;
  transactionType: 'digital' | 'place' | 'special' | 'unresolved';
  personalFinanceCategory?: {
    primary: string;
    detailed: string;
  };
}

export interface PlaidRecurringTransaction {
  streamId: string;
  accountId: string;
  description: string;
  merchantName: string | null;
  category: string[];
  averageAmount: { amount: number; isoCurrencyCode: string };
  lastAmount: { amount: number; isoCurrencyCode: string };
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY' | 'ANNUALLY' | 'UNKNOWN';
  transactionIds: string[];
  firstDate: string;
  lastDate: string;
  isActive: boolean;
  status: 'MATURE' | 'EARLY_DETECTION' | 'TOMBSTONED';
}

export interface PlaidIdentity {
  accountId: string;
  owners: Array<{
    names: string[];
    phoneNumbers: Array<{ data: string; primary: boolean; type: string }>;
    emails: Array<{ data: string; primary: boolean; type: string }>;
    addresses: Array<{
      data: {
        city: string | null;
        country: string | null;
        postalCode: string | null;
        region: string | null;
        street: string | null;
      };
      primary: boolean;
    }>;
  }>;
}

export interface PlaidLiability {
  accountId: string;
  type: 'credit' | 'mortgage' | 'student';
  credit?: {
    isOverdue: boolean;
    lastPaymentAmount: number;
    lastPaymentDate: string;
    lastStatementBalance: number;
    lastStatementIssueDate: string;
    minimumPaymentAmount: number;
    nextPaymentDueDate: string;
    aprs: Array<{
      aprPercentage: number;
      aprType: string;
      balanceSubjectToApr: number;
      interestChargeAmount: number;
    }>;
  };
  mortgage?: {
    accountNumber: string;
    currentLateFee: number;
    escrowBalance: number;
    hasPmi: boolean;
    hasPrepaymentPenalty: boolean;
    interestRatePercentage: number;
    interestRateType: string;
    lastPaymentAmount: number;
    lastPaymentDate: string;
    loanTerm: string;
    loanTypeDescription: string;
    maturityDate: string;
    nextMonthlyPayment: number;
    nextPaymentDueDate: string;
    originationDate: string;
    originationPrincipalAmount: number;
    pastDueAmount: number;
    ytdInterestPaid: number;
    ytdPrincipalPaid: number;
  };
  student?: {
    accountNumber: string;
    disbursementDates: string[];
    expectedPayoffDate: string;
    guarantor: string;
    interestRatePercentage: number;
    isOverdue: boolean;
    lastPaymentAmount: number;
    lastPaymentDate: string;
    lastStatementBalance: number;
    lastStatementIssueDate: string;
    loanName: string;
    loanStatus: { endDate: string; type: string };
    minimumPaymentAmount: number;
    nextPaymentDueDate: string;
    originationDate: string;
    originationPrincipalAmount: number;
    outstandingInterestAmount: number;
    paymentReferenceNumber: string;
    pslfStatus: { estimatedEligibilityDate: string; paymentsMade: number; paymentsRemaining: number };
    repaymentPlan: { description: string; type: string };
    sequenceNumber: string;
    servicerAddress: {
      city: string;
      country: string;
      postalCode: string;
      region: string;
      street: string;
    };
    ytdInterestPaid: number;
    ytdPrincipalPaid: number;
  };
}

export interface PlaidInvestmentHolding {
  accountId: string;
  securityId: string;
  institutionPrice: number;
  institutionPriceAsOf: string | null;
  institutionPriceDatetime: string | null;
  institutionValue: number;
  costBasis: number | null;
  quantity: number;
  isoCurrencyCode: string | null;
  unofficialCurrencyCode: string | null;
}

export interface PlaidSecurity {
  securityId: string;
  isin: string | null;
  cusip: string | null;
  sedol: string | null;
  institutionSecurityId: string | null;
  institutionId: string | null;
  proxySecurityId: string | null;
  name: string | null;
  tickerSymbol: string | null;
  isCashEquivalent: boolean;
  type: string;
  closePrice: number | null;
  closePriceAsOf: string | null;
  isoCurrencyCode: string | null;
  unofficialCurrencyCode: string | null;
}

export interface WebhookEvent {
  webhookType: string;
  webhookCode: string;
  itemId: string;
  error?: { errorCode: string; errorMessage: string };
  newTransactions?: number;
  removedTransactions?: string[];
  [key: string]: unknown;
}

// ============================================================================
// PLAID CONNECTOR CLASS
// ============================================================================

export class PlaidConnector extends EventEmitter {
  private clientId: string;
  private secret: string;
  private environment: PlaidEnvironment;
  private credentials: Map<string, PlaidCredentials> = new Map();

  private readonly API_URLS: Record<PlaidEnvironment, string> = {
    sandbox: 'https://sandbox.plaid.com',
    development: 'https://development.plaid.com',
    production: 'https://production.plaid.com'
  };

  constructor(config: {
    clientId: string;
    secret: string;
    environment: PlaidEnvironment;
  }) {
    super();
    this.clientId = config.clientId;
    this.secret = config.secret;
    this.environment = config.environment;
  }

  private get baseUrl(): string {
    return this.API_URLS[this.environment];
  }

  private async request<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        secret: this.secret,
        ...body
      })
    });

    const data = await response.json();

    if (data.error_code) {
      const error = new Error(`Plaid error: ${data.error_code} - ${data.error_message}`);
      (error as unknown as { plaidError: unknown }).plaidError = data;
      throw error;
    }

    return data;
  }

  // ==========================================================================
  // LINK TOKEN FLOW
  // ==========================================================================

  async createLinkToken(options: {
    userId: string;
    clientName: string;
    products: PlaidProduct[];
    countryCodes?: string[];
    language?: string;
    webhook?: string;
    accessToken?: string;
    linkCustomizationName?: string;
    redirectUri?: string;
    androidPackageName?: string;
    accountFilters?: Record<string, { accountSubtypes: string[] }>;
  }): Promise<{ linkToken: string; expiration: string; requestId: string }> {
    const response = await this.request<{
      link_token: string;
      expiration: string;
      request_id: string;
    }>('/link/token/create', {
      user: { client_user_id: options.userId },
      client_name: options.clientName,
      products: options.products,
      country_codes: options.countryCodes || ['US'],
      language: options.language || 'en',
      webhook: options.webhook,
      access_token: options.accessToken,
      link_customization_name: options.linkCustomizationName,
      redirect_uri: options.redirectUri,
      android_package_name: options.androidPackageName,
      account_filters: options.accountFilters
    });

    return {
      linkToken: response.link_token,
      expiration: response.expiration,
      requestId: response.request_id
    };
  }

  async exchangePublicToken(publicToken: string): Promise<PlaidCredentials> {
    const response = await this.request<{
      access_token: string;
      item_id: string;
    }>('/item/public_token/exchange', {
      public_token: publicToken
    });

    // Get institution info
    const itemInfo = await this.getItem(response.access_token);

    const credentials: PlaidCredentials = {
      accessToken: response.access_token,
      itemId: response.item_id,
      institutionId: itemInfo.institutionId,
      institutionName: itemInfo.institutionName,
      consentExpirationTime: itemInfo.consentExpirationTime || undefined
    };

    this.credentials.set(response.item_id, credentials);
    this.emit('item_connected', { itemId: response.item_id });

    return credentials;
  }

  setCredentials(itemId: string, credentials: PlaidCredentials): void {
    this.credentials.set(itemId, credentials);
  }

  getCredentials(itemId: string): PlaidCredentials | undefined {
    return this.credentials.get(itemId);
  }

  // ==========================================================================
  // ITEM OPERATIONS
  // ==========================================================================

  async getItem(accessToken: string): Promise<{
    itemId: string;
    institutionId: string;
    institutionName: string;
    webhook: string | null;
    availableProducts: PlaidProduct[];
    billedProducts: PlaidProduct[];
    consentExpirationTime: string | null;
    updateType: string;
  }> {
    const response = await this.request<{
      item: {
        item_id: string;
        institution_id: string;
        webhook: string | null;
        available_products: PlaidProduct[];
        billed_products: PlaidProduct[];
        consent_expiration_time: string | null;
        update_type: string;
      };
      status: { transactions: unknown; investments: unknown };
    }>('/item/get', { access_token: accessToken });

    // Get institution name
    let institutionName = 'Unknown Institution';
    try {
      const institution = await this.getInstitution(response.item.institution_id);
      institutionName = institution.name;
    } catch {
      // Ignore institution lookup errors
    }

    return {
      itemId: response.item.item_id,
      institutionId: response.item.institution_id,
      institutionName,
      webhook: response.item.webhook,
      availableProducts: response.item.available_products,
      billedProducts: response.item.billed_products,
      consentExpirationTime: response.item.consent_expiration_time,
      updateType: response.item.update_type
    };
  }

  async updateItemWebhook(accessToken: string, webhook: string): Promise<void> {
    await this.request('/item/webhook/update', {
      access_token: accessToken,
      webhook
    });
  }

  async removeItem(accessToken: string): Promise<void> {
    const credentials = Array.from(this.credentials.entries())
      .find(([, cred]) => cred.accessToken === accessToken);

    await this.request('/item/remove', { access_token: accessToken });

    if (credentials) {
      this.credentials.delete(credentials[0]);
      this.emit('item_removed', { itemId: credentials[0] });
    }
  }

  async refreshTransactions(accessToken: string): Promise<void> {
    await this.request('/transactions/refresh', { access_token: accessToken });
  }

  // ==========================================================================
  // INSTITUTION OPERATIONS
  // ==========================================================================

  async getInstitution(institutionId: string, options?: {
    includeLogo?: boolean;
    includeAuthMetadata?: boolean;
    includePaymentInitiationMetadata?: boolean;
  }): Promise<PlaidInstitution> {
    const response = await this.request<{
      institution: {
        institution_id: string;
        name: string;
        products: PlaidProduct[];
        country_codes: string[];
        url?: string;
        primary_color?: string;
        logo?: string;
        routing_numbers?: string[];
        oauth: boolean;
      };
    }>('/institutions/get_by_id', {
      institution_id: institutionId,
      country_codes: ['US'],
      options: {
        include_optional_metadata: true,
        include_auth_metadata: options?.includeAuthMetadata,
        include_payment_initiation_metadata: options?.includePaymentInitiationMetadata
      }
    });

    return {
      institutionId: response.institution.institution_id,
      name: response.institution.name,
      products: response.institution.products,
      countryCodes: response.institution.country_codes,
      url: response.institution.url,
      primaryColor: response.institution.primary_color,
      logo: response.institution.logo,
      routingNumbers: response.institution.routing_numbers,
      oauth: response.institution.oauth
    };
  }

  async searchInstitutions(query: string, options?: {
    products?: PlaidProduct[];
    countryCodes?: string[];
    limit?: number;
  }): Promise<PlaidInstitution[]> {
    const response = await this.request<{
      institutions: Array<{
        institution_id: string;
        name: string;
        products: PlaidProduct[];
        country_codes: string[];
        url?: string;
        primary_color?: string;
        logo?: string;
        routing_numbers?: string[];
        oauth: boolean;
      }>;
    }>('/institutions/search', {
      query,
      products: options?.products || ['transactions'],
      country_codes: options?.countryCodes || ['US'],
      options: {
        include_optional_metadata: true,
        limit: options?.limit || 20
      }
    });

    return response.institutions.map(inst => ({
      institutionId: inst.institution_id,
      name: inst.name,
      products: inst.products,
      countryCodes: inst.country_codes,
      url: inst.url,
      primaryColor: inst.primary_color,
      logo: inst.logo,
      routingNumbers: inst.routing_numbers,
      oauth: inst.oauth
    }));
  }

  // ==========================================================================
  // ACCOUNT OPERATIONS
  // ==========================================================================

  async getAccounts(accessToken: string, accountIds?: string[]): Promise<PlaidAccount[]> {
    const response = await this.request<{
      accounts: Array<{
        account_id: string;
        name: string;
        official_name: string | null;
        type: PlaidAccount['type'];
        subtype: string | null;
        mask: string | null;
        balances: {
          available: number | null;
          current: number | null;
          limit: number | null;
          iso_currency_code: string | null;
          unofficial_currency_code: string | null;
        };
        verification_status?: PlaidAccount['verificationStatus'];
      }>;
    }>('/accounts/get', {
      access_token: accessToken,
      options: accountIds ? { account_ids: accountIds } : undefined
    });

    return response.accounts.map(acc => ({
      accountId: acc.account_id,
      name: acc.name,
      officialName: acc.official_name,
      type: acc.type,
      subtype: acc.subtype,
      mask: acc.mask,
      balances: {
        available: acc.balances.available,
        current: acc.balances.current,
        limit: acc.balances.limit,
        isoCurrencyCode: acc.balances.iso_currency_code,
        unofficialCurrencyCode: acc.balances.unofficial_currency_code
      },
      verificationStatus: acc.verification_status
    }));
  }

  async getBalance(accessToken: string, accountIds?: string[]): Promise<PlaidAccount[]> {
    const response = await this.request<{
      accounts: Array<{
        account_id: string;
        name: string;
        official_name: string | null;
        type: PlaidAccount['type'];
        subtype: string | null;
        mask: string | null;
        balances: {
          available: number | null;
          current: number | null;
          limit: number | null;
          iso_currency_code: string | null;
          unofficial_currency_code: string | null;
        };
      }>;
    }>('/accounts/balance/get', {
      access_token: accessToken,
      options: accountIds ? { account_ids: accountIds } : undefined
    });

    return response.accounts.map(acc => ({
      accountId: acc.account_id,
      name: acc.name,
      officialName: acc.official_name,
      type: acc.type,
      subtype: acc.subtype,
      mask: acc.mask,
      balances: {
        available: acc.balances.available,
        current: acc.balances.current,
        limit: acc.balances.limit,
        isoCurrencyCode: acc.balances.iso_currency_code,
        unofficialCurrencyCode: acc.balances.unofficial_currency_code
      }
    }));
  }

  // ==========================================================================
  // TRANSACTION OPERATIONS
  // ==========================================================================

  async getTransactions(accessToken: string, options: {
    startDate: string;
    endDate: string;
    accountIds?: string[];
    count?: number;
    offset?: number;
    includeOriginalDescription?: boolean;
    includePersonalFinanceCategory?: boolean;
  }): Promise<{
    accounts: PlaidAccount[];
    transactions: PlaidTransaction[];
    totalTransactions: number;
  }> {
    const response = await this.request<{
      accounts: Array<Record<string, unknown>>;
      transactions: Array<Record<string, unknown>>;
      total_transactions: number;
    }>('/transactions/get', {
      access_token: accessToken,
      start_date: options.startDate,
      end_date: options.endDate,
      options: {
        account_ids: options.accountIds,
        count: options.count || 100,
        offset: options.offset || 0,
        include_original_description: options.includeOriginalDescription,
        include_personal_finance_category: options.includePersonalFinanceCategory ?? true
      }
    });

    return {
      accounts: response.accounts.map(acc => this.transformAccount(acc)),
      transactions: response.transactions.map(tx => this.transformTransaction(tx)),
      totalTransactions: response.total_transactions
    };
  }

  async syncTransactions(accessToken: string, cursor?: string, options?: {
    count?: number;
    includeOriginalDescription?: boolean;
    includePersonalFinanceCategory?: boolean;
  }): Promise<{
    added: PlaidTransaction[];
    modified: PlaidTransaction[];
    removed: Array<{ transactionId: string }>;
    nextCursor: string;
    hasMore: boolean;
  }> {
    const response = await this.request<{
      added: Array<Record<string, unknown>>;
      modified: Array<Record<string, unknown>>;
      removed: Array<{ transaction_id: string }>;
      next_cursor: string;
      has_more: boolean;
    }>('/transactions/sync', {
      access_token: accessToken,
      cursor,
      count: options?.count || 100,
      options: {
        include_original_description: options?.includeOriginalDescription,
        include_personal_finance_category: options?.includePersonalFinanceCategory ?? true
      }
    });

    return {
      added: response.added.map(tx => this.transformTransaction(tx)),
      modified: response.modified.map(tx => this.transformTransaction(tx)),
      removed: response.removed.map(r => ({ transactionId: r.transaction_id })),
      nextCursor: response.next_cursor,
      hasMore: response.has_more
    };
  }

  async getRecurringTransactions(accessToken: string, accountIds?: string[]): Promise<{
    inflowStreams: PlaidRecurringTransaction[];
    outflowStreams: PlaidRecurringTransaction[];
    updatedDatetime: string;
  }> {
    const response = await this.request<{
      inflow_streams: Array<Record<string, unknown>>;
      outflow_streams: Array<Record<string, unknown>>;
      updated_datetime: string;
    }>('/transactions/recurring/get', {
      access_token: accessToken,
      options: accountIds ? { account_ids: accountIds } : undefined
    });

    return {
      inflowStreams: response.inflow_streams.map(s => this.transformRecurringTransaction(s)),
      outflowStreams: response.outflow_streams.map(s => this.transformRecurringTransaction(s)),
      updatedDatetime: response.updated_datetime
    };
  }

  private transformTransaction(data: Record<string, unknown>): PlaidTransaction {
    const location = data.location as Record<string, unknown>;
    const paymentMeta = data.payment_meta as Record<string, unknown>;
    const personalFinanceCategory = data.personal_finance_category as Record<string, unknown> | undefined;

    return {
      transactionId: data.transaction_id as string,
      accountId: data.account_id as string,
      amount: data.amount as number,
      isoCurrencyCode: data.iso_currency_code as string | null,
      unofficialCurrencyCode: data.unofficial_currency_code as string | null,
      category: data.category as string[] | null,
      categoryId: data.category_id as string | null,
      checkNumber: data.check_number as string | null,
      date: data.date as string,
      datetime: data.datetime as string | null,
      authorizedDate: data.authorized_date as string | null,
      authorizedDatetime: data.authorized_datetime as string | null,
      location: {
        address: location?.address as string | null,
        city: location?.city as string | null,
        region: location?.region as string | null,
        postalCode: location?.postal_code as string | null,
        country: location?.country as string | null,
        lat: location?.lat as number | null,
        lon: location?.lon as number | null,
        storeNumber: location?.store_number as string | null
      },
      name: data.name as string,
      merchantName: data.merchant_name as string | null,
      paymentChannel: data.payment_channel as 'online' | 'in store' | 'other',
      paymentMeta: {
        byOrderOf: paymentMeta?.by_order_of as string | null,
        payee: paymentMeta?.payee as string | null,
        payer: paymentMeta?.payer as string | null,
        paymentMethod: paymentMeta?.payment_method as string | null,
        paymentProcessor: paymentMeta?.payment_processor as string | null,
        ppdId: paymentMeta?.ppd_id as string | null,
        reason: paymentMeta?.reason as string | null,
        referenceNumber: paymentMeta?.reference_number as string | null
      },
      pending: data.pending as boolean,
      pendingTransactionId: data.pending_transaction_id as string | null,
      accountOwner: data.account_owner as string | null,
      transactionCode: data.transaction_code as string | null,
      transactionType: data.transaction_type as 'digital' | 'place' | 'special' | 'unresolved',
      personalFinanceCategory: personalFinanceCategory ? {
        primary: personalFinanceCategory.primary as string,
        detailed: personalFinanceCategory.detailed as string
      } : undefined
    };
  }

  private transformRecurringTransaction(data: Record<string, unknown>): PlaidRecurringTransaction {
    const avgAmount = data.average_amount as Record<string, unknown>;
    const lastAmount = data.last_amount as Record<string, unknown>;

    return {
      streamId: data.stream_id as string,
      accountId: data.account_id as string,
      description: data.description as string,
      merchantName: data.merchant_name as string | null,
      category: data.category as string[],
      averageAmount: {
        amount: avgAmount.amount as number,
        isoCurrencyCode: avgAmount.iso_currency_code as string
      },
      lastAmount: {
        amount: lastAmount.amount as number,
        isoCurrencyCode: lastAmount.iso_currency_code as string
      },
      frequency: data.frequency as PlaidRecurringTransaction['frequency'],
      transactionIds: data.transaction_ids as string[],
      firstDate: data.first_date as string,
      lastDate: data.last_date as string,
      isActive: data.is_active as boolean,
      status: data.status as PlaidRecurringTransaction['status']
    };
  }

  private transformAccount(data: Record<string, unknown>): PlaidAccount {
    const balances = data.balances as Record<string, unknown>;
    return {
      accountId: data.account_id as string,
      name: data.name as string,
      officialName: data.official_name as string | null,
      type: data.type as PlaidAccount['type'],
      subtype: data.subtype as string | null,
      mask: data.mask as string | null,
      balances: {
        available: balances?.available as number | null,
        current: balances?.current as number | null,
        limit: balances?.limit as number | null,
        isoCurrencyCode: balances?.iso_currency_code as string | null,
        unofficialCurrencyCode: balances?.unofficial_currency_code as string | null
      }
    };
  }

  // ==========================================================================
  // IDENTITY OPERATIONS
  // ==========================================================================

  async getIdentity(accessToken: string): Promise<PlaidIdentity[]> {
    const response = await this.request<{
      accounts: Array<{
        account_id: string;
        owners: Array<{
          names: string[];
          phone_numbers: Array<{ data: string; primary: boolean; type: string }>;
          emails: Array<{ data: string; primary: boolean; type: string }>;
          addresses: Array<{
            data: {
              city: string | null;
              country: string | null;
              postal_code: string | null;
              region: string | null;
              street: string | null;
            };
            primary: boolean;
          }>;
        }>;
      }>;
    }>('/identity/get', { access_token: accessToken });

    return response.accounts.map(acc => ({
      accountId: acc.account_id,
      owners: acc.owners.map(owner => ({
        names: owner.names,
        phoneNumbers: owner.phone_numbers.map(p => ({
          data: p.data,
          primary: p.primary,
          type: p.type
        })),
        emails: owner.emails.map(e => ({
          data: e.data,
          primary: e.primary,
          type: e.type
        })),
        addresses: owner.addresses.map(a => ({
          data: {
            city: a.data.city,
            country: a.data.country,
            postalCode: a.data.postal_code,
            region: a.data.region,
            street: a.data.street
          },
          primary: a.primary
        }))
      }))
    }));
  }

  // ==========================================================================
  // LIABILITIES OPERATIONS
  // ==========================================================================

  async getLiabilities(accessToken: string, accountIds?: string[]): Promise<{
    accounts: PlaidAccount[];
    liabilities: PlaidLiability[];
  }> {
    const response = await this.request<{
      accounts: Array<Record<string, unknown>>;
      liabilities: {
        credit?: Array<Record<string, unknown>>;
        mortgage?: Array<Record<string, unknown>>;
        student?: Array<Record<string, unknown>>;
      };
    }>('/liabilities/get', {
      access_token: accessToken,
      options: accountIds ? { account_ids: accountIds } : undefined
    });

    const liabilities: PlaidLiability[] = [];

    // Process credit liabilities
    response.liabilities.credit?.forEach(credit => {
      liabilities.push({
        accountId: credit.account_id as string,
        type: 'credit',
        credit: {
          isOverdue: credit.is_overdue as boolean,
          lastPaymentAmount: credit.last_payment_amount as number,
          lastPaymentDate: credit.last_payment_date as string,
          lastStatementBalance: credit.last_statement_balance as number,
          lastStatementIssueDate: credit.last_statement_issue_date as string,
          minimumPaymentAmount: credit.minimum_payment_amount as number,
          nextPaymentDueDate: credit.next_payment_due_date as string,
          aprs: (credit.aprs as Array<Record<string, unknown>>).map(apr => ({
            aprPercentage: apr.apr_percentage as number,
            aprType: apr.apr_type as string,
            balanceSubjectToApr: apr.balance_subject_to_apr as number,
            interestChargeAmount: apr.interest_charge_amount as number
          }))
        }
      });
    });

    // Process mortgage liabilities
    response.liabilities.mortgage?.forEach(mortgage => {
      liabilities.push({
        accountId: mortgage.account_id as string,
        type: 'mortgage',
        mortgage: {
          accountNumber: mortgage.account_number as string,
          currentLateFee: mortgage.current_late_fee as number,
          escrowBalance: mortgage.escrow_balance as number,
          hasPmi: mortgage.has_pmi as boolean,
          hasPrepaymentPenalty: mortgage.has_prepayment_penalty as boolean,
          interestRatePercentage: mortgage.interest_rate_percentage as number,
          interestRateType: mortgage.interest_rate_type as string,
          lastPaymentAmount: mortgage.last_payment_amount as number,
          lastPaymentDate: mortgage.last_payment_date as string,
          loanTerm: mortgage.loan_term as string,
          loanTypeDescription: mortgage.loan_type_description as string,
          maturityDate: mortgage.maturity_date as string,
          nextMonthlyPayment: mortgage.next_monthly_payment as number,
          nextPaymentDueDate: mortgage.next_payment_due_date as string,
          originationDate: mortgage.origination_date as string,
          originationPrincipalAmount: mortgage.origination_principal_amount as number,
          pastDueAmount: mortgage.past_due_amount as number,
          ytdInterestPaid: mortgage.ytd_interest_paid as number,
          ytdPrincipalPaid: mortgage.ytd_principal_paid as number
        }
      });
    });

    return {
      accounts: response.accounts.map(acc => this.transformAccount(acc)),
      liabilities
    };
  }

  // ==========================================================================
  // INVESTMENTS OPERATIONS
  // ==========================================================================

  async getInvestmentHoldings(accessToken: string, accountIds?: string[]): Promise<{
    accounts: PlaidAccount[];
    holdings: PlaidInvestmentHolding[];
    securities: PlaidSecurity[];
  }> {
    const response = await this.request<{
      accounts: Array<Record<string, unknown>>;
      holdings: Array<{
        account_id: string;
        security_id: string;
        institution_price: number;
        institution_price_as_of: string | null;
        institution_price_datetime: string | null;
        institution_value: number;
        cost_basis: number | null;
        quantity: number;
        iso_currency_code: string | null;
        unofficial_currency_code: string | null;
      }>;
      securities: Array<{
        security_id: string;
        isin: string | null;
        cusip: string | null;
        sedol: string | null;
        institution_security_id: string | null;
        institution_id: string | null;
        proxy_security_id: string | null;
        name: string | null;
        ticker_symbol: string | null;
        is_cash_equivalent: boolean;
        type: string;
        close_price: number | null;
        close_price_as_of: string | null;
        iso_currency_code: string | null;
        unofficial_currency_code: string | null;
      }>;
    }>('/investments/holdings/get', {
      access_token: accessToken,
      options: accountIds ? { account_ids: accountIds } : undefined
    });

    return {
      accounts: response.accounts.map(acc => this.transformAccount(acc)),
      holdings: response.holdings.map(h => ({
        accountId: h.account_id,
        securityId: h.security_id,
        institutionPrice: h.institution_price,
        institutionPriceAsOf: h.institution_price_as_of,
        institutionPriceDatetime: h.institution_price_datetime,
        institutionValue: h.institution_value,
        costBasis: h.cost_basis,
        quantity: h.quantity,
        isoCurrencyCode: h.iso_currency_code,
        unofficialCurrencyCode: h.unofficial_currency_code
      })),
      securities: response.securities.map(s => ({
        securityId: s.security_id,
        isin: s.isin,
        cusip: s.cusip,
        sedol: s.sedol,
        institutionSecurityId: s.institution_security_id,
        institutionId: s.institution_id,
        proxySecurityId: s.proxy_security_id,
        name: s.name,
        tickerSymbol: s.ticker_symbol,
        isCashEquivalent: s.is_cash_equivalent,
        type: s.type,
        closePrice: s.close_price,
        closePriceAsOf: s.close_price_as_of,
        isoCurrencyCode: s.iso_currency_code,
        unofficialCurrencyCode: s.unofficial_currency_code
      }))
    };
  }

  // ==========================================================================
  // AUTH OPERATIONS
  // ==========================================================================

  async getAuth(accessToken: string, accountIds?: string[]): Promise<{
    accounts: PlaidAccount[];
    numbers: {
      ach: Array<{
        accountId: string;
        account: string;
        routing: string;
        wireRouting: string | null;
      }>;
      eft: Array<{
        accountId: string;
        account: string;
        institution: string;
        branch: string;
      }>;
      international: Array<{
        accountId: string;
        iban: string;
        bic: string;
      }>;
      bacs: Array<{
        accountId: string;
        account: string;
        sortCode: string;
      }>;
    };
  }> {
    const response = await this.request<{
      accounts: Array<Record<string, unknown>>;
      numbers: {
        ach: Array<{
          account_id: string;
          account: string;
          routing: string;
          wire_routing: string | null;
        }>;
        eft: Array<{
          account_id: string;
          account: string;
          institution: string;
          branch: string;
        }>;
        international: Array<{
          account_id: string;
          iban: string;
          bic: string;
        }>;
        bacs: Array<{
          account_id: string;
          account: string;
          sort_code: string;
        }>;
      };
    }>('/auth/get', {
      access_token: accessToken,
      options: accountIds ? { account_ids: accountIds } : undefined
    });

    return {
      accounts: response.accounts.map(acc => this.transformAccount(acc)),
      numbers: {
        ach: response.numbers.ach.map(n => ({
          accountId: n.account_id,
          account: n.account,
          routing: n.routing,
          wireRouting: n.wire_routing
        })),
        eft: response.numbers.eft.map(n => ({
          accountId: n.account_id,
          account: n.account,
          institution: n.institution,
          branch: n.branch
        })),
        international: response.numbers.international.map(n => ({
          accountId: n.account_id,
          iban: n.iban,
          bic: n.bic
        })),
        bacs: response.numbers.bacs.map(n => ({
          accountId: n.account_id,
          account: n.account,
          sortCode: n.sort_code
        }))
      }
    };
  }

  // ==========================================================================
  // WEBHOOK HANDLING
  // ==========================================================================

  verifyWebhook(body: string, headers: Record<string, string>): boolean {
    // Plaid uses JWT-based webhook verification
    const signedJwt = headers['plaid-verification'];
    if (!signedJwt) return false;

    // In production, verify the JWT signature using Plaid's public keys
    // This is a simplified version
    try {
      const parts = signedJwt.split('.');
      if (parts.length !== 3) return false;

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      const bodyHash = require('crypto')
        .createHash('sha256')
        .update(body)
        .digest('hex');

      return payload.request_body_sha256 === bodyHash;
    } catch {
      return false;
    }
  }

  parseWebhook(body: string): WebhookEvent {
    const data = JSON.parse(body);
    const event: WebhookEvent = {
      webhookType: data.webhook_type,
      webhookCode: data.webhook_code,
      itemId: data.item_id,
      error: data.error ? {
        errorCode: data.error.error_code,
        errorMessage: data.error.error_message
      } : undefined,
      newTransactions: data.new_transactions,
      removedTransactions: data.removed_transactions,
      ...data
    };

    this.emit('webhook', event);

    // Emit specific events
    switch (event.webhookCode) {
      case 'SYNC_UPDATES_AVAILABLE':
        this.emit('transactions_available', event);
        break;
      case 'INITIAL_UPDATE':
      case 'HISTORICAL_UPDATE':
        this.emit('transactions_ready', event);
        break;
      case 'PENDING_EXPIRATION':
      case 'USER_PERMISSION_REVOKED':
        this.emit('item_error', event);
        break;
    }

    return event;
  }

  // ==========================================================================
  // SANDBOX HELPERS (for testing)
  // ==========================================================================

  async sandboxCreatePublicToken(
    institutionId: string,
    products: PlaidProduct[],
    options?: { webhook?: string; overrideUsername?: string }
  ): Promise<string> {
    if (this.environment !== 'sandbox') {
      throw new Error('Sandbox methods only available in sandbox environment');
    }

    const response = await this.request<{ public_token: string }>(
      '/sandbox/public_token/create',
      {
        institution_id: institutionId,
        initial_products: products,
        options: {
          webhook: options?.webhook,
          override_username: options?.overrideUsername
        }
      }
    );

    return response.public_token;
  }

  async sandboxFireWebhook(
    accessToken: string,
    webhookCode: string
  ): Promise<void> {
    if (this.environment !== 'sandbox') {
      throw new Error('Sandbox methods only available in sandbox environment');
    }

    await this.request('/sandbox/item/fire_webhook', {
      access_token: accessToken,
      webhook_code: webhookCode
    });
  }

  async sandboxResetLogin(accessToken: string): Promise<void> {
    if (this.environment !== 'sandbox') {
      throw new Error('Sandbox methods only available in sandbox environment');
    }

    await this.request('/sandbox/item/reset_login', {
      access_token: accessToken
    });
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createPlaidConnector(config: {
  clientId: string;
  secret: string;
  environment: PlaidEnvironment;
}): PlaidConnector {
  return new PlaidConnector(config);
}

export default PlaidConnector;

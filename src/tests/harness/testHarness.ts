import http from 'http';
import app from '../../server';
import { db, resetLedger, initDatabase } from '../../database';
import { config } from '../../config';

export interface HttpResponse<T = any> {
  status: number;
  body: T;
  headers: http.IncomingHttpHeaders;
}

export class TestHarness {
  private server: http.Server | null = null;
  public baseUrl: string = '';
  public port: number = 0;

  /**
   * Start ephemeral or configured application server
   */
  async start(preferredPort: number = 0): Promise<string> {
    if (this.server) {
      return this.baseUrl;
    }

    await new Promise<void>((resolve, reject) => {
      this.server = app.listen(preferredPort, '127.0.0.1', () => {
        const addr = this.server!.address() as any;
        this.port = addr.port;
        this.baseUrl = `http://127.0.0.1:${this.port}`;
        resolve();
      });
      this.server.on('error', reject);
    });

    return this.baseUrl;
  }

  /**
   * Stop application server gracefully
   */
  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => {
      this.server!.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Reset database to clean isolated state with default seeded Chart of Accounts,
   * customers, items, and organization settings.
   */
  resetDb(): void {
    resetLedger();
    initDatabase();
  }

  /**
   * Universal HTTP client for API contract & integration tests
   */
  request<T = any>(
    method: string,
    path: string,
    body?: any,
    headers: Record<string, string> = {}
  ): Promise<HttpResponse<T>> {
    return new Promise((resolve, reject) => {
      if (!this.baseUrl) {
        return reject(new Error('TestHarness is not running. Call harness.start() first.'));
      }

      const url = new URL(path, this.baseUrl);
      const reqHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...headers
      };

      const payload = body !== undefined ? JSON.stringify(body) : undefined;
      if (payload) {
        reqHeaders['Content-Length'] = String(Buffer.byteLength(payload));
      }

      const req = http.request(url, { method, headers: reqHeaders }, (res) => {
        let rawData = '';
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          let parsed: any = rawData;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            // Keep raw string if non-JSON
          }
          resolve({
            status: res.statusCode || 500,
            body: parsed,
            headers: res.headers
          });
        });
      });

      req.on('error', (err) => {
        reject(new Error(`[TestHarness Request Error] ${method} ${path} failed: ${err.message}`));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  // ==========================================
  // HELPER METHODS REQUIRED BY TEST SPEC
  // ==========================================

  /**
   * Ensure standard Chart of Accounts are seeded and return list
   */
  getChartOfAccounts(): any[] {
    return db.prepare('SELECT * FROM accounts ORDER BY code ASC').all();
  }

  /**
   * Create or fetch a customer
   */
  async createCustomer(data: {
    name: string;
    gstin?: string;
    stateCode: string;
    email?: string;
    phone?: string;
  }): Promise<HttpResponse> {
    return this.request('POST', '/api/customers', data);
  }

  /**
   * Create or fetch a catalog item
   */
  async createItem(data: {
    name: string;
    hsnCode: string;
    unitPrice: number;
    defaultTaxRate: number;
  }): Promise<HttpResponse> {
    return this.request('POST', '/api/items', data);
  }

  /**
   * Create and optionally deliver a GST invoice
   */
  async createInvoice(data: {
    customerId: string;
    invoiceNumber: string;
    invoiceDate?: string;
    dueDate?: string;
    deliver?: boolean;
    lines: Array<{
      itemId: string;
      description?: string;
      hsnCode: string;
      quantity: number;
      unitPrice: number;
      taxRate: number;
    }>;
  }, headers: Record<string, string> = {}): Promise<HttpResponse> {
    return this.request('POST', '/api/invoices', {
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      deliver: true,
      ...data
    }, headers);
  }

  /**
   * Record a customer remittance / payment
   */
  async recordPayment(data: {
    customerId: string;
    amount: number;
    depositAccountId?: string;
    paymentDate?: string;
    referenceNumber?: string;
    allocations: Array<{
      invoiceId: string;
      amount: number;
    }>;
  }, headers: Record<string, string> = {}): Promise<HttpResponse> {
    return this.request('POST', '/api/payments', {
      paymentDate: new Date().toISOString().split('T')[0],
      depositAccountId: 'acc_bank_1010',
      ...data
    }, headers);
  }

  /**
   * Void an invoice by posting immutable contra-entries
   */
  async voidInvoice(invoiceId: string, reason: string = 'Test Cancellation'): Promise<HttpResponse> {
    return this.request('POST', `/api/invoices/${invoiceId}/void`, { reason });
  }

  /**
   * Query Trial Balance report
   */
  async getTrialBalance(toDate?: string): Promise<HttpResponse> {
    const query = toDate ? `?toDate=${encodeURIComponent(toDate)}` : '';
    return this.request('GET', `/api/reports/trial-balance${query}`);
  }

  /**
   * Query General Ledger double-entry lines
   */
  async getTransactions(query?: { referenceId?: string; accountId?: string }): Promise<HttpResponse> {
    const params = new URLSearchParams(query as any).toString();
    const qs = params ? `?${params}` : '';
    return this.request('GET', `/api/transactions${qs}`);
  }

  /**
   * Query GSTR-1 statutory summary
   */
  async getGSTR1(fromDate?: string, toDate?: string): Promise<HttpResponse> {
    const params: Record<string, string> = {};
    if (fromDate) params.fromDate = fromDate;
    if (toDate) params.toDate = toDate;
    const qs = new URLSearchParams(params).toString();
    return this.request('GET', `/api/reports/gstr-1${qs ? `?${qs}` : ''}`);
  }
}

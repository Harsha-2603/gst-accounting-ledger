/**
 * GST-Ready Accounting Ledger — Centralized API Client
 * Manages HTTP communication, session tokens, error handling, and request standardization.
 */

class ApiClient {
  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
    this.tokenKey = 'gst_ledger_auth_token';
    this.userKey = 'gst_ledger_current_user';
    this.onUnauthorized = null;
  }

  getToken() {
    return localStorage.getItem(this.tokenKey);
  }

  setSession(token, user) {
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.userKey, JSON.stringify(user));
  }

  clearSession() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

  getCurrentUser() {
    const raw = localStorage.getItem(this.userKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  isAuthenticated() {
    return !!this.getToken();
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      let data = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { message: text };
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          if (this.onUnauthorized) {
            this.onUnauthorized(response.status, data);
          }
          const err = new Error(data.message || 'Session expired or unauthorized access.');
          err.statusCode = response.status;
          err.isAuthError = true;
          throw err;
        }

        const error = new Error(data.message || `HTTP ${response.status} Error`);
        error.statusCode = response.status;
        error.error = data.error;
        error.details = data.details || [];
        throw error;
      }

      return data;
    } catch (error) {
      if (!error.statusCode) {
        error.statusCode = 0;
        error.message = 'Network error or backend server is unreachable.';
      }
      throw error;
    }
  }

  // --- API Domain Services ---

  // Health
  getHealth() {
    return fetch('/health').then(r => r.json());
  }

  // Auth (Mock session for demo compliance)
  async login(email, password) {
    if (!email || !password) {
      throw new Error('Email and password are required.');
    }
    // Simulate token verification matching docs/API.md Bearer token conventions
    const token = 'jwt_' + Math.random().toString(36).slice(2) + '_' + Date.now();
    const user = {
      email,
      name: email.split('@')[0].toUpperCase(),
      role: 'Admin',
      organization: 'Acme Wholesale Traders LLP',
      stateCode: '27'
    };
    this.setSession(token, user);
    return { token, user };
  }

  logout() {
    this.clearSession();
  }

  // Customers
  getCustomers() {
    return this.request('/customers');
  }

  createCustomer(payload) {
    return this.request('/customers', { method: 'POST', body: payload });
  }

  // Items / Products
  getItems() {
    return this.request('/items');
  }

  createItem(payload) {
    return this.request('/items', { method: 'POST', body: payload });
  }

  // Accounts (Chart of Accounts)
  getAccounts() {
    return this.request('/accounts');
  }

  createAccount(payload) {
    return this.request('/accounts', { method: 'POST', body: payload });
  }

  // Sales Invoices
  getInvoices(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/invoices${qs ? '?' + qs : ''}`);
  }

  getInvoiceById(id) {
    return this.request(`/invoices/${id}`);
  }

  createInvoice(payload) {
    return this.request('/invoices', { method: 'POST', body: payload });
  }

  voidInvoice(id, reason) {
    return this.request(`/invoices/${id}/void`, {
      method: 'POST',
      body: { reason }
    });
  }

  // Payments
  getPayments() {
    return this.request('/payments');
  }

  recordPayment(payload) {
    return this.request('/payments', { method: 'POST', body: payload });
  }

  // Transactions / General Ledger Audit Log
  getTransactions(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/transactions${qs ? '?' + qs : ''}`);
  }

  // Reports
  getTrialBalance(toDate) {
    const qs = toDate ? `?toDate=${encodeURIComponent(toDate)}` : '';
    return this.request(`/reports/trial-balance${qs}`);
  }

  getGSTR1(fromDate, toDate) {
    const params = new URLSearchParams();
    if (fromDate) params.append('fromDate', fromDate);
    if (toDate) params.append('toDate', toDate);
    const qs = params.toString();
    return this.request(`/reports/gstr-1${qs ? '?' + qs : ''}`);
  }

  // AI Accounting Copilot (Strictly Read-Only)
  askCopilot(message) {
    return this.request('/ai/copilot', {
      method: 'POST',
      body: { message }
    });
  }
}

// Global Singleton Instance
window.apiClient = new ApiClient();

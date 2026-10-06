/**
 * GST-Ready Accounting Ledger — Master Frontend Application Controller (SPA)
 * Manages routing, authentication, data synchronization, modals, and AI Copilot.
 */

document.addEventListener('DOMContentLoaded', () => {
  const api = window.apiClient;
  const ui = window.UI;

  // Application State
  const state = {
    activeRoute: 'dashboard',
    user: api.getCurrentUser() || { email: 'admin@acmewholesale.in', name: 'ADMIN', role: 'Admin' },
    customers: [],
    items: [],
    accounts: [],
    invoices: [],
    payments: [],
    transactions: [],
    trialBalance: null,
    gstr1: null,
    aiMessages: [
      {
        sender: 'assistant',
        text: 'Hello! I am your AI Accounting Copilot. I provide read-only financial explanations grounded strictly in your live double-entry ledger. How can I help you today?',
        sources: []
      }
    ]
  };

  // DOM Elements
  const loginScreen = document.getElementById('loginScreen');
  const userBadgeName = document.getElementById('userBadgeName');
  const btnLogout = document.getElementById('btnLogout');
  const pageTitle = document.getElementById('pageTitle');
  const equilibriumBadge = document.getElementById('topbarEquilibrium');
  const navItems = document.querySelectorAll('.nav-item');
  const viewSections = document.querySelectorAll('.view-section');
  const appSidebar = document.getElementById('appSidebar');
  const btnToggleMobileSidebar = document.getElementById('btnToggleMobileSidebar');

  // AI Drawer Elements
  const aiDrawer = document.getElementById('aiDrawer');
  const aiDrawerOverlay = document.getElementById('aiDrawerOverlay');
  const btnOpenAI = document.getElementById('btnOpenAI');
  const btnCloseAI = document.getElementById('btnCloseAI');
  const aiChatThread = document.getElementById('aiChatThread');
  const aiInput = document.getElementById('aiInput');
  const btnSendAI = document.getElementById('btnSendAI');
  const suggestionChips = document.querySelectorAll('.suggestion-chip');

  // Modals
  const modalInvoice = document.getElementById('modalInvoice');
  const modalPayment = document.getElementById('modalPayment');
  const modalVoid = document.getElementById('modalVoid');
  const modalCustomer = document.getElementById('modalCustomer');
  const modalItem = document.getElementById('modalItem');

  const btnNewInvoice = document.getElementById('btnNewInvoice');
  const btnNewPayment = document.getElementById('btnNewPayment');
  const btnOpenNewCustomerModal = document.getElementById('btnOpenNewCustomerModal');
  const btnOpenNewItemModal = document.getElementById('btnOpenNewItemModal');

  // --- Authentication & Session Handling ---
  function checkAuth() {
    if (!api.isAuthenticated()) {
      loginScreen.classList.add('active');
    } else {
      loginScreen.classList.remove('active');
      const curUser = api.getCurrentUser();
      if (curUser) {
        state.user = curUser;
        userBadgeName.textContent = curUser.name || 'USER';
      }
    }
  }

  window.appHandleLogin = async function() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
      const { user } = await api.login(email, password);
      state.user = user;
      userBadgeName.textContent = user.name || 'ADMIN';
      loginScreen.classList.remove('active');
      ui.showToast(`Welcome back, ${user.name}!`, 'success');
      loadAllData();
      navigate(window.location.hash.slice(1) || 'dashboard');
    } catch (err) {
      ui.showToast(err.message, 'error');
    }
  };

  btnLogout.addEventListener('click', () => {
    ui.showConfirmModal({
      title: 'Sign Out',
      message: 'Are you sure you want to end your current accounting session?',
      confirmText: 'Sign Out',
      isDanger: false,
      onConfirm: () => {
        api.logout();
        loginScreen.classList.add('active');
        ui.showToast('You have been signed out.', 'info');
      }
    });
  });

  api.onUnauthorized = () => {
    loginScreen.classList.add('active');
    ui.showToast('Session expired. Please sign in again.', 'warning');
  };

  // --- Routing Solution ---
  function navigate(route) {
    const validRoutes = ['dashboard', 'customers', 'items', 'invoices', 'payments', 'trial-balance', 'gstr1', 'journal'];
    const targetRoute = validRoutes.includes(route) ? route : 'dashboard';
    state.activeRoute = targetRoute;

    navItems.forEach(item => {
      if (item.dataset.tab === targetRoute) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    viewSections.forEach(section => {
      if (section.id === `view-${targetRoute}`) {
        section.classList.add('active');
      } else {
        section.classList.remove('active');
      }
    });

    const routeTitles = {
      dashboard: 'Dashboard Overview',
      customers: 'Customers Master Directory',
      items: 'Products & Services Catalog',
      invoices: 'Sales Invoices & GST Bifurcation',
      payments: 'Customer Payments & AR Relief',
      'trial-balance': 'Trial Balance Sheet (Accrual Basis)',
      gstr1: 'GSTR-1 Statutory Return',
      journal: 'Double-Entry General Ledger Audit Log'
    };
    pageTitle.textContent = routeTitles[targetRoute] || 'Accounting Ledger';

    // Refresh view data
    switch (targetRoute) {
      case 'dashboard': loadDashboard(); break;
      case 'customers': loadCustomers(); break;
      case 'items': loadItems(); break;
      case 'invoices': loadInvoices(); break;
      case 'payments': loadPayments(); break;
      case 'trial-balance': loadTrialBalance(); break;
      case 'gstr1': loadGSTR1(); break;
      case 'journal': loadTransactions(); break;
    }

    if (window.innerWidth <= 900) {
      appSidebar.classList.remove('mobile-open');
    }
  }

  window.addEventListener('hashchange', () => {
    navigate(window.location.hash.slice(1));
  });

  if (btnToggleMobileSidebar) {
    btnToggleMobileSidebar.addEventListener('click', () => {
      appSidebar.classList.toggle('mobile-open');
    });
  }

  // --- Data Loaders & View Renderers ---

  async function loadAllData() {
    try {
      await Promise.all([
        loadCustomers(),
        loadItems(),
        loadAccounts(),
        loadTrialBalance()
      ]);
      loadDashboard();
    } catch (err) {
      console.error('Error loading master data:', err);
    }
  }

  // 1. Dashboard
  async function loadDashboard() {
    try {
      const [invoices, payments, tb] = await Promise.all([
        api.getInvoices(),
        api.getPayments(),
        api.getTrialBalance()
      ]);
      state.invoices = invoices;
      state.payments = payments;
      state.trialBalance = tb;

      let totalRevenue = 0;
      let totalReceivables = 0;
      let totalTaxCollected = 0;

      invoices.forEach(inv => {
        if (inv.status === 'DELIVERED') {
          totalRevenue += (inv.subtotal || 0);
          totalReceivables += (inv.dueAmount || 0);
          totalTaxCollected += ((inv.cgstAmount || 0) + (inv.sgstAmount || 0) + (inv.igstAmount || 0));
        }
      });

      let totalCashBank = 0;
      if (tb && tb.accounts) {
        tb.accounts.forEach(acc => {
          if (acc.accountCode === '1000' || acc.accountCode === '1010') {
            totalCashBank += (acc.balance || 0);
          }
        });
      }

      document.getElementById('kpiRevenue').textContent = ui.formatINR(totalRevenue);
      document.getElementById('kpiAR').textContent = ui.formatINR(totalReceivables);
      document.getElementById('kpiCashBank').textContent = ui.formatINR(totalCashBank);
      document.getElementById('kpiTaxes').textContent = ui.formatINR(totalTaxCollected);

      // Render recent activity table
      const tbody = document.getElementById('recentActivityBody');
      tbody.innerHTML = '';
      const recent = invoices.slice(0, 6);

      if (recent.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6">${ui.renderEmptyState({ icon: '📄', title: 'No invoices yet', description: 'Create your first sales invoice to see activity.', actionHtml: '<button class="btn btn-primary btn-sm" onclick="document.getElementById(\'modalInvoice\').classList.add(\'active\')">+ Create Invoice</button>' })}</td></tr>`;
      } else {
        recent.forEach(inv => {
          tbody.innerHTML += `
            <tr>
              <td><strong>${inv.invoiceNumber}</strong></td>
              <td>${inv.customerName}</td>
              <td>${ui.formatDate(inv.invoiceDate)}</td>
              <td class="num">${ui.formatINR(inv.totalAmount)}</td>
              <td>${ui.renderBadge(inv.status)}</td>
              <td>
                ${inv.status === 'DELIVERED' ? `
                  <button class="btn btn-secondary btn-sm" onclick="window.appVoidInvoice('${inv.id}', '${inv.invoiceNumber}')">Void</button>
                ` : '-'}
              </td>
            </tr>
          `;
        });
      }
    } catch (err) {
      console.error('Dashboard load failed:', err);
    }
  }

  // 2. Customers
  async function loadCustomers() {
    try {
      const customers = await api.getCustomers();
      state.customers = customers;
      const tbody = document.getElementById('customersTableBody');
      tbody.innerHTML = '';

      if (customers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6">${ui.renderEmptyState({ icon: '👥', title: 'No customers recorded', description: 'Add your wholesale B2B customer accounts.', actionHtml: '<button class="btn btn-primary btn-sm" id="btnEmptyAddCust">+ Add Customer</button>' })}</td></tr>`;
        document.getElementById('btnEmptyAddCust')?.addEventListener('click', () => modalCustomer.classList.add('active'));
        return;
      }

      customers.forEach(c => {
        const isIntra = c.stateCode === '27';
        tbody.innerHTML += `
          <tr>
            <td><strong>${c.name}</strong></td>
            <td><code>${c.gstin || 'Unregistered (URP)'}</code></td>
            <td><span class="badge badge-state">${c.stateCode}</span></td>
            <td><span class="badge ${isIntra ? 'badge-delivered' : 'badge-reversal'}">${isIntra ? 'Intra-State (CGST+SGST)' : 'Inter-State (IGST)'}</span></td>
            <td>${c.email || '-'}</td>
            <td>${c.phone || '-'}</td>
          </tr>
        `;
      });

      populateCustomerDropdowns();
    } catch (err) {
      document.getElementById('customersTableBody').innerHTML = `<tr><td colspan="6">${ui.renderErrorState(err.message, 'loadCustomers')}</td></tr>`;
    }
  }

  // 3. Items
  async function loadItems() {
    try {
      const items = await api.getItems();
      state.items = items;
      const tbody = document.getElementById('itemsTableBody');
      tbody.innerHTML = '';

      if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4">${ui.renderEmptyState({ icon: '📦', title: 'No items in catalog', description: 'Add products and services with HSN codes.', actionHtml: '<button class="btn btn-primary btn-sm" id="btnEmptyAddItem">+ Add Item</button>' })}</td></tr>`;
        document.getElementById('btnEmptyAddItem')?.addEventListener('click', () => modalItem.classList.add('active'));
        return;
      }

      items.forEach(it => {
        tbody.innerHTML += `
          <tr>
            <td><strong>${it.name}</strong></td>
            <td><code>${it.hsnCode}</code></td>
            <td class="num">${ui.formatINR(it.unitPrice)}</td>
            <td class="num"><span class="badge badge-state">${it.defaultTaxRate}% GST</span></td>
          </tr>
        `;
      });
    } catch (err) {
      document.getElementById('itemsTableBody').innerHTML = `<tr><td colspan="4">${ui.renderErrorState(err.message, 'loadItems')}</td></tr>`;
    }
  }

  // 4. Accounts
  async function loadAccounts() {
    try {
      const accounts = await api.getAccounts();
      state.accounts = accounts;
      populateDepositAccountsDropdown();
    } catch (err) {
      console.error('Accounts load failed:', err);
    }
  }

  // 5. Invoices
  async function loadInvoices() {
    const tbody = document.getElementById('invoicesTableBody');
    tbody.innerHTML = ui.renderSkeleton(5, 9);

    try {
      const invoices = await api.getInvoices();
      state.invoices = invoices;
      tbody.innerHTML = '';

      if (invoices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9">${ui.renderEmptyState({ icon: '📄', title: 'No invoices generated', description: 'Create and deliver a B2B sales invoice to post double-entry vouchers.', actionHtml: '<button class="btn btn-primary btn-sm" onclick="document.getElementById(\'modalInvoice\').classList.add(\'active\')">+ Create Invoice</button>' })}</td></tr>`;
        return;
      }

      invoices.forEach(inv => {
        const isIntra = inv.placeOfSupply === '27';
        const gstSummary = isIntra
          ? `CGST: ${ui.formatINR(inv.cgstAmount)} | SGST: ${ui.formatINR(inv.sgstAmount)}`
          : `IGST: ${ui.formatINR(inv.igstAmount)}`;

        tbody.innerHTML += `
          <tr>
            <td><strong>${inv.invoiceNumber}</strong></td>
            <td>${inv.customerName}</td>
            <td>${ui.formatDate(inv.invoiceDate)}</td>
            <td><span class="badge badge-state">${inv.placeOfSupply} (${isIntra ? 'Intra' : 'Inter'})</span></td>
            <td class="num">${ui.formatINR(inv.subtotal)}</td>
            <td class="num"><small style="color:var(--text-muted);">${gstSummary}</small><br><strong>${ui.formatINR(inv.totalAmount)}</strong></td>
            <td class="num" style="color:${inv.dueAmount > 0 ? 'var(--amber-500)' : 'var(--emerald-500)'}">${ui.formatINR(inv.dueAmount)}</td>
            <td>${ui.renderBadge(inv.status)}</td>
            <td>
              ${inv.status === 'DELIVERED' && inv.paidAmount === 0 ? `
                <button class="btn btn-danger btn-sm" onclick="window.appVoidInvoice('${inv.id}', '${inv.invoiceNumber}')">Void</button>
              ` : inv.status === 'DELIVERED' ? `
                <span style="font-size:11px; color:var(--text-subtle);">Payment attached</span>
              ` : `
                <span style="font-size:11px; color:var(--text-subtle);">-</span>
              `}
            </td>
          </tr>
        `;
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9">${ui.renderErrorState(err.message, 'loadInvoices')}</td></tr>`;
    }
  }

  // 6. Payments
  async function loadPayments() {
    const tbody = document.getElementById('paymentsTableBody');
    tbody.innerHTML = ui.renderSkeleton(4, 6);

    try {
      const payments = await api.getPayments();
      state.payments = payments;
      tbody.innerHTML = '';

      if (payments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6">${ui.renderEmptyState({ icon: '💳', title: 'No payment remittances', description: 'Record payments from customers to relieve outstanding receivables.', actionHtml: '<button class="btn btn-primary btn-sm" onclick="document.getElementById(\'modalPayment\').classList.add(\'active\')">+ Record Payment</button>' })}</td></tr>`;
        return;
      }

      payments.forEach(p => {
        tbody.innerHTML += `
          <tr>
            <td><strong>${p.paymentNumber}</strong></td>
            <td>${p.customerName}</td>
            <td>${ui.formatDate(p.paymentDate)}</td>
            <td><span class="badge badge-state">${p.depositAccountName}</span></td>
            <td><code>${p.referenceNumber || 'N/A'}</code></td>
            <td class="num" style="color:var(--emerald-500); font-weight:700;">${ui.formatINR(p.amount)}</td>
          </tr>
        `;
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6">${ui.renderErrorState(err.message, 'loadPayments')}</td></tr>`;
    }
  }

  // 7. Trial Balance
  async function loadTrialBalance() {
    try {
      const tb = await api.getTrialBalance();
      state.trialBalance = tb;
      updateEquilibriumHeader(tb);

      const banner = document.getElementById('tbEquilibriumBanner');
      if (tb.isBalanced) {
        banner.style.background = 'var(--emerald-subtle)';
        banner.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        banner.style.color = 'var(--emerald-500)';
        banner.innerHTML = `
          <div style="font-size: 15px; font-weight: 700;">⚖️ GENERAL LEDGER IN PERFECT EQUILIBRIUM</div>
          <div style="font-size: 12px; margin-top: 4px; color:#a7f3d0;">
            Total Debits: <strong>${ui.formatINR(tb.totalDebit)}</strong> equal Total Credits: <strong>${ui.formatINR(tb.totalCredit)}</strong> (Difference: ${tb.difference.toFixed(4)}). Zero-trust transaction balancing certified.
          </div>
        `;
      } else {
        banner.style.background = 'var(--rose-subtle)';
        banner.style.borderColor = 'rgba(244, 63, 94, 0.4)';
        banner.style.color = 'var(--rose-500)';
        banner.innerHTML = `
          <div style="font-size: 15px; font-weight: 700;">⚠️ DISCREPANCY DETECTED</div>
          <div style="font-size: 12px; margin-top: 4px; color:#fecdd3;">Difference: ₹${tb.difference.toFixed(4)}</div>
        `;
      }

      const tbody = document.getElementById('trialBalanceTableBody');
      tbody.innerHTML = '';
      tb.accounts.forEach(acc => {
        tbody.innerHTML += `
          <tr>
            <td><span class="badge badge-state">${acc.accountCode}</span></td>
            <td><strong>${acc.accountName}</strong></td>
            <td><span style="font-size: 11px; text-transform:uppercase; color:var(--text-subtle);">${acc.type}</span></td>
            <td class="num">${acc.debit > 0 ? ui.formatINR(acc.debit) : '-'}</td>
            <td class="num">${acc.credit > 0 ? ui.formatINR(acc.credit) : '-'}</td>
            <td class="num" style="font-weight:600;">${ui.formatINR(acc.balance)}</td>
          </tr>
        `;
      });

      document.getElementById('tbTotalDebit').textContent = ui.formatINR(tb.totalDebit);
      document.getElementById('tbTotalCredit').textContent = ui.formatINR(tb.totalCredit);
    } catch (err) {
      console.error('Trial Balance error:', err);
    }
  }

  function updateEquilibriumHeader(tb) {
    if (!tb) return;
    if (tb.isBalanced) {
      equilibriumBadge.className = 'equilibrium-badge';
      equilibriumBadge.innerHTML = `<span class="pulse-dot"></span><span>Trial Balance Balanced (${ui.formatINR(tb.totalDebit)})</span>`;
    } else {
      equilibriumBadge.className = 'equilibrium-badge';
      equilibriumBadge.style.background = 'var(--rose-subtle)';
      equilibriumBadge.style.color = 'var(--rose-500)';
      equilibriumBadge.innerHTML = `<span>⚠️ Discrepancy: ₹${tb.difference.toFixed(4)}</span>`;
    }
  }

  window.appRefreshTrialBalance = async function() {
    await loadTrialBalance();
    ui.showToast('Trial Balance recalculated and certified balanced.', 'success');
  };

  // 8. GSTR-1
  async function loadGSTR1() {
    try {
      const gstr1 = await api.getGSTR1();
      state.gstr1 = gstr1;

      // Section 4A B2B
      const b2bBody = document.getElementById('gstr1B2BBody');
      b2bBody.innerHTML = '';
      if (!gstr1.b2bSummary || gstr1.b2bSummary.length === 0) {
        b2bBody.innerHTML = `<tr><td colspan="10">${ui.renderEmptyState({ icon: '📑', title: 'No delivered B2B invoices', description: 'Deliver sales invoices to populate GSTR-1 Section 4A.' })}</td></tr>`;
      } else {
        gstr1.b2bSummary.forEach(row => {
          b2bBody.innerHTML += `
            <tr>
              <td><code>${row.customerGstin}</code></td>
              <td>${row.customerName}</td>
              <td><strong>${row.invoiceNumber}</strong></td>
              <td>${ui.formatDate(row.invoiceDate)}</td>
              <td><span class="badge badge-state">${row.placeOfSupply}</span></td>
              <td class="num">${ui.formatINR(row.taxableValue)}</td>
              <td class="num">${row.rate}%</td>
              <td class="num">${ui.formatINR(row.cgst)}</td>
              <td class="num">${ui.formatINR(row.sgst)}</td>
              <td class="num">${ui.formatINR(row.igst)}</td>
            </tr>
          `;
        });
      }

      // Section 12 HSN
      const hsnBody = document.getElementById('gstr1HSNBody');
      hsnBody.innerHTML = '';
      if (!gstr1.hsnSummary || gstr1.hsnSummary.length === 0) {
        hsnBody.innerHTML = `<tr><td colspan="8">${ui.renderEmptyState({ icon: '📦', title: 'No HSN records', description: 'Outward supplies with statutory HSN codes will appear here.' })}</td></tr>`;
      } else {
        gstr1.hsnSummary.forEach(h => {
          hsnBody.innerHTML += `
            <tr>
              <td><code>${h.hsnCode}</code></td>
              <td>${h.description}</td>
              <td>${h.uqc}</td>
              <td class="num">${h.totalQuantity}</td>
              <td class="num">${ui.formatINR(h.taxableValue)}</td>
              <td class="num">${ui.formatINR(h.cgst)}</td>
              <td class="num">${ui.formatINR(h.sgst)}</td>
              <td class="num">${ui.formatINR(h.igst)}</td>
            </tr>
          `;
        });
      }
    } catch (err) {
      document.getElementById('gstr1B2BBody').innerHTML = `<tr><td colspan="10">${ui.renderErrorState(err.message, 'loadGSTR1')}</td></tr>`;
    }
  }

  // 9. Audit Journal Vouchers
  async function loadTransactions() {
    const tbody = document.getElementById('journalTableBody');
    tbody.innerHTML = ui.renderSkeleton(5, 7);

    try {
      const data = await api.getTransactions();
      state.transactions = data.transactions || [];
      tbody.innerHTML = '';

      if (state.transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7">${ui.renderEmptyState({ icon: '📜', title: 'No journal entries posted', description: 'Transactions appear here as balanced double-entry vouchers upon document delivery.' })}</td></tr>`;
        return;
      }

      state.transactions.forEach(jl => {
        const isReversal = jl.entryType === 'REVERSAL' || (jl.narration && jl.narration.toLowerCase().includes('reversal'));
        tbody.innerHTML += `
          <tr style="${isReversal ? 'background: rgba(168, 85, 247, 0.05);' : ''}">
            <td><strong>${jl.entryNumber}</strong></td>
            <td>${ui.formatDate(jl.date)}</td>
            <td><span class="badge ${isReversal ? 'badge-reversal' : 'badge-state'}">${jl.entryType || 'POSTING'}</span></td>
            <td><code>${jl.accountCode}</code> ${jl.accountName}</td>
            <td style="font-size: 12px; color: var(--text-subtle);">${jl.narration || '-'}</td>
            <td class="num">${jl.debit > 0 ? ui.formatINR(jl.debit) : '-'}</td>
            <td class="num">${jl.credit > 0 ? ui.formatINR(jl.credit) : '-'}</td>
          </tr>
        `;
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7">${ui.renderErrorState(err.message, 'loadTransactions')}</td></tr>`;
    }
  }

  // --- Dropdown Population & Dynamic Invoice Forms ---

  function populateCustomerDropdowns() {
    const custSelect = document.getElementById('invoiceCustomerSelect');
    if (custSelect) {
      custSelect.innerHTML = '<option value="">-- Choose Customer --</option>';
      state.customers.forEach(c => {
        const isIntra = c.stateCode === '27';
        custSelect.innerHTML += `<option value="${c.id}" data-state="${c.stateCode}">${c.name} (${c.stateCode} - ${isIntra ? 'Intra-State' : 'Inter-State'})</option>`;
      });
    }

    const payCustSelect = document.getElementById('payCustomerSelect');
    if (payCustSelect) {
      payCustSelect.innerHTML = '<option value="">-- Choose Customer --</option>';
      state.customers.forEach(c => {
        payCustSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
      });
    }
  }

  function populateDepositAccountsDropdown() {
    const depositSelect = document.getElementById('payDepositSelect');
    if (!depositSelect) return;
    depositSelect.innerHTML = '';
    state.accounts.forEach(a => {
      if (a.code === '1010' || a.code === '1000') {
        depositSelect.innerHTML += `<option value="${a.id}">${a.code} - ${a.name}</option>`;
      }
    });
  }

  function addInvoiceLineItem() {
    const container = document.getElementById('invoiceLinesContainer');
    const lineRow = document.createElement('div');
    lineRow.className = 'form-row invoice-line-item';
    lineRow.style.padding = '12px';
    lineRow.style.background = 'rgba(255,255,255,0.02)';
    lineRow.style.borderRadius = 'var(--radius-sm)';
    lineRow.style.marginBottom = '10px';
    lineRow.style.border = '1px solid var(--border-subtle)';

    let itemOptions = '';
    state.items.forEach(it => {
      itemOptions += `<option value="${it.id}" data-price="${it.unitPrice}" data-tax="${it.defaultTaxRate}" data-hsn="${it.hsnCode}">${it.name} (HSN: ${it.hsnCode})</option>`;
    });

    lineRow.innerHTML = `
      <div style="flex: 2;">
        <label class="form-label">Item / Product</label>
        <select class="form-select line-item-select">
          ${itemOptions}
        </select>
      </div>
      <div style="flex: 1;">
        <label class="form-label">HSN Code</label>
        <input type="text" class="form-input line-hsn" value="${state.items[0]?.hsnCode || '8471'}" readonly>
      </div>
      <div style="flex: 1;">
        <label class="form-label">Quantity</label>
        <input type="number" class="form-input line-qty" value="1" min="1" step="1">
      </div>
      <div style="flex: 1.5;">
        <label class="form-label">Rate (₹)</label>
        <input type="number" class="form-input line-price" value="${state.items[0]?.unitPrice || 50000}" min="0" step="0.01">
      </div>
      <div style="flex: 1;">
        <label class="form-label">GST %</label>
        <select class="form-select line-tax">
          <option value="18">18%</option>
          <option value="12">12%</option>
          <option value="5">5%</option>
          <option value="28">28%</option>
          <option value="0">0%</option>
        </select>
      </div>
      <div style="display:flex; align-items:flex-end;">
        <button type="button" class="btn btn-secondary btn-sm" onclick="this.closest('.invoice-line-item').remove(); window.appRecalculateInvoicePreview();">✕</button>
      </div>
    `;

    container.appendChild(lineRow);

    const select = lineRow.querySelector('.line-item-select');
    const hsnInput = lineRow.querySelector('.line-hsn');
    const priceInput = lineRow.querySelector('.line-price');
    const taxSelect = lineRow.querySelector('.line-tax');
    const qtyInput = lineRow.querySelector('.line-qty');

    select.addEventListener('change', () => {
      const opt = select.selectedOptions[0];
      if (opt) {
        priceInput.value = opt.dataset.price || 0;
        taxSelect.value = opt.dataset.tax || 18;
        hsnInput.value = opt.dataset.hsn || '8471';
        recalculateInvoicePreview();
      }
    });

    [priceInput, taxSelect, qtyInput].forEach(inp => {
      inp.addEventListener('input', recalculateInvoicePreview);
    });

    recalculateInvoicePreview();
  }

  document.getElementById('btnAddLineItem')?.addEventListener('click', addInvoiceLineItem);

  document.getElementById('invoiceCustomerSelect')?.addEventListener('change', () => {
    const custOpt = document.getElementById('invoiceCustomerSelect').selectedOptions[0];
    const customerState = custOpt ? custOpt.dataset.state : '27';
    const isIntra = customerState === '27';

    const posBadge = document.getElementById('placeOfSupplyBadge');
    if (isIntra) {
      posBadge.className = 'badge badge-delivered';
      posBadge.textContent = 'Intra-State (50/50 Dual Split)';
    } else {
      posBadge.className = 'badge badge-reversal';
      posBadge.textContent = 'Inter-State (100% IGST Allocation)';
    }
    recalculateInvoicePreview();
  });

  function recalculateInvoicePreview() {
    const custOpt = document.getElementById('invoiceCustomerSelect')?.selectedOptions[0];
    const customerState = custOpt ? custOpt.dataset.state : '27';
    const isIntra = customerState === '27';

    let subtotal = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    const lines = document.querySelectorAll('.invoice-line-item');
    lines.forEach(line => {
      const qty = parseFloat(line.querySelector('.line-qty').value) || 0;
      const price = parseFloat(line.querySelector('.line-price').value) || 0;
      const rate = parseFloat(line.querySelector('.line-tax').value) || 0;

      const lineTaxable = qty * price;
      subtotal += lineTaxable;

      if (isIntra) {
        cgst += lineTaxable * (rate / 200);
        sgst += lineTaxable * (rate / 200);
      } else {
        igst += lineTaxable * (rate / 100);
      }
    });

    const total = subtotal + cgst + sgst + igst;

    document.getElementById('previewSubtotal').textContent = ui.formatINR(subtotal);
    document.getElementById('previewCGST').textContent = ui.formatINR(cgst);
    document.getElementById('previewSGST').textContent = ui.formatINR(sgst);
    document.getElementById('previewIGST').textContent = ui.formatINR(igst);
    document.getElementById('previewTotal').textContent = ui.formatINR(total);
  }
  window.appRecalculateInvoicePreview = recalculateInvoicePreview;

  // Invoice Submit
  document.getElementById('btnSubmitInvoice')?.addEventListener('click', async () => {
    const customerId = document.getElementById('invoiceCustomerSelect').value;
    if (!customerId) {
      ui.showToast('Please select a customer for the invoice.', 'error');
      return;
    }

    const lines = [];
    document.querySelectorAll('.invoice-line-item').forEach(line => {
      const itemId = line.querySelector('.line-item-select').value;
      const hsnCode = line.querySelector('.line-hsn').value;
      const quantity = parseFloat(line.querySelector('.line-qty').value);
      const unitPrice = parseFloat(line.querySelector('.line-price').value);
      const taxRate = parseFloat(line.querySelector('.line-tax').value);

      lines.push({ itemId, hsnCode, quantity, unitPrice, taxRate });
    });

    if (lines.length === 0) {
      ui.showToast('Invoice must have at least one line item.', 'error');
      return;
    }

    const deliver = document.getElementById('invoiceDeliverCheck').checked;

    try {
      const result = await api.createInvoice({ customerId, deliver, lines });
      ui.showToast(`Invoice ${result.invoiceNumber} posted! GL Voucher ${result.journalEntryId || 'committed'}`, 'success');
      ui.closeModal('modalInvoice');
      await loadInvoices();
      await loadTrialBalance();
      await loadDashboard();
    } catch (err) {
      ui.showToast(`Invoice creation failed: ${err.message}`, 'error');
    }
  });

  // Void Invoice
  let targetVoidInvoiceId = null;
  window.appVoidInvoice = function(id, invoiceNumber) {
    targetVoidInvoiceId = id;
    document.getElementById('voidInvoiceNum').textContent = invoiceNumber;
    document.getElementById('voidReasonInput').value = 'Customer cancellation / incorrect billing';
    ui.openModal('modalVoid');
  };

  document.getElementById('btnConfirmVoid')?.addEventListener('click', async () => {
    if (!targetVoidInvoiceId) return;
    const reason = document.getElementById('voidReasonInput').value;

    try {
      const result = await api.voidInvoice(targetVoidInvoiceId, reason);
      ui.showToast(`Invoice voided! Immutable reversal posted (${result.reversalJournalEntryId})`, 'success');
      ui.closeModal('modalVoid');
      targetVoidInvoiceId = null;
      await loadInvoices();
      await loadTrialBalance();
      await loadDashboard();
    } catch (err) {
      ui.showToast(`Void failed: ${err.message}`, 'error');
    }
  });

  // Record Payment
  document.getElementById('payCustomerSelect')?.addEventListener('change', async () => {
    const custId = document.getElementById('payCustomerSelect').value;
    const container = document.getElementById('payAllocationsContainer');
    container.innerHTML = '';

    if (!custId) return;

    try {
      const invoices = await api.getInvoices({ status: 'DELIVERED' });
      const custInvoices = invoices.filter(i => i.customerId === custId && i.dueAmount > 0);

      if (custInvoices.length === 0) {
        container.innerHTML = '<div style="color:var(--text-subtle); padding:8px;">No open unpaid invoices for this customer.</div>';
        return;
      }

      custInvoices.forEach(inv => {
        container.innerHTML += `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:rgba(255,255,255,0.02); border-radius:var(--radius-sm); margin-bottom:8px;">
            <div>
              <strong>${inv.invoiceNumber}</strong> (${ui.formatDate(inv.invoiceDate)})<br>
              <small style="color:var(--text-muted);">Due: ${ui.formatINR(inv.dueAmount)}</small>
            </div>
            <div style="width:140px;">
              <input type="number" class="form-input pay-alloc-input" data-invoice-id="${inv.id}" max="${inv.dueAmount}" value="${inv.dueAmount}" step="0.01">
            </div>
          </div>
        `;
      });
    } catch (err) {
      console.error('Error fetching invoices:', err);
    }
  });

  document.getElementById('btnSubmitPayment')?.addEventListener('click', async () => {
    const customerId = document.getElementById('payCustomerSelect').value;
    const depositAccountId = document.getElementById('payDepositSelect').value;
    const amount = parseFloat(document.getElementById('payAmountInput').value);
    const referenceNumber = document.getElementById('payRefInput').value;

    if (!customerId || !depositAccountId || !amount || amount <= 0) {
      ui.showToast('Please provide valid customer, deposit account, and payment amount.', 'error');
      return;
    }

    const allocations = [];
    document.querySelectorAll('.pay-alloc-input').forEach(inp => {
      const allocAmt = parseFloat(inp.value) || 0;
      if (allocAmt > 0) {
        allocations.push({
          invoiceId: inp.dataset.invoiceId,
          amount: allocAmt
        });
      }
    });

    if (allocations.length === 0) {
      ui.showToast('Please allocate payment amount to at least one invoice.', 'error');
      return;
    }

    try {
      const result = await api.recordPayment({
        customerId,
        depositAccountId,
        amount,
        referenceNumber,
        allocations
      });

      ui.showToast(`Payment ${result.paymentNumber} recorded! AR relieved: ${ui.formatINR(amount)}`, 'success');
      ui.closeModal('modalPayment');
      await loadPayments();
      await loadInvoices();
      await loadTrialBalance();
      await loadDashboard();
    } catch (err) {
      ui.showToast(`Payment failed: ${err.message}`, 'error');
    }
  });

  // Create Customer
  btnOpenNewCustomerModal?.addEventListener('click', () => ui.openModal('modalCustomer'));
  document.getElementById('btnSubmitNewCustomer')?.addEventListener('click', async () => {
    const name = document.getElementById('newCustName').value.trim();
    const stateCode = document.getElementById('newCustState').value;
    const gstin = document.getElementById('newCustGSTIN').value.trim();
    const email = document.getElementById('newCustEmail').value.trim();
    const phone = document.getElementById('newCustPhone').value.trim();

    if (!name) {
      ui.showToast('Customer name is required.', 'error');
      return;
    }

    try {
      await api.createCustomer({ name, stateCode, gstin, email, phone });
      ui.showToast(`Customer "${name}" added!`, 'success');
      ui.closeModal('modalCustomer');
      document.getElementById('newCustName').value = '';
      document.getElementById('newCustGSTIN').value = '';
      await loadCustomers();
    } catch (err) {
      ui.showToast(`Failed to add customer: ${err.message}`, 'error');
    }
  });

  // Create Item
  btnOpenNewItemModal?.addEventListener('click', () => ui.openModal('modalItem'));
  document.getElementById('btnSubmitNewItem')?.addEventListener('click', async () => {
    const name = document.getElementById('newItemName').value.trim();
    const hsnCode = document.getElementById('newItemHSN').value.trim();
    const defaultTaxRate = parseFloat(document.getElementById('newItemTaxRate').value);
    const unitPrice = parseFloat(document.getElementById('newItemPrice').value);

    if (!name || isNaN(unitPrice)) {
      ui.showToast('Item name and valid unit price are required.', 'error');
      return;
    }

    try {
      await api.createItem({ name, hsnCode, defaultTaxRate, unitPrice });
      ui.showToast(`Catalog item "${name}" created!`, 'success');
      ui.closeModal('modalItem');
      document.getElementById('newItemName').value = '';
      await loadItems();
    } catch (err) {
      ui.showToast(`Failed to add item: ${err.message}`, 'error');
    }
  });

  // Modal Open/Close Event Handlers
  btnNewInvoice?.addEventListener('click', () => {
    addInvoiceLineItem();
    ui.openModal('modalInvoice');
  });
  btnNewPayment?.addEventListener('click', () => ui.openModal('modalPayment'));

  document.querySelectorAll('.btn-modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      ui.closeModal('modalInvoice');
      ui.closeModal('modalPayment');
      ui.closeModal('modalVoid');
      ui.closeModal('modalCustomer');
      ui.closeModal('modalItem');
      ui.closeModal('modalConfirm');
    });
  });

  // --- AI Accounting Copilot Controller ---
  function openAIDrawer() {
    aiDrawer.classList.add('active');
    aiDrawerOverlay.classList.add('active');
    aiInput.focus();
  }

  function closeAIDrawer() {
    aiDrawer.classList.remove('active');
    aiDrawerOverlay.classList.remove('active');
  }

  btnOpenAI?.addEventListener('click', openAIDrawer);
  btnCloseAI?.addEventListener('click', closeAIDrawer);
  aiDrawerOverlay?.addEventListener('click', closeAIDrawer);

  // Shortcut Ctrl+K
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (aiDrawer.classList.contains('active')) {
        closeAIDrawer();
      } else {
        openAIDrawer();
      }
    }
  });

  async function handleSendAIMessage(queryText) {
    const text = queryText || aiInput.value.trim();
    if (!text) return;

    aiInput.value = '';

    state.aiMessages.push({ sender: 'user', text, sources: [] });
    renderAIChat();

    const loadingMsg = { sender: 'assistant', text: 'Analyzing double-entry ledger records...', sources: [] };
    state.aiMessages.push(loadingMsg);
    renderAIChat();

    try {
      const response = await api.askCopilot(text);
      state.aiMessages.pop();

      state.aiMessages.push({
        sender: 'assistant',
        text: response.answer,
        sources: response.sources || [],
        aiEnabled: response.aiEnabled
      });
    } catch (err) {
      state.aiMessages.pop();
      state.aiMessages.push({
        sender: 'assistant',
        text: `Notice: ${err.message}. Underlying accounting books remain fully secure and operational.`,
        sources: ['copilot_service']
      });
    }

    renderAIChat();
  }

  btnSendAI?.addEventListener('click', () => handleSendAIMessage());
  aiInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSendAIMessage();
  });

  suggestionChips.forEach(chip => {
    chip.addEventListener('click', () => {
      handleSendAIMessage(chip.dataset.question);
    });
  });

  function renderAIChat() {
    aiChatThread.innerHTML = '';
    state.aiMessages.forEach(msg => {
      const bubble = document.createElement('div');
      const isMutationWarning = msg.text.includes('strictly read-only');
      bubble.className = `chat-bubble ${msg.sender} ${isMutationWarning ? 'mutation-warning' : ''}`;

      let content = `<div>${msg.text}</div>`;
      if (msg.sources && msg.sources.length > 0) {
        content += `<div class="sources-container">`;
        msg.sources.forEach(src => {
          content += `<span class="source-tag">📄 ${src}</span>`;
        });
        content += `</div>`;
      }

      bubble.innerHTML = content;
      aiChatThread.appendChild(bubble);
    });

    aiChatThread.scrollTop = aiChatThread.scrollHeight;
  }

  // --- Initial Boot ---
  checkAuth();
  loadAllData();
  renderAIChat();
  navigate(window.location.hash.slice(1) || 'dashboard');
});

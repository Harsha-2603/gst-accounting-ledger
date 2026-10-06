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
    if (route === 'login') {
      loginScreen.classList.add('active');
      return;
    }

    if (route === 'transactions') {
      route = 'journal';
    }

    const validRoutes = ['dashboard', 'customers', 'items', 'invoices', 'payments', 'trial-balance', 'gstr1', 'journal', 'copilot'];
    const targetRoute = validRoutes.includes(route) ? route : 'dashboard';
    state.activeRoute = targetRoute;

    navItems.forEach(item => {
      if (item.dataset.tab === targetRoute || (targetRoute === 'journal' && item.dataset.tab === 'transactions')) {
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
      journal: 'Double-Entry General Ledger Audit Log',
      copilot: 'AI Accounting Copilot (Strictly Read-Only)'
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
      case 'copilot': renderAIChat(); break;
    }

    if (window.innerWidth <= 900) {
      appSidebar.classList.remove('mobile-open');
    }
  }

  window.appNavigate = function(route) {
    window.location.hash = '#' + route;
    navigate(route);
  };

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
  async function loadInvoices(customFilters = null) {
    const tbody = document.getElementById('invoicesTableBody');
    if (!tbody) return;
    tbody.innerHTML = ui.renderSkeleton(5, 11);

    const searchInput = document.getElementById('invSearchInput');
    const statusSelect = document.getElementById('invStatusFilter');
    const fromInput = document.getElementById('invDateFrom');
    const toInput = document.getElementById('invDateTo');

    const filters = customFilters || {
      search: searchInput ? searchInput.value.trim() : '',
      status: statusSelect ? statusSelect.value : 'ALL',
      fromDate: fromInput ? fromInput.value : '',
      toDate: toInput ? toInput.value : ''
    };

    try {
      const invoices = await api.getInvoices(filters);
      state.invoices = invoices;
      tbody.innerHTML = '';

      // Update KPI Summary Strip
      let grossTotal = 0;
      let grossPaid = 0;
      let grossDue = 0;
      invoices.forEach(inv => {
        if (inv.status !== 'VOIDED') {
          grossTotal += (inv.totalAmount || 0);
          grossPaid += (inv.paidAmount || 0);
          grossDue += (inv.dueAmount || 0);
        }
      });

      const statCount = document.getElementById('invStatCount');
      const statTotal = document.getElementById('invStatTotal');
      const statPaid = document.getElementById('invStatPaid');
      const statDue = document.getElementById('invStatDue');

      if (statCount) statCount.textContent = invoices.length;
      if (statTotal) statTotal.textContent = ui.formatINR(grossTotal);
      if (statPaid) statPaid.textContent = ui.formatINR(grossPaid);
      if (statDue) statDue.textContent = ui.formatINR(grossDue);

      if (invoices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11">${ui.renderEmptyState({ 
          icon: '📄', 
          title: 'No invoices found', 
          description: filters.search || (filters.status && filters.status !== 'ALL') || filters.fromDate || filters.toDate 
            ? 'No invoices match the applied search and filter criteria.' 
            : 'Create your first B2B sales invoice with automated Indian GST calculation.', 
          actionHtml: '<button class="btn btn-primary btn-sm" onclick="window.appOpenCreateInvoice()">+ Create Invoice</button>' 
        })}</td></tr>`;
        return;
      }

      invoices.forEach(inv => {
        const isIntra = inv.placeOfSupply === '27';
        const gstSummary = isIntra
          ? `<span class="badge badge-state">CGST: ${ui.formatINR(inv.cgstAmount)}</span><br><span class="badge badge-state" style="margin-top:2px;">SGST: ${ui.formatINR(inv.sgstAmount)}</span>`
          : `<span class="badge badge-reversal">IGST: ${ui.formatINR(inv.igstAmount)}</span>`;

        tbody.innerHTML += `
          <tr>
            <td>
              <a href="javascript:void(0)" onclick="window.appViewInvoiceDetails('${inv.id}')" style="font-weight:700; color:var(--primary-400); text-decoration:none;" title="Click to view full details">
                ${inv.invoiceNumber}
              </a>
            </td>
            <td>
              <strong>${inv.customerName}</strong>
              ${inv.customerGstin ? `<br><small style="color:var(--text-subtle); font-family:var(--font-mono);">${inv.customerGstin}</small>` : ''}
            </td>
            <td>${ui.formatDate(inv.invoiceDate)}</td>
            <td>${ui.formatDate(inv.dueDate || inv.invoiceDate)}</td>
            <td class="num">${ui.formatINR(inv.subtotal)}</td>
            <td class="num">${gstSummary}</td>
            <td class="num"><strong>${ui.formatINR(inv.totalAmount)}</strong></td>
            <td class="num" style="color:var(--emerald-500);">${ui.formatINR(inv.paidAmount || 0)}</td>
            <td class="num" style="color:${inv.dueAmount > 0 ? 'var(--amber-500)' : 'var(--emerald-500)'}; font-weight:700;">
              ${ui.formatINR(inv.dueAmount || 0)}
            </td>
            <td>${ui.renderBadge(inv.status)}</td>
            <td>
              <div style="display:flex; gap:4px; justify-content:flex-end;">
                <button class="btn btn-secondary btn-sm" onclick="window.appViewInvoiceDetails('${inv.id}')" title="View invoice details and GL journal entries">View</button>
                ${inv.status === 'DELIVERED' && (inv.paidAmount === 0 || !inv.paidAmount) ? `
                  <button class="btn btn-danger btn-sm" onclick="window.appVoidInvoice('${inv.id}', '${inv.invoiceNumber}')" title="Void invoice with immutable reversal">Void</button>
                ` : ''}
                ${inv.status === 'DRAFT' ? `
                  <button class="btn btn-primary btn-sm" onclick="window.appDeliverInvoice('${inv.id}')" title="Deliver draft invoice & post GL vouchers">Deliver</button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="11">${ui.renderErrorState(err.message, 'loadInvoices')}</td></tr>`;
    }
  }

  // 6. Payments Remittances & AR Relief
  async function loadPayments(customFilters) {
    const tbody = document.getElementById('paymentsTableBody');
    tbody.innerHTML = ui.renderSkeleton(4, 8);

    const searchInput = document.getElementById('paySearchInput');
    const fromInput = document.getElementById('payDateFrom');
    const toInput = document.getElementById('payDateTo');

    const filters = customFilters || {
      search: searchInput ? searchInput.value.trim().toLowerCase() : '',
      fromDate: fromInput ? fromInput.value : '',
      toDate: toInput ? toInput.value : ''
    };

    try {
      const payments = await api.getPayments();
      state.payments = payments;
      tbody.innerHTML = '';

      // Compute Stats Strip
      let totalRemittance = 0;
      let bankPortion = 0;
      let cashPortion = 0;

      payments.forEach(p => {
        const amt = p.amount || 0;
        totalRemittance += amt;
        const accName = (p.depositAccountName || '').toLowerCase();
        if (accName.includes('bank') || p.depositAccountId === 'acc_bank' || (p.depositAccountName && p.depositAccountName.includes('1010'))) {
          bankPortion += amt;
        } else {
          cashPortion += amt;
        }
      });

      const statCount = document.getElementById('payStatCount');
      const statTotal = document.getElementById('payStatTotal');
      const statBank = document.getElementById('payStatBank');
      const statCash = document.getElementById('payStatCash');

      if (statCount) statCount.textContent = payments.length;
      if (statTotal) statTotal.textContent = ui.formatINR(totalRemittance);
      if (statBank) statBank.textContent = ui.formatINR(bankPortion);
      if (statCash) statCash.textContent = ui.formatINR(cashPortion);

      // Filter client-side
      let filtered = payments;
      if (filters.search) {
        filtered = filtered.filter(p => 
          (p.paymentNumber && p.paymentNumber.toLowerCase().includes(filters.search)) ||
          (p.customerName && p.customerName.toLowerCase().includes(filters.search)) ||
          (p.referenceNumber && p.referenceNumber.toLowerCase().includes(filters.search))
        );
      }
      if (filters.fromDate) {
        filtered = filtered.filter(p => p.paymentDate >= filters.fromDate);
      }
      if (filters.toDate) {
        filtered = filtered.filter(p => p.paymentDate <= filters.toDate);
      }

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8">${ui.renderEmptyState({ 
          icon: '💳', 
          title: 'No payment remittances found', 
          description: filters.search || filters.fromDate || filters.toDate 
            ? 'No remittances match the specified search or date filters.' 
            : 'Record customer payments to relieve outstanding receivables and deposit funds.', 
          actionHtml: '<button class="btn btn-primary btn-sm" onclick="window.appOpenRecordPayment()">+ Record Payment</button>' 
        })}</td></tr>`;
        return;
      }

      filtered.forEach(p => {
        tbody.innerHTML += `
          <tr>
            <td><strong>${p.paymentNumber}</strong></td>
            <td><strong>${p.customerName}</strong></td>
            <td>${ui.formatDate(p.paymentDate)}</td>
            <td><span class="badge badge-state">${p.depositAccountName}</span></td>
            <td><code>${p.referenceNumber || 'Direct Deposit'}</code></td>
            <td class="num" style="color:var(--emerald-500); font-weight:700;">${ui.formatINR(p.amount)}</td>
            <td>
              ${p.journalEntryId ? `<span class="badge badge-delivered" style="cursor:pointer;" onclick="window.appViewTransactionDetails && window.appViewTransactionDetails('${p.journalEntryId}')" title="Click to view GL Voucher">${p.journalEntryId}</span>` : '<span class="badge badge-draft">Direct</span>'}
            </td>
            <td><span class="badge badge-delivered">POSTED</span></td>
          </tr>
        `;
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8">${ui.renderErrorState(err.message, 'loadPayments')}</td></tr>`;
    }
  }

  // 7. Trial Balance
  async function loadTrialBalance(toDate) {
    try {
      const tb = await api.getTrialBalance(toDate);
      state.trialBalance = tb;
      updateEquilibriumHeader(tb);

      // Top-level summary cards (Authoritative Backend Values)
      const cardDebit = document.getElementById('tbCardDebit');
      const cardCredit = document.getElementById('tbCardCredit');
      const cardDiff = document.getElementById('tbCardDiff');
      const cardStatus = document.getElementById('tbCardStatus');

      if (cardDebit) cardDebit.textContent = ui.formatINR(tb.totalDebit);
      if (cardCredit) cardCredit.textContent = ui.formatINR(tb.totalCredit);
      if (cardDiff) cardDiff.textContent = ui.formatINR(tb.difference);
      if (cardStatus) {
        cardStatus.innerHTML = tb.isBalanced
          ? `<span class="badge badge-delivered" style="font-size:13px; padding:4px 10px;">✓ BALANCED (Dr == Cr)</span>`
          : `<span class="badge badge-reversal" style="font-size:13px; padding:4px 10px; background:rgba(244,63,94,0.2); color:#f43f5e;">⚠️ NOT BALANCED</span>`;
      }

      // Prominent Equilibrium Banner
      const banner = document.getElementById('tbEquilibriumBanner');
      if (banner) {
        if (tb.isBalanced) {
          banner.className = 'tb-banner-balanced';
          banner.innerHTML = `
            <div style="font-size: 15px; font-weight: 700; display:flex; align-items:center; gap:8px;">
              <span>🛡️</span> <span>GENERAL LEDGER IN PERFECT STATUTORY EQUILIBRIUM</span>
            </div>
            <div style="font-size: 12.5px; margin-top: 6px; color:#a7f3d0;">
              Total Debits of <strong>${ui.formatINR(tb.totalDebit)}</strong> exactly equal Total Credits of <strong>${ui.formatINR(tb.totalCredit)}</strong> (Variance: ${tb.difference.toFixed(4)}). Zero-trust transaction balancing certified for all double-entry accounts.
            </div>
          `;
        } else {
          banner.className = 'tb-banner-unbalanced';
          banner.innerHTML = `
            <div style="font-size: 15px; font-weight: 700; display:flex; align-items:center; gap:8px;">
              <span>⚠️</span> <span>MATHEMATICAL DISCREPANCY DETECTED IN GENERAL LEDGER</span>
            </div>
            <div style="font-size: 12.5px; margin-top: 6px; color:#fecdd3;">
              Debits: ${ui.formatINR(tb.totalDebit)} vs Credits: ${ui.formatINR(tb.totalCredit)}. Discrepancy of <strong>${ui.formatINR(tb.difference)}</strong> detected.
            </div>
          `;
        }
      }

      // Accounts Table
      const tbody = document.getElementById('trialBalanceTableBody');
      tbody.innerHTML = '';
      tb.accounts.forEach(acc => {
        tbody.innerHTML += `
          <tr>
            <td><code>${acc.accountCode}</code></td>
            <td><strong>${acc.accountName}</strong></td>
            <td><span class="badge badge-state" style="font-size:11px;">${acc.type}</span></td>
            <td><small style="color:var(--text-subtle);">${acc.normalBalance}</small></td>
            <td class="num">${acc.debit > 0 ? ui.formatINR(acc.debit) : '-'}</td>
            <td class="num">${acc.credit > 0 ? ui.formatINR(acc.credit) : '-'}</td>
            <td class="num" style="font-weight:700; color: ${acc.balance >= 0 ? 'var(--text-main)' : 'var(--rose-500)'};">${ui.formatINR(acc.balance)}</td>
          </tr>
        `;
      });

      // Table Footer Totals
      const totDebitEl = document.getElementById('tbTotalDebit');
      const totCreditEl = document.getElementById('tbTotalCredit');
      const totStatusEl = document.getElementById('tbTotalStatus');

      if (totDebitEl) totDebitEl.textContent = ui.formatINR(tb.totalDebit);
      if (totCreditEl) totCreditEl.textContent = ui.formatINR(tb.totalCredit);
      if (totStatusEl) {
        totStatusEl.innerHTML = tb.isBalanced
          ? `<span style="color:var(--emerald-500);">BALANCED (Diff: 0.00)</span>`
          : `<span style="color:var(--rose-500);">UNBALANCED (Diff: ${tb.difference.toFixed(2)})</span>`;
      }
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

  document.getElementById('btnFilterTB')?.addEventListener('click', () => {
    const toDate = document.getElementById('tbDateFilter').value;
    loadTrialBalance(toDate);
    ui.showToast(toDate ? `Trial Balance filtered as of ${toDate}` : 'Trial Balance refreshed', 'info');
  });

  document.getElementById('btnResetTB')?.addEventListener('click', () => {
    const dateInp = document.getElementById('tbDateFilter');
    if (dateInp) dateInp.value = '';
    loadTrialBalance();
    ui.showToast('Trial Balance reset to current date.', 'info');
  });

  // 8. GSTR-1 Tax Return
  async function loadGSTR1(fromDate, toDate) {
    try {
      const gstr1 = await api.getGSTR1(fromDate, toDate);
      state.gstr1 = gstr1;

      const b2bInvoices = gstr1.b2bSummary || [];
      const hsnSummary = gstr1.hsnSummary || [];

      // Calculate Top Summary Metrics
      let totalTaxable = 0;
      let totalCGST = 0;
      let totalSGST = 0;
      let totalIGST = 0;

      b2bInvoices.forEach(row => {
        totalTaxable += (row.taxableValue || 0);
        totalCGST += (row.cgst || 0);
        totalSGST += (row.sgst || 0);
        totalIGST += (row.igst || 0);
      });

      const grandTotalVal = totalTaxable + totalCGST + totalSGST + totalIGST;

      const statTaxable = document.getElementById('gstr1StatTaxable');
      const statCGST = document.getElementById('gstr1StatCGST');
      const statSGST = document.getElementById('gstr1StatSGST');
      const statIGST = document.getElementById('gstr1StatIGST');
      const statTotal = document.getElementById('gstr1StatTotal');

      if (statTaxable) statTaxable.textContent = ui.formatINR(totalTaxable);
      if (statCGST) statCGST.textContent = ui.formatINR(totalCGST);
      if (statSGST) statSGST.textContent = ui.formatINR(totalSGST);
      if (statIGST) statIGST.textContent = ui.formatINR(totalIGST);
      if (statTotal) statTotal.textContent = ui.formatINR(grandTotalVal);

      // Filter B2B Summary
      const searchInput = document.getElementById('gstr1SearchInput');
      const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : '';
      const typeFilter = document.getElementById('gstr1SupplyTypeFilter')?.value || 'ALL';

      let filteredB2B = b2bInvoices;
      if (searchVal) {
        filteredB2B = filteredB2B.filter(r => 
          (r.customerGstin && r.customerGstin.toLowerCase().includes(searchVal)) ||
          (r.customerName && r.customerName.toLowerCase().includes(searchVal)) ||
          (r.invoiceNumber && r.invoiceNumber.toLowerCase().includes(searchVal))
        );
      }

      if (typeFilter === 'INTRA') {
        filteredB2B = filteredB2B.filter(r => (r.placeOfSupply && r.placeOfSupply.startsWith('27')) || (r.cgst > 0));
      } else if (typeFilter === 'INTER') {
        filteredB2B = filteredB2B.filter(r => (!r.placeOfSupply || !r.placeOfSupply.startsWith('27')) && (r.igst > 0));
      }

      // Populate Section 4A B2B
      const b2bBody = document.getElementById('gstr1B2BBody');
      b2bBody.innerHTML = '';
      if (filteredB2B.length === 0) {
        b2bBody.innerHTML = `<tr><td colspan="12">${ui.renderEmptyState({ 
          icon: '📑', 
          title: 'No delivered B2B invoices found', 
          description: searchVal || typeFilter !== 'ALL' 
            ? 'No invoices match the applied GSTR-1 return filter.' 
            : 'Deliver sales invoices to populate GSTR-1 Section 4A.' 
        })}</td></tr>`;
      } else {
        filteredB2B.forEach(row => {
          const isIntra = (row.placeOfSupply && row.placeOfSupply.startsWith('27')) || row.cgst > 0;
          const invoiceTotal = (row.taxableValue || 0) + (row.cgst || 0) + (row.sgst || 0) + (row.igst || 0);

          b2bBody.innerHTML += `
            <tr>
              <td><code>${row.customerGstin || 'URP'}</code></td>
              <td><strong>${row.customerName}</strong></td>
              <td>
                <a href="javascript:void(0)" onclick="window.appViewInvoiceDetails && window.appViewInvoiceDetails('${row.invoiceNumber}')" style="font-weight:700; color:var(--primary-400); text-decoration:none;">
                  ${row.invoiceNumber}
                </a>
              </td>
              <td>${ui.formatDate(row.invoiceDate)}</td>
              <td><span class="badge badge-state">${row.placeOfSupply}</span></td>
              <td>
                <span class="badge ${isIntra ? 'badge-delivered' : 'badge-reversal'}">
                  ${isIntra ? 'INTRA-STATE' : 'INTER-STATE'}
                </span>
              </td>
              <td class="num">${ui.formatINR(row.taxableValue)}</td>
              <td class="num">${row.rate}%</td>
              <td class="num" style="color:var(--blue-500);">${row.cgst > 0 ? ui.formatINR(row.cgst) : '-'}</td>
              <td class="num" style="color:var(--blue-500);">${row.sgst > 0 ? ui.formatINR(row.sgst) : '-'}</td>
              <td class="num" style="color:var(--purple-500);">${row.igst > 0 ? ui.formatINR(row.igst) : '-'}</td>
              <td class="num"><strong>${ui.formatINR(invoiceTotal)}</strong></td>
            </tr>
          `;
        });
      }

      // Populate Section 12 HSN
      const hsnBody = document.getElementById('gstr1HSNBody');
      hsnBody.innerHTML = '';
      if (hsnSummary.length === 0) {
        hsnBody.innerHTML = `<tr><td colspan="9">${ui.renderEmptyState({ icon: '📦', title: 'No HSN records', description: 'Outward supplies with statutory HSN codes will appear here.' })}</td></tr>`;
      } else {
        hsnSummary.forEach(h => {
          hsnBody.innerHTML += `
            <tr>
              <td><code>${h.hsnCode}</code></td>
              <td><strong>${h.description}</strong></td>
              <td>${h.uqc || 'NOS'}</td>
              <td class="num">${h.totalQuantity}</td>
              <td class="num">${ui.formatINR(h.taxableValue)}</td>
              <td class="num" style="color:var(--blue-500);">${h.cgst > 0 ? ui.formatINR(h.cgst) : '-'}</td>
              <td class="num" style="color:var(--blue-500);">${h.sgst > 0 ? ui.formatINR(h.sgst) : '-'}</td>
              <td class="num" style="color:var(--purple-500);">${h.igst > 0 ? ui.formatINR(h.igst) : '-'}</td>
              <td class="num"><strong>${ui.formatINR(h.totalValue)}</strong></td>
            </tr>
          `;
        });
      }
    } catch (err) {
      document.getElementById('gstr1B2BBody').innerHTML = `<tr><td colspan="12">${ui.renderErrorState(err.message, 'loadGSTR1')}</td></tr>`;
    }
  }

  document.getElementById('btnFilterGSTR1')?.addEventListener('click', () => {
    const fromDate = document.getElementById('gstr1FromDate').value;
    const toDate = document.getElementById('gstr1ToDate').value;
    loadGSTR1(fromDate, toDate);
    ui.showToast('GSTR-1 report updated for selected period.', 'info');
  });

  document.getElementById('btnResetGSTR1')?.addEventListener('click', () => {
    const f = document.getElementById('gstr1FromDate');
    const t = document.getElementById('gstr1ToDate');
    const s = document.getElementById('gstr1SearchInput');
    const st = document.getElementById('gstr1SupplyTypeFilter');
    if (f) f.value = '';
    if (t) t.value = '';
    if (s) s.value = '';
    if (st) st.value = 'ALL';
    loadGSTR1();
    ui.showToast('GSTR-1 report filters reset.', 'info');
  });

  // 9. Audit Journal Vouchers & Explorer
  let groupedVouchersCache = [];

  async function loadTransactions() {
    const tbody = document.getElementById('journalTableBody');
    tbody.innerHTML = ui.renderSkeleton(5, 9);

    try {
      const data = await api.getTransactions();
      const rawLines = data.transactions || [];
      state.transactions = rawLines;
      tbody.innerHTML = '';

      if (rawLines.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9">${ui.renderEmptyState({ icon: '📜', title: 'No journal entries posted', description: 'Transactions appear here as balanced double-entry vouchers upon document delivery.' })}</td></tr>`;
        return;
      }

      // Group lines by entryNumber to form complete Vouchers
      const voucherMap = new Map();
      rawLines.forEach(line => {
        const num = line.entryNumber;
        if (!voucherMap.has(num)) {
          voucherMap.set(num, {
            voucherNumber: num,
            date: line.date,
            entryType: line.entryType,
            referenceType: line.referenceType,
            referenceId: line.referenceId,
            narration: line.description || '',
            totalDebit: 0,
            totalCredit: 0,
            lines: []
          });
        }
        const v = voucherMap.get(num);
        v.lines.push(line);
        v.totalDebit += (line.debit || 0);
        v.totalCredit += (line.credit || 0);
        if (!v.narration && line.description) {
          v.narration = line.description;
        }
      });

      groupedVouchersCache = Array.from(voucherMap.values());

      // Filter Vouchers
      const searchVal = document.getElementById('journalSearchInput')?.value.trim().toLowerCase() || '';
      const typeFilter = document.getElementById('journalTypeFilter')?.value || 'ALL';

      let filteredVouchers = groupedVouchersCache;
      if (searchVal) {
        filteredVouchers = filteredVouchers.filter(v => 
          v.voucherNumber.toLowerCase().includes(searchVal) ||
          v.narration.toLowerCase().includes(searchVal) ||
          (v.referenceId && v.referenceId.toLowerCase().includes(searchVal)) ||
          v.lines.some(l => l.accountCode.toLowerCase().includes(searchVal) || l.accountName.toLowerCase().includes(searchVal))
        );
      }

      if (typeFilter !== 'ALL') {
        filteredVouchers = filteredVouchers.filter(v => v.entryType === typeFilter);
      }

      if (filteredVouchers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9">${ui.renderEmptyState({ icon: '🔍', title: 'No vouchers match filters', description: 'Try adjusting your search query or transaction type filter.' })}</td></tr>`;
        return;
      }

      filteredVouchers.forEach(v => {
        const isReversal = v.entryType === 'REVERSAL';
        const isBalanced = Math.abs(v.totalDebit - v.totalCredit) < 0.0001;

        let linkedDocHtml = '-';
        if (v.referenceType === 'Invoice' && v.referenceId) {
          linkedDocHtml = `<a href="javascript:void(0)" onclick="window.appViewInvoiceDetails && window.appViewInvoiceDetails('${v.referenceId}')" style="color:var(--primary-400); text-decoration:none; font-weight:600;">Invoice ${v.referenceId}</a>`;
        } else if (v.referenceType === 'Payment' && v.referenceId) {
          linkedDocHtml = `<span>Payment ${v.referenceId}</span>`;
        } else if (v.referenceType) {
          linkedDocHtml = `<span>${v.referenceType} (${v.referenceId || ''})</span>`;
        }

        tbody.innerHTML += `
          <tr class="${isReversal ? 'voucher-highlight-reversal' : ''}">
            <td>
              <a href="javascript:void(0)" onclick="window.appViewTransactionDetails('${v.voucherNumber}')" style="font-weight:700; color:var(--primary-400); text-decoration:none;" title="Click to open voucher">
                ${v.voucherNumber}
              </a>
            </td>
            <td>${ui.formatDate(v.date)}</td>
            <td>
              <span class="badge ${isReversal ? 'badge-reversal' : 'badge-state'}">
                ${v.entryType}
              </span>
            </td>
            <td>${linkedDocHtml}</td>
            <td style="font-size: 12px; color: var(--text-subtle); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${v.narration || ''}">
              ${v.narration || 'General Ledger Entry'}
            </td>
            <td class="num">${ui.formatINR(v.totalDebit)}</td>
            <td class="num">${ui.formatINR(v.totalCredit)}</td>
            <td>
              ${isBalanced 
                ? `<span class="voucher-balanced-tag">✓ BALANCED</span>` 
                : `<span class="badge badge-reversal" style="background:rgba(244,63,94,0.2); color:#f43f5e;">UNBALANCED</span>`}
            </td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="window.appViewTransactionDetails('${v.voucherNumber}')" title="View journal lines">View</button>
            </td>
          </tr>
        `;
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9">${ui.renderErrorState(err.message, 'loadTransactions')}</td></tr>`;
    }
  }

  // Open Transaction Detail Modal
  window.appViewTransactionDetails = function(voucherNumber) {
    const voucher = groupedVouchersCache.find(v => v.voucherNumber === voucherNumber || v.voucherNumber === `JV-${voucherNumber}`);
    if (!voucher) {
      ui.showToast(`Voucher '${voucherNumber}' not found.`, 'error');
      return;
    }

    document.getElementById('txDetVoucherNum').textContent = voucher.voucherNumber;
    document.getElementById('txDetDate').textContent = `Posting Date: ${ui.formatDate(voucher.date)}`;
    
    const typeBadge = document.getElementById('txDetTypeBadge');
    if (typeBadge) {
      typeBadge.className = voucher.entryType === 'REVERSAL' ? 'badge badge-reversal' : 'badge badge-state';
      typeBadge.textContent = voucher.entryType;
    }

    const reversalBanner = document.getElementById('txDetReversalBanner');
    if (reversalBanner) {
      reversalBanner.style.display = voucher.entryType === 'REVERSAL' ? 'block' : 'none';
    }

    document.getElementById('txDetLinkedDoc').textContent = voucher.referenceType 
      ? `${voucher.referenceType}: ${voucher.referenceId || 'N/A'}`
      : 'General Accounting Voucher';

    document.getElementById('txDetNarration').textContent = voucher.narration || 'None provided';

    const linesBody = document.getElementById('txDetLinesBody');
    linesBody.innerHTML = '';
    voucher.lines.forEach(l => {
      linesBody.innerHTML += `
        <tr>
          <td><code>${l.accountCode}</code></td>
          <td><strong>${l.accountName}</strong></td>
          <td style="font-size:12px; color:var(--text-subtle);">${l.description || '-'}</td>
          <td class="num">${l.debit > 0 ? ui.formatINR(l.debit) : '-'}</td>
          <td class="num">${l.credit > 0 ? ui.formatINR(l.credit) : '-'}</td>
        </tr>
      `;
    });

    document.getElementById('txDetTotalDebit').textContent = ui.formatINR(voucher.totalDebit);
    document.getElementById('txDetTotalCredit').textContent = ui.formatINR(voucher.totalCredit);

    ui.openModal('modalTransactionDetails');
  };

  window.appRefreshTransactions = async function() {
    await loadTransactions();
    ui.showToast('Journal vouchers refreshed from ledger.', 'info');
  };

  document.getElementById('btnFilterJournal')?.addEventListener('click', loadTransactions);
  document.getElementById('journalSearchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadTransactions();
  });
  document.getElementById('journalTypeFilter')?.addEventListener('change', loadTransactions);
  document.getElementById('btnResetJournal')?.addEventListener('click', () => {
    const s = document.getElementById('journalSearchInput');
    const t = document.getElementById('journalTypeFilter');
    if (s) s.value = '';
    if (t) t.value = 'ALL';
    loadTransactions();
    ui.showToast('Journal filters reset.', 'info');
  });


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

    let itemOptions = '<option value="">-- Custom Item / Description --</option>';
    state.items.forEach(it => {
      itemOptions += `<option value="${it.id}" data-price="${it.unitPrice}" data-tax="${it.defaultTaxRate}" data-hsn="${it.hsnCode}">${it.name} (HSN: ${it.hsnCode})</option>`;
    });

    const defaultItem = state.items[0];

    lineRow.innerHTML = `
      <div style="flex: 2; min-width: 160px;">
        <label class="form-label">Item / Description *</label>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <select class="form-select line-item-select" style="font-size:12px;">
            ${itemOptions}
          </select>
          <input type="text" class="form-input line-desc" placeholder="Item description" value="${defaultItem?.name || 'General Wholesale Goods'}" required>
        </div>
      </div>
      <div style="flex: 1; min-width: 90px;">
        <label class="form-label">HSN/SAC *</label>
        <input type="text" class="form-input line-hsn" placeholder="e.g. 8471" value="${defaultItem?.hsnCode || '8471'}" required>
      </div>
      <div style="flex: 0.8; min-width: 70px;">
        <label class="form-label">Qty *</label>
        <input type="number" class="form-input line-qty" value="1" min="1" step="1" required>
      </div>
      <div style="flex: 1.2; min-width: 100px;">
        <label class="form-label">Unit Price (₹) *</label>
        <input type="number" class="form-input line-price" value="${defaultItem?.unitPrice || 50000}" min="0" step="0.01" required>
      </div>
      <div style="flex: 1; min-width: 90px;">
        <label class="form-label">GST Rate *</label>
        <select class="form-select line-tax">
          <option value="18" ${defaultItem?.defaultTaxRate === 18 ? 'selected' : ''}>18% (Standard)</option>
          <option value="12" ${defaultItem?.defaultTaxRate === 12 ? 'selected' : ''}>12%</option>
          <option value="5" ${defaultItem?.defaultTaxRate === 5 ? 'selected' : ''}>5%</option>
          <option value="28" ${defaultItem?.defaultTaxRate === 28 ? 'selected' : ''}>28% (Luxury)</option>
          <option value="0" ${defaultItem?.defaultTaxRate === 0 ? 'selected' : ''}>0% (Nil)</option>
        </select>
      </div>
      <div style="display:flex; align-items:flex-end; padding-bottom: 2px;">
        <button type="button" class="btn btn-secondary btn-sm" onclick="this.closest('.invoice-line-item').remove(); window.appRecalculateInvoicePreview();" title="Remove line item">✕</button>
      </div>
    `;

    container.appendChild(lineRow);

    const select = lineRow.querySelector('.line-item-select');
    const descInput = lineRow.querySelector('.line-desc');
    const hsnInput = lineRow.querySelector('.line-hsn');
    const priceInput = lineRow.querySelector('.line-price');
    const taxSelect = lineRow.querySelector('.line-tax');
    const qtyInput = lineRow.querySelector('.line-qty');

    if (defaultItem) {
      select.value = defaultItem.id;
    }

    select.addEventListener('change', () => {
      const opt = select.selectedOptions[0];
      if (opt && opt.value) {
        descInput.value = opt.text.split(' (HSN:')[0];
        priceInput.value = opt.dataset.price || 0;
        taxSelect.value = opt.dataset.tax || 18;
        hsnInput.value = opt.dataset.hsn || '8471';
      }
      recalculateInvoicePreview();
    });

    [descInput, hsnInput, priceInput, taxSelect, qtyInput].forEach(inp => {
      inp.addEventListener('input', recalculateInvoicePreview);
    });

    recalculateInvoicePreview();
  }

  document.getElementById('btnAddLineItem')?.addEventListener('click', addInvoiceLineItem);

  document.getElementById('invoiceCustomerSelect')?.addEventListener('change', () => {
    const custOpt = document.getElementById('invoiceCustomerSelect').selectedOptions[0];
    const customerState = custOpt ? (custOpt.dataset.state || '27') : '27';
    const isIntra = String(customerState).trim() === '27';

    const posBadge = document.getElementById('placeOfSupplyBadge');
    if (posBadge) {
      if (isIntra) {
        posBadge.className = 'badge badge-delivered';
        posBadge.textContent = 'Intra-State (50/50 Dual Split)';
      } else {
        posBadge.className = 'badge badge-reversal';
        posBadge.textContent = `Inter-State (${customerState} - 100% IGST)`;
      }
    }
    recalculateInvoicePreview();
  });

  function recalculateInvoicePreview() {
    const custOpt = document.getElementById('invoiceCustomerSelect')?.selectedOptions[0];
    const customerState = custOpt ? (custOpt.dataset.state || '27') : '27';
    const isIntra = String(customerState).trim() === '27';

    let subtotal = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    const lines = document.querySelectorAll('.invoice-line-item');
    lines.forEach(line => {
      const qty = parseFloat(line.querySelector('.line-qty')?.value) || 0;
      const price = parseFloat(line.querySelector('.line-price')?.value) || 0;
      const rate = parseFloat(line.querySelector('.line-tax')?.value) || 0;

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

    const subEl = document.getElementById('previewSubtotal');
    const cgstEl = document.getElementById('previewCGST');
    const sgstEl = document.getElementById('previewSGST');
    const igstEl = document.getElementById('previewIGST');
    const totEl = document.getElementById('previewTotal');

    if (subEl) subEl.textContent = ui.formatINR(subtotal);
    if (cgstEl) cgstEl.textContent = ui.formatINR(cgst);
    if (sgstEl) sgstEl.textContent = ui.formatINR(sgst);
    if (igstEl) igstEl.textContent = ui.formatINR(igst);
    if (totEl) totEl.textContent = ui.formatINR(total);
  }
  window.appRecalculateInvoicePreview = recalculateInvoicePreview;

  // Open Create Invoice Modal with fresh defaults
  window.appOpenCreateInvoice = function() {
    const errorBox = document.getElementById('invoiceFormError');
    if (errorBox) {
      errorBox.style.display = 'none';
      errorBox.textContent = '';
    }

    const container = document.getElementById('invoiceLinesContainer');
    if (container) container.innerHTML = '';

    const invNumInput = document.getElementById('invoiceNumberInput');
    if (invNumInput) {
      const nextNum = `INV-${String((state.invoices?.length || 0) + 1).padStart(4, '0')}`;
      invNumInput.value = nextNum;
    }

    const dateInp = document.getElementById('invoiceDateInput');
    const dueDateInp = document.getElementById('invoiceDueDateInput');
    const today = new Date().toISOString().split('T')[0];
    if (dateInp) dateInp.value = today;
    if (dueDateInp) {
      const due = new Date();
      due.setDate(due.getDate() + 30);
      dueDateInp.value = due.toISOString().split('T')[0];
    }

    addInvoiceLineItem();
    recalculateInvoicePreview();
    ui.openModal('modalInvoice');
  };

  btnNewInvoice?.addEventListener('click', window.appOpenCreateInvoice);
  document.getElementById('btnOpenNewInvoiceFromList')?.addEventListener('click', window.appOpenCreateInvoice);

  // Submit Invoice Handler (Both Deliver & Draft)
  async function submitInvoiceForm(deliverMode) {
    const errorBox = document.getElementById('invoiceFormError');
    if (errorBox) {
      errorBox.style.display = 'none';
      errorBox.textContent = '';
    }

    const customerId = document.getElementById('invoiceCustomerSelect').value;
    if (!customerId) {
      if (errorBox) {
        errorBox.textContent = 'Please select a debtor customer for this invoice.';
        errorBox.style.display = 'block';
      }
      ui.showToast('Please select a debtor customer for this invoice.', 'error');
      return;
    }

    const invoiceNumber = document.getElementById('invoiceNumberInput')?.value.trim() || undefined;
    const invoiceDate = document.getElementById('invoiceDateInput')?.value || undefined;
    const dueDate = document.getElementById('invoiceDueDateInput')?.value || undefined;

    if (!invoiceDate || !dueDate) {
      if (errorBox) {
        errorBox.textContent = 'Invoice Date and Due Date are required.';
        errorBox.style.display = 'block';
      }
      ui.showToast('Invoice Date and Due Date are required.', 'error');
      return;
    }

    const lineElements = document.querySelectorAll('.invoice-line-item');
    if (lineElements.length === 0) {
      if (errorBox) {
        errorBox.textContent = 'Invoice must have at least one line item.';
        errorBox.style.display = 'block';
      }
      ui.showToast('Invoice must have at least one line item.', 'error');
      return;
    }

    const lines = [];
    let lineValidationError = null;

    lineElements.forEach((line, idx) => {
      const itemId = line.querySelector('.line-item-select')?.value || undefined;
      const description = line.querySelector('.line-desc')?.value.trim() || undefined;
      const hsnCode = line.querySelector('.line-hsn')?.value.trim();
      const quantity = parseFloat(line.querySelector('.line-qty')?.value);
      const unitPrice = parseFloat(line.querySelector('.line-price')?.value);
      const taxRate = parseFloat(line.querySelector('.line-tax')?.value);

      if (!hsnCode) {
        lineValidationError = `Line ${idx + 1}: Statutory HSN/SAC code is required.`;
      } else if (isNaN(quantity) || quantity <= 0) {
        lineValidationError = `Line ${idx + 1}: Quantity must be greater than 0.`;
      } else if (isNaN(unitPrice) || unitPrice < 0) {
        lineValidationError = `Line ${idx + 1}: Unit price must be a non-negative number.`;
      } else if (![0, 5, 12, 18, 28].includes(taxRate)) {
        lineValidationError = `Line ${idx + 1}: Invalid GST tax slab (${taxRate}%). Allowed: 0%, 5%, 12%, 18%, 28%.`;
      }

      lines.push({ itemId, description, hsnCode, quantity, unitPrice, taxRate });
    });

    if (lineValidationError) {
      if (errorBox) {
        errorBox.textContent = lineValidationError;
        errorBox.style.display = 'block';
      }
      ui.showToast(lineValidationError, 'error');
      return;
    }

    const deliver = (deliverMode !== undefined) ? deliverMode : document.getElementById('invoiceDeliverCheck').checked;

    const submitBtn = document.getElementById('btnSubmitInvoice');
    const draftBtn = document.getElementById('btnSaveDraftInvoice');

    try {
      if (submitBtn) submitBtn.disabled = true;
      if (draftBtn) draftBtn.disabled = true;

      const result = await api.createInvoice({
        customerId,
        invoiceNumber,
        invoiceDate,
        dueDate,
        deliver,
        lines
      });

      ui.closeModal('modalInvoice');

      // Populate Success Modal
      const custOpt = document.getElementById('invoiceCustomerSelect').selectedOptions[0];
      const custName = custOpt ? custOpt.text : 'Customer';

      document.getElementById('successInvNum').textContent = result.invoiceNumber;
      document.getElementById('successInvMsg').textContent = result.status === 'DELIVERED' 
        ? 'Delivered & committed to double-entry general ledger!'
        : 'Saved as unposted draft invoice.';
      document.getElementById('successInvCustomer').textContent = custName;
      document.getElementById('successInvSubtotal').textContent = ui.formatINR(result.subtotal);
      document.getElementById('successInvCGST').textContent = ui.formatINR(result.cgstAmount);
      document.getElementById('successInvSGST').textContent = ui.formatINR(result.sgstAmount);
      document.getElementById('successInvIGST').textContent = ui.formatINR(result.igstAmount);
      document.getElementById('successInvTotal').textContent = ui.formatINR(result.totalAmount);
      document.getElementById('successInvDue').textContent = ui.formatINR(result.dueAmount);

      const jvPill = document.getElementById('successInvJournal');
      if (result.journalEntryId) {
        jvPill.className = 'badge badge-delivered';
        jvPill.textContent = result.journalEntryId;
      } else {
        jvPill.className = 'badge badge-draft';
        jvPill.textContent = 'None (Draft)';
      }

      const viewDetailsBtn = document.getElementById('btnSuccessViewDetails');
      if (viewDetailsBtn) {
        viewDetailsBtn.onclick = () => {
          ui.closeModal('modalInvoiceSuccess');
          window.appViewInvoiceDetails(result.id);
        };
      }

      ui.openModal('modalInvoiceSuccess');
      ui.showToast(`Invoice ${result.invoiceNumber} created successfully!`, 'success');

      await loadInvoices();
      await loadTrialBalance();
      await loadDashboard();
    } catch (err) {
      if (errorBox) {
        errorBox.textContent = `Backend Validation Error: ${err.message}`;
        errorBox.style.display = 'block';
      }
      ui.showToast(`Invoice creation failed: ${err.message}`, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (draftBtn) draftBtn.disabled = false;
    }
  }

  document.getElementById('btnSubmitInvoice')?.addEventListener('click', () => submitInvoiceForm(true));
  document.getElementById('btnSaveDraftInvoice')?.addEventListener('click', () => submitInvoiceForm(false));

  // Invoice Details Modal
  window.appViewInvoiceDetails = async function(id) {
    try {
      const inv = await api.getInvoiceById(id);
      if (!inv) {
        ui.showToast(`Invoice '${id}' not found.`, 'error');
        return;
      }

      document.getElementById('detInvoiceNum').textContent = `Invoice ${inv.invoiceNumber}`;
      const statusBadge = document.getElementById('detInvoiceStatusBadge');
      if (statusBadge) statusBadge.innerHTML = ui.renderBadge(inv.status);

      // Customer Card
      document.getElementById('detCustomerName').textContent = inv.customerName;
      document.getElementById('detCustomerGstin').textContent = inv.customerGstin || 'Unregistered (URP)';
      const isIntra = inv.placeOfSupply === '27';
      document.getElementById('detCustomerPos').innerHTML = `
        <span class="badge ${isIntra ? 'badge-delivered' : 'badge-reversal'}">
          ${inv.placeOfSupply} (${isIntra ? 'Intra-State: CGST+SGST' : 'Inter-State: IGST'})
        </span>
      `;

      // Metadata Card
      document.getElementById('detInvoiceDate').textContent = ui.formatDate(inv.invoiceDate);
      document.getElementById('detInvoiceDueDate').textContent = ui.formatDate(inv.dueDate || inv.invoiceDate);
      const jvEl = document.getElementById('detJournalRef');
      if (inv.journalEntryId) {
        jvEl.innerHTML = `<span class="badge badge-delivered">GL Voucher: ${inv.journalEntryId}</span>`;
      } else {
        jvEl.innerHTML = `<span class="badge badge-draft">Draft (Unposted)</span>`;
      }

      // Actions in header
      const voidBtn = document.getElementById('btnDetVoidInvoice');
      const deliverBtn = document.getElementById('btnDetDeliverInvoice');

      if (voidBtn) {
        if (inv.status === 'DELIVERED' && (inv.paidAmount === 0 || !inv.paidAmount)) {
          voidBtn.style.display = 'inline-block';
          voidBtn.onclick = () => {
            ui.closeModal('modalInvoiceDetails');
            window.appVoidInvoice(inv.id, inv.invoiceNumber);
          };
        } else {
          voidBtn.style.display = 'none';
        }
      }

      if (deliverBtn) {
        if (inv.status === 'DRAFT') {
          deliverBtn.style.display = 'inline-block';
          deliverBtn.onclick = async () => {
            await window.appDeliverInvoice(inv.id);
            window.appViewInvoiceDetails(inv.id);
          };
        } else {
          deliverBtn.style.display = 'none';
        }
      }

      // Lines table
      const linesBody = document.getElementById('detLinesBody');
      linesBody.innerHTML = '';
      if (inv.lines && inv.lines.length > 0) {
        inv.lines.forEach((l, idx) => {
          linesBody.innerHTML += `
            <tr>
              <td><strong>${l.description || 'Item #' + (idx + 1)}</strong></td>
              <td><code>${l.hsnCode}</code></td>
              <td class="num">${l.quantity}</td>
              <td class="num">${ui.formatINR(l.unitPrice)}</td>
              <td class="num">${ui.formatINR(l.taxableAmount)}</td>
              <td class="num"><span class="badge badge-state">${l.taxRate}%</span></td>
              <td class="num">${l.cgstAmount > 0 ? ui.formatINR(l.cgstAmount) : '-'}</td>
              <td class="num">${l.sgstAmount > 0 ? ui.formatINR(l.sgstAmount) : '-'}</td>
              <td class="num">${l.igstAmount > 0 ? ui.formatINR(l.igstAmount) : '-'}</td>
              <td class="num"><strong>${ui.formatINR(l.totalLineAmount)}</strong></td>
            </tr>
          `;
        });
      }

      // Summary & Breakdown
      document.getElementById('detSummaryTotal').textContent = ui.formatINR(inv.totalAmount);
      document.getElementById('detSummaryPaid').textContent = ui.formatINR(inv.paidAmount || 0);
      document.getElementById('detSummaryDue').textContent = ui.formatINR(inv.dueAmount);

      document.getElementById('detBreakdownSubtotal').textContent = ui.formatINR(inv.subtotal);
      document.getElementById('detBreakdownCGST').textContent = ui.formatINR(inv.cgstAmount);
      document.getElementById('detBreakdownSGST').textContent = ui.formatINR(inv.sgstAmount);
      document.getElementById('detBreakdownIGST').textContent = ui.formatINR(inv.igstAmount);
      document.getElementById('detBreakdownTotal').textContent = ui.formatINR(inv.totalAmount);

      // GL Audit Entries for this Invoice
      const journalBody = document.getElementById('detJournalBody');
      journalBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:12px;">Loading double-entry audit vouchers...</td></tr>';

      try {
        const txData = await api.getTransactions({ referenceId: inv.id });
        const txs = txData.transactions || [];
        journalBody.innerHTML = '';

        if (txs.length === 0) {
          journalBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:16px; color:var(--text-subtle);">No general ledger postings for this invoice (Draft or Pre-system).</td></tr>';
        } else {
          txs.forEach(t => {
            const isReversal = t.entryType === 'REVERSAL';
            journalBody.innerHTML += `
              <tr style="${isReversal ? 'background:rgba(168,85,247,0.08);' : ''}">
                <td><strong>${t.entryNumber}</strong></td>
                <td>${ui.formatDate(t.date)}</td>
                <td><span class="badge ${isReversal ? 'badge-reversal' : 'badge-delivered'}">${t.entryType}</span></td>
                <td><code>${t.accountCode}</code> ${t.accountName}</td>
                <td style="font-size:12px; color:var(--text-subtle);">${t.description || '-'}</td>
                <td class="num">${t.debit > 0 ? ui.formatINR(t.debit) : '-'}</td>
                <td class="num">${t.credit > 0 ? ui.formatINR(t.credit) : '-'}</td>
              </tr>
            `;
          });
        }
      } catch (e) {
        journalBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:12px; color:var(--rose-500);">Could not load general ledger transactions.</td></tr>';
      }

      ui.openModal('modalInvoiceDetails');
    } catch (err) {
      ui.showToast(`Failed to load invoice: ${err.message}`, 'error');
    }
  };

  // Deliver Draft Invoice
  window.appDeliverInvoice = async function(id) {
    try {
      const result = await api.deliverInvoice(id);
      ui.showToast(`Invoice ${result.invoiceNumber} delivered & posted to GL! (${result.journalEntryId})`, 'success');
      await loadInvoices();
      await loadTrialBalance();
      await loadDashboard();
      return result;
    } catch (err) {
      ui.showToast(`Delivery failed: ${err.message}`, 'error');
      throw err;
    }
  };

  // Void Invoice
  let targetVoidInvoiceId = null;
  window.appVoidInvoice = function(id, invoiceNumber) {
    targetVoidInvoiceId = id;
    document.getElementById('voidInvoiceNum').textContent = invoiceNumber;
    document.getElementById('voidReasonInput').value = 'Customer cancellation / billing discrepancy';
    ui.openModal('modalVoid');
  };

  document.getElementById('btnConfirmVoid')?.addEventListener('click', async () => {
    if (!targetVoidInvoiceId) return;
    const reason = document.getElementById('voidReasonInput').value.trim() || 'Customer cancellation';
    const confirmBtn = document.getElementById('btnConfirmVoid');

    try {
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Posting Reversal Contra-Entries...';
      }

      const result = await api.voidInvoice(targetVoidInvoiceId, reason);
      ui.showToast(`Invoice voided! Immutable reversal posted (${result.reversalJournalEntryId})`, 'success');
      ui.closeModal('modalVoid');
      targetVoidInvoiceId = null;

      await loadInvoices();
      await loadTrialBalance();
      await loadDashboard();
    } catch (err) {
      ui.showToast(`Void failed: ${err.message}`, 'error');
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm Immutable Reversal';
      }
    }
  });

  // Filter Bar Handlers
  document.getElementById('btnFilterInvoices')?.addEventListener('click', () => {
    loadInvoices();
  });

  document.getElementById('btnResetInvoices')?.addEventListener('click', () => {
    const s = document.getElementById('invSearchInput');
    const st = document.getElementById('invStatusFilter');
    const f = document.getElementById('invDateFrom');
    const t = document.getElementById('invDateTo');
    if (s) s.value = '';
    if (st) st.value = 'ALL';
    if (f) f.value = '';
    if (t) t.value = '';
    loadInvoices();
  });

  document.getElementById('invSearchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadInvoices();
  });

  document.getElementById('invStatusFilter')?.addEventListener('change', () => {
    loadInvoices();
  });

  // Record Payment Controller & Allocation Engine
  window.appOpenRecordPayment = function(targetCustomerId) {
    const errorBox = document.getElementById('paymentFormError');
    if (errorBox) {
      errorBox.style.display = 'none';
      errorBox.textContent = '';
    }

    const dateInp = document.getElementById('paymentDateInput');
    if (dateInp) {
      dateInp.value = new Date().toISOString().split('T')[0];
    }

    const amtInp = document.getElementById('payAmountInput');
    const refInp = document.getElementById('payRefInput');
    if (amtInp) amtInp.value = '';
    if (refInp) refInp.value = '';

    const custSelect = document.getElementById('payCustomerSelect');
    if (custSelect) {
      if (targetCustomerId) {
        custSelect.value = targetCustomerId;
      }
    }

    populateDepositAccountsDropdown();
    ui.openModal('modalPayment');

    if (custSelect && custSelect.value) {
      custSelect.dispatchEvent(new Event('change'));
    } else {
      const tbody = document.getElementById('payAllocationsBody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 16px; color:var(--text-subtle);">Select a debtor customer above to load open delivered invoices.</td></tr>';
      }
      recalculatePaymentAllocations();
    }
  };

  // Recalculate Payment Allocations
  function recalculatePaymentAllocations() {
    const amtInp = document.getElementById('payAmountInput');
    const remitAmount = parseFloat(amtInp ? amtInp.value : 0) || 0;

    let totalAlloc = 0;
    let hasOverallocation = false;

    const rows = document.querySelectorAll('.pay-alloc-row');
    rows.forEach(row => {
      const due = parseFloat(row.dataset.due) || 0;
      const allocInp = row.querySelector('.pay-alloc-input');
      const allocVal = parseFloat(allocInp ? allocInp.value : 0) || 0;
      const remEl = row.querySelector('.pay-alloc-remaining');

      totalAlloc += allocVal;
      const remaining = Math.max(0, due - allocVal);
      if (remEl) {
        remEl.textContent = ui.formatINR(remaining);
        remEl.style.color = remaining === 0 ? 'var(--emerald-500)' : 'var(--amber-500)';
      }

      if (allocVal > due) {
        hasOverallocation = true;
        allocInp.style.borderColor = 'var(--rose-500)';
        allocInp.title = 'Allocated amount exceeds invoice due balance!';
      } else {
        allocInp.style.borderColor = 'var(--border-subtle)';
        allocInp.title = '';
      }
    });

    const allocTotalEl = document.getElementById('payAllocTotal');
    const remitTotalEl = document.getElementById('payRemitTotal');
    const diffBadge = document.getElementById('payAllocDiffBadge');

    if (allocTotalEl) allocTotalEl.textContent = ui.formatINR(totalAlloc);
    if (remitTotalEl) remitTotalEl.textContent = ui.formatINR(remitAmount);

    const diff = Math.abs(remitAmount - totalAlloc);

    if (diffBadge) {
      if (hasOverallocation) {
        diffBadge.innerHTML = `<span class="badge badge-reversal" style="background:rgba(244,63,94,0.2); color:#f43f5e;">⚠️ Overpayment detected</span>`;
      } else if (remitAmount > 0 && diff < 0.01) {
        diffBadge.innerHTML = `<span class="badge badge-delivered">✓ Exact Match (Diff: ₹0.00)</span>`;
      } else if (remitAmount === 0 && totalAlloc === 0) {
        diffBadge.innerHTML = `<span class="badge badge-draft">Awaiting Amount</span>`;
      } else {
        diffBadge.innerHTML = `<span class="badge badge-draft" style="color:var(--amber-500);">Mismatch: ₹${diff.toFixed(2)}</span>`;
      }
    }
  }

  // Customer selection in Payment modal -> load open invoices
  document.getElementById('payCustomerSelect')?.addEventListener('change', async () => {
    const custId = document.getElementById('payCustomerSelect').value;
    const tbody = document.getElementById('payAllocationsBody');
    if (!tbody) return;

    if (!custId) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 16px; color:var(--text-subtle);">Select a debtor customer above to load open delivered invoices.</td></tr>';
      recalculatePaymentAllocations();
      return;
    }

    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 16px;">Loading customer invoices...</td></tr>';

    try {
      const invoices = await api.getInvoices({ status: 'DELIVERED' });
      const custInvoices = invoices.filter(i => (i.customerId === custId || i.customer_id === custId) && (i.dueAmount || i.due_amount) > 0);

      if (custInvoices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 20px; color:var(--emerald-500);">✓ This customer has zero open invoices with outstanding receivables. All invoices are settled.</td></tr>';
        recalculatePaymentAllocations();
        return;
      }

      tbody.innerHTML = '';
      let sumDue = 0;

      custInvoices.forEach(inv => {
        const invDue = inv.dueAmount || inv.due_amount || 0;
        const invPaid = inv.paidAmount || inv.paid_amount || 0;
        const invTotal = inv.totalAmount || inv.total_amount || 0;
        sumDue += invDue;

        tbody.innerHTML += `
          <tr class="pay-alloc-row" data-invoice-id="${inv.id}" data-due="${invDue}">
            <td><strong>${inv.invoiceNumber}</strong></td>
            <td>${ui.formatDate(inv.invoiceDate)}</td>
            <td class="num">${ui.formatINR(invTotal)}</td>
            <td class="num" style="color:var(--emerald-500);">${ui.formatINR(invPaid)}</td>
            <td class="num" style="color:var(--amber-500); font-weight:700;">${ui.formatINR(invDue)}</td>
            <td class="num">
              <input type="number" class="form-input pay-alloc-input" data-invoice-id="${inv.id}" max="${invDue}" min="0" step="0.01" value="0.00" style="padding: 4px 8px; font-size: 12px; text-align: right;">
            </td>
            <td class="num pay-alloc-remaining" style="font-weight:600; color:var(--amber-500);">
              ${ui.formatINR(invDue)}
            </td>
            <td>
              <button type="button" class="btn btn-secondary btn-sm btn-pay-full" style="font-size:11px; padding:2px 8px;" title="Pay entire outstanding balance">Pay Full</button>
            </td>
          </tr>
        `;
      });

      // Wire allocation inputs and Pay Full buttons
      tbody.querySelectorAll('.pay-alloc-input').forEach(inp => {
        inp.addEventListener('input', recalculatePaymentAllocations);
      });

      tbody.querySelectorAll('.btn-pay-full').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const row = e.target.closest('.pay-alloc-row');
          const due = parseFloat(row.dataset.due) || 0;
          const inp = row.querySelector('.pay-alloc-input');
          if (inp) {
            inp.value = due.toFixed(2);
            // If total payment input is empty, update it
            const amtInp = document.getElementById('payAmountInput');
            if (amtInp && (!amtInp.value || parseFloat(amtInp.value) === 0)) {
              amtInp.value = due.toFixed(2);
            }
          }
          recalculatePaymentAllocations();
        });
      });

      recalculatePaymentAllocations();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 16px; color:var(--rose-500);">Error loading invoices: ${err.message}</td></tr>`;
    }
  });

  document.getElementById('payAmountInput')?.addEventListener('input', recalculatePaymentAllocations);

  // Auto-allocate button handler
  document.getElementById('btnAutoAllocatePayment')?.addEventListener('click', () => {
    const amtInp = document.getElementById('payAmountInput');
    let targetAmount = parseFloat(amtInp ? amtInp.value : 0) || 0;

    const rows = document.querySelectorAll('.pay-alloc-row');
    if (rows.length === 0) return;

    if (targetAmount <= 0) {
      // If payment input is empty, fill with sum of all open dues
      let totalDue = 0;
      rows.forEach(r => { totalDue += (parseFloat(r.dataset.due) || 0); });
      targetAmount = totalDue;
      if (amtInp) amtInp.value = totalDue.toFixed(2);
    }

    let remainingToAllocate = targetAmount;
    rows.forEach(row => {
      const due = parseFloat(row.dataset.due) || 0;
      const inp = row.querySelector('.pay-alloc-input');
      if (inp) {
        if (remainingToAllocate <= 0) {
          inp.value = '0.00';
        } else if (remainingToAllocate >= due) {
          inp.value = due.toFixed(2);
          remainingToAllocate -= due;
        } else {
          inp.value = remainingToAllocate.toFixed(2);
          remainingToAllocate = 0;
        }
      }
    });

    recalculatePaymentAllocations();
    ui.showToast('Payment amount allocated across open invoices.', 'info');
  });

  // Submit Payment Handler
  document.getElementById('btnSubmitPayment')?.addEventListener('click', async () => {
    const errorBox = document.getElementById('paymentFormError');
    if (errorBox) {
      errorBox.style.display = 'none';
      errorBox.textContent = '';
    }

    const customerId = document.getElementById('payCustomerSelect').value;
    const depositAccountId = document.getElementById('payDepositSelect').value;
    const amount = parseFloat(document.getElementById('payAmountInput').value);
    const referenceNumber = document.getElementById('payRefInput')?.value.trim() || undefined;
    const paymentDate = document.getElementById('paymentDateInput')?.value || undefined;

    if (!customerId) {
      if (errorBox) { errorBox.textContent = 'Please select a debtor customer.'; errorBox.style.display = 'block'; }
      ui.showToast('Please select a debtor customer.', 'error');
      return;
    }

    if (!depositAccountId) {
      if (errorBox) { errorBox.textContent = 'Please select a deposit asset account (Cash or Bank).'; errorBox.style.display = 'block'; }
      ui.showToast('Please select a deposit asset account.', 'error');
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      if (errorBox) { errorBox.textContent = 'Remittance amount must be greater than zero.'; errorBox.style.display = 'block'; }
      ui.showToast('Remittance amount must be greater than zero.', 'error');
      return;
    }

    const allocations = [];
    let sumAlloc = 0;
    let overDueError = null;

    document.querySelectorAll('.pay-alloc-row').forEach(row => {
      const invId = row.dataset.invoiceId;
      const due = parseFloat(row.dataset.due) || 0;
      const inp = row.querySelector('.pay-alloc-input');
      const allocAmt = parseFloat(inp ? inp.value : 0) || 0;

      if (allocAmt > 0) {
        if (allocAmt > due) {
          overDueError = `Allocation ₹${allocAmt.toFixed(2)} exceeds remaining due balance ₹${due.toFixed(2)}.`;
        }
        allocations.push({ invoiceId: invId, amount: allocAmt });
        sumAlloc += allocAmt;
      }
    });

    if (overDueError) {
      if (errorBox) { errorBox.textContent = overDueError; errorBox.style.display = 'block'; }
      ui.showToast(overDueError, 'error');
      return;
    }

    if (allocations.length === 0) {
      if (errorBox) { errorBox.textContent = 'Please allocate payment amount to at least one invoice.'; errorBox.style.display = 'block'; }
      ui.showToast('Please allocate payment amount to at least one invoice.', 'error');
      return;
    }

    if (Math.abs(sumAlloc - amount) > 0.01) {
      const msg = `Sum of allocations (₹${sumAlloc.toFixed(2)}) must exactly equal total payment amount (₹${amount.toFixed(2)}).`;
      if (errorBox) { errorBox.textContent = msg; errorBox.style.display = 'block'; }
      ui.showToast(msg, 'error');
      return;
    }

    const submitBtn = document.getElementById('btnSubmitPayment');

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Recording Double-Entry Payment...';
      }

      const result = await api.recordPayment({
        customerId,
        depositAccountId,
        amount,
        referenceNumber,
        paymentDate,
        allocations
      });

      ui.closeModal('modalPayment');

      // Populate Success Receipt Modal
      const custOpt = document.getElementById('payCustomerSelect').selectedOptions[0];
      const custName = custOpt ? custOpt.text.split(' (')[0] : 'Customer';
      const depOpt = document.getElementById('payDepositSelect').selectedOptions[0];
      const depName = depOpt ? depOpt.text : 'Asset Account';

      document.getElementById('successPayNum').textContent = result.paymentNumber;
      document.getElementById('successPayCustomer').textContent = custName;
      document.getElementById('successPayAccount').textContent = depName;
      document.getElementById('successPayDate').textContent = ui.formatDate(result.paymentDate);
      document.getElementById('successPayAmount').textContent = ui.formatINR(result.amount);
      document.getElementById('successPayJournal').textContent = result.journalEntryId;

      const settledContainer = document.getElementById('successPaySettledList');
      settledContainer.innerHTML = '';
      if (result.settledInvoices && result.settledInvoices.length > 0) {
        result.settledInvoices.forEach(s => {
          settledContainer.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); margin-bottom:6px; font-size:12px;">
              <div>
                <strong>${s.invoiceNumber}</strong>
                <span class="badge ${s.isFullyPaid ? 'badge-delivered' : 'badge-draft'}" style="margin-left:6px;">
                  ${s.isFullyPaid ? 'FULLY SETTLED' : 'PARTIAL'}
                </span>
              </div>
              <div style="text-align:right;">
                <span>Paid: <strong>${ui.formatINR(s.paidAmount)}</strong></span> • 
                <span>Remaining Due: <strong style="color:${s.dueAmount > 0 ? 'var(--amber-500)' : 'var(--emerald-500)'};">${ui.formatINR(s.dueAmount)}</strong></span>
              </div>
            </div>
          `;
        });
      }

      ui.openModal('modalPaymentSuccess');
      ui.showToast(`Payment ${result.paymentNumber} recorded! AR relieved: ${ui.formatINR(amount)}`, 'success');

      // Refresh all dependent accounting states
      await loadPayments();
      await loadInvoices();
      await loadTrialBalance();
      await loadTransactions();
      await loadDashboard();
    } catch (err) {
      if (errorBox) {
        errorBox.textContent = `Backend Payment Validation Error: ${err.message}`;
        errorBox.style.display = 'block';
      }
      ui.showToast(`Payment failed: ${err.message}`, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Record Payment & Relieve AR';
      }
    }
  });

  // Payment Filter Listeners
  document.getElementById('btnFilterPayments')?.addEventListener('click', () => loadPayments());
  document.getElementById('paySearchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadPayments();
  });
  document.getElementById('btnResetPayments')?.addEventListener('click', () => {
    const s = document.getElementById('paySearchInput');
    const f = document.getElementById('payDateFrom');
    const t = document.getElementById('payDateTo');
    if (s) s.value = '';
    if (f) f.value = '';
    if (t) t.value = '';
    loadPayments();
    ui.showToast('Payment filters reset.', 'info');
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
    const dateInp = document.getElementById('invoiceDateInput');
    if (dateInp && !dateInp.value) {
      dateInp.value = new Date().toISOString().split('T')[0];
    }
    ui.openModal('modalInvoice');
  });
  btnNewPayment?.addEventListener('click', () => {
    const dateInp = document.getElementById('paymentDateInput');
    if (dateInp && !dateInp.value) {
      dateInp.value = new Date().toISOString().split('T')[0];
    }
    ui.openModal('modalPayment');
  });

  document.querySelectorAll('.btn-modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-overlay');
      if (modal) {
        modal.classList.remove('active');
      } else {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
      }
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
    const aiPageInput = document.getElementById('aiPageInput');
    const text = (queryText || aiInput.value || (aiPageInput ? aiPageInput.value : '')).trim();
    if (!text) return;

    aiInput.value = '';
    if (aiPageInput) aiPageInput.value = '';

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

  // Full-page AI View Listeners
  const btnSendPageAI = document.getElementById('btnSendPageAI');
  const aiPageInput = document.getElementById('aiPageInput');
  btnSendPageAI?.addEventListener('click', () => handleSendAIMessage());
  aiPageInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSendAIMessage();
  });

  document.querySelectorAll('.page-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      handleSendAIMessage(chip.dataset.question);
    });
  });

  function renderAIChat() {
    const threads = [
      document.getElementById('aiChatThread'),
      document.getElementById('aiPageChatThread')
    ].filter(Boolean);

    threads.forEach(thread => {
      thread.innerHTML = '';
      state.aiMessages.forEach(msg => {
        const bubble = document.createElement('div');
        const isMutationWarning = msg.text.includes('strictly read-only') || msg.text.includes('SECURITY WARNING');
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
        thread.appendChild(bubble);
      });
      thread.scrollTop = thread.scrollHeight;
    });
  }

  // --- Initial Boot ---
  checkAuth();
  loadAllData();
  renderAIChat();
  navigate(window.location.hash.slice(1) || 'dashboard');
});

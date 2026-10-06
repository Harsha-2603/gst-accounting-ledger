/**
 * GST-Ready Accounting Ledger — Reusable UI Components & Helpers
 */

const UI = {
  // Format Currency in Indian Rupee format with exact 2 decimal places
  formatINR(val) {
    const num = Number(val) || 0;
    return '₹' + num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  },

  // Date formatting
  formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  },

  // Badge Component
  renderBadge(status) {
    const s = String(status || '').toUpperCase();
    let badgeClass = 'badge-state';
    let icon = '';

    switch (s) {
      case 'DELIVERED':
      case 'ACTIVE':
      case 'PAID':
      case 'CONNECTED':
        badgeClass = 'badge-delivered';
        icon = '● ';
        break;
      case 'VOIDED':
      case 'CANCELLED':
      case 'ERROR':
      case 'DISCONNECTED':
        badgeClass = 'badge-voided';
        icon = '✕ ';
        break;
      case 'DRAFT':
      case 'PARTIAL':
      case 'PENDING':
        badgeClass = 'badge-draft';
        icon = '⏱ ';
        break;
      case 'REVERSAL':
        badgeClass = 'badge-reversal';
        icon = '↺ ';
        break;
      default:
        badgeClass = 'badge-state';
        break;
    }

    return `<span class="badge ${badgeClass}">${icon}${s}</span>`;
  },

  // GST Breakdown Component (Clean display preview)
  renderGSTBreakdown({ subtotal, cgst, sgst, igst, total, placeOfSupply }) {
    const isIntra = placeOfSupply === '27';
    return `
      <div class="gst-breakdown-box">
        <div class="gst-breakdown-header">
          <span>TAX SUMMARY</span>
          <span class="badge ${isIntra ? 'badge-delivered' : 'badge-reversal'}">
            ${isIntra ? 'Intra-State (50/50 Dual Split)' : 'Inter-State (100% IGST)'}
          </span>
        </div>
        <div class="gst-row">
          <span>Taxable Subtotal</span>
          <strong>${UI.formatINR(subtotal)}</strong>
        </div>
        ${isIntra ? `
          <div class="gst-row">
            <span>Central GST (CGST)</span>
            <span>${UI.formatINR(cgst)}</span>
          </div>
          <div class="gst-row">
            <span>State GST (SGST)</span>
            <span>${UI.formatINR(sgst)}</span>
          </div>
        ` : `
          <div class="gst-row">
            <span>Integrated GST (IGST)</span>
            <span>${UI.formatINR(igst)}</span>
          </div>
        `}
        <div class="gst-row total">
          <span>Invoice Grand Total</span>
          <strong style="color: var(--emerald-500);">${UI.formatINR(total)}</strong>
        </div>
      </div>
    `;
  },

  // Empty State Component
  renderEmptyState({ icon = '📭', title = 'No records found', description = 'There are no items matching this criteria.', actionHtml = '' }) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${icon}</div>
        <h3 class="empty-title">${title}</h3>
        <p class="empty-desc">${description}</p>
        ${actionHtml ? `<div class="empty-action">${actionHtml}</div>` : ''}
      </div>
    `;
  },

  // Loading Skeleton Component
  renderSkeleton(rows = 4, cols = 5) {
    let html = '';
    for (let i = 0; i < rows; i++) {
      html += '<tr class="skeleton-row">';
      for (let j = 0; j < cols; j++) {
        html += '<td><div class="skeleton-shimmer"></div></td>';
      }
      html += '</tr>';
    }
    return html;
  },

  // Error State Component
  renderErrorState(message, retryFnName) {
    return `
      <div class="error-state">
        <div style="font-size: 28px; margin-bottom: 8px;">⚠️</div>
        <div style="font-size: 14px; font-weight: 600; color: #fecdd3; margin-bottom: 4px;">Failed to load data</div>
        <div style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 14px;">${message}</div>
        ${retryFnName ? `<button class="btn btn-secondary btn-sm" onclick="${retryFnName}()">Try Again</button>` : ''}
      </div>
    `;
  },

  // Modal Open / Close Helpers
  openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('active');
  },

  closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');
  },

  // Generic Confirmation Modal
  showConfirmModal({ title, message, warningNote, confirmText = 'Confirm', isDanger = false, onConfirm }) {
    const modal = document.getElementById('modalConfirm');
    if (!modal) return;

    document.getElementById('confirmModalTitle').textContent = title || 'Please Confirm';
    document.getElementById('confirmModalMessage').textContent = message || 'Are you sure you want to proceed?';

    const noteEl = document.getElementById('confirmModalNote');
    if (warningNote) {
      noteEl.textContent = warningNote;
      noteEl.style.display = 'block';
    } else {
      noteEl.style.display = 'none';
    }

    const confirmBtn = document.getElementById('btnConfirmAction');
    confirmBtn.textContent = confirmText;
    confirmBtn.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';

    // One-time click handler
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

    newBtn.addEventListener('click', async () => {
      UI.closeModal('modalConfirm');
      if (onConfirm) await onConfirm();
    });

    UI.openModal('modalConfirm');
  },

  // Toast Notification System
  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span style="font-size: 16px;">${icon}</span><span style="flex:1;">${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 200ms ease';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }
};

window.UI = UI;

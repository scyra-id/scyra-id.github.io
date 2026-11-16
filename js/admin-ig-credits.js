/**
 * =============================================
 * ADMIN IG CREDIT REQUESTS CONTROLLER
 * =============================================
 * Menghandle approval/rejection permintaan free credit via IG
 * 
 * Menggunakan database kedua (window.dbPayment) untuk credit tables
 * UI Premium dengan stats, search, toast, dan detail modal
 */

// Credit icon HTML helper
const CREDIT_ICON = `<img src="images/credit_icon.webp" alt="Credit" style="width: 24px; height: 24px; vertical-align: middle;">`;

let currentFilter = 'pending';
let currentRequestId = null;
let currentAction = null;
let allRequests = []; // Cache all requests for search
let allRequestsWithProfiles = []; // Cache with profile data

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for Supabase clients (both db and dbPayment)
    await waitForDb();
    
    // Check admin access
    const { data: { user } } = await window.db.auth.getUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    
    const { data: profile } = await window.db
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    
    if (!profile || profile.role !== 'admin') {
        window.location.href = 'dashboard.html';
        return;
    }
    
    // Initialize page
    await loadRequests(currentFilter);
    setupEventListeners();
});

// =========================================================
// WAIT FOR DB (both db and dbPayment)
// =========================================================
function waitForDb() {
    return new Promise((resolve) => {
        const check = () => {
            if (window.db && window.dbPayment) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

// Helper untuk mendapatkan db yang tepat
function getDb() {
    return window.dbPayment || window.db;
}

function getAuthDb() {
    return window.db;
}

// =========================================================
// SETUP EVENT LISTENERS
// =========================================================
function setupEventListeners() {
    // Filter tabs
    document.querySelectorAll('.ig-tab-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            document.querySelectorAll('.ig-tab-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentFilter = e.currentTarget.dataset.status;
            await loadRequests(currentFilter);
        });
    });
    
    // Modal confirm button
    document.getElementById('btnConfirmAction').addEventListener('click', handleConfirmAction);
    
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                filterTable(e.target.value.trim().toLowerCase());
            }, 300);
        });
    }
    
    // Refresh button
    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', async () => {
            btnRefresh.classList.add('spinning');
            btnRefresh.disabled = true;
            await loadRequests(currentFilter);
            btnRefresh.classList.remove('spinning');
            btnRefresh.disabled = false;
            showToast('Data berhasil di-refresh!', 'success');
        });
    }
}

// =========================================================
// LOAD REQUESTS
// =========================================================
async function loadRequests(status = 'all') {
    const tbody = document.getElementById('requestsTableBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="6">
                <div class="ig-loading-state">
                    <div class="ig-loading-spinner"></div>
                    <div class="ig-loading-text">Memuat data request...</div>
                </div>
            </td>
        </tr>
    `;
    
    try {
        if (!window.ReferralCreditGateway) {
            throw new Error('Gateway credit Instagram belum tersedia');
        }

        // Load semua request melalui gateway server-side.
        allRequests = await window.ReferralCreditGateway.call('instagram_credit.admin.list');
        
        // Fetch user profiles from main db for each request
        const authDb = getAuthDb();
        allRequestsWithProfiles = await Promise.all(
            allRequests.map(async (req) => {
                const { data: profileData } = await authDb
                    .from('profiles')
                    .select('nama_lengkap, email')
                    .eq('id', req.user_id)
                    .single();
                
                return {
                    ...req,
                    profiles: profileData || { nama_lengkap: 'Unknown', email: 'N/A' }
                };
            })
        );
        
        // Update stats
        updateStats();
        
        // Filter by status
        let filteredRequests = allRequestsWithProfiles;
        if (status !== 'all') {
            filteredRequests = allRequestsWithProfiles.filter(r => r.status === status);
        }
        
        // Render table
        renderTable(filteredRequests);
        
    } catch (err) {
        console.error('Error loading requests:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="ig-error-state">
                        <div class="ig-error-icon">❌</div>
                        <div class="ig-error-msg">Gagal memuat data</div>
                        <div class="ig-error-detail">${err.message}</div>
                    </div>
                </td>
            </tr>
        `;
    }
}

// =========================================================
// UPDATE STATS
// =========================================================
function updateStats() {
    const pending = allRequests.filter(r => r.status === 'pending').length;
    const approved = allRequests.filter(r => r.status === 'approved').length;
    const rejected = allRequests.filter(r => r.status === 'rejected').length;
    const total = allRequests.length;
    
    // Update stat cards
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statApproved').textContent = approved;
    document.getElementById('statRejected').textContent = rejected;
    document.getElementById('statTotal').textContent = total;
    
    // Update tab counts
    document.getElementById('tabCountPending').textContent = pending;
    document.getElementById('tabCountApproved').textContent = approved;
    document.getElementById('tabCountRejected').textContent = rejected;
    document.getElementById('tabCountAll').textContent = total;
}

// =========================================================
// RENDER TABLE
// =========================================================
function renderTable(requests) {
    const tbody = document.getElementById('requestsTableBody');
    
    if (!requests || requests.length === 0) {
        const emptyMessages = {
            pending: { icon: '⏳', title: 'Tidak ada request pending', desc: 'Semua request sudah diproses!' },
            approved: { icon: '✅', title: 'Belum ada yang di-approve', desc: 'Approve request untuk memberikan credit.' },
            rejected: { icon: '❌', title: 'Belum ada yang di-reject', desc: 'Request yang ditolak akan muncul di sini.' },
            all: { icon: '📭', title: 'Belum ada request', desc: 'Request dari Instagram followers akan muncul di sini.' }
        };
        
        const msg = emptyMessages[currentFilter] || emptyMessages.all;
        
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="ig-empty-state">
                        <div class="ig-empty-icon">${msg.icon}</div>
                        <div class="ig-empty-title">${msg.title}</div>
                        <div class="ig-empty-desc">${msg.desc}</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = requests.map(req => {
        const statusBadge = getStatusBadge(req.status);
        const actionButtons = getActionButtons(req);
        const userInfo = req.profiles || { nama_lengkap: 'Unknown', email: 'N/A' };
        const initials = getInitials(userInfo.nama_lengkap);
        
        return `
            <tr data-search="${(userInfo.nama_lengkap + ' ' + userInfo.email + ' ' + req.instagram_username).toLowerCase()}">
                <td>
                    <div class="ig-user-cell">
                        <div class="ig-user-avatar">${initials}</div>
                        <div class="ig-user-info">
                            <span class="ig-user-name">${escapeHtml(userInfo.nama_lengkap)}</span>
                            <span class="ig-user-email">${escapeHtml(userInfo.email)}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <a href="https://instagram.com/${req.instagram_username}" 
                       target="_blank" 
                       class="ig-link">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                        </svg>
                        @${escapeHtml(req.instagram_username)}
                    </a>
                </td>
                <td>
                    <span class="ig-credit-badge">${CREDIT_ICON} ${req.credits_amount}</span>
                </td>
                <td>${statusBadge}</td>
                <td>
                    <div class="ig-date-cell">
                        <span class="ig-date-main">${formatDate(req.created_at)}</span>
                        ${req.processed_at ? `<span class="ig-date-sub">Diproses: ${formatDate(req.processed_at)}</span>` : ''}
                    </div>
                </td>
                <td>${actionButtons}</td>
            </tr>
        `;
    }).join('');
}

// =========================================================
// FILTER TABLE (Search)
// =========================================================
function filterTable(query) {
    const rows = document.querySelectorAll('#requestsTableBody tr[data-search]');
    
    if (!query) {
        rows.forEach(row => row.style.display = '');
        return;
    }
    
    rows.forEach(row => {
        const searchText = row.getAttribute('data-search');
        row.style.display = searchText.includes(query) ? '' : 'none';
    });
}

// =========================================================
// GET INITIALS
// =========================================================
function getInitials(name) {
    if (!name || name === 'Unknown') return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

// =========================================================
// ESCAPE HTML
// =========================================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =========================================================
// GET STATUS BADGE
// =========================================================
function getStatusBadge(status) {
    const config = {
        pending: { class: 'pending', icon: '⏳', label: 'Pending' },
        approved: { class: 'approved', icon: '✅', label: 'Approved' },
        rejected: { class: 'rejected', icon: '❌', label: 'Rejected' }
    };
    
    const c = config[status] || { class: '', icon: '', label: status };
    return `<span class="ig-status-badge ${c.class}">${c.icon} ${c.label}</span>`;
}

// =========================================================
// GET ACTION BUTTONS
// =========================================================
function getActionButtons(request) {
    if (request.status === 'pending') {
        return `
            <div class="ig-action-btns">
                <button onclick="showApproveModal('${request.id}', '${escapeHtml(request.instagram_username)}', ${request.credits_amount})" 
                        class="ig-btn ig-btn-approve">
                    ✅ Approve
                </button>
                <button onclick="showRejectModal('${request.id}', '${escapeHtml(request.instagram_username)}')" 
                        class="ig-btn ig-btn-reject">
                    ❌ Reject
                </button>
            </div>
        `;
    }
    return `
        <div class="ig-action-btns">
            <button onclick="showDetailModal('${request.id}')" class="ig-btn ig-btn-detail">
                📋 Detail
            </button>
            <span class="ig-processed-label">${request.status === 'approved' ? '✅' : '❌'}</span>
        </div>
    `;
}

// =========================================================
// FORMAT DATE
// =========================================================
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// =========================================================
// SHOW APPROVE MODAL
// =========================================================
window.showApproveModal = (requestId, username, credits) => {
    currentRequestId = requestId;
    currentAction = 'approve';
    
    const modal = document.getElementById('actionModal');
    document.getElementById('modalTitle').innerHTML = '✅ Approve Request';
    document.getElementById('modalMessage').innerHTML = `
        Approve permintaan dari <strong>@${escapeHtml(username)}</strong>?<br>
        User akan mendapat <strong>${credits} ${CREDIT_ICON} credit</strong>.
    `;
    document.getElementById('notesGroup').style.display = 'none';
    
    // Update button style
    const btnConfirm = document.getElementById('btnConfirmAction');
    btnConfirm.className = 'ig-modal-btn ig-modal-btn-approve';
    btnConfirm.innerHTML = '✅ Approve';
    
    modal.classList.add('show');
};

// =========================================================
// SHOW REJECT MODAL
// =========================================================
window.showRejectModal = (requestId, username) => {
    currentRequestId = requestId;
    currentAction = 'reject';
    
    const modal = document.getElementById('actionModal');
    document.getElementById('modalTitle').innerHTML = '❌ Reject Request';
    document.getElementById('modalMessage').innerHTML = `
        Reject permintaan dari <strong>@${escapeHtml(username)}</strong>?
    `;
    document.getElementById('notesGroup').style.display = 'block';
    document.getElementById('adminNotes').value = '';
    
    // Update button style
    const btnConfirm = document.getElementById('btnConfirmAction');
    btnConfirm.className = 'ig-modal-btn ig-modal-btn-reject';
    btnConfirm.innerHTML = '❌ Reject';
    
    modal.classList.add('show');
};

// =========================================================
// SHOW DETAIL MODAL
// =========================================================
window.showDetailModal = (requestId) => {
    const request = allRequestsWithProfiles.find(r => r.id === requestId);
    if (!request) return;
    
    const userInfo = request.profiles || { nama_lengkap: 'Unknown', email: 'N/A' };
    
    const detailContent = document.getElementById('detailContent');
    detailContent.innerHTML = `
        <div class="ig-detail-row">
            <span class="ig-detail-label">Nama User</span>
            <span class="ig-detail-value">${escapeHtml(userInfo.nama_lengkap)}</span>
        </div>
        <div class="ig-detail-row">
            <span class="ig-detail-label">Email</span>
            <span class="ig-detail-value">${escapeHtml(userInfo.email)}</span>
        </div>
        <div class="ig-detail-row">
            <span class="ig-detail-label">Instagram</span>
            <span class="ig-detail-value">
                <a href="https://instagram.com/${escapeHtml(request.instagram_username)}" target="_blank" class="ig-link">
                    @${escapeHtml(request.instagram_username)}
                </a>
            </span>
        </div>
        <div class="ig-detail-row">
            <span class="ig-detail-label">Credit Requested</span>
            <span class="ig-detail-value"><span class="ig-credit-badge">${CREDIT_ICON} ${request.credits_amount}</span></span>
        </div>
        <div class="ig-detail-row">
            <span class="ig-detail-label">Status</span>
            <span class="ig-detail-value">${getStatusBadge(request.status)}</span>
        </div>
        <div class="ig-detail-row">
            <span class="ig-detail-label">Tanggal Request</span>
            <span class="ig-detail-value">${formatDate(request.created_at)}</span>
        </div>
        ${request.processed_at ? `
        <div class="ig-detail-row">
            <span class="ig-detail-label">Tanggal Diproses</span>
            <span class="ig-detail-value">${formatDate(request.processed_at)}</span>
        </div>
        ` : ''}
        ${request.admin_notes ? `
        <div class="ig-detail-row">
            <span class="ig-detail-label">Catatan Admin</span>
            <span class="ig-detail-value">${escapeHtml(request.admin_notes)}</span>
        </div>
        ` : ''}
    `;
    
    document.getElementById('detailModal').classList.add('show');
};

// =========================================================
// CLOSE MODALS
// =========================================================
window.closeActionModal = () => {
    document.getElementById('actionModal').classList.remove('show');
    currentRequestId = null;
    currentAction = null;
};

window.closeDetailModal = () => {
    document.getElementById('detailModal').classList.remove('show');
};

// Close modals on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('ig-modal-overlay')) {
        e.target.classList.remove('show');
        if (e.target.id === 'actionModal') {
            currentRequestId = null;
            currentAction = null;
        }
    }
});

// Close modals on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeActionModal();
        closeDetailModal();
    }
});

// =========================================================
// HANDLE CONFIRM ACTION
// =========================================================
async function handleConfirmAction() {
    if (!currentRequestId || !currentAction) return;
    
    const btnConfirm = document.getElementById('btnConfirmAction');
    const originalHTML = btnConfirm.innerHTML;
    btnConfirm.disabled = true;
    btnConfirm.innerHTML = '<span class="ig-loading-spinner" style="width:18px;height:18px;border-width:2px;margin:0 auto;"></span> Processing...';
    
    try {
        if (currentAction === 'approve') {
            await approveRequest(currentRequestId);
        } else if (currentAction === 'reject') {
            const notes = document.getElementById('adminNotes').value.trim();
            await rejectRequest(currentRequestId, notes);
        }
        
        // Reload requests
        await loadRequests(currentFilter);
        
        // Close modal
        closeActionModal();
        
        // Show success toast
        showToast(
            `Request berhasil ${currentAction === 'approve' ? 'di-approve' : 'di-reject'}!`,
            'success'
        );
        
    } catch (err) {
        console.error('Error processing action:', err);
        showToast(err.message || 'Terjadi kesalahan saat memproses request', 'error');
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = originalHTML;
    }
}

// =========================================================
// APPROVE REQUEST
// =========================================================
async function approveRequest(requestId) {
    if (!window.ReferralCreditGateway) {
        throw new Error('Gateway credit Instagram belum tersedia');
    }
    await window.ReferralCreditGateway.call('instagram_credit.admin.process', {
        requestId,
        decision: 'approved'
    });
}

// =========================================================
// REJECT REQUEST
// =========================================================
async function rejectRequest(requestId, notes = '') {
    if (!window.ReferralCreditGateway) {
        throw new Error('Gateway credit Instagram belum tersedia');
    }
    await window.ReferralCreditGateway.call('instagram_credit.admin.process', {
        requestId,
        decision: 'rejected',
        notes
    });
}

// =========================================================
// TOAST NOTIFICATION
// =========================================================
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastText = document.getElementById('toastText');
    
    if (!toast) return;
    
    toast.className = `ig-toast ${type}`;
    toastIcon.textContent = type === 'success' ? '✅' : '❌';
    toastText.textContent = message;
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}

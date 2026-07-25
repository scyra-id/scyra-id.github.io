/**
 * =============================================
 * ADMIN GIVE CREDITS MODULE
 * =============================================
 * Admin dapat memberikan credit gratis kepada user
 * untuk testing atau reward
 */

let selectedUserId = null;
let selectedUserEmail = null;
let allUsersMode = false;

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for both db and dbPayment to be ready
    await waitForDb();
    
    // Check if admin
    await checkAdminAccess();
    
    // Initialize page
    initializeForm();
    loadStats();
    loadTransactions();
});

// =========================================================
// WAIT FOR DB
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

// =========================================================
// CHECK ADMIN ACCESS
// =========================================================
async function checkAdminAccess() {
    try {
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
            await showScyraAlert('Anda tidak memiliki akses ke halaman ini.', '🔒 Akses Ditolak', '🔒');
            window.location.href = 'dashboard.html';
        }
    } catch (err) {
        console.error('Admin check error:', err);
        window.location.href = 'dashboard.html';
    }
}

// =========================================================
// INITIALIZE FORM
// =========================================================
function initializeForm() {
    // Search method radio buttons
    document.querySelectorAll('input[name="searchMethod"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            handleSearchMethodChange(e.target.value);
        });
    });

    // Search buttons
    document.getElementById('btnSearchUser').addEventListener('click', searchUserByEmail);
    document.getElementById('btnSearchUserById').addEventListener('click', searchUserById);

    // Credit amount input
    document.getElementById('creditAmount').addEventListener('change', updateBtnState);
    document.getElementById('creditReason').addEventListener('change', updateBtnState);

    // Give credits button
    document.getElementById('btnGiveCredits').addEventListener('click', giveCredits);

    // Reset button
    document.getElementById('btnReset').addEventListener('click', resetForm);
}

// =========================================================
// HANDLE SEARCH METHOD CHANGE
// =========================================================
function handleSearchMethodChange(method) {
    document.getElementById('emailInputGroup').style.display = method === 'email' ? 'block' : 'none';
    document.getElementById('useridInputGroup').style.display = method === 'userid' ? 'block' : 'none';
    document.getElementById('allUsersInfo').style.display = method === 'all' ? 'block' : 'none';
    
    selectedUserId = null;
    selectedUserEmail = null;
    allUsersMode = method === 'all';
    
    document.getElementById('userInfoDisplay').style.display = 'none';
    updateBtnState();
}

// =========================================================
// SEARCH USER BY EMAIL
// =========================================================
async function searchUserByEmail() {
    const email = document.getElementById('userEmail').value.trim();
    
    if (!email) {
        await showScyraAlert('Masukkan email user', '⚠️ Input Required', '⚠️');
        return;
    }

    try {
        // Search di profiles table
        const { data: profile, error } = await window.db
            .from('profiles')
            .select('id, display_name, email, role')
            .eq('email', email)
            .single();

        if (error || !profile) {
            await showScyraAlert('User dengan email tersebut tidak ditemukan', '❌ Not Found', '❌');
            return;
        }

        selectedUserId = profile.id;
        selectedUserEmail = profile.email;
        
        // Get current credits
        const { data: credits } = await window.dbPayment
            .from('user_credits')
            .select('total_credits, bonus_credits')
            .eq('user_id', profile.id)
            .single();

        const totalCredits = (credits?.total_credits || 0) + (credits?.bonus_credits || 0);

        // Display user info
        displayUserInfo(profile, totalCredits);
        updateBtnState();

    } catch (err) {
        console.error('Search error:', err);
        await showScyraAlert('Terjadi kesalahan: ' + err.message, '❌ Error', '❌');
    }
}

// =========================================================
// SEARCH USER BY ID
// =========================================================
async function searchUserById() {
    const userId = document.getElementById('userId').value.trim();
    
    if (!userId) {
        await showScyraAlert('Masukkan User ID', '⚠️ Input Required', '⚠️');
        return;
    }

    try {
        // Search di profiles table
        const { data: profile, error } = await window.db
            .from('profiles')
            .select('id, display_name, email, role')
            .eq('id', userId)
            .single();

        if (error || !profile) {
            await showScyraAlert('User dengan ID tersebut tidak ditemukan', '❌ Not Found', '❌');
            return;
        }

        selectedUserId = profile.id;
        selectedUserEmail = profile.email;
        
        // Get current credits
        const { data: credits } = await window.dbPayment
            .from('user_credits')
            .select('total_credits, bonus_credits')
            .eq('user_id', profile.id)
            .single();

        const totalCredits = (credits?.total_credits || 0) + (credits?.bonus_credits || 0);

        // Display user info
        displayUserInfo(profile, totalCredits);
        updateBtnState();

    } catch (err) {
        console.error('Search error:', err);
        await showScyraAlert('Terjadi kesalahan: ' + err.message, '❌ Error', '❌');
    }
}

// =========================================================
// DISPLAY USER INFO
// =========================================================
function displayUserInfo(profile, currentCredits) {
    const display = document.getElementById('userInfoDisplay');
    
    document.getElementById('displayName').textContent = profile.display_name || 'Unknown';
    document.getElementById('displayEmail').textContent = profile.email;
    document.getElementById('displayRole').textContent = profile.role || 'user';
    document.getElementById('displayCredits').textContent = currentCredits;
    
    display.style.display = 'block';
}

// =========================================================
// UPDATE BUTTON STATE
// =========================================================
function updateBtnState() {
    const btn = document.getElementById('btnGiveCredits');
    const amount = parseInt(document.getElementById('creditAmount').value) || 0;
    const reason = document.getElementById('creditReason').value.trim();
    
    const isValid = amount > 0 && reason && (selectedUserId || allUsersMode);
    btn.disabled = !isValid;
}

// =========================================================
// GIVE CREDITS
// =========================================================
async function giveCredits() {
    const amount = parseInt(document.getElementById('creditAmount').value);
    const type = document.getElementById('creditType').value;
    const reason = document.getElementById('creditReason').value.trim();
    const btn = document.getElementById('btnGiveCredits');

    if (!amount || !reason) {
        await showScyraAlert('Masukkan jumlah credit dan alasan', '⚠️ Input Required', '⚠️');
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = '⏳ Processing...';

        // Ensure auth is synced
        if (window.syncAuthToPaymentDB && !window._authSyncedToPaymentDB) {
            await window.syncAuthToPaymentDB();
        }

        const db = window.dbPayment;

        if (allUsersMode) {
            // Give credits to ALL users
            await giveCreditsToAllUsers(db, amount, type, reason);
        } else if (selectedUserId) {
            // Give credits to single user
            await giveCreditsToUser(db, selectedUserId, amount, type, reason);
        }

        await showScyraAlert(
            `✅ Berhasil memberikan ${amount} credit!<br><strong>${reason}</strong>`,
            '🎉 Success',
            '🎉'
        );

        resetForm();
        loadStats();
        loadTransactions();

    } catch (err) {
        console.error('Give credits error:', err);
        await showScyraAlert('Gagal memberikan credit: ' + err.message, '❌ Error', '❌');
    } finally {
        btn.disabled = false;
        btn.textContent = '🎁 Give Credits';
    }
}

// =========================================================
// GIVE CREDITS TO SINGLE USER
// =========================================================
async function giveCreditsToUser(db, userId, amount, type, reason) {
    // Get or create user_credits record
    const { data: userCredit } = await db
        .from('user_credits')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (!userCredit) {
        // Create new record
        const creditField = type === 'bonus' ? 'bonus_credits' : 'total_credits';
        await db.from('user_credits').insert({
            user_id: userId,
            [creditField]: amount,
            total_credits: type === 'bonus' ? 0 : amount,
            bonus_credits: type === 'bonus' ? amount : 0,
            used_credits: 0
        });
    } else {
        // Update existing record
        const creditField = type === 'bonus' ? 'bonus_credits' : 'total_credits';
        const newValue = userCredit[creditField] + amount;
        
        await db.from('user_credits').update({
            [creditField]: newValue
        }).eq('user_id', userId);
    }

    // Log transaction
    await db.from('credit_transactions').insert({
        user_id: userId,
        type: 'admin_free_give',
        amount: amount,
        description: `[ADMIN] ${reason}`,
        reference_id: `admin-give-${Date.now()}`
    });
}

// =========================================================
// GIVE CREDITS TO ALL USERS
// =========================================================
async function giveCreditsToAllUsers(db, amount, type, reason) {
    try {
        // Get all users
        const { data: allUsers } = await window.db
            .from('profiles')
            .select('id');

        if (!allUsers || allUsers.length === 0) {
            throw new Error('Tidak ada user ditemukan');
        }

        let successCount = 0;
        let errorCount = 0;

        // Give credits to each user
        for (const user of allUsers) {
            try {
                await giveCreditsToUser(db, user.id, amount, type, reason);
                successCount++;
            } catch (err) {
                console.warn('Failed for user ' + user.id, err);
                errorCount++;
            }
        }

        console.log(`✅ Given credits to ${successCount} users, ${errorCount} failed`);

    } catch (err) {
        throw err;
    }
}

// =========================================================
// LOAD STATS
// =========================================================
async function loadStats() {
    try {
        const db = window.dbPayment;

        // Get total users
        const { count: totalUsersCount } = await window.db
            .from('profiles')
            .select('*', { count: 'exact', head: true });

        // Get credits given today
        const today = new Date().toISOString().split('T')[0];
        const { count: creditsGivenCount } = await db
            .from('credit_transactions')
            .select('*', { count: 'exact', head: true })
            .eq('type', 'admin_free_give')
            .gte('created_at', today);

        document.getElementById('totalUsers').textContent = totalUsersCount || 0;
        document.getElementById('totalCreditsGiven').textContent = creditsGivenCount || 0;

    } catch (err) {
        console.error('Load stats error:', err);
    }
}

// =========================================================
// LOAD TRANSACTIONS
// =========================================================
async function loadTransactions() {
    try {
        const db = window.dbPayment;

        // Get recent admin_free_give transactions
        const { data: transactions, error } = await db
            .from('credit_transactions')
            .select(`
                created_at,
                amount,
                type,
                description,
                user_id
            `)
            .eq('type', 'admin_free_give')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        const tbody = document.getElementById('transactionsTable');
        tbody.innerHTML = '';

        if (!transactions || transactions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">Belum ada transaksi</td></tr>`;
            return;
        }

        for (const txn of transactions) {
            // Get user email
            const { data: profile } = await window.db
                .from('profiles')
                .select('email')
                .eq('id', txn.user_id)
                .single();

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(txn.created_at).toLocaleString('id-ID')}</td>
                <td>${profile?.email || 'Unknown'}</td>
                <td><strong style="color: var(--success);">+${txn.amount}</strong></td>
                <td><span class="badge badge-free">Free</span></td>
                <td>${txn.description}</td>
            `;
            tbody.appendChild(row);
        }

    } catch (err) {
        console.error('Load transactions error:', err);
        document.getElementById('transactionsTable').innerHTML = `
            <tr><td colspan="5" style="text-align: center; color: var(--error);">Gagal memuat transaksi</td></tr>
        `;
    }
}

// =========================================================
// RESET FORM
// =========================================================
function resetForm() {
    selectedUserId = null;
    selectedUserEmail = null;
    allUsersMode = false;

    document.getElementById('userEmail').value = '';
    document.getElementById('userId').value = '';
    document.getElementById('creditAmount').value = '10';
    document.getElementById('creditType').value = 'bonus';
    document.getElementById('creditReason').value = '';
    
    document.querySelector('input[name="searchMethod"][value="email"]').checked = true;
    document.getElementById('emailInputGroup').style.display = 'block';
    document.getElementById('useridInputGroup').style.display = 'none';
    document.getElementById('allUsersInfo').style.display = 'none';
    document.getElementById('userInfoDisplay').style.display = 'none';
    
    updateBtnState();
}
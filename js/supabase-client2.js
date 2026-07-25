// ==========================================
// 🏦 SUPABASE CLIENT 2 (KHUSUS PEMBAYARAN)
// Database terpisah untuk transaksi & payment
// ==========================================

const SUPABASE_URL_PAYMENT = 'https://zevbiyiphwukvqugkrkt.supabase.co/';
const SUPABASE_ANON_KEY_PAYMENT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpldmJpeWlwaHd1a3ZxdWdrcmt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMDAzNTQsImV4cCI6MjA5OTc3NjM1NH0.Msp6H2pCxu3t5cxdOgat3ApmRV9gm3LIw0-LZDHJ_7Y';

// Simpan ke window dengan nama berbeda biar gak bentrok sama window.db
window.dbPayment = window.supabase.createClient(
    SUPABASE_URL_PAYMENT, 
    SUPABASE_ANON_KEY_PAYMENT
);

// Flag untuk track apakah sync sudah dilakukan
window._authSyncedToPaymentDB = false;

// Sync auth session dari database utama ke database payment
async function syncAuthToPaymentDB() {
    try {
        if (!window.db) {
            return false;
        }

        // Get session dari database utama
        const { data: { session } } = await window.db.auth.getSession();
        
        if (session && session.access_token) {
            // Set session ke database payment dengan mode fallback
            try {
                await window.dbPayment.auth.setSession(session);
                window._authSyncedToPaymentDB = true;
                console.log('✅ Auth session synced to Payment DB');
                return true;
            } catch (e) {
                // Silent fail - RLS sudah disabled jadi tidak masalah
                return false;
            }
        }
        return false;
    } catch (err) {
        // Silent fail
        return false;
    }
}

// Export function untuk manual sync jika dibutuhkan
window.syncAuthToPaymentDB = syncAuthToPaymentDB;

// Setup auth state change listener (ONLY if window.db already exists)
const setupAuthListener = () => {
    if (window.db) {
        window.db.auth.onAuthStateChange(() => {
            syncAuthToPaymentDB();
        });
    }
};

// Delay setup listener untuk menghindari race condition
setTimeout(setupAuthListener, 1000);

// Add method to handle cross-DB queries safely
window.safePaymentQuery = async (table, method = 'select', ...args) => {
    try {
        const query = window.dbPayment.from(table)[method](...args);
        return query;
    } catch (err) {
        console.error(`❌ Query error on ${table}.${method}:`, err);
        throw err;
    }
};

// Optional: Log untuk verifikasi koneksi
console.log('💳 Payment DB initialized:', SUPABASE_URL_PAYMENT);

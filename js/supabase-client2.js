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

// Optional: Log untuk verifikasi koneksi
console.log('💳 Payment DB initialized:', SUPABASE_URL_PAYMENT);
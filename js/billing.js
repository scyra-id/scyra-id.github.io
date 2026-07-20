let countdownInterval;
let pollingInterval;
let currentMerchantOrderId = '';
let currentPaket = '';
let currentHarga = 0;
let discount = 0;

document.addEventListener('DOMContentLoaded', async () => {
    const checkAuth = async () => {
        // 🚨 PAKAI db UTAMA untuk cek login user (karena auth ada di project utama)
        if (!window.db) return setTimeout(checkAuth, 100);
        const { data: { user } } = await window.db.auth.getUser();
        
        if (!user) {
            if (typeof showScyraAlert === 'function') {
                await showScyraAlert('Kamu harus login terlebih dahulu untuk melakukan pembayaran.', '🔒 Akses Ditolak', '🔒');
            }
            window.location.href = 'login.html';
            return;
        }
        
        // Ambil parameter paket dari URL (?paket=gold&harga=99000)
        const urlParams = new URLSearchParams(window.location.search);
        currentPaket = urlParams.get('paket');
        currentHarga = parseInt(urlParams.get('harga')) || 0;
        
        // Kalau gak ada parameter paket, tendang balik ke katalog
        if (!currentPaket) {
            window.location.href = 'paketbelajar.html';
            return;
        }
        
        // Update UI dengan data paket
        const paketNameEl = document.getElementById('paketName');
        if (paketNameEl) {
            paketNameEl.textContent = currentPaket.charAt(0).toUpperCase() + currentPaket.slice(1);
        }
        
        updateFinalTotal();
        await generateInvoice(user);
        setupEventListeners();
    };
    
    checkAuth();
});

// =========================================================
// 🎯 GENERATE INVOICE VIA EDGE FUNCTION (DB PAYMENT)
// =========================================================
async function generateInvoice(user) {
    const qrisContainer = document.getElementById('qrisContainer');
    
    // 🚨 SAFETY CHECK: Pastikan dbPayment udah siap
    if (!window.dbPayment || !window.dbPayment.functions) {
        console.error('dbPayment undefined! Cek supabase-client2.js');
        if (qrisContainer) {
            qrisContainer.innerHTML = `<p style="color: var(--error);">❌ Gagal koneksi ke server pembayaran.</p>`;
        }
        return;
    }

    try {
        if (qrisContainer) {
            qrisContainer.innerHTML = '<p style="color: var(--text-muted);">⏳ Membuat invoice...</p>';
        }
        
        // 🚨 1. AMBIL TOKEN LOGIN (JWT) DARI DB UTAMA
        const { data: { session } } = await window.db.auth.getSession();
        const accessToken = session?.access_token;
        
        if (!accessToken) {
            throw new Error('Sesi login tidak valid. Silakan login ulang.');
        }

        // 🚨 2. INVOKE EDGE FUNCTION DENGAN SUNTIKAN TOKEN DB UTAMA
                // 🚨 INVOKE EDGE FUNCTION
        const { data, error } = await window.dbPayment.functions.invoke('create-invoice', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            body: { 
                paket: currentPaket, 
                amount: currentHarga
            }
        });

        // 🔍 BUKA RAHASIA: Print semua data dari Edge Function ke Console (F12)
        console.log('🔍 RESPONSE EDGE FUNCTION:', data);
        console.log('🔍 SUPABASE ERROR:', error);

        if (error) throw new Error(error.message);
        
        if (!data || !data.success) {
            // Ambil pesan error dari berbagai kemungkinan field balasan Duitku
            const errMsg = data?.error || data?.message || data?.responseMessage || 'Gagal membuat invoice. Cek Console F12 untuk detail!';
            throw new Error(errMsg);
        }

        currentMerchantOrderId = data.merchantOrderId;
        
        // Render QR Code pakai library qrcodejs
        if (qrisContainer) {
            qrisContainer.innerHTML = '';
            new QRCode(qrisContainer, {
                text: data.qrString,
                width: 250,
                height: 250,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        }

        startCountdown();
        startPolling();
    } catch (err) {
        console.error('Invoice Error:', err);
        if (qrisContainer) {
            qrisContainer.innerHTML = `<p style="color: var(--error);">❌ Gagal memuat QRIS: ${err.message}</p>`;
        }
    }
}

// =========================================================
// 🔁 POLLING STATUS PEMBAYARAN (Tiap 3 Detik)
// =========================================================
function startPolling() {
    pollingInterval = setInterval(async () => {
        try {
            // 🚨 1. AMBIL TOKEN LOGIN (KTP) DARI DB UTAMA
            const { data: { session } } = await window.db.auth.getSession();
            const accessToken = session?.access_token;

            // 🚨 2. PANGGIL check-payment PAKAI dbPayment + SUNTIK TOKEN
            const { data, error } = await window.dbPayment.functions.invoke('check-payment', {
                headers: {
                    Authorization: `Bearer ${accessToken}` // Ini KTP-nya!
                },
                body: { merchantOrderId: currentMerchantOrderId }
            });

            if (error) {
                console.warn('⚠️ Polling warning:', error.message);
                return; 
            }

            // 🔍 DEBUG: Print status tiap 3 detik ke Console (F12)
            console.log('🔍 Polling Status:', data);

            if (data && data.status === 'paid') {
                clearInterval(pollingInterval);
                clearInterval(countdownInterval);
                showSuccessModal(data.paket);
            } else if (data && (data.status === 'expired' || data.status === 'failed')) {
                clearInterval(pollingInterval);
                clearInterval(countdownInterval);
                if (typeof showScyraAlert === 'function') {
                    await showScyraAlert('Pembayaran gagal atau kadaluarsa. Silakan coba lagi.', '❌ Transaksi Gagal', '❌');
                }
                window.location.href = 'paketbelajar.html';
            }
        } catch (e) { 
            console.warn('Polling network error:', e); 
        }
    }, 3000); // Cek tiap 3 detik
}

// =========================================================
// 🎉 MODAL SUKSES PEMBAYARAN
// =========================================================
function showSuccessModal(paket) {
    const confirmBtn = document.getElementById('confirmPaymentBtn');
    
    if (confirmBtn) {
        confirmBtn.textContent = '✅ Pembayaran Berhasil!';
        confirmBtn.style.background = 'var(--success)';
        confirmBtn.disabled = false;
        
        confirmBtn.onclick = async () => {
            if (typeof showScyraConfirm === 'function') {
                const confirmed = await showScyraConfirm(
                    `Paket ${paket} telah aktif! Klik OK untuk mulai belajar.`,
                    '🎉 Pembayaran Sukses',
                    '🎉'
                );
                if (confirmed) window.location.href = 'dashboard.html';
            } else {
                alert(`Paket ${paket} telah aktif!`);
                window.location.href = 'dashboard.html';
            }
        };
    }
    
    // Auto trigger modal sukses
    if (typeof showScyraConfirm === 'function') {
        showScyraConfirm(
            `Pembayaran berhasil! Paket <strong>${paket}</strong> telah aktif.<br>Klik "Mulai Belajar" untuk lanjut ke dashboard.`,
            '🎉 Pembayaran Sukses',
            '🎉'
        ).then(confirmed => {
            if (confirmed) window.location.href = 'dashboard.html';
        });
    }
}

// =========================================================
// 🎧 EVENT LISTENERS (Kupon, Terms, dll)
// =========================================================
function setupEventListeners() {
    const termsCheckbox = document.getElementById('termsCheckbox');
    const applyCouponBtn = document.getElementById('applyCouponBtn');
    const couponInput = document.getElementById('couponInput');
    const termsLink = document.getElementById('termsLink');
    
    if (applyCouponBtn) {
        applyCouponBtn.addEventListener('click', () => {
            const couponCode = couponInput.value.trim().toUpperCase();
            const couponMessage = document.getElementById('couponMessage');
            
            // 🎟️ Dummy coupons (bisa lo sesuaikan)
            const validCoupons = { 
                'DISKON10': 10, 
                'HEMAT20': 20, 
                'SCYRA50': 50 
            };
            
            if (validCoupons[couponCode]) {
                discount = validCoupons[couponCode];
                couponMessage.textContent = `✅ Kupon berhasil! Diskon ${discount}%`;
                couponMessage.className = 'coupon-message success';
                updateFinalTotal();
            } else {
                couponMessage.textContent = '❌ Kode kupon tidak valid';
                couponMessage.className = 'coupon-message error';
            }
        });
    }
    
    if (termsLink) {
        termsLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof showScyraAlert === 'function') {
                showScyraAlert(
                    'Dengan menggunakan layanan Scyra, kamu setuju untuk:<br><br>• Mematuhi semua ketentuan penggunaan<br>• Tidak membagikan akun kepada orang lain<br>• Pembayaran tidak dapat dikembalikan',
                    '📋 Syarat & Ketentuan',
                    '📋'
                );
            }
        });
    }
}

// =========================================================
// 💰 UPDATE TOTAL HARGA (Dengan Diskon)
// =========================================================
function updateFinalTotal() {
    const finalTotal = currentHarga - (currentHarga * discount / 100);
    const paketPrice = document.getElementById('paketPrice');
    const discountAmount = document.getElementById('discountAmount');
    const finalTotalEl = document.getElementById('finalTotal');
    const totalAmount = document.getElementById('totalAmount');
    
    if (paketPrice) paketPrice.textContent = `Rp ${currentHarga.toLocaleString('id-ID')}`;
    if (discountAmount) discountAmount.textContent = `- Rp ${(currentHarga * discount / 100).toLocaleString('id-ID')}`;
    if (finalTotalEl) finalTotalEl.textContent = `Rp ${finalTotal.toLocaleString('id-ID')}`;
    if (totalAmount) totalAmount.textContent = `Rp ${finalTotal.toLocaleString('id-ID')}`;
}

// =========================================================
// ⏰ COUNTDOWN TIMER (15 Menit)
// =========================================================
function startCountdown() {
    let timeLeft = 15 * 60; // 15 menit dalam detik
    countdownInterval = setInterval(() => {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        const countdownEl = document.getElementById('countdown');
        
        if (countdownEl) {
            countdownEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        
        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            clearInterval(pollingInterval);
            if (typeof showScyraAlert === 'function') {
                showScyraAlert('Waktu pembayaran habis. Silakan pilih paket kembali.', '⏰ Waktu Habis', '⏰');
            }
            setTimeout(() => {
                window.location.href = 'paketbelajar.html';
            }, 2000);
        }
        
        timeLeft--;
    }, 1000);
}
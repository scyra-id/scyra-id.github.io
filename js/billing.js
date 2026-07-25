let countdownInterval;
let pollingInterval;
let currentMerchantOrderId = '';
let currentPaket = '';
let hargaAsli = 0;
let hargaDiskon = 0;
let couponDiscountAmount = 0;
let discountPercent = 0;
let isCheckoutDone = false;

// Credit purchase variables
let isCreditPurchase = false;
let creditAmount = 0;
let creditBonus = 0;
let creditTotal = 0;

// Default coupon code
const DEFAULT_COUPON = 'SCYRAMERDEKA45';

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for both db and dbPayment to be ready
    await waitForDb();
    checkAuth();
});

// =========================================================
// 🔄 WAIT FOR DB (both db and dbPayment)
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
// 🔐 AUTH & INITIALIZATION
// =========================================================
async function checkAuth() {
    const { data: { user } } = await window.db.auth.getUser();
    
    if (!user) {
        if (typeof showScyraAlert === 'function') {
            await showScyraAlert('Kamu harus login terlebih dahulu untuk melakukan pembayaran.', '🔒 Akses Ditolak', '🔒');
        }
        window.location.href = 'login.html';
        return;
    }
    
    // Ambil parameter dari URL
    const urlParams = new URLSearchParams(window.location.search);
    const type = urlParams.get('type');
    
    if (type === 'credit') {
        isCreditPurchase = true;
        creditAmount = parseInt(urlParams.get('credit')) || 0;
        creditBonus = parseInt(urlParams.get('bonus')) || 0;
        creditTotal = parseInt(urlParams.get('total')) || 0;
        hargaDiskon = parseInt(urlParams.get('harga')) || 0;
        hargaAsli = hargaDiskon;
        currentPaket = 'credit';
        
        if (creditAmount <= 0 || hargaDiskon <= 0) {
            window.location.href = 'paketbelajar.html';
            return;
        }
    } else {
        // Regular paket purchase
        currentPaket = urlParams.get('paket') || '';
        hargaAsli = parseInt(urlParams.get('original')) || 0;
        hargaDiskon = parseInt(urlParams.get('harga')) || 0;
        
        if (!currentPaket || hargaDiskon <= 0) {
            window.location.href = 'paketbelajar.html';
            return;
        }
        
        if (hargaAsli <= 0) hargaAsli = hargaDiskon;
    }
    
    // Set default coupon code and auto-apply
    const couponInput = document.getElementById('couponInput');
    if (couponInput) {
        couponInput.value = DEFAULT_COUPON;
    }
    applyCoupon(DEFAULT_COUPON);
    
    updateUI();
    setupEventListeners(user);
}

// =========================================================
// 💰 CALCULATION & UI
// =========================================================
function calculateTotals() {
    const subtotal = Math.max(0, hargaDiskon - couponDiscountAmount);
    const biayaAdmin = Math.round(subtotal * 0.007);
    const totalBayar = subtotal + biayaAdmin;
    return { subtotal, biayaAdmin, totalBayar };
}

function updateUI() {
    const totals = calculateTotals();
    
    const paketNameEl = document.getElementById('paketName');
    const paketOriginalPrice = document.getElementById('paketOriginalPrice');
    const discountAmount = document.getElementById('discountAmount');
    const subtotalAmount = document.getElementById('subtotalAmount');
    const adminFeeAmount = document.getElementById('adminFeeAmount');
    const finalTotal = document.getElementById('finalTotal');
    const totalAmount = document.getElementById('totalAmount');
    
    if (paketNameEl) {
        paketNameEl.textContent = isCreditPurchase 
            ? '💎 Credit' 
            : currentPaket.charAt(0).toUpperCase() + currentPaket.slice(1);
    }
    
    if (paketOriginalPrice) paketOriginalPrice.textContent = `Rp ${hargaAsli.toLocaleString('id-ID')}`;
    if (discountAmount) discountAmount.textContent = `- Rp ${Math.max(0, hargaAsli - hargaDiskon + couponDiscountAmount).toLocaleString('id-ID')}`;
    if (subtotalAmount) subtotalAmount.textContent = `Rp ${totals.subtotal.toLocaleString('id-ID')}`;
    if (adminFeeAmount) adminFeeAmount.textContent = `Rp ${totals.biayaAdmin.toLocaleString('id-ID')}`;
    if (finalTotal) finalTotal.textContent = `Rp ${totals.totalBayar.toLocaleString('id-ID')}`;
    if (totalAmount) totalAmount.textContent = `Rp ${totals.totalBayar.toLocaleString('id-ID')}`;
}

function applyCoupon(code) {
    const couponMessage = document.getElementById('couponMessage');
    
    if (!code) {
        couponDiscountAmount = 0;
        discountPercent = 0;
        return;
    }
    
    // SCYRAMERDEKA45 is a GIMMICK code - no additional discount
    // It just displays the package discount already applied between original and hargaDiskon
    if (code === 'SCYRAMERDEKA45') {
        couponDiscountAmount = 0;
        discountPercent = 0;
        if (couponMessage) {
            couponMessage.textContent = '✅ Kupon SCYRAMERDEKA45 aktif (Diskon Paket Terpasang)';
            couponMessage.className = 'coupon-message success';
        }
        return;
    }
    
    // Additional custom coupons with extra discount
    const validCoupons = { 
        'DISKON10': 10, 
        'HEMAT20': 20, 
        'SCYRA50': 50
    };
    
    if (validCoupons[code]) {
        discountPercent = validCoupons[code];
        couponDiscountAmount = Math.round(hargaDiskon * discountPercent / 100);
        if (couponMessage) {
            couponMessage.textContent = `✅ Kupon berhasil! Diskon tambahan ${discountPercent}%`;
            couponMessage.className = 'coupon-message success';
        }
    } else {
        couponDiscountAmount = 0;
        discountPercent = 0;
        if (couponMessage) {
            couponMessage.textContent = '❌ Kode kupon tidak valid';
            couponMessage.className = 'coupon-message error';
        }
    }
}

// =========================================================
// 🎧 EVENT LISTENERS
// =========================================================
function setupEventListeners(user) {
    const termsCheckbox = document.getElementById('termsCheckbox');
    const applyCouponBtn = document.getElementById('applyCouponBtn');
    const couponInput = document.getElementById('couponInput');
    const termsLink = document.getElementById('termsLink');
    const confirmBtn = document.getElementById('confirmPaymentBtn');
    
    // Terms checkbox enables/disables checkout button
    if (termsCheckbox) {
        termsCheckbox.addEventListener('change', () => {
            if (confirmBtn) {
                confirmBtn.disabled = !termsCheckbox.checked || isCheckoutDone;
            }
        });
    }
    
    // Apply coupon manually
    if (applyCouponBtn) {
        applyCouponBtn.addEventListener('click', () => {
            const code = couponInput ? couponInput.value.trim().toUpperCase() : '';
            applyCoupon(code);
            updateUI();
        });
    }
    
    // Checkout / "Saya Sudah Bayar" button
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (isCheckoutDone) {
                await checkPaymentStatus(user);
            } else {
                await onCheckout(user);
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
// 🛒 ON-DEMAND CHECKOUT
// =========================================================
async function onCheckout(user) {
    if (isCheckoutDone) return;
    
    const qrisContainer = document.getElementById('qrisContainer');
    if (qrisContainer) {
        qrisContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center;">⏳ Membuat invoice...</p>';
    }
    
    isCheckoutDone = true;
    
    const confirmBtn = document.getElementById('confirmPaymentBtn');
    if (confirmBtn) {
        confirmBtn.textContent = 'Saya Sudah Bayar';
    }
    
    await generateInvoice(user);
}

// =========================================================
// 🎯 GENERATE INVOICE VIA EDGE FUNCTION (DB PAYMENT)
// =========================================================
async function generateInvoice(user) {
    const qrisContainer = document.getElementById('qrisContainer');
    
    if (!window.dbPayment || !window.dbPayment.functions) {
        console.error('dbPayment undefined! Cek supabase-client2.js');
        if (qrisContainer) {
            qrisContainer.innerHTML = `<p style="color: var(--error);">❌ Gagal koneksi ke server pembayaran.</p>`;
        }
        return;
    }

    try {
        const { data: { session } } = await window.db.auth.getSession();
        const accessToken = session?.access_token;
        
        if (!accessToken) {
            throw new Error('Sesi login tidak valid. Silakan login ulang.');
        }

        const totals = calculateTotals();

        const { data, error } = await window.dbPayment.functions.invoke('create-invoice', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            body: { 
                paket: currentPaket, 
                amount: totals.totalBayar
            }
        });

        console.log('🔍 RESPONSE EDGE FUNCTION:', data);
        console.log('🔍 SUPABASE ERROR:', error);

        if (error) throw new Error(error.message);
        
        if (!data || !data.success) {
            const errMsg = data?.error || data?.message || data?.responseMessage || 'Gagal membuat invoice. Cek Console F12 untuk detail!';
            throw new Error(errMsg);
        }

        currentMerchantOrderId = data.merchantOrderId;
        
        // Render QR Code
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
        startPolling(user);
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
function startPolling(user) {
    pollingInterval = setInterval(async () => {
        try {
            const { data: { session } } = await window.db.auth.getSession();
            const accessToken = session?.access_token;

            const { data, error } = await window.dbPayment.functions.invoke('check-payment', {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                },
                body: { merchantOrderId: currentMerchantOrderId }
            });

            if (error) {
                console.warn('⚠️ Polling warning:', error.message);
                return; 
            }

            console.log('🔍 Polling Status:', data);

            if (data && data.status === 'paid') {
                clearInterval(pollingInterval);
                clearInterval(countdownInterval);
                
                if (isCreditPurchase) {
                    await addPurchasedCredits();
                }
                
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
    }, 3000);
}

// =========================================================
// 🔄 MANUAL STATUS CHECK ("Saya Sudah Bayar")
// =========================================================
async function checkPaymentStatus(user) {
    if (!currentMerchantOrderId) return;
    
    const qrisContainer = document.getElementById('qrisContainer');
    if (qrisContainer) {
        qrisContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center;">⏳ Memeriksa status pembayaran...</p>';
    }
    
    try {
        const { data: { session } } = await window.db.auth.getSession();
        const accessToken = session?.access_token;

        const { data, error } = await window.dbPayment.functions.invoke('check-payment', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            body: { merchantOrderId: currentMerchantOrderId }
        });

        if (error) throw new Error(error.message);

        if (data && data.status === 'paid') {
            clearInterval(pollingInterval);
            clearInterval(countdownInterval);
            if (isCreditPurchase) await addPurchasedCredits();
            showSuccessModal(data.paket);
        } else if (data && (data.status === 'expired' || data.status === 'failed')) {
            clearInterval(pollingInterval);
            clearInterval(countdownInterval);
            if (typeof showScyraAlert === 'function') {
                await showScyraAlert('Pembayaran gagal atau kadaluarsa. Silakan coba lagi.', '❌ Transaksi Gagal', '❌');
            }
            window.location.href = 'paketbelajar.html';
        } else {
            if (typeof showScyraAlert === 'function') {
                await showScyraAlert('Pembayaran masih diproses. Silakan scan QRIS dan selesaikan pembayaran.', '⏳ Menunggu Pembayaran', '⏳');
            } else {
                alert('Pembayaran masih diproses. Silakan scan QRIS dan selesaikan pembayaran.');
            }
            // Re-render QR code display
            const confirmBtn = document.getElementById('confirmPaymentBtn');
            if (confirmBtn) confirmBtn.disabled = false;
        }
    } catch (err) {
        console.error('Check payment status error:', err);
        if (typeof showScyraAlert === 'function') {
            await showScyraAlert('Gagal memeriksa status pembayaran. Silakan coba lagi.', '❌ Error', '❌');
        }
    }
}

// =========================================================
// 💎 UPDATE UI UNTUK CREDIT PURCHASE (legacy support)
// =========================================================
function updateCreditPurchaseUI() {
    // Credit purchase now uses unified updateUI.
    // Hide coupon section for credit purchase.
    const couponSection = document.querySelector('.coupon-section');
    if (couponSection) {
        couponSection.style.display = 'none';
    }
}

// =========================================================
// 💎 TAMBAH CREDIT SETELAH PEMBAYARAN BERHASIL
// =========================================================
async function addPurchasedCredits() {
    if (!isCreditPurchase || creditTotal <= 0) return;
    
    try {
        const { data: { user } } = await getAuthDb().auth.getUser();
        if (!user) return;
        
        if (window.CreditSystem) {
            await window.CreditSystem.addCredits(
                user.id,
                creditAmount,
                'purchase',
                `Pembelian ${creditAmount} credit`,
                currentMerchantOrderId
            );
            
            if (creditBonus > 0) {
                await window.CreditSystem.addCredits(
                    user.id,
                    creditBonus,
                    'bonus',
                    `Bonus ${creditBonus} credit dari pembelian`,
                    currentMerchantOrderId
                );
            }
        } else {
            const db = getDb();
            
            if (window.syncAuthToPaymentDB && !window._authSyncedToPaymentDB) {
                await window.syncAuthToPaymentDB();
            }
            
            const { data: userCredit, error: fetchError } = await db
                .from('user_credits')
                .select('*')
                .eq('user_id', user.id)
                .single();
            
            if (fetchError) {
                console.warn('⚠️ User credit not found, creating new record...');
            }
            
            if (userCredit) {
                await db
                    .from('user_credits')
                    .update({
                        total_credits: userCredit.total_credits + creditAmount,
                        bonus_credits: userCredit.bonus_credits + creditBonus
                    })
                    .eq('user_id', user.id);
            } else {
                await db
                    .from('user_credits')
                    .insert({
                        user_id: user.id,
                        total_credits: creditAmount,
                        bonus_credits: creditBonus
                    });
            }
            
            await db.from('credit_transactions').insert([
                {
                    user_id: user.id,
                    type: 'purchase',
                    amount: creditAmount,
                    description: `Pembelian ${creditAmount} credit`,
                    reference_id: currentMerchantOrderId
                },
                {
                    user_id: user.id,
                    type: 'bonus',
                    amount: creditBonus,
                    description: `Bonus ${creditBonus} credit dari pembelian`,
                    reference_id: currentMerchantOrderId
                }
            ]);
        }
        
        console.log(`✅ Added ${creditTotal} credits to user ${user.id}`);
    } catch (err) {
        console.error('Error adding credits:', err);
    }
}

// =========================================================
// 🎉 MODAL SUKSES PEMBAYARAN
// =========================================================
function showSuccessModal(paket) {
    const confirmBtn = document.getElementById('confirmPaymentBtn');
    
    const successMessage = isCreditPurchase 
        ? `Pembayaran berhasil! <strong>${creditTotal} 💎 credit</strong> telah ditambahkan ke akunmu.`
        : `Pembayaran berhasil! Paket <strong>${paket}</strong> telah aktif.`;
    
    if (confirmBtn) {
        confirmBtn.textContent = '✅ Pembayaran Berhasil!';
        confirmBtn.style.background = 'var(--success)';
        confirmBtn.disabled = false;
        
        confirmBtn.onclick = async () => {
            if (typeof showScyraConfirm === 'function') {
                const confirmed = await showScyraConfirm(
                    `${successMessage}<br><br>Klik OK untuk lanjut ke dashboard.`,
                    '🎉 Pembayaran Sukses',
                    '🎉'
                );
                if (confirmed) window.location.href = 'dashboard.html';
            } else {
                alert(isCreditPurchase ? `${creditTotal} credit telah ditambahkan!` : `Paket ${paket} telah aktif!`);
                window.location.href = 'dashboard.html';
            }
        };
    }
    
    if (typeof showScyraConfirm === 'function') {
        showScyraConfirm(
            `${successMessage}<br>Klik "OK" untuk lanjut ke dashboard.`,
            '🎉 Pembayaran Sukses',
            '🎉'
        ).then(confirmed => {
            if (confirmed) window.location.href = 'dashboard.html';
        });
    }
}

// =========================================================
// ⏰ COUNTDOWN TIMER (15 Menit)
// =========================================================
function startCountdown() {
    let timeLeft = 15 * 60;
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

document.addEventListener('DOMContentLoaded', async () => {
    // Tunggu Supabase siap
    const waitForDb = () => new Promise(resolve => {
        if (window.db) resolve();
        else {
            const interval = setInterval(() => {
                if (window.db) { clearInterval(interval); resolve(); }
            }, 100);
        }
    });
    await waitForDb();

    const { data: { user } } = await window.db.auth.getUser();
    
    const guestHeader = document.getElementById('guest-header');
    const guestFooter = document.getElementById('guest-footer');
    const dashboardLayout = document.getElementById('dashboard-layout');
    const pageContent = document.getElementById('page-content');
    
    // =============================================
    // CREDIT SYSTEM FUNCTIONS
    // =============================================
    
    /**
     * Hitung bonus credit berdasarkan jumlah credit yang dibeli
     * - 10 credit = 0 bonus
     * - 20 credit = 5 bonus
     * - 30 credit = 10 bonus
     * - dst (max 100 credit)
     * - Untuk non-kelipatan 10, bonus dibulatkan ke bawah
     */
    function calculateBonusCredit(creditAmount) {
        if (creditAmount < 10) return 0;
        
        // Batasi maksimal 100 credit
        const cappedAmount = Math.min(creditAmount, 100);
        
        // Hitung kelipatan 10 (dibulatkan ke bawah)
        const kelipatan = Math.floor(cappedAmount / 10);
        
        // Bonus = (kelipatan - 1) * 5, minimal 0
        const bonus = Math.max(0, (kelipatan - 1) * 5);
        
        return bonus;
    }
    
    /**
     * Hitung harga berdasarkan jumlah credit
     * Rp 15.000 per 10 credit
     */
    function calculatePrice(creditAmount) {
        // Harga per credit = 15000 / 10 = 1500
        const pricePerCredit = 1500;
        return creditAmount * pricePerCredit;
    }
    
    /**
     * Format harga ke format Rupiah
     */
    function formatRupiah(amount) {
        return 'Rp ' + amount.toLocaleString('id-ID');
    }
    
    /**
     * Update tampilan summary credit
     */
    function updateCreditSummary() {
        const creditInput = document.getElementById('creditAmount');
        if (!creditInput) return;
        
        const creditAmount = parseInt(creditInput.value) || 0;
        
        // Validasi
        const validAmount = Math.max(1, Math.min(100, creditAmount));
        if (creditAmount !== validAmount) {
            creditInput.value = validAmount;
        }
        
        const bonus = calculateBonusCredit(validAmount);
        const totalCredit = validAmount + bonus;
        const totalPrice = calculatePrice(validAmount);
        
        // Update UI
        const summaryBaseCredit = document.getElementById('summaryBaseCredit');
        const summaryBonusCredit = document.getElementById('summaryBonusCredit');
        const summaryTotalCredit = document.getElementById('summaryTotalCredit');
        const summaryTotalPrice = document.getElementById('summaryTotalPrice');
        
        if (summaryBaseCredit) summaryBaseCredit.textContent = validAmount;
        if (summaryBonusCredit) summaryBonusCredit.textContent = '+' + bonus;
        if (summaryTotalCredit) summaryTotalCredit.textContent = totalCredit;
        if (summaryTotalPrice) summaryTotalPrice.textContent = formatRupiah(totalPrice);
    }
    
    // Setup credit purchase section
    const creditPurchaseSection = document.getElementById('creditPurchaseSection');
    const creditAmountInput = document.getElementById('creditAmount');
    const btnBuyCredit = document.getElementById('btnBuyCredit');
    
    if (creditAmountInput) {
        creditAmountInput.addEventListener('input', updateCreditSummary);
        creditAmountInput.addEventListener('change', updateCreditSummary);
    }
    
    if (btnBuyCredit) {
        btnBuyCredit.addEventListener('click', async () => {
            const { data: { user } } = await window.db.auth.getUser();
            if (!user) {
                if (typeof showScyraAlert === 'function') {
                    await showScyraAlert('Kamu harus login terlebih dahulu untuk membeli credit.', '🔒 Login Diperlukan', '🔒');
                } else {
                    alert('Kamu harus login terlebih dahulu.');
                }
                window.location.href = 'login.html';
                return;
            }
            
            const creditAmount = parseInt(creditAmountInput.value) || 10;
            const bonus = calculateBonusCredit(creditAmount);
            const totalCredit = creditAmount + bonus;
            const totalPrice = calculatePrice(creditAmount);
            
            // Redirect ke billing dengan parameter credit
            window.location.href = `billing.html?type=credit&credit=${creditAmount}&bonus=${bonus}&total=${totalCredit}&harga=${totalPrice}`;
        });
    }
    
    if (user) {
        // === STATE: USER LOGIN ===
        document.body.classList.add('dashboard-page');
        
        // Sembunyikan elemen guest (Gak di-fetch jadi aman)
        if (guestHeader) guestHeader.style.display = 'none';
        if (guestFooter) guestFooter.style.display = 'none';
        
        // Tampilkan dashboard layout (main.js akan otomatis fetch sidebar & topbar)
        if (dashboardLayout) dashboardLayout.style.display = 'flex';
        
        // Pindahkan konten utama ke dalam dashboard-body
        const dashboardBody = document.getElementById('dashboard-body-target');
        if (dashboardBody && pageContent) {
            dashboardBody.appendChild(pageContent);
        }
        
        // Cek role user untuk menonaktifkan tombol paket yang sudah dimiliki
        const { data: profile } = await window.db.from('profiles').select('role').eq('id', user.id).single();
        
        if (profile) {
            // Nonaktifkan tombol paket yang sudah dimiliki
            if (profile.role === 'silver' || profile.role === 'gold') {
                const activeBtn = document.querySelector(`.btn-pilih-paket[data-paket="${profile.role}"]`);
                if (activeBtn) {
                    activeBtn.textContent = 'Paket Aktif';
                    activeBtn.disabled = true;
                }
            }
            
            // Tampilkan section beli credit hanya untuk user free dan silver
            if (profile.role === 'user' || profile.role === 'silver') {
                if (creditPurchaseSection) {
                    creditPurchaseSection.style.display = 'block';
                    updateCreditSummary(); // Initialize summary
                }
            }
            
            // Untuk user gold, tampilkan notifikasi
            if (profile.role === 'gold' && creditPurchaseSection) {
                const goldNotice = document.createElement('div');
                goldNotice.style.cssText = 'margin-top: 1.5rem; padding: 1rem; background: rgba(255, 193, 7, 0.1); border-radius: 8px; border-left: 4px solid #ffc107;';
                goldNotice.innerHTML = `
                    <p style="margin: 0; color: var(--text-primary); font-size: 0.9rem;">
                        <strong>👑 Paket Gold Aktif</strong><br>
                        Anda telah berlangganan paket Gold. Sistem credit tidak lagi tersedia karena Anda sudah memiliki akses penuh ke semua fitur.
                    </p>
                `;
                const freeCard = document.querySelector('.paket-card:first-child');
                if (freeCard) {
                    freeCard.appendChild(goldNotice);
                }
            }
        }
    } else {
        // === STATE: GUEST ===
        document.body.classList.remove('dashboard-page');
        
        // Sembunyikan dashboard layout
        if (dashboardLayout) dashboardLayout.style.display = 'none';
        
        // Fetch header & footer manual (karena ID-nya bukan 'header-placeholder' & 'footer-placeholder')
        if (guestHeader) {
            fetch('components/header.html')
                .then(res => res.text())
                .then(html => {
                    guestHeader.innerHTML = html;
                    document.dispatchEvent(new Event('headerLoaded')); // Trigger session.js
                });
        }
        if (guestFooter) {
            fetch('components/footer.html')
                .then(res => res.text())
                .then(html => { guestFooter.innerHTML = html; });
        }
    }

    // Logic Klik Tombol Beli Paket
    document.querySelectorAll('.btn-pilih-paket').forEach(btn => {
        btn.addEventListener('click', async () => {
            const { data: { user } } = await window.db.auth.getUser();
            if (!user) {
                if (typeof showScyraAlert === 'function') {
                    await showScyraAlert('Kamu harus login terlebih dahulu untuk membeli paket.', '🔒 Login Diperlukan', '🔒');
                } else {
                    alert('Kamu harus login terlebih dahulu.');
                }
                window.location.href = 'login.html';
                return;
            }
            
            const paket = btn.getAttribute('data-paket');
            const original = btn.getAttribute('data-original') || btn.getAttribute('data-harga');
            const harga = btn.getAttribute('data-harga');
            window.location.href = `billing.html?paket=${paket}&original=${original}&harga=${harga}`;
        });
    });
});
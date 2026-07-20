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
        if (profile && (profile.role === 'silver' || profile.role === 'gold')) {
            const activeBtn = document.querySelector(`.btn-pilih-paket[data-paket="${profile.role}"]`);
            if (activeBtn) {
                activeBtn.textContent = 'Paket Aktif';
                activeBtn.disabled = true;
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
            const harga = btn.getAttribute('data-harga');
            window.location.href = `billing.html?paket=${paket}&harga=${harga}`;
        });
    });
});
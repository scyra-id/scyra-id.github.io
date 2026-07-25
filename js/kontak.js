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
        // =============================================
        // === STATE: USER LOGIN ===
        // =============================================
        document.body.classList.add('dashboard-page');
        
        // Sembunyikan elemen guest (Gak di-fetch jadi aman)
        if (guestHeader) guestHeader.style.display = 'none';
        if (guestFooter) guestFooter.style.display = 'none';
        
        // Tampilkan dashboard layout (main.js akan otomatis fetch sidebar & topbar ke placeholder)
        if (dashboardLayout) dashboardLayout.style.display = 'flex';
        
        // Pindahkan konten utama ke dalam dashboard-body
        const dashboardBody = document.getElementById('dashboard-body-target');
        if (dashboardBody && pageContent) {
            dashboardBody.appendChild(pageContent);
        }

    } else {
        // =============================================
        // === STATE: GUEST ===
        // =============================================
        document.body.classList.remove('dashboard-page');
        
        // Sembunyikan dashboard layout
        if (dashboardLayout) dashboardLayout.style.display = 'none';
        
        // Fetch header & footer manual dari folder components/
        if (guestHeader) {
            fetch('components/header.html')
                .then(res => res.text())
                .then(html => {
                    guestHeader.innerHTML = html;
                    document.dispatchEvent(new Event('headerLoaded')); // Trigger session.js
                })
                .catch(err => console.error('Gagal load header:', err));
        }
        if (guestFooter) {
            fetch('components/footer.html')
                .then(res => res.text())
                .then(html => { 
                    guestFooter.innerHTML = html; 
                })
                .catch(err => console.error('Gagal load footer:', err));
        }
    }
});
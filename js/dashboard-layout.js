// js/dashboard-layout.js

document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggleSidebarBtn');
    const overlay = document.getElementById('sidebar-overlay');

    // 1. Logika Klik Desktop (Tutup/Buka Lebar Sidebar)
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }

    // 2. 🚨 LOGIKA HAMBURGER MOBILE (PAKAI EVENT DELEGATION)
    // Ini memastikan tombol tetap bisa diklik meski topbar loading lama
    document.addEventListener('click', (e) => {
        // Cek apakah yang diklik adalah tombol hamburger atau anaknya
        const mobileBtn = e.target.closest('#mobileSidebarBtn');
        if (mobileBtn) {
            if (sidebar && overlay) {
                sidebar.classList.toggle('mobile-open');
                overlay.classList.toggle('active');
            }
        }
    });

    // 3. Klik Overlay untuk Tutup Sidebar
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('active');
        });
    }
});
// ==========================================
// 1. TEMA (Jalankan Sync agar tidak kedip)
// ==========================================
(function() {
    const savedTheme = localStorage.getItem('scyra_theme') || localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.classList.add('dark-mode');
    }
})();

// ==========================================
// 2. SCYRA MODAL INJECTOR (Global Alert/Confirm)
// ==========================================
function injectScyraModal() {
    if (document.getElementById('scyraModal')) return;
    const modalHTML = `
    <div id="scyraModal" class="scyra-modal">
        <div class="scyra-modal-box">
            <div class="scyra-modal-icon" id="modalIcon">✅</div>
            <h3 id="modalTitle">Info</h3>
            <div id="modalMessage" style="margin-bottom:1.5rem; color:var(--text-secondary); line-height:1.6; font-size:1rem;">Pesan</div>
            <div class="scyra-modal-actions">
                <button id="modalBtnCancel" class="btn-modal cancel" style="display:none;">Batal</button>
                <button id="modalBtnOk" class="btn-modal ok">Mengerti</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}
// Eksekusi injeksi modal saat web dimuat
document.addEventListener('DOMContentLoaded', injectScyraModal);

window.showScyraAlert = function(message, title = "Info", icon = "✅") {
    return new Promise((resolve) => {
        let modal = document.getElementById('scyraModal');
        
        // Paksa injeksi jika modal belum ada di HTML
        if(!modal) { 
            injectScyraModal(); 
            modal = document.getElementById('scyraModal'); 
        }

        // Fallback terakhir kalau document.body belum siap sama sekali
        if (!modal) {
            alert(message.replace(/<[^>]*>?/gm, '')); // Bersihkan tag HTML untuk alert asli
            return resolve(true);
        }
        
        // 🚨 PENTING: Gunakan innerHTML agar tag <br> dan style terbaca!
        document.getElementById('modalIcon').innerHTML = icon;
        document.getElementById('modalTitle').innerHTML = title;
        document.getElementById('modalMessage').innerHTML = message; 
        
        const btnOk = document.getElementById('modalBtnOk');
        const btnCancel = document.getElementById('modalBtnCancel');
        
        btnCancel.style.display = 'none';
        btnOk.textContent = 'Mengerti';
        
        modal.classList.add('active');
        
        btnOk.onclick = () => { 
            modal.classList.remove('active'); 
            resolve(true); 
        };
    });
};

window.showScyraConfirm = function(message, title = "Konfirmasi", icon = "❓") {
    return new Promise((resolve) => {
        let modal = document.getElementById('scyraModal');
        
        if(!modal) { 
            injectScyraModal(); 
            modal = document.getElementById('scyraModal'); 
        }

        if(!modal) {
            const ans = confirm(message.replace(/<[^>]*>?/gm, ''));
            return resolve(ans);
        }

        document.getElementById('modalIcon').innerHTML = icon;
        document.getElementById('modalTitle').innerHTML = title;
        document.getElementById('modalMessage').innerHTML = message;
        
        const btnOk = document.getElementById('modalBtnOk');
        const btnCancel = document.getElementById('modalBtnCancel');
        
        btnCancel.style.display = 'inline-block';
        btnOk.textContent = 'Ya, Lanjutkan';
        btnCancel.textContent = 'Batal';
        
        modal.classList.add('active');
        
        btnOk.onclick = () => { 
            modal.classList.remove('active'); 
            resolve(true); 
        };
        btnCancel.onclick = () => { 
            modal.classList.remove('active'); 
            resolve(false); 
        };
    });
};

// ==========================================
// 3. KOMPONEN MODULAR (Header, Sidebar, Topbar)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    
    // A. Landing Page: Fetch Header
    const headerPlaceholder = document.getElementById('header-placeholder');
    if (headerPlaceholder) {
        try {
            const resp = await fetch('components/header.html');
            headerPlaceholder.innerHTML = await resp.text();
            document.dispatchEvent(new Event('headerLoaded'));
        } catch (e) { console.error('Gagal load header:', e); }
    }

    // B. Dashboard: Fetch Sidebar
    const sidebarPlaceholder = document.getElementById('sidebar-placeholder');
    if (sidebarPlaceholder) {
        try {
            const resp = await fetch('components/sidebar.html');
            sidebarPlaceholder.innerHTML = await resp.text();
            initSidebarLogic(); 
        } catch (e) { console.error('Gagal load sidebar:', e); }
    }

    // C. Dashboard: Fetch Topbar
    const topbarPlaceholder = document.getElementById('topbar-placeholder');
    if (topbarPlaceholder) {
        try {
            const resp = await fetch('components/topbar.html');
            topbarPlaceholder.innerHTML = await resp.text();
            
            const pageTitle = document.title.split(' - ')[0] || 'Dashboard';
            const titleEl = document.getElementById('topbarTitle');
            if (titleEl) titleEl.textContent = pageTitle;

            document.dispatchEvent(new Event('topbarLoaded'));
            document.dispatchEvent(new Event('headerLoaded')); 
        } catch (e) { console.error('Gagal load topbar:', e); }
    }

    // D. Footer
    const footerPlaceholder = document.getElementById('footer-placeholder');
    if (footerPlaceholder) {
        try {
            const resp = await fetch('components/footer.html');
            footerPlaceholder.innerHTML = await resp.text();
        } catch (e) { console.error('Gagal load footer:', e); }
    }
});

// ==========================================
// 4. LOGIKA SIDEBAR (Collapse Desktop)
// ==========================================
function initSidebarLogic() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggleSidebarBtn');
    
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }

    const path = window.location.pathname;
    const navDashboard = document.getElementById('nav-dashboard');
    const navMateri = document.getElementById('nav-materi');
    const navTryout = document.getElementById('nav-tryout');
    const navRiwayat = document.getElementById('nav-riwayat');

    [navDashboard, navMateri, navTryout, navRiwayat].forEach(el => { if(el) el.classList.remove('active'); });

    if(path.includes('dashboard')) navDashboard?.classList.add('active');
    else if(path.includes('materi')) navMateri?.classList.add('active');
    else if(path.includes('tryout')) navTryout?.classList.add('active');
    else if(path.includes('riwayat')) navRiwayat?.classList.add('active');
    else navDashboard?.classList.add('active'); 
}

// Script mendeteksi scroll untuk memicu blur Topbar
document.addEventListener('DOMContentLoaded', () => {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.addEventListener('scroll', () => {
            const topbar = document.getElementById('topbar');
            if (topbar) {
                if (mainContent.scrollTop > 10) {
                    topbar.classList.add('scrolled'); 
                } else {
                    topbar.classList.remove('scrolled'); 
                }
            }
        });
    }
});

// Sensor scroll untuk Landing Page Header
window.addEventListener('scroll', () => {
    const siteHeader = document.querySelector('.site-header');
    if (siteHeader) {
        if (window.scrollY > 20) {
            siteHeader.classList.add('scrolled'); 
        } else {
            siteHeader.classList.remove('scrolled'); 
        }
    }
});
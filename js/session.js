// Gambar fallback (Sage Green SVG) anti error 404
const GENERIC_AVATAR = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzg3QTg3OCI+PGNpcmNsZSBjeD0iMTIiIGN5PSI4IiByPSI0Ii8+PHBhdGggZD0iTTEyIDE0Yy02LjEgMC0xMCA0LTEwIDEwaDIwYzAtNi0zLjktMTAtMTAtMTB6Ii8+PC9zdmc+";

async function initScyraSession() {
    await checkAuthState();
}

// 1. PASANG TELINGA (Event Delegation) sejak awal, mencakup Header, Sidebar & Topbar
setupHeaderInteractions();

// 2. TRIGGER TARIK DATA AUTH JIKA HTML SUDAH MUNCUL ATAL SAAT KOMPONEN DI-LOAD
if (document.getElementById('profile-area') || document.getElementById('sidebarName')) {
    initScyraSession();
}

// 💡 Tangkap sinyal dari main.js saat komponen di-fetch
document.addEventListener('headerLoaded', initScyraSession);
document.addEventListener('topbarLoaded', initScyraSession);
document.addEventListener('sidebarLoaded', initScyraSession); // 👈 TAMBAHAN BARU

async function checkAuthState() {
    try {
        if (!window.db) return;
        const { data: { user }, error: authError } = await window.db.auth.getUser();

        const guestArea = document.getElementById('guest-area');
        const profileArea = document.getElementById('profile-area');
        const mobileGuestArea = document.getElementById('mobile-guest-area');
        const mobileProfileArea = document.getElementById('mobile-profile-area');
        const logoutBtnMobile = document.getElementById('logout-btn-mobile');

        // STATE 1: GUEST
        if (authError || !user) {
            if (guestArea) guestArea.style.display = 'flex';
            if (profileArea) profileArea.classList.remove('active'); 
            if (mobileGuestArea) mobileGuestArea.style.display = 'flex';
            if (mobileProfileArea) mobileProfileArea.style.display = 'none';
            if (logoutBtnMobile) logoutBtnMobile.style.display = 'none';
            return;
        }

        // STATE 2: LOGGED IN
        if (guestArea) guestArea.style.display = 'none';
        if (profileArea) profileArea.classList.add('active'); 
        if (mobileGuestArea) mobileGuestArea.style.display = 'none';
        if (mobileProfileArea) mobileProfileArea.style.display = 'block';
        if (logoutBtnMobile) logoutBtnMobile.style.display = 'block';

        // Set email fallback cepat
        document.querySelectorAll('#dropdownEmail, #mobileEmail').forEach(el => el.textContent = user.email);

        // Tarik data profil dari Supabase
        const { data: profile } = await window.db.from('profiles').select('*').eq('id', user.id).single();

        if (profile) {
            window.userRole = profile.role; 
            
            const finalAvatarUrl = profile.avatar_url ? profile.avatar_url : GENERIC_AVATAR;
            
            // 💡 TAMBAHAN: Masukkan #sidebarAvatar
            document.querySelectorAll('#headerAvatar, #dropdownAvatar, #mobileAvatar, #sidebarAvatar').forEach(el => {
                if (el) el.src = finalAvatarUrl;
            });
            
            // 💡 TAMBAHAN: Masukkan #sidebarName
            const namaTampilan = profile.full_name || profile.username || user.email.split('@')[0];
            document.querySelectorAll('#dropdownName, #mobileName, #sidebarName').forEach(el => {
                if (el) el.textContent = namaTampilan;
            });

            // 💡 TAMBAHAN: Role Admin untuk Sidebar (#sidebar-admin-link)
            if (profile.role === 'admin') {
                const adminLink = document.getElementById('admin-link');
                const mobileAdminLink = document.getElementById('mobile-admin-link');
                const sidebarAdminLink = document.getElementById('sidebar-admin-link');
                if (adminLink) adminLink.style.display = 'flex';
                if (mobileAdminLink) mobileAdminLink.style.display = 'block';
                if (sidebarAdminLink) sidebarAdminLink.style.display = 'flex';
            }
        }
    } catch (err) {
        console.error("Scyra Session Error:", err.message);
    }
}

// =========================================================================
// JURUS EVENT DELEGATION
// =========================================================================
function setupHeaderInteractions() {
    
    document.addEventListener('click', async (e) => {
        
        // A. LOGIKA TEMA (Dark Mode)
        const themeBtn = e.target.closest('#themeToggleBtn');
        if (themeBtn) {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('scyra_theme', isDark ? 'dark' : 'light');
            
            const themeIcon = document.getElementById('themeIcon');
            if (themeIcon) {
                themeIcon.textContent = isDark ? '☀️' : '🌙';
            }
            return;
        }

        // B. LOGIKA DROPDOWN PROFIL HEADER
        const avatarBtn = e.target.closest('#headerAvatarBtn');
        const dropdown = document.getElementById('profile-dropdown');
        
        if (avatarBtn) {
            dropdown?.classList.toggle('active');
        } else if (!e.target.closest('.profile-dropdown-container')) {
            dropdown?.classList.remove('active');
        }

        // 💡 C. LOGIKA DROPDOWN PROFIL SIDEBAR (TAMBAHAN BARU)
        const sidebarProfileBtn = e.target.closest('#sidebarProfileBtn');
        const sidebarDropdown = document.getElementById('sidebarProfileDropdown');

        if (sidebarProfileBtn) {
            sidebarDropdown?.classList.toggle('active');
            return;
        } else if (!e.target.closest('.sidebar-footer')) {
            sidebarDropdown?.classList.remove('active');
        }

        // D. LOGIKA HAMBURGER MENU
        const hamburgerBtn = e.target.closest('#hamburgerBtn') || e.target.closest('#mainSidebarBtn');
        const mobileDrawer = document.getElementById('mobile-drawer'); 
        const sidebar = document.getElementById('sidebar'); 
        const backdrop = document.getElementById('drawer-backdrop') || document.getElementById('sidebar-overlay');

        if (hamburgerBtn) {
            if (window.innerWidth <= 992) {
                sidebar?.classList.toggle('mobile-open');
                mobileDrawer?.classList.toggle('active');
                backdrop?.classList.toggle('active');
            } else {
                sidebar?.classList.toggle('collapsed');
                
                if (sidebar?.classList.contains('collapsed')) {
                    sessionStorage.setItem('sidebarState', 'collapsed');
                } else {
                    sessionStorage.setItem('sidebarState', 'open');
                }
            }
            return;
        } else if (backdrop && e.target === backdrop) {
            sidebar?.classList.remove('mobile-open');
            mobileDrawer?.classList.remove('active');
            backdrop.classList.remove('active');
        }

        // 💡 E. LOGIKA LOGOUT (Diberi tambahan #logout-btn-sidebar)
        const logoutBtn = e.target.closest('#logout-btn-desktop') || 
                          e.target.closest('#logout-btn-mobile') || 
                          e.target.closest('#logout-btn-sidebar');

        if (logoutBtn) {
            e.preventDefault();
            const konfirmasi = typeof window.showScyraConfirm === 'function' 
                ? await window.showScyraConfirm("Apakah kamu yakin ingin keluar dari Scyra?")
                : confirm("Apakah kamu yakin ingin keluar dari Scyra?");
                
            if (konfirmasi) {
                if (window.db) {
                    await window.db.auth.signOut();
                    window.location.href = 'index.html';
                }
            }
        }
    });
}

// AUTO-RESTORE SIDEBAR STATE
document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver((mutations, obs) => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            const savedState = sessionStorage.getItem('sidebarState');
            if (savedState === 'collapsed' && window.innerWidth > 992) {
                sidebar.classList.add('collapsed');
            }
            obs.disconnect(); 
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
});

// HELPER FUNCTION: VALIDASI AKSES PAKET
window.hasAccess = async function(requiredRole) {
    if (!window.db) return false;
    
    const { data: { user } } = await window.db.auth.getUser();
    if (!user) return false;
    
    const { data: profile } = await window.db.from('profiles').select('role').eq('id', user.id).single();
    if (!profile) return false;
    
    const roleHierarchy = {
        'user': 1,
        'silver': 2,
        'gold': 3,
        'admin': 4
    };
    
    const userRoleLevel = roleHierarchy[profile.role] || 0;
    const requiredRoleLevel = roleHierarchy[requiredRole] || 0;
    
    return userRoleLevel >= requiredRoleLevel;
};
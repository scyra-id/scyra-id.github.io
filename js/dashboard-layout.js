/**
 * =============================================
 * DASHBOARD LAYOUT CONTROLLER
 * =============================================
 * Menangani interaksi sidebar footer profile dropdown
 * dan logout functionality
 */

// Gambar fallback (Sage Green SVG) anti error 404
const SIDEBAR_GENERIC_AVATAR = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzg3QTg3OCI+PGNpcmNsZSBjeD0iMTIiIGN5PSI4IiByPSI0Ii8+PHBhdGggZD0iTTEyIDE0Yy02LjEgMC0xMCA0LTEwIDEwaDIwYzAtNi0zLjktMTAtMTAtMTB6Ii8+PC9zdmc+";

console.log('🔧 dashboard-layout.js loaded');

// Flag untuk memastikan init hanya dipanggil sekali
let isInitialized = false;

// Tunggu sidebar dimuat (karena di-fetch secara dinamis)
const initWhenReady = () => {
    if (isInitialized) {
        console.log('⚠️ Already initialized, skipping...');
        return;
    }
    if (document.getElementById('sidebarProfileBtn')) {
        console.log('✅ Sidebar found immediately, initializing...');
        initSidebarFooter();
    } else {
        console.log('⏳ Sidebar not found yet, waiting for sidebarLoaded event...');
        
        // Listen untuk event dari main.js
        document.addEventListener('sidebarLoaded', () => {
            console.log('📡 sidebarLoaded event received');
            initSidebarFooter();
        });
        
        // Fallback: gunakan MutationObserver untuk menunggu elemen sidebar
        const observer = new MutationObserver((mutations, obs) => {
            if (document.getElementById('sidebarProfileBtn')) {
                console.log('👀 MutationObserver detected sidebar');
                obs.disconnect();
                initSidebarFooter();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
};

// Tunggu DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhenReady);
} else {
    initWhenReady();
}

async function initSidebarFooter() {
    console.log('🚀 initSidebarFooter() called');
    
    if (isInitialized) {
        console.log('⚠️ Already initialized in this function, aborting');
        return;
    }
    
    const sidebarProfileBtn = document.getElementById('sidebarProfileBtn');
    const sidebarProfileDropdown = document.getElementById('sidebarProfileDropdown');
    
    if (!sidebarProfileBtn) {
        console.warn('❌ sidebarProfileBtn not found, aborting');
        return;
    }

    console.log('✅ Sidebar elements found');
    
    // Set flag agar tidak init ulang
    isInitialized = true;

    // Toggle dropdown - pasang di awal agar pasti terpasang
    sidebarProfileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebarProfileBtn.classList.toggle('active');
        sidebarProfileDropdown?.classList.toggle('active');
        console.log('🔽 Dropdown toggled');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!sidebarProfileBtn.contains(e.target) && !sidebarProfileDropdown?.contains(e.target)) {
            sidebarProfileBtn.classList.remove('active');
            sidebarProfileDropdown?.classList.remove('active');
        }
    });

    console.log('✅ Dropdown event listeners attached');

    // Tunggu Supabase client ready
    await waitForDb();
    console.log('✅ Supabase client ready');
    
    // Check authentication
    const { data: { user }, error: authError } = await window.db.auth.getUser();
    if (!user || authError) {
        console.warn('❌ No user authenticated');
        return;
    }

    console.log('✅ User authenticated:', user.email);

    // Load user profile (sama seperti session.js)
    try {
        const { data: profile, error: profileError } = await window.db
            .from('profiles')
            .select('full_name, username, avatar_url, role')
            .eq('id', user.id)
            .single();

        if (profileError) throw profileError;

        if (profile) {
            console.log('✅ Profile loaded:', profile);
            
            // Set nama (priority: full_name > username > email prefix)
            const namaTampilan = profile.full_name || profile.username || user.email.split('@')[0];
            const sidebarName = document.getElementById('sidebarName');
            if (sidebarName) {
                sidebarName.textContent = namaTampilan;
                console.log('✅ Sidebar name set to:', namaTampilan);
            }

            // Set avatar (sama seperti session.js)
            const finalAvatarUrl = profile.avatar_url || SIDEBAR_GENERIC_AVATAR;
            const sidebarAvatar = document.getElementById('sidebarAvatar');
            if (sidebarAvatar) {
                sidebarAvatar.src = finalAvatarUrl;
                console.log('✅ Sidebar avatar set');
            }

            // Show admin link if user is admin
            if (profile.role === 'admin') {
                const adminLink = document.getElementById('sidebar-admin-link');
                if (adminLink) {
                    adminLink.style.display = 'flex';
                    console.log('✅ Admin link shown');
                }
            }
        }
    } catch (err) {
        console.error('❌ Error loading sidebar profile:', err);
    }

    // Load credit amount (sama seperti loadCreditDisplay di main.js)
    try {
        const db = window.dbPayment || window.db;
        
        // Ensure auth is synced before querying payment DB
        if (window.syncAuthToPaymentDB && !window._authSyncedToPaymentDB) {
            await window.syncAuthToPaymentDB();
        }
        
        const { data: creditData, error: creditError } = await db
            .from('user_credits')
            .select('total_credits, bonus_credits, used_credits')
            .eq('user_id', user.id)
            .single();

        let totalCredit = 0;
        if (creditData && !creditError) {
            totalCredit = (creditData.total_credits || 0) + (creditData.bonus_credits || 0) - (creditData.used_credits || 0);
            console.log('✅ Credit loaded:', totalCredit);
        } else if (creditError) {
            console.warn('⚠️ Credit error:', creditError.message);
        }

        const sidebarCreditAmount = document.getElementById('sidebarCreditAmount');
        if (sidebarCreditAmount) {
            sidebarCreditAmount.textContent = totalCredit;
            console.log('✅ Sidebar credit amount set to:', totalCredit);
        }
    } catch (err) {
        console.warn('⚠️ Sidebar credit load failed (non-critical):', err.message);
        const sidebarCreditAmount = document.getElementById('sidebarCreditAmount');
        if (sidebarCreditAmount) sidebarCreditAmount.textContent = '0';
    }

    // Logout handler
    const logoutBtn = document.getElementById('logout-btn-sidebar');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
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
        });
        console.log('✅ Logout handler attached');
    }

    console.log('✅ Sidebar footer initialization complete');
}

function waitForDb() {
    return new Promise((resolve) => {
        const check = () => {
            if (window.db) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}
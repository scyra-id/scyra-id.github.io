// ==========================================
// 🚀 SMART ROUTER (PENGATUR LALU LINTAS)
// ==========================================
async function checkAuthAndRoute() {
    const loadingScreen = document.getElementById('auth-loading');
    
    // Tunggu koneksi Supabase siap
    if (!window.db) {
        setTimeout(checkAuthAndRoute, 100); 
        return;
    }

    // Cek Session (Lebih akurat untuk auto-login)
    const { data: { session } } = await window.db.auth.getSession();

    if (session) {
        // 👑 KONDISI 1: USER SUDAH LOGIN
        // Langsung teleportasi ke Dashboard tanpa memuat Landing Page
        window.location.href = 'dashboard.html';
    } else {
        // 👤 KONDISI 2: USER BELUM LOGIN (TAMU)
        // Buka tirai loading dan tampilkan Landing Page
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
            setTimeout(() => loadingScreen.remove(), 500); // Hapus dari memori
        }
        if (typeof initMascotGreeting === 'function') initMascotGreeting();
    }
}

// ==========================================
// 🚀 HANDLER TOMBOL "MULAI BELAJAR"
// ==========================================
function handleMulaiBelajar(event) {
    event.preventDefault();

    // Cek apakah survey aktif
    window.db.from('survey_settings')
        .select('setting_value')
        .eq('setting_key', 'survey_active')
        .single()
        .then(({ data }) => {
            const surveyActive = data && data.setting_value === true;
            
            if (surveyActive) {
                // Cek apakah user sudah isi survey
                const hasSurveyDone = localStorage.getItem('scyra_survey_done');
                if (!hasSurveyDone) {
                    // Belum isi survey → arahkan ke survey
                    window.location.href = 'survey.html';
                    return;
                }
            }
            
            // Survey nonaktif ATAU sudah isi survey → fungsi normal
            const hasRegisteredBefore = localStorage.getItem('scyra_has_registered');
            const supabaseAuthToken = localStorage.getItem('sb-qqouccbtjywanmgktdty-auth-token');
            let hasSupabaseData = false;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('sb-') && key.includes('auth')) {
                    hasSupabaseData = true;
                    break;
                }
            }
            
            if (hasRegisteredBefore || supabaseAuthToken || hasSupabaseData) {
                window.location.href = 'login.html';
            } else {
                window.location.href = 'register.html';
            }
        })
        .catch(() => {
            // Fallback: fungsi normal
            const hasRegisteredBefore = localStorage.getItem('scyra_has_registered');
            const supabaseAuthToken = localStorage.getItem('sb-qqouccbtjywanmgktdty-auth-token');
            let hasSupabaseData = false;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('sb-') && key.includes('auth')) {
                    hasSupabaseData = true;
                    break;
                }
            }
            
            if (hasRegisteredBefore || supabaseAuthToken || hasSupabaseData) {
                window.location.href = 'login.html';
            } else {
                window.location.href = 'register.html';
            }
        });
}

// ==========================================
// SIMPAN STATUS REGISTRASI SAAT USER REGISTER
// ==========================================
function setUserRegistered(email) {
    localStorage.setItem('scyra_has_registered', 'true');
    localStorage.setItem('scyra_saved_email', email);
}

// Fungsi untuk clear status (logout)
function clearUserStatus() {
    localStorage.removeItem('scyra_has_registered');
    localStorage.removeItem('scyra_saved_email');
}

// ==========================================
// EXPORT KE GLOBAL WINDOW
// ==========================================
window.handleMulaiBelajar = handleMulaiBelajar;
window.setUserRegistered = setUserRegistered;
window.clearUserStatus = clearUserStatus;

// Jalankan Smart Router segera setelah HTML dimuat
document.addEventListener('DOMContentLoaded', checkAuthAndRoute);

// Fallback: Remove auth-loading after 3 seconds if still stuck
setTimeout(() => {
    const loadingScreen = document.getElementById('auth-loading');
    if (loadingScreen && !loadingScreen.classList.contains('hidden')) {
        console.warn('Auth check timeout - removing loading screen');
        loadingScreen.classList.add('hidden');
        setTimeout(() => loadingScreen.remove(), 500);
        if (typeof initMascotGreeting === 'function') initMascotGreeting();
    }
}, 3000);

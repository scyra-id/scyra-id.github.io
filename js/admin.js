document.addEventListener('DOMContentLoaded', async () => {
    const checkAdminAccess = async () => {
        if (!window.db) return setTimeout(checkAdminAccess, 100); // Tunggu koneksi
        
        const { data: { user } } = await window.db.auth.getUser();
        
        // 1. Cek Login
        if (!user) {
            alert('⛔ Akses Ditolak: Kamu harus login terlebih dahulu.');
            window.location.href = 'login.html';
            return;
        }
        
        // 2. Cek Role di Database SQL (Tabel profiles)
        const { data: profile, error } = await window.db
            .from('profiles')
            .select('role, full_name')
            .eq('id', user.id)
            .single();
            
        // 3. Validasi Role
        if (error || !profile || profile.role !== 'admin') {
            alert('⛔ Akses Ditolak: Halaman ini khusus untuk Administrator.');
            window.location.href = 'index.html';
            return;
        }
        
        // 4. Lolos verifikasi: Munculkan konten, matikan loading
        const adminContent = document.getElementById('admin-content');
        const adminLoading = document.getElementById('admin-loading');
        
        // KUNCI PERBAIKAN LAYOUT: Kembalikan ke 'grid' atau hapus paksaan display-nya
        if (adminContent) adminContent.style.display = 'grid'; 
        if (adminLoading) adminLoading.style.display = 'none';
        
        // 5. Tampilkan sapaan (Hanya jalankan jika elemennya ada di HTML)
        const greetingEl = document.getElementById('adminGreeting');
        if (greetingEl) {
            greetingEl.textContent = `Selamat datang, ${profile.full_name || 'Admin'}! Siap mengatur sistem...`;
        }

        // 6. Inisialisasi fitur Reset Tryout
        initResetTryout();

        // 7. Inisialisasi Kontrol Gamifikasi
        initGamificationControl();
    };

    checkAdminAccess();
});

// ==========================================
// FITUR RESET TRYOUT (KHUSUS ADMIN)
// ==========================================
function initResetTryout() {
    const userSelect = document.getElementById('resetUserSelect');
    const btnReset = document.getElementById('btnResetTryout');
    const resetResult = document.getElementById('resetResult');

    if (!userSelect || !btnReset) return;

    loadUsersForReset(userSelect);

    btnReset.addEventListener('click', async () => {
        const userId = userSelect.value;
        if (!userId) {
            showResetResult('Pilih user terlebih dahulu.', 'error');
            return;
        }

        const userName = userSelect.options[userSelect.selectedIndex].text;
        const konfirmasi = await showScyraConfirm(
            `Yakin ingin reset semua hasil tryout milik <strong>${userName}</strong>?<br>Data yang dihapus tidak bisa dikembalikan.`,
            'Konfirmasi Reset Tryout', '⚠️'
        );

        if (!konfirmasi) return;

        try {
            btnReset.disabled = true;
            btnReset.textContent = '⏳ Mereset...';

            const { error } = await window.db
                .from('hasil_tryout')
                .delete()
                .eq('user_id', userId);

            if (error) throw error;

            showResetResult(`Berhasil reset hasil tryout milik ${userName}.`, 'success');
        } catch (err) {
            console.error(err);
            showResetResult('Gagal reset: ' + err.message, 'error');
        } finally {
            btnReset.disabled = false;
            btnReset.textContent = 'Reset Hasil Tryout';
        }
    });
}

async function loadUsersForReset(selectEl) {
    try {
        const { data: users, error } = await window.db
            .from('profiles')
            .select('id, full_name, username, email')
            .order('full_name');

        if (error) throw error;

        selectEl.innerHTML = '<option value="">-- Pilih User --</option>';
        if (!users || users.length === 0) return;

        users.forEach(u => {
            const label = u.full_name || u.username || u.email || u.id;
            selectEl.innerHTML += `<option value="${u.id}">${label}</option>`;
        });
    } catch (err) {
        console.error('Gagal load users:', err);
        selectEl.innerHTML = '<option value="">Gagal memuat user</option>';
    }
}

function showResetResult(message, type) {
    const resetResult = document.getElementById('resetResult');
    if (!resetResult) return;
    resetResult.textContent = message;
    resetResult.style.color = type === 'success' ? 'var(--success)' : 'var(--error)';
    resetResult.style.display = 'block';
    setTimeout(() => { resetResult.style.display = 'none'; }, 5000);
}

// ==========================================
// KONTROL SISTEM GAMIFIKASI (ADMIN)
// ==========================================
async function initGamificationControl() {
    const toggle = document.getElementById('gamificationToggle');
    if (!toggle) return;

    const track = document.getElementById('gamificationToggleTrack');
    const thumb = document.getElementById('gamificationToggleThumb');
    const badge = document.getElementById('gamificationBadgeStatus');
    const title = document.getElementById('gamificationToggleTitle');
    const subtext = document.getElementById('gamificationToggleSubtext');

    function updateToggleUI(isActive) {
        if (isActive) {
            toggle.checked = true;
            if (track) track.style.background = 'var(--brand-primary)';
            if (thumb) thumb.style.transform = 'translateX(26px)';
            if (badge) {
                badge.textContent = '🟢 AKTIF PENUH';
                badge.style.background = 'rgba(74, 222, 128, 0.15)';
                badge.style.color = '#16a34a';
                badge.style.borderColor = 'rgba(74, 222, 128, 0.3)';
            }
            if (title) title.textContent = 'Gamifikasi Aktif';
            if (subtext) subtext.textContent = 'XP, Level, Studio & Trofi berjalan penuh';
        } else {
            toggle.checked = false;
            if (track) track.style.background = 'var(--border-color)';
            if (thumb) thumb.style.transform = 'translateX(3px)';
            if (badge) {
                badge.textContent = '🔴 COMING SOON';
                badge.style.background = 'rgba(239, 68, 68, 0.15)';
                badge.style.color = '#ef4444';
                badge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            }
            if (title) title.textContent = 'Mode Coming Soon';
            if (subtext) subtext.textContent = 'Streak tetap aktif, XP & Level freeze';
        }
    }

    // 1. Baca status saat ini
    let currentActive = false;
    try {
        if (window.ScyraGamificationConfig) {
            currentActive = await window.ScyraGamificationConfig.isEnabled(true);
        }
    } catch (e) {
        console.warn('Gagal memuat status gamifikasi:', e);
    }
    updateToggleUI(currentActive);

    // 2. Handle interaksi toggle
    toggle.onchange = async (e) => {
        const nextState = e.target.checked;
        toggle.disabled = true;

        try {
            if (window.ScyraGamificationConfig) {
                await window.ScyraGamificationConfig.setEnabled(nextState);
            }
            currentActive = nextState;
            updateToggleUI(currentActive);

            if (typeof showScyraAlert === 'function') {
                await showScyraAlert(
                    nextState
                        ? 'Sistem Gamifikasi Berhasil Diaktifkan Penuh! Pengguna kini bisa mendapatkan XP, naik level, dan mengkustomisasi avatar.'
                        : 'Sistem Gamifikasi Disetel ke Mode Coming Soon. XP dibekukan, namun Daily Streak pengguna tetap aktif berjalan.',
                    nextState ? '🎮 Gamifikasi Aktif' : '⏳ Mode Coming Soon Aktif',
                    nextState ? '🚀' : '🔒'
                );
            }
        } catch (err) {
            console.error('Gagal memperbarui status gamifikasi:', err);
            updateToggleUI(currentActive);
            if (typeof showScyraAlert === 'function') {
                await showScyraAlert('Gagal mengubah pengaturan: ' + (err.message || err), '⚠️ Gagal', '❌');
            } else {
                alert('Gagal mengubah pengaturan: ' + (err.message || err));
            }
        } finally {
            toggle.disabled = false;
        }
    };
}

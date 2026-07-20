document.addEventListener('DOMContentLoaded', async () => {
    let userId = null;
    const checkUser = setInterval(async () => {
        if (window.db) {
            clearInterval(checkUser);
            const { data: { user } } = await window.db.auth.getUser();
            if (!user) { window.location.href = 'login.html'; return; }
            userId = user.id;
            
            if (document.getElementById('katalogTryout')) initKatalog();
            if (document.getElementById('subtestContainer')) initDetailTryout();
        }
    }, 100);

    // ==========================================
    // HALAMAN 1: KATALOG TRYOUT (SENSOR WAKTU)
    // ==========================================
    async function initKatalog() {
        const container = document.getElementById('katalogTryout');
        try {
            // Tarik data asli dari DB (hanya yang statusnya 'aktif')
            const { data, error } = await window.db.from('paket_tryout')
                .select('*, subtes_tryout(count)')
                .eq('status', 'aktif')
                .order('waktu_mulai', { ascending: true });
            
            if (error) throw error;
            if (!data || data.length === 0) {
                container.innerHTML = `<p style="color:var(--text-secondary);">Belum ada tryout yang tersedia saat ini.</p>`;
                return;
            }

            let html = '';
            const sekarang = new Date();

            data.forEach(to => {
                const mulai = new Date(to.waktu_mulai);
                const selesai = new Date(to.waktu_selesai);
                const jmlSubtes = to.subtes_tryout[0]?.count || 0;
                
                let isLocked = true;
                let statusLabel = "";
                let bgGradient = "linear-gradient(90deg, #e53935, #ff8a65)"; // Merah (Kunci)
                let opacityCard = "0.7"; 
                let clickAction = `onclick="showScyraAlert('Tryout ini sedang dikunci. Perhatikan jadwal pelaksanaannya!', '🔒 Terkunci', '⚠️')"`;

                // Logika Waktu
                if (sekarang < mulai) {
                    statusLabel = `🔒 Belum Dimulai (Buka: ${formatTgl(mulai)})`;
                } else if (sekarang > selesai) {
                    statusLabel = `🔒 Sudah Berakhir (Tutup: ${formatTgl(selesai)})`;
                } else {
                    isLocked = false;
                    statusLabel = `🟢 Bisa Dikerjakan (Sisa waktu sampai ${formatTgl(selesai)})`;
                    bgGradient = "linear-gradient(90deg, var(--brand-primary), var(--warning))"; // Sage/Orange (Buka)
                    opacityCard = "1";
                    clickAction = `onclick="window.location.href='detail-tryout.html?id=${to.id}'"`;
                }

                html += `
                <div class="to-card" style="opacity: ${opacityCard}; ${isLocked ? 'cursor: not-allowed;' : 'cursor: pointer;'}" ${clickAction}>
                    <div class="to-title">${to.nama_paket} ${isLocked ? '🔒' : ''}</div>
                    <div class="to-subtitle">${jmlSubtes} Subtes Tersedia</div>
                    
                    <div class="to-meta">
                        <span style="font-weight: 600; color: ${isLocked ? 'var(--error)' : 'var(--brand-primary-dark)'};">${statusLabel}</span>
                    </div>
                    
                    <div class="led-container">
                        <div class="led-bar" style="background: ${bgGradient}; width: 100%;"></div>
                    </div>
                </div>`;
            });
            container.innerHTML = html;

        } catch (err) {
            container.innerHTML = `<p style="color:var(--error);">Gagal memuat katalog: ${err.message}</p>`;
        }
    }

    // ==========================================
    // HALAMAN 2: DETAIL PERSIAPAN (DOUBLE CHECK KEAMANAN)
    // ==========================================
    async function initDetailTryout() {
        const container = document.getElementById('subtestContainer');
        const urlParams = new URLSearchParams(window.location.search);
        const toId = urlParams.get('id');

        if (!toId) return window.location.href = 'tryout.html';

        try {
            // 1. Double check ke database (Cegah anak pinter maksa ngetik ID di URL)
            const { data: p, error: errP } = await window.db.from('paket_tryout').select('*').eq('id', toId).single();
            if (errP || !p) throw errP;

            const sekarang = new Date();
            if (sekarang < new Date(p.waktu_mulai) || sekarang > new Date(p.waktu_selesai)) {
                await showScyraAlert("Tryout ini sedang tidak dapat diakses saat ini.", "Terkunci", "🔒");
                return window.location.href = 'tryout.html';
            }

            // Ganti Judul
            document.getElementById('toTitle').textContent = p.nama_paket;

            // 2. Tarik Subtes
            const { data: subtesList, error: errSt } = await window.db.from('subtes_tryout')
                .select('*').eq('paket_id', toId);
            if (errSt) throw errSt;

            // Acak Subtes
            const subtesDiacak = subtesList.sort(() => Math.random() - 0.5);

            let html = '';
            subtesDiacak.forEach(st => {
                html += `
                <div class="subtest-item">
                    <div class="st-info">
                        <h4>${st.nama_subtes}</h4>
                        <div class="st-meta">
                            <span>⏱️ ${st.waktu_menit} Menit</span>
                            <span>📝 ${st.jml_soal} Soal</span>
                        </div>
                    </div>
                    <button onclick="mulaiUjian('${st.kategori_db}', ${st.jml_soal}, ${st.waktu_menit})" class="btn-primary-lg" style="padding: 0.6rem 2rem; font-size: 0.95rem;">
                        Mulai Ujian 🚀
                    </button>
                </div>`;
            });
            container.innerHTML = html;
        } catch (err) {
            container.innerHTML = `<p style="color:var(--error);">Gagal memuat subtes.</p>`;
        }
    }

    window.mulaiUjian = async (kategori, jmlSoal, waktuMenit) => {
        const konfirmasi = await showScyraConfirm(`Siap memulai subtes ini?<br>Waktu ${waktuMenit} menit akan berjalan.`, "Mulai Subtes?", "⏳");
        if(konfirmasi) {
            window.location.href = `ujian.html?kat=${kategori}&limit=${jmlSoal}&time=${waktuMenit}`;
        }
    }

    // Helper format Tgl Indonesia
    function formatTgl(dateObj) {
        return dateObj.toLocaleString('id-ID', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
    }
});
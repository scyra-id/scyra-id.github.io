document.addEventListener('DOMContentLoaded', async () => {
    // Cek User Login & Database
    const checkUser = setInterval(async () => {
        if (window.db) {
            clearInterval(checkUser);
            const { data: { user } } = await window.db.auth.getUser();
            if (!user) { window.location.href = 'login.html'; return; }

            if (document.getElementById('subtestContainer')) initDetailTryout(user);
        }
    }, 100);

    // Mapping default subtes UTBK (sampai tabel subtes tersedia di database)
    const subtesDefaults = {
        'Penalaran Umum': { kode: 'PU', waktu: 30, soal: 30 },
        'Pengetahuan Kuantitatif': { kode: 'PK', waktu: 20, soal: 15 },
        'Pemahaman Bacaan dan Menulis': { kode: 'PBM', waktu: 25, soal: 20 },
        'Pengetahuan dan Pemahaman Umum': { kode: 'PPU', waktu: 15, soal: 20 },
        'Literasi dalam Bahasa Indonesia': { kode: 'LBI', waktu: 45, soal: 30 },
        'Literasi dalam Bahasa Inggris': { kode: 'LBE', waktu: 30, soal: 20 },
        'Penalaran Matematika': { kode: 'PM', waktu: 30, soal: 20 }
    };

    // ==========================================
    // HALAMAN DETAIL TRYOUT
    // ==========================================
    async function initDetailTryout(user) {
        const container = document.getElementById('subtestContainer');
        const urlParams = new URLSearchParams(window.location.search);
        const toId = urlParams.get('id');

        if (!toId) {
            await showScyraAlert("Tryout tidak ditemukan!", "Oops", "⚠️");
            window.location.href = 'tryout.html';
            return;
        }

        container.innerHTML = '<p>⏳ Menyiapkan subtes...</p>';

        try {
            // 1. Ambil info paket tryout (kalau ada di database)
            const { data: paket, error: paketError } = await window.db
                .from('paket_tryout')
                .select('*')
                .eq('id', toId)
                .single();

            if (paket && !paketError) {
                const titleEl = document.getElementById('toTitle');
                if (titleEl) titleEl.textContent = paket.nama_paket || 'Tryout SNBT';
            }

            // 2. Ambil semua kategori UTBK sebagai subtes
            const { data: kategoriList, error: kategoriError } = await window.db
                .from('kategori')
                .select('*')
                .eq('jenjang', 'utbk')
                .order('nama_mapel');

            if (kategoriError) throw kategoriError;

            if (!kategoriList || kategoriList.length === 0) {
                container.innerHTML = '<p style="color:var(--error);">Belum ada subtes tersedia.</p>';
                return;
            }

            // 3. Bentuk data subtes dengan mapping default waktu & soal
            let subtesData = kategoriList.map(k => {
                const defaults = subtesDefaults[k.nama_mapel] || { kode: k.slug, waktu: 20, soal: 15 };
                return {
                    id: k.id,
                    nama: k.nama_mapel,
                    kode: defaults.kode,
                    waktu: defaults.waktu,
                    jml_soal: defaults.soal
                };
            });

            // 4. Load atau acak urutan subtes (persist per user + paket)
            const stateKey = `tryout_state_${user.id}_${toId}`;
            let savedState = localStorage.getItem(stateKey);
            let state;

            if (savedState) {
                state = JSON.parse(savedState);
                // Pastikan urutan subtes yang tersimpan masih valid
                const validIds = subtesData.map(s => s.id);
                state.order = state.order.filter(id => validIds.includes(id));
                // Tambahkan subtes baru kalau ada
                validIds.forEach(id => {
                    if (!state.order.includes(id)) state.order.push(id);
                });
                if (!state.completed) state.completed = [];
            } else {
                // ACAK URUTAN SAAT PERTAMA KALI MASUK
                state = {
                    order: subtesData.sort(() => Math.random() - 0.5).map(s => s.id),
                    completed: []
                };
                localStorage.setItem(stateKey, JSON.stringify(state));
            }

            // 5. Sinkronkan status selesai dari hasil_tryout (agar kalau localStorage hilang tetap valid)
            const { data: hasilData, error: hasilError } = await window.db
                .from('hasil_tryout')
                .select('kategori_id')
                .eq('user_id', user.id)
                .not('kategori_id', 'is', null);

            if (!hasilError && hasilData) {
                const completedIds = hasilData.map(h => h.kategori_id);
                state.completed = [...new Set([...state.completed, ...completedIds])];
                localStorage.setItem(stateKey, JSON.stringify(state));
            }

            // 6. Urutkan subtes sesuai state
            subtesData = state.order.map(id => subtesData.find(s => s.id === id)).filter(Boolean);

            // 7. Tentukan subtes aktif (paling atas yang belum selesai)
            const firstIncompleteIndex = subtesData.findIndex(s => !state.completed.includes(s.id));

            // 8. Render subtes
            let html = '';
            subtesData.forEach((st, index) => {
                const isCompleted = state.completed.includes(st.id);
                const isActive = index === firstIncompleteIndex;
                const isLocked = !isCompleted && !isActive;

                let btnText = 'Mulai Ujian 🚀';
                let btnClass = 'btn-primary-lg';
                let btnStyle = 'padding: 0.6rem 2rem; font-size: 0.95rem;';
                let btnOnclick = `onclick="mulaiUjian('${st.kode}', ${st.jml_soal}, ${st.waktu}, '${toId}')"`;
                let badge = '';

                if (isCompleted) {
                    btnText = 'Selesai ✓';
                    btnClass = 'btn-primary-lg';
                    btnStyle = 'padding: 0.6rem 2rem; font-size: 0.95rem; background: var(--success); cursor: not-allowed;';
                    btnOnclick = '';
                    badge = '<span class="badge" style="background: var(--success); color: white; margin-bottom: 0.5rem;">Selesai</span>';
                } else if (isLocked) {
                    btnText = 'Terkunci 🔒';
                    btnClass = 'btn-primary-lg';
                    btnStyle = 'padding: 0.6rem 2rem; font-size: 0.95rem; background: var(--text-muted); cursor: not-allowed;';
                    btnOnclick = '';
                    badge = '<span class="badge" style="background: var(--text-muted); color: white; margin-bottom: 0.5rem;">Terkunci</span>';
                }

                html += `
                <div class="subtest-item" style="opacity: ${isLocked ? '0.7' : '1'};">
                    <div class="st-info">
                        ${badge}
                        <h4>${st.nama}</h4>
                        <div class="st-meta">
                            <span>⏱️ ${st.waktu} Menit</span>
                            <span>📝 ${st.jml_soal} Soal</span>
                        </div>
                    </div>
                    <button ${btnOnclick} class="${btnClass}" style="${btnStyle}" ${isCompleted || isLocked ? 'disabled' : ''}>
                        ${btnText}
                    </button>
                </div>`;
            });

            container.innerHTML = html;

            // 9. Kalau semua selesai, tampilkan pesan khusus
            if (firstIncompleteIndex === -1) {
                container.innerHTML += `
                    <div style="text-align: center; padding: 2rem; background: var(--bg-secondary); border-radius: 16px; margin-top: 1rem;">
                        <h3>🎉 Selamat!</h3>
                        <p style="color: var(--text-secondary);">Kamu sudah menyelesaikan semua subtes. Silakan cek hasil di dashboard.</p>
                        <a href="dashboard.html" class="btn-primary-lg">Ke Dashboard</a>
                    </div>
                `;
            }

        } catch (err) {
            console.error(err);
            container.innerHTML = `<p style="color:var(--error);">Gagal memuat subtes: ${err.message}</p>`;
        }
    }

    // Fungsi trigger menuju ujian.html
    window.mulaiUjian = async (kategori, jmlSoal, waktuMenit, paketId) => {
        const konfirmasi = await showScyraConfirm(
            `Siap memulai subtes ini?<br>Waktu ${waktuMenit} menit akan berjalan.`,
            "Mulai Subtes?", "⏳"
        );
        if (konfirmasi) {
            window.location.href = `ujian.html?kat=${kategori}&limit=${jmlSoal}&time=${waktuMenit}&paket=${paketId}`;
        }
    };
});

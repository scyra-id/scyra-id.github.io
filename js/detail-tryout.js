document.addEventListener('DOMContentLoaded', async () => {
    // Credit icon HTML helper
    const CREDIT_ICON = `<img src="images/credit_icon.webp" alt="Credit" style="width: 24px; height: 24px; vertical-align: middle;">`;
    
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
             // 🚨 RBAC CHECK: CEK AKSES TRYOUT DENGAN CREDIT
             let currentUserRole = window.userRole;
             if (!currentUserRole) {
                 const { data: prof } = await window.db.from('profiles').select('role').eq('id', user.id).single();
                 currentUserRole = prof ? prof.role : 'user';
             }
             
             const needsCredit = window.CreditSystem ? await window.CreditSystem.needsCreditSystem() : false;
             const isGold = currentUserRole === 'gold' || currentUserRole === 'admin';
             
             // Jika perlu credit dan bukan gold, cek apakah sudah unlock
             if (needsCredit && !isGold && window.CreditSystem) {
                 const isUnlocked = await window.CreditSystem.isContentUnlocked('tryout', toId);
                 if (!isUnlocked) {
                     await showScyraAlert(
                         `Tryout ini memerlukan unlock dengan credit.<br><br>Kembali ke katalog dan unlock dengan 50 ${CREDIT_ICON} credit untuk akses penuh!`,
                         '🔒 Akses Ditolak',
                         '🔒'
                     );
                     window.location.href = 'tryout.html';
                     return;
                 }
             }
             
             // 1. Ambil info paket tryout (kalau ada di database)
             const { data: paket, error: paketError } = await window.db
                 .from('paket_tryout')
                 .select('*')
                 .eq('id', toId)
                 .single();

             if (paket && !paketError) {
                  const titleEl = document.getElementById('toTitle');
                  if (titleEl) titleEl.textContent = paket.nama_paket || 'Tryout SNBT';
             } else {
                 throw paketError || new Error('Paket tryout tidak ditemukan.');
             }

             const sekarang = new Date();
             const isIRT = Boolean(paket.is_irt_enabled);
             const irtMulai = paket.irt_window_start ? new Date(paket.irt_window_start) : null;
             const irtSelesai = paket.irt_window_end ? new Date(paket.irt_window_end) : null;
             // IRT changes the scoring lifecycle only. The package keeps this
             // existing detail page and its ordinary subtest UI.
             if (isIRT && (!irtMulai || !irtSelesai)) {
                 throw new Error('Konfigurasi window IRT paket belum lengkap.');
             }

             if (isIRT && sekarang < irtMulai) {
                 await showScyraAlert('Tryout ini belum dibuka.', 'Terkunci', '🔒');
                 return window.location.href = 'tryout.html';
             }

             if (isIRT && sekarang > irtSelesai && !isGold) {
                 await showScyraAlert('Periode tryout ini telah berakhir. Akses ulang tersedia untuk pengguna premium.', 'Terkunci', '🔒');
                 return window.location.href = 'tryout.html';
             }

             if (!isIRT && (sekarang < new Date(paket.waktu_mulai) || sekarang > new Date(paket.waktu_selesai))) {
                 await showScyraAlert('Tryout ini sedang tidak dapat diakses saat ini.', 'Terkunci', '🔒');
                 return window.location.href = 'tryout.html';
             }

             const irtAttemptMode = isIRT && sekarang > irtSelesai ? 'replay' : (isIRT ? 'live' : 'regular');

             // 2. Ambil kategori untuk memetakan kode subtes ke UUID.
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

             // 3. Use the subtests generated for this package. This keeps the
             // admin-configured duration, question count, and selected pool as
             // the source of truth. Old packages fall back to the original map.
             const { data: paketSubtes, error: subtesError } = await window.db
                 .from('subtes_tryout')
                 .select('id, nama_subtes, kategori_db, waktu_menit, jml_soal, soal_pool_ids')
                 .eq('paket_id', toId);
             if (subtesError) throw subtesError;

             const kategoriByCode = new Map();
             kategoriList.forEach(kategori => {
                 if (kategori.slug) kategoriByCode.set(kategori.slug.toUpperCase(), kategori);
                 const defaults = subtesDefaults[kategori.nama_mapel];
                 if (defaults?.kode) kategoriByCode.set(defaults.kode.toUpperCase(), kategori);
             });

             let subtesData = paketSubtes?.length
                 ? paketSubtes.map(subtes => {
                     const kategori = kategoriByCode.get((subtes.kategori_db || '').toUpperCase());
                     return {
                         id: kategori?.id || subtes.id,
                         nama: subtes.nama_subtes,
                         kode: subtes.kategori_db,
                         waktu: subtes.waktu_menit,
                         jml_soal: subtes.jml_soal,
                         poolCount: (subtes.soal_pool_ids || []).length
                     };
                 }).filter(subtes => subtes.kode)
                 : kategoriList.map(k => {
                     const defaults = subtesDefaults[k.nama_mapel] || { kode: k.slug, waktu: 20, soal: 15 };
                     return {
                         id: k.id,
                         nama: k.nama_mapel,
                         kode: defaults.kode,
                         waktu: defaults.waktu,
                         jml_soal: defaults.soal,
                         poolCount: 0
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

             // A premium replay is a fresh attempt of the same package, so it
             // must not inherit the completed-subtest state of the live attempt.
             if (irtAttemptMode === 'replay') {
                 state.completed = [];
                 localStorage.setItem(stateKey, JSON.stringify(state));
             }

            // 5. Sinkronkan status selesai dari hasil_tryout (agar kalau localStorage hilang tetap valid)
             const { data: hasilData, error: hasilError } = await window.db
                 .from('hasil_tryout')
                 .select('kategori_id, is_irt_live')
                 .eq('user_id', user.id)
                 .eq('paket_tryout_id', toId)
                 .not('kategori_id', 'is', null);

             if (!hasilError && hasilData && irtAttemptMode !== 'replay') {
                 // During the live IRT window, a subtest may only be submitted
                 // once. Premium replays happen after the window and remain open.
                 const completedIds = hasilData
                     .filter(h => !isIRT || (irtAttemptMode === 'live' && h.is_irt_live))
                     .map(h => h.kategori_id);
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
                 let btnOnclick = `onclick="mulaiUjian('${st.kode}', ${st.jml_soal}, ${st.waktu}, '${toId}', '${irtAttemptMode}')"`;
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
                             ${st.poolCount ? `<span>📚 Pool ${st.poolCount} Soal</span>` : ''}
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
    window.mulaiUjian = async (kategori, jmlSoal, waktuMenit, paketId, mode = 'regular') => {
        const konfirmasi = await showScyraConfirm(
            `Siap memulai subtes ini?<br>Waktu ${waktuMenit} menit akan berjalan.`,
            "Mulai Subtes?", "⏳"
        );
        if (konfirmasi) {
            window.location.href = `ujian.html?kat=${encodeURIComponent(kategori)}&limit=${jmlSoal}&time=${waktuMenit}&paket=${paketId}&mode=${mode}`;
        }
    };
});

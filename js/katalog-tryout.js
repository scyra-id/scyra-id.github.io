document.addEventListener('DOMContentLoaded', async () => {
    // Credit icon HTML helper
    const CREDIT_ICON = `<img src="images/credit_icon.webp" alt="Credit" style="width: 24px; height: 24px; vertical-align: middle;">`;
    
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
     // HALAMAN 1: KATALOG TRYOUT (SENSOR WAKTU + CREDIT)
     // ==========================================
     async function initKatalog() {
         const container = document.getElementById('katalogTryout');
         try {
             // Ambil role user
             let currentUserRole = window.userRole;
             if (!currentUserRole) {
                 const { data: { user } } = await window.db.auth.getUser();
                 if (user) {
                     const { data: prof } = await window.db.from('profiles').select('role').eq('id', user.id).single();
                     currentUserRole = prof ? prof.role : 'user';
                 } else {
                     currentUserRole = 'guest';
                 }
             }
             
             // Cek apakah perlu credit system
             const needsCredit = window.CreditSystem ? await window.CreditSystem.needsCreditSystem() : false;
             const isGold = currentUserRole === 'gold' || currentUserRole === 'admin';
             
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
                 let creditBadge = '';

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
                     
                     // Jika membutuhkan credit dan user bukan gold, tambahin keterangan
                     if (needsCredit && !isGold) {
                         creditBadge = `<div style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--brand-primary); font-weight: 600;">${CREDIT_ICON} Unlock dengan credit untuk akses penuh</div>`;
                         clickAction = `onclick="handleTryoutClick('${to.id}', ${needsCredit}, ${isGold})"`;
                     } else {
                         clickAction = `onclick="window.location.href='detail-tryout.html?id=${to.id}'"`;
                     }
                 }

                 html += `
                 <div class="to-card" style="opacity: ${opacityCard}; ${isLocked ? 'cursor: not-allowed;' : 'cursor: pointer;'}" ${clickAction}>
                     <div class="to-title">${to.nama_paket} ${isLocked ? '🔒' : ''}</div>
                     <div class="to-subtitle">${jmlSubtes} Subtes Tersedia</div>
                     
                     <div class="to-meta">
                         <span style="font-weight: 600; color: ${isLocked ? 'var(--error)' : 'var(--brand-primary-dark)'};">${statusLabel}</span>
                         ${creditBadge}
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

     // ==========================================
     // HANDLE TRYOUT CLICK (CEK UNLOCK)
     // ==========================================
     window.handleTryoutClick = async (tryoutId, needsCredit, isGold) => {
         if (!needsCredit || isGold) {
             window.location.href = `detail-tryout.html?id=${tryoutId}`;
             return;
         }
         
         // Cek apakah sudah unlock tryout ini
         if (window.CreditSystem) {
             const isUnlocked = await window.CreditSystem.isContentUnlocked('tryout', tryoutId);
             if (isUnlocked) {
                 window.location.href = `detail-tryout.html?id=${tryoutId}`;
             } else {
                 // Tampilkan modal unlock
                 showTryoutUnlockModal(tryoutId);
             }
         } else {
             window.location.href = `detail-tryout.html?id=${tryoutId}`;
         }
     };
     
     // ==========================================
     // MODAL UNLOCK TRYOUT
     // ==========================================
     window.showTryoutUnlockModal = async (tryoutId) => {
         if (!window.CreditSystem) return;
         
         try {
             const availableCredits = await window.CreditSystem.getAvailableCredits();
             const { data: tryout } = await window.db.from('paket_tryout').select('nama_paket').eq('id', tryoutId).single();
             
             const creditCost = 50; // Cost unlock tryout paket
             const tryoutName = tryout ? tryout.nama_paket : 'Tryout ini';
             
             if (typeof showScyraConfirm === 'function') {
                 const confirmed = await showScyraConfirm(
                     `Unlock <strong>${tryoutName}</strong> dengan ${creditCost} ${CREDIT_ICON} credit?<br><br>Setelah unlock, kamu bisa mengerjakan semua subtes dalam paket ini berkali-kali tanpa batas.<br><br>Credit tersedia: <strong>${availableCredits} ${CREDIT_ICON}</strong>`,
                     '🔓 Unlock Tryout',
                     '🔓'
                 );
                 
                 if (!confirmed) return;
             } else {
                 const confirmed = confirm(`Unlock ${tryoutName} dengan ${creditCost} credit?\n\nSetelah unlock, kamu bisa mengerjakan semua subtes dalam paket ini berkali-kali.\n\nCredit tersedia: ${availableCredits}`);
                 if (!confirmed) return;
             }
             
             // Check sufficient credits
             if (availableCredits < creditCost) {
                 if (typeof showScyraAlert === 'function') {
                     await showScyraAlert(
                        `Credit tidak cukup! Kamu perlu ${creditCost} ${CREDIT_ICON} credit tetapi hanya punya ${availableCredits} ${CREDIT_ICON}.<br><br>Beli credit atau ajak teman dengan kode referral untuk mendapat credit gratis!`,
                        '❌ Credit Tidak Cukup',
                        CREDIT_ICON
                     );
                 } else {
                     alert(`Credit tidak cukup! Perlu ${creditCost} credit, tersedia ${availableCredits} credit.`);
                 }
                 window.location.href = 'paketbelajar.html';
                 return;
             }
             
             // Unlock tryout
             const result = await window.CreditSystem.unlockContent('tryout', tryoutId, creditCost);
             
             if (result.success) {
                 if (typeof showScyraAlert === 'function') {
                     await showScyraAlert(
                         `Berhasil unlock <strong>${tryoutName}</strong>!<br><br>Kamu sekarang bisa mengerjakan semua subtes dalam paket ini.<br><br>Credit tersisa: <strong>${availableCredits - creditCost} ${CREDIT_ICON}</strong>`,
                         '✅ Unlock Berhasil',
                         '✅'
                     );
                 } else {
                     alert(`✅ Berhasil unlock ${tryoutName}!\n\nCredit tersisa: ${availableCredits - creditCost}`);
                 }
                 
                 // Update credit display
                 await window.CreditSystem.updateTopbarCredit();
                 
                 // Redirect ke detail tryout
                 window.location.href = `detail-tryout.html?id=${tryoutId}`;
             }
         } catch (error) {
             console.error('Error unlocking tryout:', error);
             if (typeof showScyraAlert === 'function') {
                 await showScyraAlert(
                     error.message || 'Terjadi kesalahan saat unlock tryout',
                     '❌ Unlock Gagal',
                     '❌'
                 );
             } else {
                 alert('❌ ' + (error.message || 'Gagal unlock tryout'));
             }
         }
     };
     
     // Helper format Tgl Indonesia
     function formatTgl(dateObj) {
         return dateObj.toLocaleString('id-ID', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
     }
 });

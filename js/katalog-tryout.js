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
             const isSilver = currentUserRole === 'silver';

             // Hitung jumlah tryout yang sudah di-unlock Silver (via unlocked_content)
             let silverUnlockCount = 0;
             const SILVER_FREE_TRYOUT_LIMIT = 3;
             if (isSilver && window.CreditSystem) {
                 try {
                     const db = window.dbPayment || window.db;
                     const { data: { user: currentUser } } = await window.db.auth.getUser();
                     if (currentUser) {
                         const { count } = await db
                             .from('unlocked_content')
                             .select('*', { count: 'exact', head: true })
                             .eq('user_id', currentUser.id)
                             .eq('content_type', 'tryout');
                         silverUnlockCount = count || 0;
                     }
                 } catch (e) {
                     console.warn('⚠️ Gagal hitung unlock Silver:', e.message);
                 }
             }
             const silverHasFreeSlots = isSilver && silverUnlockCount < SILVER_FREE_TRYOUT_LIMIT;
             
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

             // Tarik pendaftaran user untuk menandai badge status
             let registeredPaketIds = new Set();
             if (userId) {
                 const { data: userRegs } = await window.db
                     .from('tryout_pendaftaran')
                     .select('paket_id')
                     .eq('user_id', userId);
                 if (userRegs) {
                     registeredPaketIds = new Set(userRegs.map(r => r.paket_id));
                 }
             }

             let html = '';
             const sekarang = new Date();

             data.forEach(to => {
                  const mulai = new Date(to.waktu_mulai);
                  const selesai = new Date(to.waktu_selesai);
                  const isIrtPackage = Boolean(to.is_irt_enabled);
                  const irtMulai = to.irt_window_start ? new Date(to.irt_window_start) : null;
                  const irtSelesai = to.irt_window_end ? new Date(to.irt_window_end) : null;
                 const jmlSubtes = to.subtes_tryout[0]?.count || 0;
                 const isRegistered = registeredPaketIds.has(to.id);
                 
                 let isLocked = true;
                 let statusLabel = "";
                 let bgGradient = "linear-gradient(90deg, #e53935, #ff8a65)"; // Merah (Kunci)
                 let opacityCard = "0.7"; 
                 let clickAction = `onclick="showScyraAlert('Tryout ini sedang dikunci. Perhatikan jadwal pelaksanaannya!', '🔒 Terkunci', '⚠️')"`;
                 let creditBadge = '';

                 // Logika Waktu
                  if (isIrtPackage && (!irtMulai || !irtSelesai)) {
                      statusLabel = '🔒 Belum dikonfigurasi';
                  } else if (isIrtPackage && sekarang > irtSelesai) {
                      // Window IRT sudah lewat
                      const irtCalibrated = to.irt_status === 'CALIBRATED';
                      if (isGold && irtCalibrated) {
                          // Gold + kalibrasi selesai = bisa replay
                          isLocked = false;
                          statusLabel = '🟢 Bisa Dikerjakan (Replay IRT)';
                          bgGradient = "linear-gradient(90deg, var(--brand-primary), var(--warning))";
                          opacityCard = "1";
                          clickAction = `onclick="handleTryoutClick('${to.id}', ${needsCredit}, ${isGold}, ${silverHasFreeSlots})"`;
                      } else if (isGold && !irtCalibrated) {
                          // Gold tapi kalibrasi belum selesai
                          statusLabel = '⏳ Menunggu Kalibrasi IRT...';
                      } else {
                          // User biasa
                          statusLabel = `🔒 Sudah Berakhir (Tutup: ${formatTgl(irtSelesai)})`;
                      }
                  } else if (isIrtPackage && sekarang < irtMulai) {
                      statusLabel = `🔒 Belum Dimulai (Buka: ${formatTgl(irtMulai)})`;
                  } else if (sekarang > selesai) {
                      // Waktu reguler habis (non-IRT atau IRT yang belum lewat window)
                      statusLabel = `🔒 Sudah Berakhir (Tutup: ${formatTgl(selesai)})`;
                 } else {
                     isLocked = false;
                     statusLabel = `🟢 Bisa Dikerjakan (Sisa waktu sampai ${formatTgl(selesai)})`;
                     bgGradient = "linear-gradient(90deg, var(--brand-primary), var(--warning))"; // Sage/Orange (Buka)
                     opacityCard = "1";
                     
                     // Keterangan credit berdasarkan role
                     if (needsCredit && !isGold && !silverHasFreeSlots) {
                         creditBadge = `<div style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--brand-primary); font-weight: 600;">${CREDIT_ICON} Unlock dengan credit untuk akses penuh</div>`;
                     } else if (silverHasFreeSlots) {
                         creditBadge = `<div style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--brand-primary); font-weight: 600;">🎫 Gratis Silver (${silverUnlockCount}/${SILVER_FREE_TRYOUT_LIMIT} terpakai)</div>`;
                     }
                     clickAction = `onclick="handleTryoutClick('${to.id}', ${needsCredit}, ${isGold}, ${silverHasFreeSlots})"`;
                 }

                 const regBadge = !isLocked ? (isRegistered 
                     ? `<span style="background: rgba(107, 143, 92, 0.15); color: var(--brand-primary-dark); padding: 0.2rem 0.55rem; border-radius: 6px; font-size: 0.75rem; font-weight: 700;">✓ Terdaftar</span>`
                     : `<span style="background: rgba(212, 175, 55, 0.15); color: #b58d10; padding: 0.2rem 0.55rem; border-radius: 6px; font-size: 0.75rem; font-weight: 700;">📝 Pilih Target PTN</span>`)
                     : '';

                 html += `
                 <div class="to-card" style="opacity: ${opacityCard}; ${isLocked ? 'cursor: not-allowed;' : 'cursor: pointer;'}" ${clickAction}>
                     <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.25rem;">
                         <div class="to-title" style="margin: 0;">${to.nama_paket} ${isLocked ? '🔒' : ''}</div>
                         ${regBadge}
                     </div>
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
     // NAVIGASI TRYOUT (CEK PENDAFTARAN & TARGET PTN)
     // ==========================================
     window.navigateToTryout = async (tryoutId) => {
         try {
             const { data: { user } } = await window.db.auth.getUser();
             if (user) {
                 const { data: reg } = await window.db
                     .from('tryout_pendaftaran')
                     .select('id')
                     .eq('paket_id', tryoutId)
                     .eq('user_id', user.id)
                     .maybeSingle();

                 if (reg) {
                     window.location.href = `detail-tryout.html?id=${tryoutId}`;
                     return;
                 }
             }
             // Belum terdaftar -> arahkan ke halaman pilih PTN & pendaftaran
             window.location.href = `daftar-tryout.html?id=${tryoutId}`;
         } catch (e) {
             console.error('Error navigating to tryout:', e);
             window.location.href = `daftar-tryout.html?id=${tryoutId}`;
         }
     };

     // ==========================================
     // HANDLE TRYOUT CLICK (CEK UNLOCK & DAFTAR)
     // ==========================================
     window.handleTryoutClick = async (tryoutId, needsCredit, isGold, silverHasFreeSlots) => {
         if (!needsCredit || isGold) {
             return window.navigateToTryout(tryoutId);
         }
         
         // Cek apakah sudah unlock tryout ini
         if (window.CreditSystem) {
             const isUnlocked = await window.CreditSystem.isContentUnlocked('tryout', tryoutId);
             if (isUnlocked) {
                 return window.navigateToTryout(tryoutId);
             } else {
                 // Tampilkan modal unlock
                 showTryoutUnlockModal(tryoutId, silverHasFreeSlots);
             }
         } else {
             return window.navigateToTryout(tryoutId);
         }
     };
     
     // ==========================================
     // MODAL UNLOCK TRYOUT
     // ==========================================
     window.showTryoutUnlockModal = async (tryoutId, silverHasFreeSlots) => {
         if (!window.CreditSystem) return;
         
         try {
             const { data: tryout } = await window.db.from('paket_tryout').select('nama_paket').eq('id', tryoutId).single();
             const tryoutName = tryout ? tryout.nama_paket : 'Tryout ini';

             // CASE 1: Member Silver dengan jatah tryout gratis tersisa
             if (silverHasFreeSlots) {
                 let confirmed = false;
                 if (typeof showScyraConfirm === 'function') {
                     confirmed = await showScyraConfirm(
                         `Kamu memiliki akses <strong>Tryout Premium Gratis</strong> dari <strong>Paket Silver</strong>!<br><br>Gunakan jatah gratis untuk membuka <strong>${tryoutName}</strong>?<br><br><span style="font-size:0.85rem; color:var(--text-secondary);">Tidak ada pengurangan credit untuk pembukaan ini.</span>`,
                         '🎫 Klaim Tryout Silver',
                         '🎫'
                     );
                 } else {
                     confirmed = confirm(`Gunakan jatah Tryout Gratis Paket Silver untuk membuka ${tryoutName}?\n\nTidak ada pengurangan credit.`);
                 }

                 if (!confirmed) return;

                 const result = await window.CreditSystem.unlockContent('tryout', tryoutId, 0);
                 if (result.success) {
                     if (typeof showScyraAlert === 'function') {
                         await showScyraAlert(
                             `Berhasil membuka <strong>${tryoutName}</strong> dengan jatah Paket Silver!<br><br>Kamu sekarang bisa mengerjakan seluruh subtes di paket ini.`,
                             '✅ Tryout Terbuka',
                             '🎉'
                         );
                     } else {
                         alert(`✅ Berhasil membuka ${tryoutName} dengan jatah Paket Silver!`);
                     }
                     return window.navigateToTryout(tryoutId);
                 }
                 return;
             }

             // CASE 2: User Free atau Silver yang jatah gratisnya sudah habis
             const availableCredits = await window.CreditSystem.getAvailableCredits();
             const creditCost = 50; // Cost unlock tryout paket
             const userRole = await window.CreditSystem.getUserRole();
             const isSilverUser = userRole === 'silver';

             let confirmPrompt = `Unlock <strong>${tryoutName}</strong> dengan ${creditCost} ${CREDIT_ICON} credit?<br><br>Setelah unlock, kamu bisa mengerjakan semua subtes dalam paket ini berkali-kali tanpa batas.<br><br>Credit tersedia: <strong>${availableCredits} ${CREDIT_ICON}</strong>`;
             if (isSilverUser) {
                 confirmPrompt = `Jatah 3 Tryout gratis dari Paket Silver kamu sudah terpakai.<br><br>Unlock <strong>${tryoutName}</strong> dengan ${creditCost} ${CREDIT_ICON} credit?<br><br>Credit tersedia: <strong>${availableCredits} ${CREDIT_ICON}</strong>`;
             }
             
             if (typeof showScyraConfirm === 'function') {
                 const confirmed = await showScyraConfirm(
                     confirmPrompt,
                     '🔓 Unlock Tryout',
                     '🔓'
                 );
                 if (!confirmed) return;
             } else {
                 const confirmed = confirm(`Unlock ${tryoutName} dengan ${creditCost} credit?\n\nCredit tersedia: ${availableCredits}`);
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
                 
                 // Redirect ke detail tryout atau daftar target PTN
                 await window.navigateToTryout(tryoutId);
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

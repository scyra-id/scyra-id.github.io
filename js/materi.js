document.addEventListener('DOMContentLoaded', () => {
    // ========================================================
    // DEKLARASI ELEMEN DOM
    // ========================================================
    const mapelView = document.getElementById('mapelView');
    const babView = document.getElementById('babView');
    const mapelGrid = document.getElementById('mapelGrid');
    const babList = document.getElementById('babList');
    const btnBack = document.getElementById('btnBackToMapel');
    const jenjangSelect = document.getElementById('jenjangSelect');

    const babTitle = document.getElementById('babTitle');
    const babIconLarge = document.getElementById('babIconLarge');

    let dbKategori = [];
    let dbMateri = [];
    let currentUserRole = 'guest'; // Fallback default
    let currentMapelId = null; // Track current mapel (subtest) for credit unlock
    
    // Credit cost per subtest (1 mapel = 1 subtest)
    const CREDIT_COST_PER_SUBTEST = 20;
    
    // Credit icon HTML helper
    const CREDIT_ICON = `<img src="images/credit_icon.webp" alt="Credit" style="width: 24px; height: 24px; vertical-align: middle;">`;

    // ========================================================
    // 1. TARIK DATA DARI DATABASE + CEK ROLE USER
    // ========================================================
    async function fetchData() {
        mapelGrid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 2rem;">Memuat data dari server... ⏳</div>';
        try {
            // A. Ambil Role User (Fallback biar gak error kalau session.js belum set)
            if (!window.userRole) {
                const { data: { user } } = await window.db.auth.getUser();
                if (user) {
                    const { data: profile } = await window.db.from('profiles').select('role').eq('id', user.id).single();
                    currentUserRole = profile ? profile.role : 'user';
                }
            } else {
                currentUserRole = window.userRole;
            }

            // B. Ambil Kategori
            const resKategori = await window.db.from('kategori').select('*').order('nama_mapel');
            if (resKategori.data) dbKategori = resKategori.data;

            // 🚨 C. AMBIL MATERI + nomor_bab (PENTING!)
            const resMateri = await window.db.from('materi')
                .select('id, judul, kategori_id, status, created_at, nomor_bab')
                .eq('status', 'publik')
                .order('nomor_bab', { ascending: true }); // Urutkan by nomor_bab
            if (resMateri.data) dbMateri = resMateri.data;

            const jenjangAwal = jenjangSelect ? jenjangSelect.value : 'utbk';
            renderMapel(jenjangAwal);
        } catch (error) {
            console.error("Gagal menarik data:", error);
            mapelGrid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color: var(--error);">Gagal terhubung ke database.</div>';
        }
    }

    // ========================================================
    // 2. RENDER MAPEL
    // ========================================================
    function renderMapel(jenjangDipilih) {
        mapelGrid.innerHTML = '';
        const filterJenjang = (jenjangDipilih || 'utbk').toLowerCase().trim();

        const mapelTersaring = dbKategori.filter(k => {
            const jenjangDB = (k.jenjang || '').toLowerCase().trim();
            return jenjangDB === filterJenjang;
        });

        if (mapelTersaring.length === 0) {
            mapelGrid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 3rem; color: var(--text-secondary);">Materi untuk jenjang ini belum tersedia. 🚧</div>`;
            return;
        }

        mapelTersaring.forEach(mapel => {
            const jumlahBab = dbMateri.filter(m => m.kategori_id === mapel.id).length;
            const card = document.createElement('div');
            card.className = 'mapel-card';
            if (mapel.bg_card) {
                card.style.setProperty('--bg-image', `url('${mapel.bg_card}')`);
            }
            card.innerHTML = `
                <div class="mapel-icon">${mapel.icon || '📚'}</div>
                <div class="mapel-info">
                    <h3>${mapel.nama_mapel}</h3>
                    <p>${jumlahBab} Modul Pembelajaran</p>
                </div>
            `;
            card.addEventListener('click', () => bukaDetailBab(mapel));
            mapelGrid.appendChild(card);
        });
    }

    // ========================================================
    // 3. RENDER DAFTAR BAB & UJIAN (DENGAN LOGIKA GEMBOK + CREDIT)
    // ========================================================
    async function bukaDetailBab(mapel) {
        mapelView.style.display = 'none';
        if(jenjangSelect) jenjangSelect.parentElement.style.display = 'none'; 
        babView.style.display = 'block';
        babTitle.textContent = mapel.nama_mapel;
        babIconLarge.textContent = mapel.icon || '📚';
        currentMapelId = mapel.id;

        const babs = dbMateri.filter(m => m.kategori_id === mapel.id);
        
        // 🚨 SORTING: Urutkan dari nomor_bab terkecil ke terbesar
        babs.sort((a, b) => (a.nomor_bab || 999) - (b.nomor_bab || 999));

        babList.innerHTML = '<div style="text-align:center; padding: 2rem;">Memuat status unlock... ⏳</div>';

        // 🚨 CEK ROLE USER & CREDIT SYSTEM
        const needsCredit = window.CreditSystem ? await window.CreditSystem.needsCreditSystem() : false;
        // 🚨 Silver, Gold, dan Admin = auto-unlock semua materi tanpa credit
        const isPremium = currentUserRole === 'gold' || currentUserRole === 'admin' || currentUserRole === 'silver';
        
        // Check if subtest is unlocked (gunakan kategori_id sebagai identifier subtest)
        let isSubtestUnlocked = false;
        if (needsCredit && !isPremium && window.CreditSystem) {
            isSubtestUnlocked = await window.CreditSystem.isContentUnlocked('subtest', mapel.id);
        }

        babList.innerHTML = '';

        // Build panel header dengan unlock button
        let panelHeaderHTML = `
            <div class="panel-header">
                <h3>📚 Modul & Pemantapan</h3>
                <p>Pelajari materi dan kerjakan tugas harian per bab.</p>
            </div>
        `;
        
        // Jika perlu credit dan subtest belum unlocked, tampilkan unlock button di header
        if (needsCredit && !isPremium && !isSubtestUnlocked && babs.length > 0) {
            panelHeaderHTML = `
                <div class="panel-header panel-header-with-action">
                    <div>
                        <h3>📚 Modul & Pemantapan</h3>
                        <p>Pelajari materi dan kerjakan tugas harian per bab.</p>
                    </div>
                    <button class="btn-unlock" onclick="unlockSubtest('${mapel.id}', ${CREDIT_COST_PER_SUBTEST})">
                        🔓 Unlock Subtest (${CREDIT_COST_PER_SUBTEST} ${CREDIT_ICON})
                    </button>
                </div>
            `;
        } else if (needsCredit && !isPremium && isSubtestUnlocked) {
            panelHeaderHTML = `
                <div class="panel-header panel-header-with-action">
                    <div>
                        <h3>📚 Modul & Pemantapan</h3>
                        <p>Pelajari materi dan kerjakan tugas harian per bab.</p>
                    </div>
                    <span class="badge-unlocked">✅ Subtest Unlocked</span>
                </div>
            `;
        }

        if (babs.length === 0) {
            babList.innerHTML = panelHeaderHTML + `<div style="text-align:center; padding: 2rem; color: var(--text-secondary);">Belum ada materi publik. ✍️</div>`;
        } else {
            // Determine if babs are locked (semua bab dalam subtest dikunci bersama)
            // Tapi BAB 1 selalu unlocked untuk semua user!
            let areBabsLocked = false;
            if (isPremium) {
                areBabsLocked = false; // Silver, Gold, Admin = semua bab unlocked
            } else if (needsCredit) {
                areBabsLocked = !isSubtestUnlocked;
            } else {
                // Guest users - locked untuk premium (tapi bab 1 tetap free)
                areBabsLocked = true;
            }
            
            let babsHTML = panelHeaderHTML;
            
            for (const bab of babs) {
                const babNum = bab.nomor_bab || 1;
                
                // 🎯 BAB 1 SELALU UNLOCKED UNTUK SEMUA USER!
                const isBab1 = babNum === 1;
                const isThisBabLocked = areBabsLocked && !isBab1;
                const lockClass = isThisBabLocked ? 'locked' : '';
                
                let btnMateri, btnDrill;
                
                if (isThisBabLocked && needsCredit) {
                    // Show disabled button karena perlu unlock subtest
                    btnMateri = `<button class="btn-baca btn-locked" disabled>🔒 Unlock Subtest</button>`;
                    btnDrill = `<button class="btn-outline btn-locked" disabled>🔒 Unlock Subtest</button>`;
                } else if (isThisBabLocked) {
                    // Old locked system (guest users) - tapi bukan bab 1
                    btnMateri = `<button class="btn-baca btn-locked" onclick="showUpgradeModal()">🔒 Akses Premium</button>`;
                    btnDrill = `<button class="btn-outline btn-locked" onclick="showUpgradeModal()">🔒 Premium</button>`;
                } else {
                    // Unlocked - normal buttons (termasuk bab 1)
                    btnMateri = `<button class="btn-baca" onclick="window.location.href='detail-materi.html?id=${bab.id}'">📖 Baca Materi</button>`;
                    btnDrill = `<button class="btn-outline" onclick="window.location.href='latihan-soal.html?materi=${bab.id}'">📝 Pemantapan</button>`;
                }

                babsHTML += `
                    <div class="bab-item ${lockClass}" id="bab-item-${bab.id}">
                        <div class="bab-item-header">
                            <h4>Bab ${babNum}: ${bab.judul}</h4>
                        </div>
                        <div class="bab-actions">
                            ${btnMateri}
                            ${btnDrill}
                        </div>
                    </div>
                `;
            }
            
            babList.innerHTML = babsHTML;
        }

        // --- B. RENDER KANAN: UJIAN HARIAN (DRILL SOAL CAMPURAN) ---
        await renderUjianList(babs, needsCredit, isPremium, isSubtestUnlocked);
    }
    
    // ========================================================
    // 3B. RENDER UJIAN LIST (DIPISAH KARENA ASYNC)
    // ========================================================
    async function renderUjianList(babs, needsCredit, isPremium, isSubtestUnlocked) {
        const ujianList = document.getElementById('ujianList');
        let checkboxHTML = '';
        
        // Determine if drill is locked (same logic as babs)
        let areBabsLocked = false;
        if (isPremium) {
            areBabsLocked = false; // Silver, Gold, Admin = semua bab unlocked
        } else if (needsCredit) {
            areBabsLocked = !isSubtestUnlocked;
        } else {
            areBabsLocked = true;
        }
        
        for (const bab of babs) {
            const babNum = bab.nomor_bab || 1;
            
            // 🎯 BAB 1 SELALU UNLOCKED UNTUK SEMUA USER!
            const isBab1 = babNum === 1;
            const isThisBabLocked = areBabsLocked && !isBab1;
            
            const lockLabel = isThisBabLocked ? (needsCredit ? `🔒 Unlock Subtest` : '🔒 Premium') : '';
            const disabledAttr = isThisBabLocked ? 'disabled' : '';
            const cursorStyle = isThisBabLocked ? 'not-allowed' : 'pointer';
            const opacityStyle = isThisBabLocked ? '0.6' : '1';
            
            // Badge gratis untuk bab 1
            const freeBadge = isBab1 ? '<span style="color: #4caf50; font-size: 0.75rem; font-weight: 600;">✨ GRATIS</span>' : '';
            
            checkboxHTML += `
                <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.8rem; cursor: ${cursorStyle}; padding: 0.5rem; background: var(--bg-primary); border-radius: 6px; border: 1px solid var(--border-color); opacity: ${opacityStyle};">
                    <input type="checkbox" name="drillBab" value="${bab.id}" class="drill-checkbox" ${disabledAttr}>
                    <span style="font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                        <span>Bab ${babNum}: ${bab.judul}</span>
                        ${freeBadge}
                        ${lockLabel ? `<span style="color: ${needsCredit ? 'var(--brand-primary)' : 'var(--error)'}; font-size: 0.8rem;">${lockLabel}</span>` : ''}
                    </span>
                </label>
            `;
        }

        ujianList.innerHTML = `
            <div class="bab-item" style="border-left: 4px solid var(--brand-accent); flex-direction: column; align-items: stretch;">
                <div class="bab-item-header">
                    <h4>🎯 Setup Drill Soal</h4>
                    <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top:0.3rem;">Pilih satu atau lebih materi yang ingin diujikan secara acak:</p>
                </div>
                <div style="margin: 1rem 0; max-height: 250px; overflow-y: auto;">
                    ${checkboxHTML || '<p style="color: var(--text-muted);">Belum ada materi untuk di-drill.</p>'}
                </div>
                <div class="bab-actions">
                    <button class="btn-baca" style="background: var(--brand-accent); color: #1a1a1a; width: 100%; font-size: 1.05rem;" onclick="mulaiDrillCampuran()">🚀 Mulai Drill Campuran</button>
                </div>
            </div>
        `;
    }

    // 🚨 FUNGSI MODAL UPGRADE (GLOBAL)
    window.showUpgradeModal = () => {
        if (typeof showScyraConfirm === 'function') {
            showScyraConfirm(
                'Materi ini khusus untuk member <strong>Silver</strong> atau <strong>Gold</strong>.<br>Upgrade sekarang untuk akses seluruh bab dan latihan soal!',
                '🔒 Konten Premium',
                '🚀'
            ).then(confirmed => {
                if (confirmed) window.location.href = 'paketbelajar.html';
            });
        } else {
            alert('Upgrade ke Silver/Gold untuk akses materi ini!');
            window.location.href = 'paketbelajar.html';
        }
    };

    // Fungsi global buat nangkep ID bab yang dipilih lalu loncat ke halaman Drill
    window.mulaiDrillCampuran = () => {
        const selected = Array.from(document.querySelectorAll('.drill-checkbox:checked')).map(cb => cb.value);
        if(selected.length === 0) return alert('⚠️ Pilih minimal 1 bab dulu buat di-drill!');
        window.location.href = `drill-soal.html?babs=${selected.join(',')}`;
    };
    
    // ========================================================
    // 🔓 FUNGSI UNLOCK SUBTEST DENGAN CREDIT (GLOBAL)
    // ========================================================
    window.unlockSubtest = async (subtestId, creditCost) => {
        if (!window.CreditSystem) {
            alert('❌ Credit system tidak tersedia');
            return;
        }
        
        try {
            // Get available credits
            const availableCredits = await window.CreditSystem.getAvailableCredits();
            
            // Get subtest info
            const subtest = dbKategori.find(k => k.id === subtestId);
            const subtestName = subtest ? subtest.nama_mapel : 'subtest ini';
            
            // Count babs in this subtest
            const babCount = dbMateri.filter(m => m.kategori_id === subtestId).length;
            
            // Confirm unlock
            if (typeof showScyraConfirm === 'function') {
                const confirmed = await showScyraConfirm(
                    `Unlock <strong>${subtestName}</strong> (${babCount} bab) dengan ${creditCost} ${CREDIT_ICON} credit?<br><br>Semua bab dalam subtest ini akan terbuka!<br><br>Credit tersedia: <strong>${availableCredits} ${CREDIT_ICON}</strong>`,
                    '🔓 Unlock Subtest',
                    '🔓'
                );
                
                if (!confirmed) return;
            } else {
                const confirmed = confirm(`Unlock ${subtestName} (${babCount} bab) dengan ${creditCost} credit?\n\nSemua bab dalam subtest ini akan terbuka!\n\nCredit tersedia: ${availableCredits}`);
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
                    alert(`Credit tidak cukup! Perlu ${creditCost} credit, tersedia ${availableCredits} credit.\n\nBeli credit atau gunakan referral code untuk mendapat credit gratis!`);
                }
                window.location.href = 'paketbelajar.html';
                return;
            }
            
            // Unlock subtest (content_type = 'subtest', content_id = kategori_id)
            const result = await window.CreditSystem.unlockContent('subtest', subtestId, creditCost);
            
            if (result.success) {
                // Show success message
                if (typeof showScyraAlert === 'function') {
                    await showScyraAlert(
                        `Berhasil unlock <strong>${subtestName}</strong>!<br><br>Semua ${babCount} bab sekarang terbuka.<br><br>Credit tersisa: <strong>${availableCredits - creditCost} ${CREDIT_ICON}</strong>`,
                        '✅ Unlock Berhasil',
                        '✅'
                    );
                } else {
                    alert(`✅ Berhasil unlock ${subtestName}!\n\nSemua ${babCount} bab sekarang terbuka.\n\nCredit tersisa: ${availableCredits - creditCost}`);
                }
                
                // Update credit display di topbar
                await window.CreditSystem.updateTopbarCredit();
                
                // Re-render current mapel
                const currentMapel = dbKategori.find(k => k.id === currentMapelId);
                if (currentMapel) {
                    await bukaDetailBab(currentMapel);
                }
            }
        } catch (error) {
            console.error('Error unlocking subtest:', error);
            if (typeof showScyraAlert === 'function') {
                await showScyraAlert(
                    error.message || 'Terjadi kesalahan saat unlock subtest',
                    '❌ Unlock Gagal',
                    '❌'
                );
            } else {
                alert('❌ ' + (error.message || 'Gagal unlock subtest'));
            }
        }
    };

    // ========================================================
    // 4. EVENT LISTENER (TOMBOL KEMBALI & FILTER)
    // ========================================================
    btnBack.addEventListener('click', () => {
        babView.style.display = 'none';
        mapelView.style.display = 'block';
        if(jenjangSelect) jenjangSelect.parentElement.style.display = 'block'; 
    });

    if (jenjangSelect) {
        jenjangSelect.addEventListener('change', (e) => {
            renderMapel(e.target.value);
        });
    }

    // ========================================================
    // 5. JALANKAN SAAT KONEKSI DB SIAP & CEK LOGIN (GUARD)
    // ========================================================
    const cekKoneksi = setInterval(async () => {
        if (window.db) {
            clearInterval(cekKoneksi);
            const { data: { user } } = await window.db.auth.getUser();
            if (!user) {
                window.location.href = 'login.html';
                return;
            }
            fetchData();
        }
    }, 100);
});
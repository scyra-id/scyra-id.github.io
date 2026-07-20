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
    // 3. RENDER DAFTAR BAB & UJIAN (DENGAN LOGIKA GEMBOK RBAC)
    // ========================================================
    function bukaDetailBab(mapel) {
        mapelView.style.display = 'none';
        if(jenjangSelect) jenjangSelect.parentElement.style.display = 'none'; 
        babView.style.display = 'block';
        babTitle.textContent = mapel.nama_mapel;
        babIconLarge.textContent = mapel.icon || '📚';

        const babs = dbMateri.filter(m => m.kategori_id === mapel.id);
        
        // 🚨 SORTING: Urutkan dari nomor_bab terkecil ke terbesar
        babs.sort((a, b) => (a.nomor_bab || 999) - (b.nomor_bab || 999));

        babList.innerHTML = '';

        // 🚨 CEK ROLE USER (Fallback aman)
        const isUserFree = (currentUserRole === 'user' || currentUserRole === 'guest' || !currentUserRole);

        if (babs.length === 0) {
            babList.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-secondary);">Belum ada materi publik. ✍️</div>`;
        } else {
            babs.forEach((bab) => {
                const babNum = bab.nomor_bab || 1;
                const isLocked = isUserFree && babNum > 1; // 🚨 GEMBOK LOGIC
                const lockClass = isLocked ? 'locked' : '';
                
                const btnMateri = isLocked 
                    ? `<button class="btn-baca btn-locked" onclick="showUpgradeModal()">🔒 Akses Premium</button>` 
                    : `<button class="btn-baca" onclick="window.location.href='detail-materi.html?id=${bab.id}'">📖 Baca Materi</button>`;
                
                const btnDrill = isLocked
                    ? `<button class="btn-outline btn-locked" onclick="showUpgradeModal()">🔒 Pemantapan</button>`
                    : `<button class="btn-outline" onclick="window.location.href='drill-soal.html?babs=${bab.id}'">📝 Pemantapan</button>`;

                babList.innerHTML += `
                    <div class="bab-item ${lockClass}">
                        <div class="bab-item-header">
                            <h4>Bab ${babNum}: ${bab.judul}</h4>
                        </div>
                        <div class="bab-actions">
                            ${btnMateri}
                            ${btnDrill}
                        </div>
                    </div>
                `;
            });
        }

        // --- B. RENDER KANAN: UJIAN HARIAN (DRILL SOAL CAMPURAN) ---
        const ujianList = document.getElementById('ujianList');
        let checkboxHTML = babs.map((bab) => {
            const babNum = bab.nomor_bab || 1;
            const isLocked = isUserFree && babNum > 1; // 🚨 GEMBOK CHECKBOX
            
            return `
                <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.8rem; cursor: ${isLocked ? 'not-allowed' : 'pointer'}; padding: 0.5rem; background: var(--bg-primary); border-radius: 6px; border: 1px solid var(--border-color); opacity: ${isLocked ? '0.6' : '1'};">
                    <input type="checkbox" name="drillBab" value="${bab.id}" class="drill-checkbox" ${isLocked ? 'disabled' : ''}>
                    <span style="font-size: 0.95rem;">
                        Bab ${babNum}: ${bab.judul} 
                        ${isLocked ? '<span style="color: var(--error); font-size: 0.8rem;">🔒 Premium</span>' : ''}
                    </span>
                </label>
            `;
        }).join('');

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
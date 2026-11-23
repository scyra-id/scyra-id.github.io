/**
 * DAFTAR TRYOUT & TARGET PTN (SNBT)
 * Mengelola pendaftaran paket tryout dengan pemilihan 2-4 target PTN sesuai regulasi resmi SNBT.
 */

document.addEventListener('DOMContentLoaded', async () => {
    let currentUser = null;
    let tryoutPaket = null;
    let tryoutId = null;

    // State pilihan (slot 1 s/d 4)
    const selectedChoices = {
        1: null,
        2: null,
        3: null,
        4: null
    };

    const slotVisible = {
        1: true,
        2: true,
        3: false,
        4: false
    };

    // Indeks pencarian dimuat sekali di frontend agar nama prodi dan PTN
    // dapat dicari bersamaan, tanpa bergantung pada urutan kata yang diketik.
    let cachedProdis = [];
    let prodiSearchIndexPromise = null;
    let searchDebounceTimers = {};

    // 1. Inisialisasi Auth & Koneksi DB
    const checkInit = setInterval(async () => {
        if (window.db) {
            clearInterval(checkInit);
            const { data: { user } } = await window.db.auth.getUser();
            if (!user) {
                window.location.href = 'login.html';
                return;
            }
            currentUser = user;
            initPage();
        }
    }, 100);

    async function initPage() {
        const urlParams = new URLSearchParams(window.location.search);
        tryoutId = urlParams.get('id');

        if (!tryoutId) {
            await showAlert('ID tryout tidak ditemukan di URL.', 'Kesalahan', '⚠️');
            window.location.href = 'tryout.html';
            return;
        }

        try {
            // Load Paket Tryout
            const { data: paket, error: paketErr } = await window.db
                .from('paket_tryout')
                .select('*')
                .eq('id', tryoutId)
                .single();

            if (paketErr || !paket) {
                await showAlert('Paket tryout tidak ditemukan atau sudah tidak aktif.', 'Kesalahan', '⚠️');
                window.location.href = 'tryout.html';
                return;
            }

            tryoutPaket = paket;

            // Update UI Header
            document.getElementById('toTitle').textContent = `Daftar ${paket.nama_paket}`;
            document.getElementById('toBadgeText').textContent = paket.nama_paket;

            // Cek apakah tryout aktif
            const sekarang = new Date();
            const mulai = new Date(paket.waktu_mulai);
            const selesai = new Date(paket.waktu_selesai);
            const isIrtEnabled = Boolean(paket.is_irt_enabled);
            const irtCalibrated = paket.irt_status === 'CALIBRATED';

            let isGold = false;
            if (currentUser) {
                const { data: prof } = await window.db.from('profiles').select('role').eq('id', currentUser.id).single();
                isGold = prof?.role === 'gold' || prof?.role === 'admin';
            }

            if (sekarang > selesai) {
                // Kecuali Gold + IRT yang sudah terkalibrasi (mode replay)
                if (!(isIrtEnabled && irtCalibrated && isGold)) {
                    await showAlert('Tryout ini sudah berakhir.', 'Sudah Berakhir', '🔒');
                    window.location.href = 'tryout.html';
                    return;
                }
            }

            if (sekarang < mulai) {
                await showAlert(`Tryout ini belum dibuka. Jadwal buka: ${formatTgl(mulai)}`, 'Belum Dibuka', '🔒');
                window.location.href = 'tryout.html';
                return;
            }

            // Cek apakah tryout butuh unlock dengan credit (untuk user non-gold)
            if (window.CreditSystem && !isGold) {
                const needsCredit = await window.CreditSystem.needsCreditSystem();
                if (needsCredit) {
                    const isUnlocked = await window.CreditSystem.isContentUnlocked('tryout', tryoutId);
                    if (!isUnlocked) {
                        const userRole = await window.CreditSystem.getUserRole();
                        const isSilver = userRole === 'silver';
                        const msg = isSilver
                            ? 'Silakan buka/klaim tryout ini terlebih dahulu melalui katalog tryout (tersedia jatah gratis Paket Silver)!'
                            : 'Silakan unlock tryout ini terlebih dahulu dengan credit melalui katalog tryout!';
                        await showAlert(msg, 'Akses Belum Terbuka', '🔒');
                        window.location.href = 'tryout.html';
                        return;
                    }
                }
            }

            // Cek apakah user SUDAH terdaftar sebelumnya
            const { data: existingReg, error: regErr } = await window.db
                .from('tryout_pendaftaran')
                .select('id')
                .eq('paket_id', tryoutId)
                .eq('user_id', currentUser.id)
                .maybeSingle();

            if (existingReg) {
                // Sudah terdaftar, langsung arahkan ke persiapan subtes
                window.location.href = `detail-tryout.html?id=${tryoutId}`;
                return;
            }

            // Preload indeks prodi untuk pencarian realtime di frontend.
            // Tidak perlu ditunggu di sini; performSearch akan menunggunya bila perlu.
            prodiSearchIndexPromise = loadProdiSearchIndex();

            // Setup Event Listeners untuk slot search inputs
            setupSearchInputs();

            // Render validasi awal
            updateValidationUI();

        } catch (err) {
            console.error('Init error:', err);
            await showAlert('Gagal memuat data pendaftaran: ' + err.message, 'Kesalahan', '❌');
            window.location.href = 'tryout.html';
        }
    }

    // 2. Preload indeks prodi untuk pencarian frontend
    async function loadProdiSearchIndex() {
        const pageSize = 1000;
        let from = 0;
        let hasMore = true;
        const allProdis = [];

        try {
            while (hasMore) {
                const { data, error } = await window.db
                    .from('prodi')
                    .select(`
                        id, nama_prodi, jenjang, rumpun, kode_prodi,
                        ptn ( id, nama_ptn, kode_ptn ),
                        prodi_daya_tampung ( tahun, daya_tampung, peminat ),
                        prodi_estimasi_skor ( estimasi_skor_min, estimasi_skor_aman )
                    `)
                    .eq('aktif', true)
                    .order('id')
                    .range(from, from + pageSize - 1);

                if (error) throw error;

                const batch = data || [];
                allProdis.push(...batch);
                hasMore = batch.length === pageSize;
                from += pageSize;
            }

            cachedProdis = allProdis.map(prodi => ({
                ...prodi,
                // Token gabungan memungkinkan: "Teknik Informatika ITS"
                // dan "ITS Teknik Informatika" menemukan hasil yang sama.
                searchTokens: tokenizeSearchText(`${prodi.nama_prodi || ''} ${prodi.ptn?.nama_ptn || ''}`)
            }));
        } catch (error) {
            console.warn('Gagal memuat indeks pencarian prodi:', error);
            throw error;
        }
    }

    // 3. Setup Search Inputs untuk Slot 1-4
    function setupSearchInputs() {
        [1, 2, 3, 4].forEach(slot => {
            const input = document.getElementById(`search-input-${slot}`);
            const dropdown = document.getElementById(`dropdown-${slot}`);

            if (!input || !dropdown) return;
            // setupSearchInputs dipanggil kembali saat slot ditampilkan/direset.
            // Jangan memasang listener berulang pada input yang sama.
            if (input.dataset.searchListenerBound === 'true') return;
            input.dataset.searchListenerBound = 'true';

            input.addEventListener('input', () => {
                const query = input.value.trim();
                clearTimeout(searchDebounceTimers[slot]);

                if (query.length < 2) {
                    dropdown.innerHTML = '';
                    dropdown.classList.remove('active');
                    return;
                }

                dropdown.innerHTML = '<div style="padding: 1rem; color: var(--text-secondary); text-align: center;">⏳ Mencari program studi...</div>';
                dropdown.classList.add('active');

                searchDebounceTimers[slot] = setTimeout(() => {
                    performSearch(query, slot);
                }, 300);
            });

            // Tutup dropdown jika klik di luar
            document.addEventListener('click', (e) => {
                if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                    dropdown.classList.remove('active');
                }
            });

            // Tampilkan dropdown kembali jika input diklik dan ada isi
            input.addEventListener('focus', () => {
                if (input.value.trim().length >= 2 && dropdown.children.length > 0) {
                    dropdown.classList.add('active');
                }
            });
        });
    }

    // 4. Pencarian Prodi & PTN
    async function performSearch(query, slot) {
        const dropdown = document.getElementById(`dropdown-${slot}`);
        if (!dropdown) return;

        try {
            if (prodiSearchIndexPromise) {
                await prodiSearchIndexPromise;
            }

            // Abaikan hasil pencarian yang sudah tidak sesuai dengan input terbaru.
            const input = document.getElementById(`search-input-${slot}`);
            if (!input || input.value.trim() !== query) return;

            const queryTokens = tokenizeSearchText(query);
            if (queryTokens.length === 0) {
                dropdown.innerHTML = '';
                dropdown.classList.remove('active');
                return;
            }

            const data = cachedProdis
                .filter(prodi => queryTokens.every(queryToken =>
                    prodi.searchTokens.some(dataToken => dataToken.startsWith(queryToken))
                ))
                .sort((a, b) => getSearchScore(b, queryTokens) - getSearchScore(a, queryTokens))
                .slice(0, 20);

            if (!data || data.length === 0) {
                dropdown.innerHTML = `
                    <div style="padding: 1.25rem; color: var(--text-secondary); text-align: center;">
                        Tidak ditemukan program studi untuk "<strong>${escapeHtml(query)}</strong>".<br>
                        <small style="color: var(--text-muted);">Cari dengan nama prodi, PTN, atau keduanya. Pastikan penulisan nama PTN/singkatannya sesuai data.</small>
                    </div>
                `;
                return;
            }

            // Render hasil pencarian
            dropdown.innerHTML = data.map(item => {
                const jenjangClass = (item.jenjang || 'S1').toLowerCase();
                const dayaTampung = item.prodi_daya_tampung?.[0];
                const estimasi = item.prodi_estimasi_skor?.[0];
                const ptnName = item.ptn?.nama_ptn || 'PTN';

                return `
                    <div class="ptn-search-item" data-prodi-id="${item.id}">
                        <div class="ptn-item-main">
                            <div class="ptn-item-name">${escapeHtml(item.nama_prodi)}</div>
                            <div class="ptn-item-univ">
                                <span>🏛️ ${escapeHtml(ptnName)}</span>
                                ${dayaTampung ? `<span>• Kuota: ${dayaTampung.daya_tampung || '-'}</span>` : ''}
                            </div>
                        </div>
                        <div class="ptn-item-badge-wrap">
                            <span class="jenjang-badge ${jenjangClass}">${escapeHtml(item.jenjang || 'S1')}</span>
                            ${item.rumpun ? `<span class="rumpun-badge">${escapeHtml(item.rumpun)}</span>` : ''}
                            ${estimasi?.estimasi_skor_aman ? `<span class="meta-chip score-chip">Target: ~${estimasi.estimasi_skor_aman}</span>` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            // Event listener klik item
            dropdown.querySelectorAll('.ptn-search-item').forEach(el => {
                el.addEventListener('click', () => {
                    const prodiId = parseInt(el.getAttribute('data-prodi-id'), 10);
                    const selected = data.find(p => p.id === prodiId);
                    if (selected) {
                        selectProdi(slot, selected);
                    }
                });
            });

        } catch (err) {
            console.error('Search error:', err);
            dropdown.innerHTML = `<div style="padding: 1rem; color: var(--error); text-align: center;">Gagal mencari: ${err.message}</div>`;
        }
    }

    /** Normalisasi agar kapital, tanda baca, dan spasi berlebih tidak memengaruhi pencarian. */
    function tokenizeSearchText(text) {
        return String(text || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
    }

    /**
     * Urutkan hasil paling relevan terlebih dahulu tanpa mengubah aturan cocoknya:
     * semua kata query tetap harus ditemukan, dan boleh berada di prodi atau PTN.
     */
    function getSearchScore(prodi, queryTokens) {
        const prodiTokens = tokenizeSearchText(prodi.nama_prodi);
        const ptnTokens = tokenizeSearchText(prodi.ptn?.nama_ptn);

        return queryTokens.reduce((score, queryToken) => {
            if (prodiTokens.includes(queryToken) || ptnTokens.includes(queryToken)) return score + 4;
            if (prodiTokens.some(token => token.startsWith(queryToken))) return score + 2;
            if (ptnTokens.some(token => token.startsWith(queryToken))) return score + 1;
            return score;
        }, 0);
    }

    // 5. Pilih Prodi untuk Slot
    function selectProdi(slot, prodi) {
        // Cek duplikasi prodi di slot lain
        for (const [s, p] of Object.entries(selectedChoices)) {
            if (parseInt(s, 10) !== slot && p && p.id === prodi.id) {
                showAlert(`Program studi "${prodi.nama_prodi}" sudah Anda pilih di Pilihan ${s}. Silakan pilih program studi lain.`, 'Pilihan Duplikat', '⚠️');
                return;
            }
        }

        selectedChoices[slot] = prodi;

        // Render card preview terpilih
        renderSelectedView(slot, prodi);

        // Update validasi
        updateValidationUI();
    }

    // 6. Render Card View Prodi Terpilih
    function renderSelectedView(slot, prodi) {
        const slotBody = document.getElementById(`slot-body-${slot}`);
        const slotCard = document.getElementById(`slot-${slot}`);
        const dropdown = document.getElementById(`dropdown-${slot}`);
        if (dropdown) dropdown.classList.remove('active');

        if (!slotBody || !slotCard) return;

        slotCard.classList.add('is-filled');

        const jenjangClass = (prodi.jenjang || 'S1').toLowerCase();
        const ptnName = prodi.ptn?.nama_ptn || 'Perguruan Tinggi Negeri';
        const dayaTampung = prodi.prodi_daya_tampung?.[0];
        const estimasi = prodi.prodi_estimasi_skor?.[0];

        slotBody.innerHTML = `
            <div class="selected-prodi-view">
                <div class="selected-prodi-info">
                    <h4>${escapeHtml(prodi.nama_prodi)}</h4>
                    <div class="selected-prodi-univ">🏛️ ${escapeHtml(ptnName)}</div>
                    <div class="selected-meta-chips">
                        <span class="jenjang-badge ${jenjangClass}">${escapeHtml(prodi.jenjang || 'S1')}</span>
                        ${prodi.rumpun ? `<span class="rumpun-badge">${escapeHtml(prodi.rumpun)}</span>` : ''}
                        ${dayaTampung ? `<span class="meta-chip">Daya Tampung: <strong>${dayaTampung.daya_tampung ?? '-'}</strong></span>` : ''}
                        ${dayaTampung?.peminat ? `<span class="meta-chip">Peminat: <strong>${dayaTampung.peminat.toLocaleString('id-ID')}</strong></span>` : ''}
                        ${estimasi?.estimasi_skor_aman ? `<span class="meta-chip score-chip">Skor Aman: <strong>${estimasi.estimasi_skor_aman}</strong></span>` : ''}
                    </div>
                </div>
                <button type="button" class="btn-change-prodi" onclick="resetSlotSearch(${slot})">
                    🔄 Ganti Pilihan
                </button>
            </div>
        `;
    }

    // Reset slot kembali ke input search
    window.resetSlotSearch = function(slot) {
        selectedChoices[slot] = null;
        const slotBody = document.getElementById(`slot-body-${slot}`);
        const slotCard = document.getElementById(`slot-${slot}`);

        if (slotCard) slotCard.classList.remove('is-filled');

        if (slotBody) {
            slotBody.innerHTML = `
                <div class="ptn-search-box">
                    <span class="ptn-search-icon">🔍</span>
                    <input type="text" class="ptn-search-input" id="search-input-${slot}" placeholder="Cari prodi atau universitas pilihan ${slot}..." autocomplete="off">
                    <p class="ptn-search-hint">Cari nama prodi, PTN, atau keduanya. Contoh: Teknik Informatika ITS.</p>
                    <div class="ptn-dropdown-results" id="dropdown-${slot}"></div>
                </div>
            `;
            setupSearchInputs();
        }

        updateValidationUI();
    };

    // 7. Toggle Tambah / Hapus Pilihan 3 & 4
    window.tambahPilihan = function(slot) {
        if (slot === 3) {
            slotVisible[3] = true;
            document.getElementById('slot-3').style.display = 'block';
            document.getElementById('btnAddChoice3').style.display = 'none';
            document.getElementById('btnAddChoice4').style.display = 'inline-flex';
        } else if (slot === 4) {
            if (!slotVisible[3] || !selectedChoices[3]) {
                showAlert('Silakan pilih prodi pada Pilihan 3 terlebih dahulu sebelum menambah Pilihan 4.', 'Perhatian', '⚠️');
                return;
            }
            slotVisible[4] = true;
            document.getElementById('slot-4').style.display = 'block';
            document.getElementById('btnAddChoice4').style.display = 'none';
        }
        setupSearchInputs();
        updateValidationUI();
    };

    window.hapusPilihan = function(slot) {
        if (slot === 4) {
            slotVisible[4] = false;
            selectedChoices[4] = null;
            document.getElementById('slot-4').style.display = 'none';
            resetSlotSearch(4);
            document.getElementById('btnAddChoice4').style.display = 'inline-flex';
        } else if (slot === 3) {
            // Jika hapus slot 3, slot 4 juga harus ditutup
            if (slotVisible[4]) {
                hapusPilihan(4);
            }
            slotVisible[3] = false;
            selectedChoices[3] = null;
            document.getElementById('slot-3').style.display = 'none';
            resetSlotSearch(3);
            document.getElementById('btnAddChoice3').style.display = 'inline-flex';
            document.getElementById('btnAddChoice4').style.display = 'none';
        }
        updateValidationUI();
    };

    // 8. Validasi Aturan Resmi SNBT
    function evaluateValidation() {
        const activeChoices = [];
        if (selectedChoices[1]) activeChoices.push(selectedChoices[1]);
        if (selectedChoices[2]) activeChoices.push(selectedChoices[2]);
        if (slotVisible[3] && selectedChoices[3]) activeChoices.push(selectedChoices[3]);
        if (slotVisible[4] && selectedChoices[4]) activeChoices.push(selectedChoices[4]);

        const total = activeChoices.length;
        const s1Count = activeChoices.filter(p => (p.jenjang || '').toUpperCase() === 'S1').length;
        const d4Count = activeChoices.filter(p => (p.jenjang || '').toUpperCase() === 'D4').length;
        const d3Count = activeChoices.filter(p => (p.jenjang || '').toUpperCase() === 'D3').length;
        const vokasiCount = d4Count + d3Count;

        // Cek duplicate
        const ids = activeChoices.map(p => p.id);
        const hasDuplicate = new Set(ids).size !== ids.length;

        let isValid = false;
        let message = '';

        if (hasDuplicate) {
            message = 'Terdapat program studi yang sama dipilih lebih dari satu kali. Pilihan harus berbeda.';
        } else if (!selectedChoices[1] || !selectedChoices[2]) {
            message = 'Pilihan 1 dan Pilihan 2 wajib diisi (minimal 2 program studi terpilih).';
        } else if (slotVisible[3] && !selectedChoices[3]) {
            message = 'Slot Pilihan 3 sedang terbuka. Silakan pilih program studi atau klik "Hapus Pilihan 3".';
        } else if (slotVisible[4] && !selectedChoices[4]) {
            message = 'Slot Pilihan 4 sedang terbuka. Silakan pilih program studi atau klik "Hapus Pilihan 4".';
        } else if (total === 2) {
            isValid = true;
            message = '✅ Pilihan memenuhi syarat SNBT: 2 program studi (bebas Sarjana/Vokasi).';
        } else if (total === 3) {
            if (s1Count === 3) {
                message = '⚠️ Tidak boleh memilih 3 Sarjana (S1). Sesuai aturan 3 pilihan SNBT, wajib kombinasi Sarjana dan Vokasi (contoh: 2 S1 + 1 Vokasi atau 1 S1 + 2 Vokasi).';
            } else if (vokasiCount === 3) {
                message = '⚠️ Tidak boleh memilih 3 Vokasi (D4/D3). Sesuai aturan 3 pilihan SNBT, wajib kombinasi Sarjana dan Vokasi (contoh: 1 S1 + 2 Vokasi atau 2 S1 + 1 Vokasi).';
            } else {
                isValid = true;
                message = `✅ Pilihan memenuhi syarat SNBT: 3 program studi (${s1Count} Sarjana + ${vokasiCount} Vokasi).`;
            }
        } else if (total === 4) {
            if (s1Count !== 2 || vokasiCount !== 2) {
                message = `⚠️ Untuk 4 pilihan SNBT, wajib terdiri dari 2 Sarjana (S1) dan 2 Vokasi (D4/D3). Saat ini terpilih: ${s1Count} Sarjana dan ${vokasiCount} Vokasi.`;
            } else if (d3Count < 1) {
                message = '⚠️ Untuk 4 pilihan SNBT, minimal 1 di antara program Vokasi harus merupakan jenjang Diploma Tiga (D3). Saat ini belum ada pilihan program D3.';
            } else {
                isValid = true;
                message = `✅ Pilihan memenuhi syarat SNBT: 4 program studi (2 Sarjana + 2 Vokasi dengan minimal 1 D3).`;
            }
        }

        return { isValid, message, total, s1Count, d4Count, d3Count };
    }

    // 9. Update UI Validasi
    function updateValidationUI() {
        const val = evaluateValidation();

        document.getElementById('countTotal').textContent = `${val.total} / 4`;
        document.getElementById('countS1').textContent = val.s1Count;
        document.getElementById('countD4').textContent = val.d4Count;
        document.getElementById('countD3').textContent = val.d3Count;

        const badgeEl = document.getElementById('valStatusBadge');
        const badgeText = document.getElementById('valStatusText');
        const msgBox = document.getElementById('valMessageBox');
        const btnSubmit = document.getElementById('btnSubmitDaftar');

        if (val.isValid) {
            badgeEl.className = 'val-status-badge valid';
            badgeEl.innerHTML = '<span>✅</span> <span>Memenuhi Syarat SNBT</span>';
            msgBox.className = 'val-message-box valid';
            msgBox.textContent = val.message;
            btnSubmit.disabled = false;
        } else {
            badgeEl.className = 'val-status-badge invalid';
            badgeEl.innerHTML = '<span>⚠️</span> <span>Belum Memenuhi Syarat</span>';
            msgBox.className = 'val-message-box invalid';
            msgBox.textContent = val.message;
            btnSubmit.disabled = true;
        }
    }

    // 10. Konfirmasi & Submit Pendaftaran
    window.submitPendaftaran = async function() {
        const val = evaluateValidation();
        if (!val.isValid) {
            showAlert(val.message, 'Validasi Belum Lengkap', '⚠️');
            return;
        }

        const btnSubmit = document.getElementById('btnSubmitDaftar');
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<span>⏳</span> Memproses Pendaftaran...';

        try {
            // Rangkum pilihan untuk modal konfirmasi
            let summaryHtml = '<ul style="text-align: left; margin: 0.75rem 0 1rem 1.25rem; line-height: 1.6; font-size: 0.95rem;">';
            summaryHtml += `<li><strong>Pilihan 1:</strong> ${escapeHtml(selectedChoices[1].nama_prodi)} (${selectedChoices[1].jenjang}) - ${escapeHtml(selectedChoices[1].ptn?.nama_ptn || '')}</li>`;
            summaryHtml += `<li><strong>Pilihan 2:</strong> ${escapeHtml(selectedChoices[2].nama_prodi)} (${selectedChoices[2].jenjang}) - ${escapeHtml(selectedChoices[2].ptn?.nama_ptn || '')}</li>`;
            if (slotVisible[3] && selectedChoices[3]) {
                summaryHtml += `<li><strong>Pilihan 3:</strong> ${escapeHtml(selectedChoices[3].nama_prodi)} (${selectedChoices[3].jenjang}) - ${escapeHtml(selectedChoices[3].ptn?.nama_ptn || '')}</li>`;
            }
            if (slotVisible[4] && selectedChoices[4]) {
                summaryHtml += `<li><strong>Pilihan 4:</strong> ${escapeHtml(selectedChoices[4].nama_prodi)} (${selectedChoices[4].jenjang}) - ${escapeHtml(selectedChoices[4].ptn?.nama_ptn || '')}</li>`;
            }
            summaryHtml += '</ul>';
            summaryHtml += '<p style="color: var(--error); font-size: 0.88rem; font-weight: 600;">⚠️ Pilihan ini bersifat PERMANEN dan tidak dapat diubah setelah dikonfirmasi.</p>';

            const confirmed = await showConfirm(
                `Apakah Anda yakin ingin mendaftar ke <strong>${escapeHtml(tryoutPaket.nama_paket)}</strong> dengan pilihan program studi berikut?<br>${summaryHtml}`,
                'Konfirmasi Pendaftaran Tryout',
                '🏛️'
            );

            if (!confirmed) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = '<span>🚀</span> Konfirmasi & Daftar Tryout';
                return;
            }

            // Ambil session terbaru untuk memastikan token autentikasi valid dan fresh
            const { data: sessionData, error: sessionErr } = await window.db.auth.getSession();
            const activeUser = sessionData?.session?.user || currentUser;

            if (!activeUser) {
                await showAlert('Sesi login Anda telah berakhir. Silakan login kembali.', 'Sesi Berakhir', '⚠️');
                window.location.href = 'login.html';
                return;
            }
            currentUser = activeUser;

            // Simpan pendaftaran ke database
            const payload = {
                user_id: activeUser.id,
                paket_id: tryoutId,
                pilihan_1_prodi_id: parseInt(selectedChoices[1].id, 10),
                pilihan_2_prodi_id: parseInt(selectedChoices[2].id, 10),
                pilihan_3_prodi_id: (slotVisible[3] && selectedChoices[3]) ? parseInt(selectedChoices[3].id, 10) : null,
                pilihan_4_prodi_id: (slotVisible[4] && selectedChoices[4]) ? parseInt(selectedChoices[4].id, 10) : null,
                status: 'terdaftar'
            };

            const { data, error } = await window.db
                .from('tryout_pendaftaran')
                .insert(payload);

            if (error) {
                // Tangani jika sudah terdaftar
                if (error.code === '23505') {
                    await showAlert('Anda sudah terdaftar pada tryout ini.', 'Sudah Terdaftar', 'ℹ️');
                    window.location.href = `detail-tryout.html?id=${tryoutId}`;
                    return;
                }
                throw error;
            }

            await showAlert(
                `Selamat! Anda telah resmi terdaftar di <strong>${escapeHtml(tryoutPaket.nama_paket)}</strong>.<br><br>Target program studi impian Anda telah tersimpan. Silakan mulai pengerjaan subtes ujian!`,
                'Pendaftaran Berhasil! 🎉',
                '✅'
            );

            // Arahkan ke ruang persiapan subtes
            window.location.href = `detail-tryout.html?id=${tryoutId}`;

        } catch (err) {
            console.error('Submit error:', err);
            await showAlert('Terjadi kesalahan saat mendaftar: ' + (err.message || err), 'Gagal Mendaftar', '❌');
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = '<span>🚀</span> Konfirmasi & Daftar Tryout';
        }
    };

    // Helpers
    function escapeHtml(text) {
        if (!text) return '';
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    function formatTgl(d) {
        return new Date(d).toLocaleString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    async function showAlert(msg, title, icon) {
        if (typeof window.showScyraAlert === 'function') {
            await window.showScyraAlert(msg, title, icon);
        } else {
            alert(msg.replace(/<[^>]+>/g, ''));
        }
    }

    async function showConfirm(msg, title, icon) {
        if (typeof window.showScyraConfirm === 'function') {
            return await window.showScyraConfirm(msg, title, icon);
        } else {
            return confirm(msg.replace(/<[^>]+>/g, ''));
        }
    }
});

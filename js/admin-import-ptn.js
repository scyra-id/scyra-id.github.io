document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('ptnJsonFiles');
    const dropzone = document.getElementById('ptnDropzone');
    const startButton = document.getElementById('btnStartPtnImport');
    const fileList = document.getElementById('ptnFileList');
    const summary = document.getElementById('ptnFileSummary');
    const previewCount = document.getElementById('ptnPreviewCount');
    const importLog = document.getElementById('ptnImportLog');
    let entries = [];

    checkAdmin();
    fileInput.addEventListener('change', () => readFiles(fileInput.files));
    dropzone.addEventListener('dragover', event => {
        event.preventDefault();
        dropzone.classList.add('dragging');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
    dropzone.addEventListener('drop', event => {
        event.preventDefault();
        dropzone.classList.remove('dragging');
        readFiles(event.dataTransfer.files);
    });
    startButton.addEventListener('click', importFiles);
    document.getElementById('btnClearPtnLog').addEventListener('click', () => {
        importLog.innerHTML = '<p class="ptn-empty">Belum ada proses import.</p>';
    });

    async function checkAdmin() {
        if (!window.db) return setTimeout(checkAdmin, 100);
        const { data: { user } } = await window.db.auth.getUser();
        if (!user) return window.location.href = 'login.html';
        const { data: profile } = await window.db.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role !== 'admin') window.location.href = 'dashboard.html';
    }

    async function readFiles(files) {
        entries = await Promise.all(Array.from(files).map(readFile));
        await detectExistingPtn();
        renderPreview();
    }

    async function readFile(file) {
        const entry = { file, payload: null, valid: false, existing: false, error: '' };
        if (!file.name.toLowerCase().endsWith('.json')) {
            entry.error = 'File harus berekstensi .json.';
            return entry;
        }
        try {
            entry.payload = normalizePayload(JSON.parse(await file.text()), file.name);
            const ptn = entry.payload.ptn || entry.payload;
            const prodi = entry.payload.prodi || entry.payload.program_studi || [];
            if (!ptn.kode_ptn || !ptn.nama_ptn) throw new Error('Field ptn.kode_ptn dan ptn.nama_ptn wajib ada.');
            if (!Array.isArray(prodi)) throw new Error('Field prodi harus berupa array.');
            const invalidProdi = prodi.find(item => !item.id_prodi_snpmb || !item.nama_prodi);
            if (invalidProdi) throw new Error('Setiap prodi wajib memiliki id_prodi_snpmb dan nama_prodi.');
            entry.valid = true;
        } catch (error) {
            entry.error = error.message || 'JSON tidak valid.';
        }
        return entry;
    }

    async function detectExistingPtn() {
        const codes = [...new Set(entries.filter(entry => entry.valid).map(entry => String((entry.payload.ptn || entry.payload).kode_ptn).trim()))];
        if (!codes.length) return;
        const { data, error } = await window.db.from('ptn').select('kode_ptn').in('kode_ptn', codes);
        if (error) {
            console.warn('Tidak dapat memeriksa PTN lama:', error);
            return;
        }
        const existingCodes = new Set((data || []).map(item => item.kode_ptn));
        entries.forEach(entry => {
            if (entry.valid) entry.existing = existingCodes.has(String((entry.payload.ptn || entry.payload).kode_ptn).trim());
        });
    }

    function renderPreview() {
        const validCount = entries.filter(entry => entry.valid).length;
        const existingCount = entries.filter(entry => entry.existing).length;
        summary.textContent = `${entries.length} file dipilih, ${validCount} valid${existingCount ? `, ${existingCount} sudah ada` : ''}.`;
        previewCount.textContent = `${entries.length} file`;
        startButton.disabled = validCount === 0;
        fileList.innerHTML = entries.length ? entries.map(entry => {
            const ptn = entry.payload?.ptn || entry.payload;
            const prodiCount = entry.payload?.prodi?.length || entry.payload?.program_studi?.length || 0;
            const status = !entry.valid ? ['invalid', 'Tidak Valid'] : entry.existing ? ['exists', 'Sudah Ada'] : ['valid', 'Siap Import'];
            return `<div class="ptn-file-row"><div><span class="ptn-file-name">${escapeHtml(entry.file.name)}</span><span class="ptn-file-meta">${entry.valid ? `${escapeHtml(ptn.kode_ptn)} - ${escapeHtml(ptn.nama_ptn)} | ${prodiCount} prodi` : escapeHtml(entry.error)}</span></div><span class="ptn-status ${status[0]}">${status[1]}</span></div>`;
        }).join('') : '<p class="ptn-empty">Pilih file JSON untuk melihat validasinya.</p>';
    }

    async function importFiles() {
        startButton.disabled = true;
        const validEntries = entries.filter(entry => entry.valid);
        appendLog('Memulai import...', 'valid');
        for (const entry of validEntries) {
            const ptn = entry.payload.ptn || entry.payload;
            let allowUpdate = false;
            if (entry.existing) {
                const confirmed = await confirmUpdate(ptn.kode_ptn, ptn.nama_ptn);
                if (!confirmed) {
                    appendLog(`${ptn.kode_ptn} dilewati.`, 'exists');
                    continue;
                }
                allowUpdate = true;
            }
            try {
                const { data, error } = await window.db.rpc('import_ptn_json', {
                    p_payload: entry.payload,
                    p_allow_update: allowUpdate
                });
                if (error) throw error;
                if (data?.status === 'exists') {
                    appendLog(`${ptn.kode_ptn} sudah ada dan tidak diperbarui.`, 'exists');
                } else {
                    appendLog(`${ptn.kode_ptn} ${data?.status === 'updated' ? 'berhasil diperbarui' : 'berhasil diimport'} (${data?.prodi_count || 0} prodi).`, data?.status || 'created');
                }
            } catch (error) {
                console.error('PTN import failed:', error);
                appendLog(`${ptn.kode_ptn}: ${error.message || 'Import gagal.'}`, 'failed');
            }
        }
        await detectExistingPtn();
        renderPreview();
        startButton.disabled = entries.filter(entry => entry.valid).length === 0;
    }

    async function confirmUpdate(kode, nama) {
        const message = `Data PTN <strong>${escapeHtml(kode)} - ${escapeHtml(nama)}</strong> sudah ada.<br><br>Apakah Anda ingin mengupdate data PTN ini? Data PTN dan prodi dengan ID yang sama akan diperbarui.`;
        return typeof window.showScyraConfirm === 'function'
            ? window.showScyraConfirm(message, '🔄 Update Data PTN?', '🏛️')
            : window.confirm(`Data PTN ${kode} - ${nama} sudah ada. Apakah Anda ingin mengupdate data PTN ini?`);
    }

    function appendLog(message, status) {
        if (importLog.querySelector('.ptn-empty')) importLog.innerHTML = '';
        const row = document.createElement('div');
        row.className = 'ptn-log-row';
        row.innerHTML = `<span>${escapeHtml(message)}</span><span class="ptn-status ${status}">${status.toUpperCase()}</span>`;
        importLog.prepend(row);
    }

    function escapeHtml(value) {
        const element = document.createElement('div');
        element.textContent = value == null ? '' : String(value);
        return element.innerHTML;
    }

    function normalizePayload(raw, fileName = '') {
        // Canonical files can pass through unchanged. This branch supports the
        // existing PTN dataset, where a file has root-level PTN fields and a
        // `prodi_list` collection with concise capacity and score fields.
        if (!Array.isArray(raw?.prodi_list)) return raw;

        const kodePtn = String(raw.kode_ptn || createPtnCode(raw.nama_ptn, fileName)).trim();
        const tahunKuota = Number(raw.tahun_daya_tampung || raw.tahun || 2026);
        const tahunSkor = Number(raw.tahun_target_skor || raw.tahun_target || 2027);
        const sourceUrl = raw.source_url || raw.website || null;
        const retrievedAt = raw.source_retrieved_at || null;

        return {
            ptn: {
                kode_ptn: kodePtn,
                nama_ptn: raw.nama_ptn,
                jenis_ptn: raw.jenis_ptn || 'Akademik',
                is_akademik: raw.is_akademik ?? true,
                is_vokasi: raw.is_vokasi ?? false,
                is_ptnbh: raw.is_ptnbh ?? false,
                is_ptkin: raw.is_ptkin ?? false,
                website: raw.website,
                alamat: raw.alamat || raw.lokasi,
                provinsi: raw.provinsi || extractProvince(raw.lokasi),
                keterangan: raw.keterangan,
                source_url: sourceUrl,
                source_retrieved_at: retrievedAt
            },
            prodi: raw.prodi_list.map(item => {
                const kodeProdi = String(item.kode_prodi || '').trim();
                const subtes = Array.isArray(item.subtes_prioritas) ? item.subtes_prioritas : [];
                return {
                    // The source lacks the official SNPMB ID. This deterministic
                    // composite key is stable across later uploads of this dataset.
                    id_prodi_snpmb: item.id_prodi_snpmb || `${kodePtn}-${kodeProdi}`,
                    kode_prodi: kodeProdi || null,
                    nama_prodi: item.nama_prodi,
                    jurusan: item.jurusan || null,
                    jenjang: item.jenjang || 'S1',
                    rumpun: item.rumpun || null,
                    aktif: item.aktif ?? true,
                    source_url: item.source_url || sourceUrl,
                    source_retrieved_at: item.source_retrieved_at || retrievedAt,
                    daya_tampung: item.daya_tampung == null ? [] : [{
                        tahun: item.tahun_daya_tampung || tahunKuota,
                        jalur: item.jalur || 'SNBT',
                        daya_tampung: item.daya_tampung,
                        peminat: item.peminat ?? item.peminat_tahun_lalu ?? null,
                        terima: item.terima ?? null,
                        source_url: item.source_url || sourceUrl,
                        source_retrieved_at: item.source_retrieved_at || retrievedAt
                    }],
                    subtes_prioritas: subtes.map((value, index) => typeof value === 'string'
                        ? { nama_subtes: value, urutan_prioritas: index + 1 }
                        : value),
                    estimasi_skor: (item.estimasi_skor_min == null && item.estimasi_skor_aman == null) ? [] : [{
                        tahun_target: item.tahun_target_skor || tahunSkor,
                        jalur: 'SNBT',
                        estimasi_skor_min: item.estimasi_skor_min ?? null,
                        estimasi_skor_aman: item.estimasi_skor_aman ?? null,
                        confidence_label: item.confidence_label || 'rendah',
                        metodologi: item.metodologi || raw.keterangan || 'Estimasi dari dataset PTN.',
                        sample_size: item.sample_size ?? null,
                        sumber_estimasi: item.sumber_estimasi || 'Dataset PTN',
                        is_official_cutoff: false
                    }]
                };
            })
        };
    }

    function extractProvince(lokasi) {
        if (!lokasi || typeof lokasi !== 'string') return null;
        const pieces = lokasi.split(',').map(part => part.trim()).filter(Boolean);
        return pieces.length > 1 ? pieces.at(-1) : null;
    }

    function createPtnCode(namaPtn, fileName) {
        const source = String(namaPtn || fileName.replace(/\.json$/i, '')).trim();
        const ignoredWords = new Set(['dan', 'di', 'dari', 'ke', 'untuk']);
        const words = source.split(/\s+/).filter(word => word && !ignoredWords.has(word.toLowerCase()));
        const acronym = words.map(word => word[0]).join('').toUpperCase();
        // kode_ptn supports up to 20 characters. A predictable code makes a
        // repeated upload of source files without kode_ptn update the same PTN.
        return (acronym || source.replace(/[^a-z0-9]/gi, '').toUpperCase()).slice(0, 20);
    }
});

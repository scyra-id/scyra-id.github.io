const safeAlert = (m, t="Info", i="✅") => window.showScyraAlert ? window.showScyraAlert(m, t, i) : alert(m);
const safeConfirm = (m, t="Konfirmasi") => window.showScyraConfirm ? window.showScyraConfirm(m, t) : confirm(m);

// Helper konversi format tanggal
function toLocalInputFormat(isoString) {
    if(!isoString) return '';
    const d = new Date(isoString);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0,16);
}
function formatTampil(iso) {
    if(!iso) return '-';
    return new Date(iso).toLocaleString('id-ID', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'});
}

document.addEventListener('DOMContentLoaded', () => {
    const checkAdmin = async () => {
        if (!window.db) return setTimeout(checkAdmin, 100);
        const { data: { user } } = await window.db.auth.getUser();
        if (!user) return window.location.href = 'login.html';
        const { data: profile } = await window.db.from('profiles').select('role').eq('id', user.id).single();
        if (!profile || profile.role !== 'admin') return window.location.href = 'index.html';
        initPage();
    };
    checkAdmin();
});

async function initPage() {
    await loadPaket();
    setupModal();
    setupPoolModal();
}

let activePoolSubtes = null;
let activePoolQuestions = [];
let selectedPoolQuestionIds = new Set();

function setupModal() {
    const modal = document.getElementById('paketModalOverlay');
    const form = document.getElementById('formPaket');
    const enableIRTCheckbox = document.getElementById('enableIRT');
    const irtWindowFields = document.getElementById('irtWindowFields');

    // Toggle IRT window fields visibility
    enableIRTCheckbox.addEventListener('change', () => {
        irtWindowFields.style.display = enableIRTCheckbox.checked ? 'block' : 'none';
        
        // Set default IRT window dates (3 days from waktu_mulai)
        if (enableIRTCheckbox.checked) {
            const waktuMulai = document.getElementById('waktuMulai').value;
            if (waktuMulai) {
                const start = new Date(waktuMulai);
                const end = new Date(start);
                end.setDate(end.getDate() + 3); // 3 days window
                
                document.getElementById('irtWindowStart').value = waktuMulai;
                document.getElementById('irtWindowEnd').value = toLocalInputFormat(end.toISOString());
            }
        }
    });

    // Auto-set IRT window when waktu_mulai changes (if IRT enabled)
    document.getElementById('waktuMulai').addEventListener('change', () => {
        if (enableIRTCheckbox.checked) {
            const waktuMulai = document.getElementById('waktuMulai').value;
            if (waktuMulai) {
                const start = new Date(waktuMulai);
                const end = new Date(start);
                end.setDate(end.getDate() + 3);
                
                document.getElementById('irtWindowStart').value = waktuMulai;
                document.getElementById('irtWindowEnd').value = toLocalInputFormat(end.toISOString());
            }
        }
    });

    document.getElementById('btnOpenPaketModal').onclick = () => {
        form.reset();
        document.getElementById('paketId').value = '';
        document.getElementById('paketModalTitle').textContent = 'Buat Paket Baru';
        irtWindowFields.style.display = 'none';
        enableIRTCheckbox.checked = false;
        modal.classList.add('active');
    };

    document.getElementById('btnClosePaketModal').onclick = () => modal.classList.remove('active');

    form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const origText = btn.textContent;
        btn.disabled = true; btn.textContent = '⏳ Menyimpan...';

        const id = document.getElementById('paketId').value;
        const isIRTEnabled = document.getElementById('enableIRT').checked;
        
        const payload = {
            nama_paket: document.getElementById('namaPaket').value,
            waktu_mulai: new Date(document.getElementById('waktuMulai').value).toISOString(),
            waktu_selesai: new Date(document.getElementById('waktuSelesai').value).toISOString(),
            status: document.getElementById('statusPaket').value,
            is_irt_enabled: isIRTEnabled
        };

        // Add IRT window fields if enabled
        if (isIRTEnabled) {
            const irtStart = document.getElementById('irtWindowStart').value;
            const irtEnd = document.getElementById('irtWindowEnd').value;
            
            if (!irtStart || !irtEnd) {
                btn.disabled = false;
                btn.textContent = origText;
                return await safeAlert('IRT window harus diisi jika IRT diaktifkan!', '⚠️ Peringatan', '⚠️');
            }

            const windowDuration = new Date(irtEnd).getTime() - new Date(irtStart).getTime();
            if (windowDuration !== 72 * 60 * 60 * 1000) {
                btn.disabled = false;
                btn.textContent = origText;
                return await safeAlert('Window IRT harus berlangsung tepat 3 hari (72 jam).', '⚠️ Peringatan', '⚠️');
            }
            
            payload.irt_window_start = new Date(irtStart).toISOString();
            payload.irt_window_end = new Date(irtEnd).toISOString();
            payload.irt_status = 'SCHEDULED';
        } else {
            payload.irt_window_start = null;
            payload.irt_window_end = null;
            payload.irt_status = 'DISABLED';
        }

        try {
            if (id) {
                const { error } = await window.db.from('paket_tryout').update(payload).eq('id', id);
                if (error) throw error;
                await safeAlert('Perubahan paket disimpan!', 'Berhasil', '✅');
            } else {
                const { data: pBaru, error: e1 } = await window.db.from('paket_tryout').insert(payload).select('id').single();
                if (e1) throw e1;

                const templateSubtes = [
                    { nama_subtes: 'Penalaran Umum', kategori_db: 'PU', waktu_menit: 30, jml_soal: 30 },
                    { nama_subtes: 'Pengetahuan Kuantitatif', kategori_db: 'PK', waktu_menit: 20, jml_soal: 15 },
                    { nama_subtes: 'Pemahaman Bacaan & Menulis', kategori_db: 'PBM', waktu_menit: 25, jml_soal: 20 },
                    { nama_subtes: 'Pengetahuan & Pemahaman Umum', kategori_db: 'PPU', waktu_menit: 15, jml_soal: 20 },
                    { nama_subtes: 'Literasi Bahasa Indonesia', kategori_db: 'LBI', waktu_menit: 45, jml_soal: 30 },
                    { nama_subtes: 'Literasi Bahasa Inggris', kategori_db: 'LBE', waktu_menit: 30, jml_soal: 20 },
                    { nama_subtes: 'Penalaran Matematika', kategori_db: 'PM', waktu_menit: 30, jml_soal: 20 }
                ].map(s => ({ ...s, paket_id: pBaru.id }));

                const { error: e2 } = await window.db.from('subtes_tryout').insert(templateSubtes);
                if (e2) throw e2;
                await safeAlert('Paket & 7 Subtes otomatis dibuat!', 'Berhasil', '🎉');
            }
            modal.classList.remove('active');
            loadPaket();
        } catch (err) {
            await safeAlert('Gagal: ' + err.message, '⚠️ Error', '❌');
        } finally {
            btn.disabled = false; btn.textContent = origText;
        }
    };
}

async function loadPaket() {
    const container = document.getElementById('paketContainer');
    try {
        const { data, error } = await window.db.from('paket_tryout')
            .select('*, subtes_tryout(count)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        if (data.length === 0) return container.innerHTML = '<p>Belum ada paket.</p>';

        let html = '';
        data.forEach(p => {
            const jmlSubtes = p.subtes_tryout[0]?.count || 0;
            const now = new Date();
            const start = new Date(p.waktu_mulai);
            const end = new Date(p.waktu_selesai);
            
            // Penentuan Status Gembok untuk di UI Admin
            let lockStatus = `<span style="color:#4caf50;">🟢 Sedang Berjalan</span>`;
            if (now < start) lockStatus = `<span style="color:#f44336;">🔒 Belum Dimulai</span>`;
            else if (now > end) lockStatus = `<span style="color:#f44336;">🔒 Sudah Berakhir</span>`;
            
            // IRT Status Badge
            let irtBadge = '';
            if (p.is_irt_enabled) {
                const irtStatusColors = {
                    'DISABLED': '#9e9e9e',
                    'SCHEDULED': '#2196f3',
                    'LIVE': '#ff9800',
                    'CALIBRATING': '#f44336',
                    'COMPLETED': '#4caf50'
                };
                const irtStatusLabels = {
                    'DISABLED': 'IRT Disabled',
                    'SCHEDULED': 'IRT Terjadwal',
                    'LIVE': '🔴 IRT LIVE',
                    'CALIBRATING': '⚙️ Kalibrasi',
                    'COMPLETED': '✅ IRT Selesai'
                };
                const color = irtStatusColors[p.irt_status] || '#9e9e9e';
                const label = irtStatusLabels[p.irt_status] || p.irt_status;
                irtBadge = `<span style="font-size:0.75rem; padding:0.25rem 0.6rem; border-radius:12px; font-weight:bold; background:${color}20; color:${color}; margin-left:0.5rem;">🎯 ${label}</span>`;
            }
            
            // IRT Window Info
            let irtWindowInfo = '';
            if (p.is_irt_enabled && p.irt_window_start && p.irt_window_end) {
                irtWindowInfo = `
                    <div style="margin-top:0.75rem; padding:0.75rem; background:rgba(212,175,55,0.1); border-left:3px solid var(--brand-accent); border-radius:4px;">
                        <strong style="color:var(--brand-accent);">🎯 IRT Window:</strong><br>
                        <span style="font-size:0.85rem;">
                            Mulai: ${formatTampil(p.irt_window_start)}<br>
                            Selesai: ${formatTampil(p.irt_window_end)}<br>
                            Peserta: ${p.irt_total_participants || 0} user
                        </span>
                    </div>
                `;
            }
            
            html += `
            <div class="paket-card" style="background:var(--bg-secondary); border:1px solid var(--border-color); padding:1.5rem; border-radius:12px; margin-bottom:1rem;">
                <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                    <div>
                        <h3 style="color:var(--brand-primary); margin:0 0 0.5rem 0;">${p.nama_paket}</h3>
                        <span style="font-size:0.85rem; padding:0.3rem 0.8rem; border-radius:20px; font-weight:bold; background:${p.status === 'aktif' ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)'}; color:${p.status === 'aktif' ? '#4caf50' : '#f44336'};">${p.status.toUpperCase()}</span>
                        ${irtBadge}
                    </div>
                    <div>
                        <button onclick="editPaket('${p.id}')" class="btn-outline" style="padding:0.4rem 0.8rem;">✏️ Edit</button>
                        <button onclick="aturPoolSoal('${p.id}')" class="btn-outline" style="padding:0.4rem 0.8rem;">📚 Pool Soal</button>
                        <button onclick="hapusPaket('${p.id}')" class="btn-outline" style="padding:0.4rem 0.8rem; border-color:var(--error); color:var(--error);">🗑️</button>
                    </div>
                </div>
                <div style="color:var(--text-secondary); font-size:0.9rem; display:flex; flex-direction:column; gap:0.3rem;">
                    <div>📅 Mulai: <strong>${formatTampil(p.waktu_mulai)}</strong></div>
                    <div>⏳ Tutup: <strong>${formatTampil(p.waktu_selesai)}</strong></div>
                    <div>Status Waktu: ${lockStatus} | 📚 ${jmlSubtes} Subtes</div>
                </div>
                ${irtWindowInfo}
            </div>`;
        });
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<p>Gagal memuat paket.</p>';
    }
}

window.editPaket = async (id) => {
    const { data: p } = await window.db.from('paket_tryout').select('*').eq('id', id).single();
    if (!p) return;
    document.getElementById('paketModalTitle').textContent = 'Edit Paket';
    document.getElementById('paketId').value = p.id;
    document.getElementById('namaPaket').value = p.nama_paket;
    document.getElementById('waktuMulai').value = toLocalInputFormat(p.waktu_mulai);
    document.getElementById('waktuSelesai').value = toLocalInputFormat(p.waktu_selesai);
    document.getElementById('statusPaket').value = p.status;
    
    // Set IRT fields
    const enableIRTCheckbox = document.getElementById('enableIRT');
    const irtWindowFields = document.getElementById('irtWindowFields');
    
    enableIRTCheckbox.checked = p.is_irt_enabled || false;
    irtWindowFields.style.display = p.is_irt_enabled ? 'block' : 'none';
    
    if (p.is_irt_enabled) {
        document.getElementById('irtWindowStart').value = toLocalInputFormat(p.irt_window_start);
        document.getElementById('irtWindowEnd').value = toLocalInputFormat(p.irt_window_end);
    }
    
    document.getElementById('paketModalOverlay').classList.add('active');
};

window.hapusPaket = async (id) => {
    if (!await safeConfirm('Yakin ingin menghapus paket tryout ini?', '🗑️ Hapus Paket?')) return;
    await window.db.from('paket_tryout').delete().eq('id', id);
    loadPaket();
};

function setupPoolModal() {
    const overlay = document.getElementById('poolModalOverlay');
    document.getElementById('btnClosePoolModal').onclick = () => overlay.classList.remove('active');
    document.getElementById('poolQuestionSearch').addEventListener('input', renderPoolQuestions);
    document.getElementById('btnSavePool').onclick = savePoolSoal;
}

window.aturPoolSoal = async (paketId) => {
    const { data: subtes, error } = await window.db.from('subtes_tryout')
        .select('*').eq('paket_id', paketId).order('nama_subtes');
    if (error) return safeAlert(`Gagal memuat subtes: ${error.message}`, '⚠️ Error', '⚠️');
    if (!subtes?.length) return safeAlert('Paket ini belum memiliki subtes.', '⚠️ Info', '⚠️');

    document.getElementById('poolModalTitle').textContent = 'Atur Pool Soal';
    document.getElementById('poolModalInfo').textContent = 'Pilih subtes yang pool soalnya ingin diatur.';
    document.getElementById('poolSubtestChooser').innerHTML = subtes.map(item => `
        <button type="button" class="btn-outline" data-pool-subtes-id="${item.id}" style="text-align: left; padding: .75rem 1rem;">
            <strong>${item.nama_subtes}</strong> <span style="color: var(--text-secondary);">(${(item.soal_pool_ids || []).length}/${item.jml_soal} soal di pool)</span>
        </button>
    `).join('');
    document.getElementById('poolQuestionSearch').style.display = 'none';
    document.getElementById('poolQuestionList').style.display = 'none';
    document.getElementById('btnSavePool').style.display = 'none';
    document.getElementById('poolSelectedCount').style.display = 'none';
    document.querySelectorAll('[data-pool-subtes-id]').forEach(button => {
        button.addEventListener('click', () => openSubtestPool(subtes.find(item => item.id === button.dataset.poolSubtesId)));
    });
    document.getElementById('poolModalOverlay').classList.add('active');
};

async function openSubtestPool(subtes) {
    if (!subtes) return;
    activePoolSubtes = subtes;
    selectedPoolQuestionIds = new Set(activePoolSubtes.soal_pool_ids || []);
    const { data: kategori, error: kategoriError } = await window.db.from('kategori')
        .select('id, nama_mapel, slug').or(`slug.eq.${activePoolSubtes.kategori_db},nama_mapel.eq.${activePoolSubtes.nama_subtes}`).maybeSingle();
    if (kategoriError || !kategori) return safeAlert('Kategori untuk subtes ini tidak ditemukan.', '⚠️ Error', '⚠️');

    const { data: questions, error: questionError } = await window.db.from('bank_soal')
        .select('id, pertanyaan_html, tipe_soal').eq('kategori_id', kategori.id).order('created_at', { ascending: false });
    if (questionError) return safeAlert(`Gagal memuat bank soal: ${questionError.message}`, '⚠️ Error', '⚠️');

    activePoolQuestions = questions || [];
    document.getElementById('poolModalTitle').textContent = `Pool Soal: ${activePoolSubtes.nama_subtes}`;
    document.getElementById('poolModalInfo').textContent = `Pilih minimal ${activePoolSubtes.jml_soal} soal. Setiap peserta menerima ${activePoolSubtes.jml_soal} soal acak dari pool ini.`;
    document.getElementById('poolSubtestChooser').innerHTML = '';
    document.getElementById('poolQuestionSearch').value = '';
    document.getElementById('poolQuestionSearch').style.display = 'block';
    document.getElementById('poolQuestionList').style.display = 'block';
    document.getElementById('btnSavePool').style.display = 'inline-block';
    document.getElementById('poolSelectedCount').style.display = 'block';
    renderPoolQuestions();
}

function renderPoolQuestions() {
    const search = document.getElementById('poolQuestionSearch').value.toLowerCase();
    const visible = activePoolQuestions.filter(question => stripHtml(question.pertanyaan_html).toLowerCase().includes(search));
    document.getElementById('poolQuestionList').innerHTML = visible.length ? visible.map(question => `
        <label style="display: flex; gap: .75rem; padding: .85rem 1rem; border-bottom: 1px solid var(--border-color); cursor: pointer;">
            <input type="checkbox" data-pool-soal-id="${question.id}" ${selectedPoolQuestionIds.has(question.id) ? 'checked' : ''}>
            <span><strong>${question.tipe_soal || 'pg'}</strong><br>${stripHtml(question.pertanyaan_html).slice(0, 220)}</span>
        </label>
    `).join('') : '<p style="padding: 1rem;">Tidak ada soal yang cocok.</p>';
    document.querySelectorAll('[data-pool-soal-id]').forEach(input => {
        input.addEventListener('change', () => {
            if (input.checked) selectedPoolQuestionIds.add(input.dataset.poolSoalId);
            else selectedPoolQuestionIds.delete(input.dataset.poolSoalId);
            updatePoolSelectedCount();
        });
    });
    updatePoolSelectedCount();
}

function updatePoolSelectedCount() {
    document.getElementById('poolSelectedCount').textContent = `${selectedPoolQuestionIds.size} soal dipilih`;
}

async function savePoolSoal() {
    if (!activePoolSubtes) return;
    if (selectedPoolQuestionIds.size < activePoolSubtes.jml_soal) {
        return safeAlert(`Pool harus memuat minimal ${activePoolSubtes.jml_soal} soal.`, '⚠️ Pool Belum Cukup', '⚠️');
    }
    const { error } = await window.db.from('subtes_tryout').update({
        soal_pool_ids: Array.from(selectedPoolQuestionIds)
    }).eq('id', activePoolSubtes.id);
    if (error) return safeAlert(`Gagal menyimpan pool: ${error.message}`, '⚠️ Error', '❌');
    document.getElementById('poolModalOverlay').classList.remove('active');
    await safeAlert('Pool soal berhasil disimpan.', 'Berhasil', '✅');
}

function stripHtml(html) {
    const element = document.createElement('div');
    element.innerHTML = html || '';
    return element.textContent || element.innerText || '';
}

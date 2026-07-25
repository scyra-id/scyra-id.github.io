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
}

function setupModal() {
    const modal = document.getElementById('paketModalOverlay');
    const form = document.getElementById('formPaket');

    document.getElementById('btnOpenPaketModal').onclick = () => {
        form.reset();
        document.getElementById('paketId').value = '';
        document.getElementById('paketModalTitle').textContent = 'Buat Paket Baru';
        modal.classList.add('active');
    };

    document.getElementById('btnClosePaketModal').onclick = () => modal.classList.remove('active');

    form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const origText = btn.textContent;
        btn.disabled = true; btn.textContent = '⏳ Menyimpan...';

        const id = document.getElementById('paketId').value;
        const payload = {
            nama_paket: document.getElementById('namaPaket').value,
            waktu_mulai: new Date(document.getElementById('waktuMulai').value).toISOString(),
            waktu_selesai: new Date(document.getElementById('waktuSelesai').value).toISOString(),
            status: document.getElementById('statusPaket').value
        };

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
            
            html += `
            <div class="paket-card" style="background:var(--bg-secondary); border:1px solid var(--border-color); padding:1.5rem; border-radius:12px; margin-bottom:1rem;">
                <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                    <div>
                        <h3 style="color:var(--brand-primary); margin:0 0 0.5rem 0;">${p.nama_paket}</h3>
                        <span style="font-size:0.85rem; padding:0.3rem 0.8rem; border-radius:20px; font-weight:bold; background:${p.status === 'aktif' ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)'}; color:${p.status === 'aktif' ? '#4caf50' : '#f44336'};">${p.status.toUpperCase()}</span>
                    </div>
                    <div>
                        <button onclick="editPaket('${p.id}')" class="btn-outline" style="padding:0.4rem 0.8rem;">✏️ Edit</button>
                        <button onclick="hapusPaket('${p.id}')" class="btn-outline" style="padding:0.4rem 0.8rem; border-color:var(--error); color:var(--error);">🗑️</button>
                    </div>
                </div>
                <div style="color:var(--text-secondary); font-size:0.9rem; display:flex; flex-direction:column; gap:0.3rem;">
                    <div>📅 Mulai: <strong>${formatTampil(p.waktu_mulai)}</strong></div>
                    <div>⏳ Tutup: <strong>${formatTampil(p.waktu_selesai)}</strong></div>
                    <div>Status Waktu: ${lockStatus} | 📚 ${jmlSubtes} Subtes</div>
                </div>
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
    document.getElementById('paketModalOverlay').classList.add('active');
};

window.hapusPaket = async (id) => {
    if (!await safeConfirm('Yakin ingin menghapus paket tryout ini?', '🗑️ Hapus Paket?')) return;
    await window.db.from('paket_tryout').delete().eq('id', id);
    loadPaket();
};
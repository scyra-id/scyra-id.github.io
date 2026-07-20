document.addEventListener('DOMContentLoaded', () => {
    // 1. Pengecekan Admin Guard (Sama seperti admin materi)
    const checkAdmin = async () => {
        if (!window.db) return setTimeout(checkAdmin, 100);
        
        const { data: { user } } = await window.db.auth.getUser();
        if (!user) return window.location.href = 'login.html';
        
        const { data: profile } = await window.db.from('profiles').select('role').eq('id', user.id).single();
        if (!profile || profile.role !== 'admin') return window.location.href = 'index.html';
        
        initPage(); // Lolos, jalankan sistem!
    };
    
    checkAdmin();
});

// ==========================================
// INISIALISASI VARIABEL & EVENT LISTENER
// ==========================================
const modal = document.getElementById('modalOverlay');
const btnOpen = document.getElementById('btnOpenModal');
const btnClose = document.getElementById('btnCloseModal');
const form = document.getElementById('kategoriForm');
const tableBody = document.getElementById('kategoriTableBody');

function initPage() {
    loadKategori();
    
    // Buka Modal Tambah
    btnOpen.addEventListener('click', () => {
        form.reset();
        document.getElementById('kategoriId').value = '';
        document.getElementById('modalTitle').textContent = 'Tambah Mapel Baru';
        modal.classList.add('active');
    });

    // Tutup Modal
    btnClose.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    // Submit Form (Simpan/Edit)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await simpanKategori();
    });
}

// ==========================================
// FUNGSI CRUD (Koneksi ke Supabase)
// ==========================================

// READ: Ambil data dari tabel kategori
async function loadKategori() {
    // Mengambil data dan mengurutkan berdasarkan jenjang lalu nama mapel
    const { data, error } = await window.db.from('kategori')
        .select('*')
        .order('jenjang')
        .order('nama_mapel');
        
    if (error) {
        console.error(error);
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--error);">Gagal memuat data</td></tr>`;
        return;
    }

    if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 2rem;">Belum ada mapel. Klik tombol "+ Tambah Mapel" di atas.</td></tr>`;
        return;
    }

    // Render ke HTML
    tableBody.innerHTML = data.map(k => `
        <tr>
            <td style="font-size: 1.8rem; text-align: center;">${k.icon || '📚'}</td>
            <td style="font-weight: 600; color: var(--text-primary);">${k.nama_mapel}</td>
            <td>
                <span class="badge badge-publik" style="text-transform: uppercase;">${k.jenjang || 'UTBK'}</span>
            </td>
            <td>
                <button onclick="editKategori('${k.id}')" style="background:none; border:none; cursor:pointer; color:var(--brand-primary); margin-right:15px; font-weight:600;">✏️ Edit</button>
                <button onclick="hapusKategori('${k.id}')" style="background:none; border:none; cursor:pointer; color:var(--error); font-weight:600;">🗑️ Hapus</button>
            </td>
        </tr>
    `).join('');
}

// CREATE / UPDATE: Simpan data ke tabel
async function simpanKategori() {
    const btnSubmit = form.querySelector('button[type="submit"]');
    const originalText = btnSubmit.innerHTML;
    btnSubmit.innerHTML = 'Menyimpan...';
    btnSubmit.disabled = true;

    const id = document.getElementById('kategoriId').value;
    const payload = {
        icon: document.getElementById('icon').value,
        nama_mapel: document.getElementById('nama_mapel').value,
        jenjang: document.getElementById('jenjang').value
    };

    let result;
    if (id) {
        // Jika ada ID, berarti UPDATE
        result = await window.db.from('kategori').update(payload).eq('id', id);
    } else {
        // Jika tidak ada ID, berarti INSERT BARU
        result = await window.db.from('kategori').insert([payload]);
    }

    if (result.error) {
        alert('Gagal menyimpan: ' + result.error.message);
    } else {
        modal.classList.remove('active');
        loadKategori(); // Refresh tabel otomatis
    }

    btnSubmit.innerHTML = originalText;
    btnSubmit.disabled = false;
}

// EDIT: Lempar data ke Modal
window.editKategori = async (id) => {
    const { data, error } = await window.db.from('kategori').select('*').eq('id', id).single();
    if (data) {
        document.getElementById('kategoriId').value = data.id;
        document.getElementById('icon').value = data.icon;
        document.getElementById('nama_mapel').value = data.nama_mapel;
        document.getElementById('jenjang').value = data.jenjang || 'utbk';
        
        document.getElementById('modalTitle').textContent = 'Edit Mapel';
        modal.classList.add('active');
    }
};

// DELETE: Hapus data
window.hapusKategori = async (id) => {
    const isConfirmed = confirm('⚠️ YAKIN HAPUS MAPEL INI?\n\nJika dihapus, materi yang terhubung dengan mapel ini bisa error.');
    
    if (isConfirmed) {
        const { error } = await window.db.from('kategori').delete().eq('id', id);
        if (error) {
            alert('Gagal menghapus: ' + error.message);
        } else {
            loadKategori(); // Refresh tabel otomatis
        }
    }
};
let quill;
let kategoriList = [];

if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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
    await loadKategori();
    await loadMateri();
    initQuill();
    setupManualModal();
    setupAutoModal();
    setupImageUploader(); // Panggil fungsi upload gambar
}

async function loadKategori() {
    const { data, error } = await window.db.from('kategori').select('*').order('nama_mapel');
    if (error) return console.error(error);
    kategoriList = data;
    
    const select = document.getElementById('kategori');
    if(select) {
        select.innerHTML = '';
        data.forEach(k => select.innerHTML += `<option value="${k.id}">${k.nama_mapel}</option>`);
    }
}

async function loadMateri() {
    const tbody = document.getElementById('materiTableBody');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Memuat...</td></tr>'; // Colspan jadi 6
    
    const { data, error } = await window.db
        .from('materi')
        .select('*, kategori(nama_mapel)')
        .order('created_at', { ascending: false });
        
    if (error) return console.error(error);
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Belum ada materi.</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    data.forEach(m => {
        const katName = m.kategori ? m.kategori.nama_mapel : '-';
        const badgeClass = m.status === 'publik' ? 'badge-publik' : 'badge-draft';
        const tgl = new Date(m.created_at).toLocaleDateString('id-ID');
        
        // Tampilan Nomor Bab (Kasih warna biar jelas mana yang premium)
        const babNum = m.nomor_bab || 1;
        const babBadge = babNum === 1 
            ? `<span class="badge badge-free">Free</span>` 
            : `<span class="badge badge-premium">Bab ${babNum}</span>`;

        tbody.innerHTML += `
            <tr>
                <td><strong>${m.judul}</strong></td>
                <td>${katName}</td>
                <td>${babBadge}</td> <!-- KOLOM BARU -->
                <td><span class="badge ${badgeClass}">${m.status}</span></td>
                <td>${tgl}</td>
                <td>
                    <button class="btn-action btn-edit" onclick="editMateri('${m.id}')">Edit</button>
                    <button class="btn-action btn-delete" onclick="hapusMateri('${m.id}')">Hapus</button>
                </td>
            </tr>
        `;
    });
}

function initQuill() {
    const editorContainer = document.getElementById('editor-container');
    if (!editorContainer) return;

    const toolbarOptions = {
        container: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            ['link', 'image', 'clean']
        ],
        handlers: {
            image: async function () {
                const input = document.createElement('input');
                input.setAttribute('type', 'file');
                input.setAttribute('accept', 'image/*');
                input.click();
                input.onchange = async () => {
                    const file = input.files[0];
                    if (!file) return;
                    let fileName = file.name
                        .replace(/\s+/g, '-')
                        .toLowerCase()
                        .replace(/[^a-z0-9\-_.]/g, '');
                    if (!fileName) fileName = `image-${Date.now()}.jpg`;
                    const { data, error } = await window.db.storage.from('materi-images').upload(fileName, file);
                    if (error) return showScyraAlert('Gagal upload gambar: ' + error.message, '⚠️ Error', '⚠️');
                    const { data: urlData } = window.db.storage.from('materi-images').getPublicUrl(fileName);
                    const range = this.quill.getSelection();
                    this.quill.insertEmbed(range.index, 'image', urlData.publicUrl);
                };
            }
        }
    };

    quill = new Quill('#editor-container', { theme: 'snow', modules: { toolbar: toolbarOptions } });
}

// =======================================================
// 🚨 MESIN UPLOAD GAMBAR BARU KE SUPABASE (UNTUK KOLOM KANAN)
// =======================================================
function setupImageUploader() {
    const fileInput = document.getElementById('gambarFileInput');
    if (!fileInput) return;
    
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const btn = document.querySelector('button[onclick*="gambarFileInput"]');
        const origText = btn.innerHTML;
        btn.innerHTML = '⏳ Uploading...'; 
        btn.disabled = true;

        try {
            let fileName = file.name
                .replace(/\s+/g, '-')
                .toLowerCase()
                .replace(/[^a-z0-9\-_.]/g, '');
            if (!fileName) fileName = `image-${Date.now()}.jpg`;
            const { data, error } = await window.db.storage.from('materi-images').upload(fileName, file);
            if (error) throw error;
            
            const { data: urlData } = window.db.storage.from('materi-images').getPublicUrl(fileName);
            const shortcode = `[GAMBAR: ${urlData.publicUrl}]`;
            
            if (quill) {
                const range = quill.getSelection(true);
                const index = range ? range.index : quill.getLength();
                quill.clipboard.dangerouslyPasteHTML(index, `<p>${shortcode}</p><p><br></p>`);
                quill.setSelection(index + 2);
            }
            await showScyraAlert('Gambar berhasil di-upload! Shortcode otomatis tersisip.', '✅ Sukses', '🖼️');
        } catch(err) { 
            await showScyraAlert('Gagal upload: ' + err.message, '⚠️ Error', '❌');
        } finally { 
            btn.innerHTML = origText; 
            btn.disabled = false; 
            e.target.value = ''; 
        }
    };
}

// =======================================================
// 🚨 PARSER MENTAH AGAR AMAN DARI QUILL
// =======================================================
function parsePdfToRawHTML(linesArray) {
    let html = '';
    let currentP = '';
    linesArray.forEach(line => {
        let trimmed = line.trim();
        if (!trimmed) return;
        
        // 🔥 DETEKSI KHUSUS: Jawaban/Kunci Jawaban (BIAR TERPISAH)
        if (/^(Jawaban|Kunci Jawaban)\s*[:\-]?\s*[A-Ea-e]/i.test(trimmed)) {
            if (currentP) { html += `<p>${currentP}</p>`; currentP = ''; }
            html += `<p>${trimmed}</p>`;
            return;
        }
        
        // Deteksi Heading
        if (trimmed.length < 80 && /^(BAB|CHAPTER|MODUL|\d+\.)/i.test(trimmed) && !trimmed.includes('|') && !trimmed.includes('Trap') && !trimmed.includes('FYI')) {
            if (currentP) { html += `<p>${currentP}</p>`; currentP = ''; }
            html += `<h2>${trimmed}</h2>`;
        } 
        // Deteksi Tabel PDF
        else if (trimmed.includes('|') || (trimmed.includes('","') && trimmed.includes('"'))) {
            if (currentP) { html += `<p>${currentP}</p>`; currentP = ''; }
            let safeRow = trimmed.replace(/","/g, '|').replace(/"/g, ''); 
            html += `<p>${safeRow}</p>`;
        } 
        // Paragraf biasa (Rekatkan kalimat yang terpotong)
        else {
            currentP += (currentP ? ' ' : '') + trimmed;
            if (/[.?!]$/.test(trimmed)) {
                html += `<p>${currentP}</p>`;
                currentP = '';
            }
        }
    });
    if (currentP) html += `<p>${currentP}</p>`;
    return html;
}

function setupManualModal() {
    const modal = document.getElementById('modalOverlay');
    if (!modal) return;

    document.getElementById('btnOpenModal').onclick = () => {
        document.getElementById('modalTitle').textContent = 'Tambah Materi Baru';
        document.getElementById('materiForm').reset();
        document.getElementById('materiId').value = '';
        document.getElementById('nomorBab').value = '1';
        if(quill) quill.root.innerHTML = ''; 
        modal.classList.add('active');
    };
    
    document.getElementById('btnCloseModal').onclick = () => modal.classList.remove('active');
    modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('active'); };

    const btnImport = document.getElementById('btnImportPdf');
    const fileInput = document.getElementById('pdfFileInput');
    
    if(btnImport && fileInput) {
        btnImport.onclick = () => fileInput.click();
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            btnImport.disabled = true; btnImport.textContent = '⏳ Membaca...';
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let allLines = [];
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    let lines = {};
                    textContent.items.forEach(item => {
                        const y = Math.round(item.transform[5]); 
                        if (!lines[y]) lines[y] = [];
                        lines[y].push(item.str);
                    });
                    const sortedYs = Object.keys(lines).sort((a, b) => b - a);
                    sortedYs.forEach(y => {
                        const lineText = lines[y].join(' ').trim();
                        if (lineText) allLines.push(lineText);
                    });
                }
                
                // Gunakan Parser mentah
                let fullHtml = parsePdfToRawHTML(allLines);
                
                if(quill) quill.root.innerHTML = fullHtml;
                await showScyraAlert('PDF berhasil di-import ke editor!', '✅ Sukses Import', '📥');
            } catch (err) { 
                await showScyraAlert('Gagal membaca PDF: ' + err.message, '⚠️ Error', '⚠️'); 
            } finally { 
                btnImport.disabled = false; 
                btnImport.innerHTML = '📥 Import dari PDF'; 
                fileInput.value=''; 
            }
        };
    }

    document.getElementById('materiForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true; btn.textContent = 'Menyimpan...';
        const id = document.getElementById('materiId').value;
        const judul = document.getElementById('judul').value.trim();
        const kategori_id = document.getElementById('kategori').value;
        const status = document.getElementById('status').value;
        const konten_html = quill ? quill.root.innerHTML : '';
        const nomor_bab = parseInt(document.getElementById('nomorBab').value) || 1; 
        const slug = judul.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '') + '-' + Date.now();

        try {
            if (id) {
                await window.db.from('materi').update({ judul, kategori_id, status, konten_html }).eq('id', id);
            } else {
                const { data: { user } } = await window.db.auth.getUser();
                await window.db.from('materi').insert({ judul, slug, kategori_id, status, konten_html, created_by: user.id });
            }
            await showScyraAlert('Materi berhasil disimpan dan dipublikasikan!', '✅ Sukses', '✅');
            modal.classList.remove('active');
            loadMateri(); 
        } catch (err) { 
            await showScyraAlert('Gagal menyimpan: ' + err.message, '⚠️ Error', '⚠️'); 
        } finally { 
            btn.disabled = false; 
            btn.textContent = 'Simpan Materi'; 
        }
    };
}

function setupAutoModal() {
    const btnOpen = document.getElementById('btnOpenAutoModal');
    const modal = document.getElementById('autoModalOverlay');
    const btnClose = document.getElementById('btnCloseAutoModal');
    const form = document.getElementById('autoUploadForm');

    if (!btnOpen || !modal) return;

    btnOpen.onclick = () => { form.reset(); modal.classList.add('active'); };
    btnClose.onclick = () => modal.classList.remove('active');
    modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('active'); };

    // 🚨 KEMBALINYA AI DETEKSI KATEGORI (FULL DICTIONARY MILIK LU) 🚨
    const kataKunciMapel = {
        'penalaran-umum': ['silogisme', 'premis', 'kesimpulan', 'logika', 'argumen', 'jika maka', 'penalaran', 'deduktif', 'induktif', 'inferensi', 'analitis'],
        'pengetahuan-pemahaman-umum': ['makna kata', 'sinonim', 'antonim', 'istilah', 'pemahaman', 'konteks', 'kalimat', 'kata'],
        'pemahaman-bacaan-menulis': ['puebi', 'ejaan', 'tata bahasa', 'konjungsi', 'kalimat efektif', 'paragraf', 'gagasan', 'judul', 'menulis', 'huruf kapital'],
        'pengetahuan-kuantitatif': ['bilangan', 'persamaan', 'geometri', 'aljabar', 'rumus', 'hitung', 'aritmatika', 'pecahan', 'persen', 'kuantitatif'],
        'literasi-bahasa-indonesia': ['gagasan utama', 'teks', 'bacaan', 'indonesia', 'penulis', 'artikel', 'wacana', 'paragraf', 'bahasa indonesia'],
        'literasi-bahasa-inggris': ['the ', 'and ', 'passage', 'reading', 'comprehension', 'based on the text', 'english', 'paragraph', 'according to', 'which of the following'],
        'penalaran-matematika': ['fungsi', 'statistik', 'peluang', 'data', 'grafik', 'diagram', 'rata-rata', 'median', 'distribusi', 'matematika']
    };

    function detectKategori(teksLengkap, barisAwal) {
        const teksLower = teksLengkap.toLowerCase();
        const barisAwalLower = barisAwal.join(' ').toLowerCase();
        let skor = {};
        Object.keys(kataKunciMapel).forEach(slug => skor[slug] = 0);

        Object.entries(kataKunciMapel).forEach(([slug, keywords]) => {
            const namaMapel = slug.replace(/-/g, ' ');
            if (barisAwalLower.includes(namaMapel)) skor[slug] += 15;
        });

        Object.entries(kataKunciMapel).forEach(([slug, keywords]) => {
            keywords.forEach(kw => {
                const regex = new RegExp(kw.toLowerCase(), 'g');
                const matches = teksLower.match(regex);
                if (matches) skor[slug] += matches.length;
            });
        });

        let maxSlug = null; let maxSkor = 0;
        Object.entries(skor).forEach(([slug, s]) => {
            if (s > maxSkor) { maxSkor = s; maxSlug = slug; }
        });

        if (maxSkor >= 3 && maxSlug) return maxSlug;
        return 'pengetahuan-pemahaman-umum';
    }

    form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true; 
        const files = document.getElementById('autoPdfFile').files;
        if (!files || files.length === 0) return;

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            btn.textContent = `⏳ Memproses ${i + 1} dari ${files.length}...`;

            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let allLines = [];

                for (let p = 1; p <= pdf.numPages; p++) {
                    const page = await pdf.getPage(p);
                    const textContent = await page.getTextContent();
                    let lines = {};
                    textContent.items.forEach(item => {
                        const y = Math.round(item.transform[5]); 
                        if (!lines[y]) lines[y] = [];
                        lines[y].push(item.str);
                    });
                    const sortedYs = Object.keys(lines).sort((a, b) => b - a);
                    sortedYs.forEach(y => {
                        const lineText = lines[y].join(' ').trim();
                        if (lineText) allLines.push(lineText);
                    });
                }

                if (allLines.length === 0) throw new Error("PDF Kosong");

                let judul = allLines[0].length < 100 ? allLines[0] : file.name.replace('.pdf', '');
                const teksLengkap = allLines.join(' ');
                const barisAwal = allLines.slice(0, 10);
                const slugTerdeteksi = detectKategori(teksLengkap, barisAwal);
                const kategoriTerdeteksi = kategoriList.find(k => k.slug === slugTerdeteksi);
                const kategori_id = kategoriTerdeteksi ? kategoriTerdeteksi.id : kategoriList[0].id;
                let konten_html = parsePdfToRawHTML(allLines.slice(1));
                const slug = judul.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '') + '-' + Date.now() + '-' + i; 
                
                // 🚨 LOGIKA DETEKSI NOMOR BAB DARI NAMA FILE (BARU!)
                let nomor_bab = 1; // Default kalau gak ketemu
                // Regex mencari pola "BAB" diikuti angka (case insensitive / huruf besar-kecil bebas)
                const matchBab = file.name.match(/BAB(\d+)/i); 
                if (matchBab && matchBab[1]) {
                    nomor_bab = parseInt(matchBab[1]);
                    console.log(`🔍 Terdeteksi ${file.name} -> Bab ${nomor_bab}`);
                }

                const { data: { user } } = await window.db.auth.getUser();
                
                // 🚨 MASUKKAN nomor_bab KE DATABASE
                await window.db.from('materi').insert({
                    judul, slug, kategori_id, status: 'publik', konten_html, created_by: user.id,
                    nomor_bab 
                });
                successCount++;
            } catch (err) {
                console.error(`Gagal memproses ${file.name}:`, err);
                failCount++;
            }
        }

        if (failCount === 0) {
            await showScyraAlert(`${successCount} materi berhasil di-upload dan dipublish!`, '🚀 Sukses Total', '🏆');
        } else {
            await showScyraAlert(`Berhasil: ${successCount} file\nGagal: ${failCount} file (Cek Console F12)`, '⚠️ Selesai dengan Catatan', '⚠️');
        }

        modal.classList.remove('active');
        loadMateri();
        btn.disabled = false; 
        btn.textContent = '⚡ Deteksi & Publish Otomatis';
    };
}

window.editMateri = async (id) => {
    const { data: m } = await window.db.from('materi').select('*').eq('id', id).single();
    if (!m) return;
    document.getElementById('modalTitle').textContent = 'Edit Materi';
    document.getElementById('materiId').value = m.id;
    document.getElementById('judul').value = m.judul;
    document.getElementById('kategori').value = m.kategori_id;
    document.getElementById('status').value = m.status;
    document.getElementById('nomorBab').value = m.nomor_bab || 1;
    if(quill) quill.root.innerHTML = m.konten_html || '';
    document.getElementById('modalOverlay').classList.add('active');
};

window.hapusMateri = async (id) => {
    const isConfirmed = await showScyraConfirm('Yakin ingin menghapus materi ini secara permanen?', '🗑️ Hapus Materi', '⚠️');
    if (!isConfirmed) return;
    
    const { error } = await window.db.from('materi').delete().eq('id', id);
    if (error) return showScyraAlert('Gagal menghapus: ' + error.message, '⚠️ Error', '⚠️');
    
    await showScyraAlert('Materi berhasil dihapus.', '✅ Sukses', '✅');
    loadMateri();
};

window.insertTemplate = function(type) {
    if (!quill) return;
    const range = quill.getSelection(true);
    const index = range ? range.index : quill.getLength();

    let textSnippet = '';

    if (type === 'peta') {
        textSnippet = `<p>Fokus Materi: Tulis fokus materi disini...</p><p>Frekuensi & Estimasi: Tulis probabilitas keluar soal...</p><p>Ciri Khas: Tulis pola soal disini...</p><p><br></p>`;
    } else if (type === 'fyi') {
        textSnippet = `<p>FYI: Tulis trivia atau catatan tambahan disini...</p><p><br></p>`;
    } else if (type === 'trap') {
        textSnippet = `<p>Trap Alert: Tulis jebakan soal disini...</p><p><br></p>`;
    } else if (type === 'algo') {
        textSnippet = `<p>Langkah 1: Tindakan pertama...</p><p>Langkah 2: Tindakan kelanjutannya...</p><p><br></p>`;
    } else if (type === 'bahas') {
        textSnippet = `<p>Pembahasan: Tulis alur pemikiran dan jawaban yang benar disini...</p><p><br></p>`;
    }

    quill.clipboard.dangerouslyPasteHTML(index, textSnippet);
    quill.setSelection(index + 2);
};
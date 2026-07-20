let parsedQuestions = [];
let kategoriList = [];

// 🚨 STATE BARU UNTUK DAFTAR SOAL
let soalList = [];
let currentPage = 0;
const PAGE_SIZE = 20;
let searchTimeout = null;
let currentSearchTerm = '';
let currentFilterKategori = '';
let currentFilterMateri = '';

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
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    await loadKategori();
    setupForm();
    setupImageUploader();
    setupDaftarSoal(); 
    setupEditModal();
    await loadDaftarSoal(true); 
}

async function loadKategori() {
    const { data } = await window.db.from('kategori').select('*').order('nama_mapel');
    kategoriList = data || [];
    
    const selectKategori = document.getElementById('kategoriSoal');
    const selectMateri = document.getElementById('materiSoal');
    const filterKategori = document.getElementById('filterKategori');
    
    data.forEach(k => {
        selectKategori.innerHTML += `<option value="${k.id}">${k.nama_mapel}</option>`;
        filterKategori.innerHTML += `<option value="${k.id}">${k.nama_mapel}</option>`;
    });

    selectKategori.addEventListener('change', async (e) => {
        const katId = e.target.value;
        if (!katId) {
            selectMateri.innerHTML = '<option value="">Pilih Bab / Materi...</option>';
            selectMateri.disabled = true;
            return;
        }
        selectMateri.innerHTML = '<option value="">⏳ Memuat Daftar Bab...</option>';
        selectMateri.disabled = true;
        try {
            const { data: materiData } = await window.db.from('materi')
                .select('id, judul')
                .eq('kategori_id', katId)
                .order('nomor_bab', { ascending: true });
            if (materiData && materiData.length > 0) {
                selectMateri.innerHTML = '<option value="">Pilih Bab / Materi...</option>';
                materiData.forEach(m => selectMateri.innerHTML += `<option value="${m.id}">${m.judul}</option>`);
                selectMateri.disabled = false;
            } else {
                selectMateri.innerHTML = '<option value="">Belum ada bab untuk mapel ini</option>';
            }
        } catch (err) {
            console.error("Gagal load materi:", err);
            selectMateri.innerHTML = '<option value="">Gagal memuat data</option>';
        }
    });
}

function setupForm() {
    const form = document.getElementById('soalForm');
    const btnScan = document.getElementById('btnScan');
    form.onsubmit = async (e) => {
        e.preventDefault();
        btnScan.disabled = true;
        btnScan.textContent = '🤖 AI sedang membaca PDF...';
        parsedQuestions = [];
        const files = document.getElementById('pdfSoalFile').files;
        const katId = document.getElementById('kategoriSoal').value;
        const matId = document.getElementById('materiSoal').value;
        if (!katId || !matId) { 
            await showScyraAlert('Pilih kategori dan bab materi terlebih dahulu!', '⚠️ Peringatan', '⚠️'); 
            btnScan.disabled = false; 
            btnScan.textContent = '⚡ Scan & Simpan ke Database'; 
            return; 
        }
        try {
            for (let i = 0; i < files.length; i++) {
                const text = await extractTextFromPDF(files[i]);
                const questions = parseQuestions(text, katId, matId); 
                parsedQuestions.push(...questions);
            }
            if (parsedQuestions.length === 0) throw new Error("Tidak ada soal yang terdeteksi.");
            showPreview();
        } catch (err) {
            await showScyraAlert('Gagal memproses PDF: ' + err.message, '⚠️ Error', '⚠️');
        } finally {
            btnScan.disabled = false;
            btnScan.textContent = '⚡ Scan & Simpan ke Database';
        }
    };
    document.getElementById('btnConfirmSave').onclick = async () => {
        await saveToDatabase();
        await loadDaftarSoal(true); // 🚨 REFRESH DAFTAR SETELAH SAVE
    };
}

// =========================================================
// 🚨 FITUR BARU: DAFTAR SOAL + SEARCH + COPY UUID
// =========================================================
function setupDaftarSoal() {
    const searchInput = document.getElementById('searchSoalInput');
    const btnClearSearch = document.getElementById('btnClearSearch');
    const filterKategori = document.getElementById('filterKategori');
    const filterMateri = document.getElementById('filterMateri');
    const btnLoadMore = document.getElementById('btnLoadMore');

    // 1. SEARCH dengan Debounce (tunggu 400ms setelah user berhenti ngetik)
    searchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        btnClearSearch.style.display = val ? 'block' : 'none';
        
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentSearchTerm = val;
            loadDaftarSoal(true); // Reset pagination
        }, 400);
    });

    // 2. Clear Search Button
    btnClearSearch.addEventListener('click', () => {
        searchInput.value = '';
        btnClearSearch.style.display = 'none';
        currentSearchTerm = '';
        loadDaftarSoal(true);
    });

    // 3. Filter Kategori
    filterKategori.addEventListener('change', async (e) => {
        currentFilterKategori = e.target.value;
        currentFilterMateri = '';
        filterMateri.innerHTML = '<option value="">Semua Bab</option>';
        
        if (currentFilterKategori) {
            filterMateri.disabled = true;
            filterMateri.innerHTML = '<option value="">⏳ Memuat...</option>';
            const { data } = await window.db.from('materi')
                .select('id, judul')
                .eq('kategori_id', currentFilterKategori)
                .order('nomor_bab');
            filterMateri.innerHTML = '<option value="">Semua Bab</option>';
            (data || []).forEach(m => {
                filterMateri.innerHTML += `<option value="${m.id}">${m.judul}</option>`;
            });
            filterMateri.disabled = false;
        } else {
            filterMateri.innerHTML = '<option value="">Pilih kategori dulu</option>';
            filterMateri.disabled = true;
        }
        loadDaftarSoal(true);
    });

    // 4. Filter Materi
    filterMateri.addEventListener('change', (e) => {
        currentFilterMateri = e.target.value;
        loadDaftarSoal(true);
    });

    // 5. Load More Button
    btnLoadMore.addEventListener('click', () => {
        loadDaftarSoal(false); // Append, jangan reset
    });
}

async function loadDaftarSoal(reset = false) {
    const tbody = document.getElementById('soalTableBody');
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    const btnLoadMore = document.getElementById('btnLoadMore');

    if (reset) {
        currentPage = 0;
        soalList = [];
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;">⏳ Memuat...</td></tr>';
    }

    btnLoadMore.disabled = true;
    btnLoadMore.textContent = '⏳ Memuat...';

    try {
        // Build Query
        let query = window.db.from('bank_soal')
            .select('*, kategori(nama_mapel), materi(judul, nomor_bab)', { count: 'exact' })
            .order('created_at', { ascending: false });

        // Filter Kategori
        if (currentFilterKategori) {
            query = query.eq('kategori_id', currentFilterKategori);
        }
        // Filter Materi
        if (currentFilterMateri) {
            query = query.eq('materi_id', currentFilterMateri);
        }

        // 🔍 SEARCH LOGIC: UUID atau Kalimat
        if (currentSearchTerm) {
            // Cek apakah keyword match UUID pattern (8-4-4-4-12 hex)
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            
            if (uuidPattern.test(currentSearchTerm)) {
                // Exact match UUID
                query = query.eq('id', currentSearchTerm);
            } else if (currentSearchTerm.length >= 32 && /^[0-9a-f-]+$/i.test(currentSearchTerm)) {
                // Partial UUID match
                query = query.ilike('id', `%${currentSearchTerm}%`);
            } else {
                // Cari di pertanyaan (strip HTML tags buat search yang lebih akurat)
                query = query.ilike('pertanyaan_html', `%${currentSearchTerm}%`);
            }
        }

        // Pagination
        const from = currentPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        query = query.range(from, to);

        const { data, error, count } = await query;

        if (error) throw error;

        if (reset) {
            soalList = data || [];
        } else {
            soalList = [...soalList, ...(data || [])];
        }

        renderSoalTable();

        // Update Counter
        document.getElementById('totalSoalCount').textContent = count || 0;
        document.getElementById('displayedCount').textContent = soalList.length;
        document.getElementById('totalCount').textContent = count || 0;

        // Show/Hide Load More
        if (soalList.length < count) {
            loadMoreContainer.style.display = 'block';
            btnLoadMore.disabled = false;
            btnLoadMore.textContent = '📥 Muat Lebih Banyak';
        } else {
            loadMoreContainer.style.display = soalList.length > 0 ? 'block' : 'none';
            if (soalList.length > 0) {
                btnLoadMore.disabled = true;
                btnLoadMore.textContent = '✅ Semua soal sudah dimuat';
            }
        }

        currentPage++;
    } catch (err) {
        console.error('Load Soal Error:', err);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--error); padding: 2rem;">❌ ${err.message}</td></tr>`;
    }
}

function renderSoalTable() {
    const tbody = document.getElementById('soalTableBody');
    
    if (soalList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">📭</div>
                    <p style="margin: 0; font-size: 1.1rem;">Belum ada soal${currentSearchTerm ? ' yang cocok dengan pencarian' : ''}.</p>
                    <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem;">Upload PDF soal lewat form di atas untuk mulai mengisi bank soal.</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    soalList.forEach(soal => {
        const katName = soal.kategori ? soal.kategori.nama_mapel : '-';
        const matName = soal.materi ? soal.materi.judul : '-';
        const matNum = soal.materi && soal.materi.nomor_bab ? `Bab ${soal.materi.nomor_bab}: ` : '';
        
        // Strip HTML untuk preview pertanyaan (max 120 char)
        const plainText = (soal.pertanyaan_html || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const preview = plainText.length > 120 ? plainText.substring(0, 120) + '...' : plainText;
        
        // UUID short (8 char pertama)
        const uuidShort = soal.id.substring(0, 8);
        
        // Badge warna untuk kunci jawaban
        const kunciColors = {
            'A': '#4caf50', 'B': '#2196f3', 'C': '#ff9800', 
            'D': '#9c27b0', 'E': '#f44336'
        };
        const kunciColor = kunciColors[soal.kunci_jawaban] || '#666';

        const tr = document.createElement('tr');
                const tipeLabels = {
            'pg': '<span class="tipe-badge pg">📝 PG</span>',
            'bs': '<span class="tipe-badge bs">⚖️ B/S</span>',
            'isian': '<span class="tipe-badge isian">✏️ Isian</span>'
        };
        const tipeBadge = tipeLabels[soal.tipe_soal] || tipeLabels['pg'];

        tr.innerHTML = `
            <td>
                <div class="uuid-cell">
                    <code class="uuid-text" title="${soal.id}">${uuidShort}...</code>
                    <button class="btn-copy-uuid" onclick="copyUUID('${soal.id}')" title="Copy UUID">📋</button>
                </div>
            </td>
            <td>
                <div class="soal-preview-text">${preview}</div>
            </td>
            <td><span class="mapel-badge">${katName}</span></td>
            <td><span class="bab-text">${matNum}${matName}</span></td>
            <td style="text-align: center;">${tipeBadge}</td>
            <td style="text-align: center;">
                <span class="kunci-badge" style="background: ${kunciColor}; color: white;">${soal.kunci_jawaban || '?'}</span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action btn-edit-small" onclick="editSoal('${soal.id}')" title="Edit Soal">✏️</button>
                    <button class="btn-action btn-delete-small" onclick="hapusSoal('${soal.id}')" title="Hapus">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 🚨 COPY UUID KE CLIPBOARD
window.copyUUID = async (uuid) => {
    try {
        await navigator.clipboard.writeText(uuid);
        
        // Visual feedback
        const buttons = document.querySelectorAll('.btn-copy-uuid');
        buttons.forEach(btn => {
            if (btn.getAttribute('onclick').includes(uuid)) {
                const originalText = btn.innerHTML;
                btn.innerHTML = '✅';
                btn.style.background = 'var(--success)';
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.style.background = '';
                }, 1500);
            }
        });

        if (typeof showScyraAlert === 'function') {
            showScyraAlert(
                `UUID berhasil disalin:<br><code style="background: var(--bg-tertiary); padding: 4px 8px; border-radius: 4px; font-size: 0.85rem;">${uuid}</code>`,
                '📋 Tersalin!',
                '✅'
            );
        }
    } catch (err) {
        // Fallback untuk browser lama
        const textArea = document.createElement('textarea');
        textArea.value = uuid;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('UUID tersalin: ' + uuid);
    }
};

// 🚨 HAPUS SOAL
window.hapusSoal = async (id) => {
    const isConfirmed = await showScyraConfirm(
        'Yakin ingin menghapus soal ini secara permanen?<br>Tindakan ini tidak dapat dibatalkan.',
        '🗑️ Hapus Soal',
        '⚠️'
    );
    if (!isConfirmed) return;

    try {
        const { error } = await window.db.from('bank_soal').delete().eq('id', id);
        if (error) throw error;
        await showScyraAlert('Soal berhasil dihapus.', '✅ Sukses', '✅');
        await loadDaftarSoal(true); // Refresh
    } catch (err) {
        await showScyraAlert('Gagal menghapus: ' + err.message, '⚠️ Error', '⚠️');
    }
};

// =========================================================
// FUNGSI LAMA (TETAP SAMA)
// =========================================================
async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
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
            fullText += lines[y].join(' ') + '\n';
        });
    }
    return fullText;
}

// 🖼️ HELPER: Convert [GAMBAR: url] jadi <img> tag
function convertGambarShortcode(text) {
    if (!text) return text;
    return text.replace(
        /\[GAMBAR:\s*(.*?)\]/gi, 
        (match, url) => {
            const cleanUrl = url.trim();
            return `<img src="${cleanUrl}" class="img-soal" alt="Gambar Soal" style="max-width:100%; border-radius:8px; margin:0.8rem 0; display:block;">`;
        }
    );
}

function parseQuestions(text, katId, matId) {
    const questions = [];
    const lines = text.split('\n');
    let q = null;
    let currentOpt = null;
    let inPembahasan = false;
    let inTeks = false;
    let currentTeksBacaan = '';
    let currentTable = ''; // 🚨 STATE BARU UNTUK TABEL

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        // 🚨 1. DETEKSI BARIS TABEL (Format: | col1 | col2 |)
        if (line.match(/^\|(.+)\|$/)) {
            const cols = line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
            currentTable += `<tr>${cols.map(c => `<td>${c}</td>`).join('')}</tr>`;
            continue;
        } else {
            // Kalau baris ini BUKAN tabel, tapi ada tumpukan tabel sebelumnya -> Tutup & Masukkan
            if (currentTable) {
                const tableHtml = `<table class="tabel-soal">${currentTable}</table>`;
                if (q) q.pertanyaan = q.pertanyaan.replace(/<\/p>$/, '') + tableHtml + '<p>';
                else currentTeksBacaan += tableHtml;
                currentTable = '';
            }
        }

        // 2. DETEKSI TEKS BACAAN
        const teksMatch = line.match(/^(?:TEKS|BACAAN|INFORMASI|STUDI KASUS)\s*[:\-]?\s*(.*)/i);
        if (teksMatch) {
            inTeks = true; inPembahasan = false; currentOpt = null;
            const isiTeks = teksMatch[1].trim();
            if (isiTeks === '-' || isiTeks.toLowerCase() === 'kosong') { currentTeksBacaan = ''; inTeks = false; } 
            else { currentTeksBacaan = isiTeks ? (isiTeks + '<br>') : ''; }
            continue;
        }

        // 3. DETEKSI NOMOR SOAL
        const soalMatch = line.match(/^(\d+)\.\s+(.*)/);
        if (soalMatch) {
            if (q && q.pertanyaan && q.kunci) questions.push(q);
            inTeks = false; inPembahasan = false; currentOpt = null;
            
            let pertanyaanFinal = '';
            if (currentTeksBacaan) {
                pertanyaanFinal = `<div class="teks-bacaan" style="background: rgba(107, 143, 92, 0.08); padding: 1.2rem; border-left: 4px solid var(--brand-primary); margin-bottom: 1.5rem; border-radius: 4px; line-height: 1.6;">${currentTeksBacaan}</div>`;
            }
            pertanyaanFinal += `<p>${soalMatch[2]}</p>`;
            q = { kategori_id: katId, materi_id: matId, pertanyaan: pertanyaanFinal, opsi: { A: '', B: '', C: '', D: '', E: '' }, kunci: '', pembahasan: '', tipe: 'pg' };
            continue;
        }

        if (!q) { currentTeksBacaan += line + '<br>'; continue; }
        if (inTeks) { currentTeksBacaan += line + '<br>'; continue; }

        // 4. DETEKSI OPSI (A-E)
        const optMatch = line.match(/^([A-E])\.\s*(.*)/i);
        if (optMatch) {
            currentOpt = optMatch[1].toUpperCase();
            q.opsi[currentOpt] = optMatch[2];
            inPembahasan = false;
            continue;
        }

        // 5. DETEKSI KUNCI JAWABAN
        const kunciMatch = line.match(/^(?:kunci|jawaban)\s*[:\-]?\s*([A-Ea-e]|\w+)/i);
        if (kunciMatch) {
            q.kunci = kunciMatch[1].trim();
            inPembahasan = false; currentOpt = null;
            continue;
        }

        // 6. DETEKSI PEMBAHASAN
        const bahasMatch = line.match(/^pembahasan\s*[:\-]?\s*(.*)/i);
        if (bahasMatch) {
            inPembahasan = true; currentOpt = null;
            q.pembahasan += bahasMatch[1] ? (bahasMatch[1] + ' ') : '';
            continue;
        }

        // 7. GABUNG TEKS MULTI-BARIS
        if (inPembahasan) q.pembahasan += line + ' ';
        else if (currentOpt) q.opsi[currentOpt] += ' ' + line;
        else if (q) q.pertanyaan = q.pertanyaan.replace(/<\/p>$/, ` <br>${line}</p>`);
    }

    // 🚨 POST-PROCESS: Bersihkan & Convert Format Khusus
    if (q && q.pertanyaan && q.kunci) {
        // A. Deteksi Benar/Salah (Format: | Soal | Benar | Salah |)
        const bsMatch = q.pertanyaan.match(/<p>\s*\|\s*(.*?)\s*\|\s*Benar\s*\|\s*Salah\s*\|\s*<\/p>/i);
        if (bsMatch) {
            q.pertanyaan = `<p>${bsMatch[1]}</p>`;
            q.opsi = { A: 'Benar', B: 'Salah', C: '', D: '', E: '' };
            q.tipe = 'bs';
            if (q.kunci.toLowerCase() === 'benar' || q.kunci === '1') q.kunci = 'A';
            else if (q.kunci.toLowerCase() === 'salah' || q.kunci === '2') q.kunci = 'B';
        }

        // B. Convert Isian Singkat ([ISIAN] atau ___)
        if (q.pertanyaan.includes('[ISIAN]') || q.pertanyaan.includes('___')) {
            q.pertanyaan = q.pertanyaan.replace(/\[ISIAN\]|_{3,}/g, '<span class="kotak-isian"></span>');
            q.tipe = q.tipe || 'isian';
        }

        // C. Default tipe
        if (!q.tipe) q.tipe = 'pg';

        // 🖼️ D. CONVERT SHORTCODE GAMBAR DI PERTANYAAN
        q.pertanyaan = convertGambarShortcode(q.pertanyaan);

        // 🖼️ E. CONVERT SHORTCODE GAMBAR DI OPSI JAWABAN (A-E)
        ['A', 'B', 'C', 'D', 'E'].forEach(opt => {
            if (q.opsi[opt]) {
                q.opsi[opt] = convertGambarShortcode(q.opsi[opt]);
            }
        });

        // 🖼️ F. CONVERT SHORTCODE GAMBAR DI PEMBAHASAN
        if (q.pembahasan) {
            q.pembahasan = convertGambarShortcode(q.pembahasan);
        }

        questions.push(q);
    }
}

function showPreview() {
    const container = document.getElementById('resultsList');
    const resultsDiv = document.getElementById('scanResults');
    container.innerHTML = `<p style="margin-bottom:1rem; color: var(--brand-primary); font-weight:bold;">🎉 Berhasil mendeteksi ${parsedQuestions.length} soal!</p>`;
    
    parsedQuestions.forEach((q, i) => {
        // Render preview pertanyaan (dengan tabel & kotak isian)
        let previewPertanyaan = q.pertanyaan
            .replace(/<span class="kotak-isian"><\/span>/g, '<span style="display:inline-block; width:80px; border-bottom: 2px solid var(--brand-primary); margin: 0 4px;"></span>')
            .replace(/<table class="tabel-soal">(.*?)<\/table>/gs, '<div style="border:1px solid #ccc; padding:4px; margin:4px 0; font-size:0.8rem;">[TABEL]</div>');

        let opsiHTML = '';
        if (q.tipe === 'bs') {
            opsiHTML = `<p style="color: var(--brand-primary); font-weight:bold;">⚖️ Tipe: Benar / Salah</p>`;
        } else {
            opsiHTML = `
                <p><strong>A.</strong> ${q.opsi.A || '-'} &nbsp;|&nbsp; <strong>B.</strong> ${q.opsi.B || '-'}</p>
                <p><strong>C.</strong> ${q.opsi.C || '-'} &nbsp;|&nbsp; <strong>D.</strong> ${q.opsi.D || '-'}</p>
                <p><strong>E.</strong> ${q.opsi.E || '-'}</p>
            `;
        }

        container.innerHTML += `
            <div class="soal-preview-item">
                <h4 style="margin-bottom: 0.5rem;">
                    Soal ${i + 1} 
                    <span class="tipe-badge ${q.tipe}">${q.tipe === 'bs' ? '⚖️ B/S' : (q.tipe === 'isian' ? '✏️ Isian' : '📝 PG')}</span>
                </h4>
                <div style="font-size: 0.9rem; margin-bottom: 1rem; color: var(--text-secondary); max-height: 200px; overflow-y: auto;">
                    ${previewPertanyaan}
                </div>
                ${opsiHTML}
                <p class="kunci" style="margin-top: 0.5rem;">🔑 Kunci: <strong>${q.kunci}</strong></p>
                ${q.pembahasan ? `<details style="margin-top:0.5rem;"><summary style="cursor:pointer; color:var(--brand-primary);">💡 Pembahasan</summary><p style="font-size:0.85rem; color:var(--text-muted); margin-top:0.5rem;">${q.pembahasan}</p></details>` : ''}
            </div>
        `;
    });
    resultsDiv.style.display = 'block';
    resultsDiv.scrollIntoView({ behavior: 'smooth' });
}

async function saveToDatabase() {
    const btn = document.getElementById('btnConfirmSave');
    btn.disabled = true;
    btn.textContent = '⏳ Menyimpan ke Cloud Database...';
    const { data: { user } } = await window.db.auth.getUser();
    let success = 0;
    try {
        for (const q of parsedQuestions) {
            await window.db.from('bank_soal').insert({
                kategori_id: q.kategori_id,
                materi_id: q.materi_id,
                pertanyaan_html: q.pertanyaan,
                opsi_a_html: q.opsi.A,
                opsi_b_html: q.opsi.B,
                opsi_c_html: q.opsi.C,
                opsi_d_html: q.opsi.D,
                opsi_e_html: q.opsi.E,
                kunci_jawaban: q.kunci,
                tipe_soal: q.tipe || 'pg', // 🚨 BARU
                pembahasan_html: `<p>${q.pembahasan}</p>`,
                created_by: user.id
            });
        }
        await showScyraAlert(`${success} soal berhasil masuk ke Bank Soal Scyra!`, '🚀 Sukses Besar', '🏆');
        document.getElementById('scanResults').style.display = 'none';
        document.getElementById('soalForm').reset();
    } catch (err) {
        await showScyraAlert('Gagal menyimpan: ' + err.message, '⚠️ Error', '⚠️');
    } finally {
        btn.disabled = false;
        btn.textContent = '✅ Konfirmasi & Simpan Semua ke Database';
    }
}

// =========================================================
// ✏️ FITUR EDIT SOAL
// =========================================================
function setupEditModal() {
    const modal = document.getElementById('editSoalModal');
    const btnClose = document.getElementById('btnCloseEditModal');
    
    btnClose.onclick = () => modal.classList.remove('active');
    modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('active'); };

    // Event listener kalau Kategori di-modal edit diganti
    document.getElementById('editKategoriSoal').addEventListener('change', async (e) => {
        const katId = e.target.value;
        const editMatSelect = document.getElementById('editMateriSoal');
        editMatSelect.innerHTML = '<option value="">⏳ Memuat...</option>';
        editMatSelect.disabled = true;
        if (katId) {
            const { data } = await window.db.from('materi').select('id, judul').eq('kategori_id', katId).order('nomor_bab');
            editMatSelect.innerHTML = '';
            (data || []).forEach(m => editMatSelect.innerHTML += `<option value="${m.id}">${m.judul}</option>`);
            editMatSelect.disabled = false;
        }
    });

    // Event listener Submit Form Edit
    document.getElementById('editSoalForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true; btn.textContent = '⏳ Menyimpan...';
        
        const id = document.getElementById('editSoalId').value;
        const updates = {
            kategori_id: document.getElementById('editKategoriSoal').value,
            materi_id: document.getElementById('editMateriSoal').value,
            pertanyaan_html: document.getElementById('editPertanyaan').value,
            opsi_a_html: document.getElementById('editOpsiA').value,
            opsi_b_html: document.getElementById('editOpsiB').value,
            opsi_c_html: document.getElementById('editOpsiC').value,
            opsi_d_html: document.getElementById('editOpsiD').value,
            opsi_e_html: document.getElementById('editOpsiE').value,
            kunci_jawaban: document.getElementById('editKunci').value,
            tipe_soal: document.getElementById('editTipeSoal').value,
            pembahasan_html: `<p>${document.getElementById('editPembahasan').value}</p>`
        };

        try {
            const { error } = await window.db.from('bank_soal').update(updates).eq('id', id);
            if (error) throw error;
            await showScyraAlert('Soal berhasil diperbarui!', '✅ Sukses', '✅');
            modal.classList.remove('active');
            await loadDaftarSoal(true); // Refresh tabel
        } catch (err) {
            await showScyraAlert('Gagal update: ' + err.message, '⚠️ Error', '⚠️');
        } finally {
            btn.disabled = false; btn.textContent = '💾 Simpan Perubahan';
        }
    });
}

// Fungsi Global untuk buka modal dan load data soal
window.editSoal = async (id) => {
    const { data: soal, error } = await window.db.from('bank_soal').select('*').eq('id', id).single();
    if (error || !soal) return showScyraAlert('Gagal memuat data soal.', '⚠️ Error', '⚠️');

    // Isi form dengan data yang ada
    document.getElementById('editSoalId').value = soal.id;
    document.getElementById('editPertanyaan').value = soal.pertanyaan_html || '';
    document.getElementById('editOpsiA').value = soal.opsi_a_html || '';
    document.getElementById('editOpsiB').value = soal.opsi_b_html || '';
    document.getElementById('editOpsiC').value = soal.opsi_c_html || '';
    document.getElementById('editOpsiD').value = soal.opsi_d_html || '';
    document.getElementById('editOpsiE').value = soal.opsi_e_html || '';
    document.getElementById('editKunci').value = soal.kunci_jawaban || 'A';
    document.getElementById('editPembahasan').value = (soal.pembahasan_html || '').replace(/<\/?p>/g, '');
    document.getElementById('editTipeSoal').value = soal.tipe_soal || 'pg'; // 🚨 BARU

    // Populate Dropdown Kategori
    const editKatSelect = document.getElementById('editKategoriSoal');
    editKatSelect.innerHTML = '';
    kategoriList.forEach(k => {
        editKatSelect.innerHTML += `<option value="${k.id}" ${k.id === soal.kategori_id ? 'selected' : ''}>${k.nama_mapel}</option>`;
    });

    // Populate Dropdown Materi berdasarkan Kategori yang terpilih
    const editMatSelect = document.getElementById('editMateriSoal');
    editMatSelect.innerHTML = '<option value="">⏳ Memuat...</option>';
    editMatSelect.disabled = true;
    
    const { data: materiData } = await window.db.from('materi')
        .select('id, judul')
        .eq('kategori_id', soal.kategori_id)
        .order('nomor_bab');
        
    editMatSelect.innerHTML = '';
    (materiData || []).forEach(m => {
        editMatSelect.innerHTML += `<option value="${m.id}" ${m.id === soal.materi_id ? 'selected' : ''}>${m.judul}</option>`;
    });
    editMatSelect.disabled = false;

    // Buka Modal
    document.getElementById('editSoalModal').classList.add('active');
};

// =========================================================
// 🖼️ FITUR UPLOAD GAMBAR KE STORAGE (BUAT SHORTCODE PDF)
// =========================================================
function setupImageUploader() {
    const btnUpload = document.getElementById('btnUploadGambar');
    const fileInput = document.getElementById('gambarSoalFile');
    const resultsDiv = document.getElementById('uploadGambarResults');
    const listUrl = document.getElementById('listUrlGambar');
    
    if (!btnUpload || !fileInput) return;
    
    btnUpload.addEventListener('click', async () => {
        const files = fileInput.files;
        if (!files || files.length === 0) {
            if (typeof showScyraAlert === 'function') {
                showScyraAlert('Pilih minimal 1 file gambar dulu!', '⚠️ Peringatan', '⚠️');
            }
            return;
        }
        
        btnUpload.disabled = true;
        btnUpload.textContent = `⏳ Mengupload ${files.length} gambar...`;
        listUrl.innerHTML = '';
        
        let successCount = 0;
        let failCount = 0;
        
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                btnUpload.textContent = `⏳ Mengupload ${i + 1} dari ${files.length}...`;
                
                // Validasi ukuran (max 5MB)
                if (file.size > 5 * 1024 * 1024) {
                    console.warn(`File ${file.name} terlalu besar, dilewati.`);
                    failCount++;
                    continue;
                }
                
                // Generate nama unik (timestamp + nama file tanpa spasi)
                let fileName = file.name
                    .replace(/\s+/g, '-')
                    .toLowerCase()
                    .replace(/[^a-z0-9\-_.]/g, '');
                
                // Upload ke Supabase Storage
                const { data, error } = await window.db.storage
                    .from('soal-images')
                    .upload(fileName, file, { upsert: true });
                
                if (error) {
                    console.error(`Gagal upload ${file.name}:`, error);
                    failCount++;
                    continue;
                }
                
                // Ambil Public URL
                const { data: urlData } = window.db.storage
                    .from('soal-images')
                    .getPublicUrl(fileName);
                
                const publicUrl = urlData.publicUrl;
                const shortcode = `[GAMBAR: ${publicUrl}]`;
                
                // Tambahin ke list hasil
                const item = document.createElement('div');
                item.className = 'url-gambar-item';
                item.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.8rem;">
                        <img src="${publicUrl}" alt="${file.name}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border-color);">
                        <div style="flex: 1; min-width: 0;">
                            <p style="margin: 0 0 0.3rem 0; font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${file.name}</p>
                            <code style="display: block; background: var(--bg-tertiary); padding: 0.4rem 0.6rem; border-radius: 4px; font-size: 0.75rem; color: var(--text-secondary); word-break: break-all; margin-bottom: 0.3rem;">${shortcode}</code>
                        </div>
                        <button class="btn-copy-url-gambar" data-url="${shortcode}" title="Salin Shortcode" style="background: var(--brand-primary); color: white; border: none; width: 40px; height: 40px; border-radius: 8px; cursor: pointer; font-size: 1.1rem; flex-shrink: 0;">📋</button>
                    </div>
                `;
                listUrl.appendChild(item);
                successCount++;
            }
            
            // Tampilkan hasil
            if (successCount > 0) {
                resultsDiv.style.display = 'block';
                if (typeof showScyraAlert === 'function') {
                    showScyraAlert(
                        `Berhasil: ${successCount} gambar${failCount > 0 ? `<br>Gagal: ${failCount} gambar` : ''}`, 
                        '✅ Upload Selesai', 
                        '🖼️'
                    );
                }
                
                // Pasang event listener ke tombol copy
                document.querySelectorAll('.btn-copy-url-gambar').forEach(btn => {
                    btn.addEventListener('click', async function() {
                        const url = this.getAttribute('data-url');
                        try {
                            await navigator.clipboard.writeText(url);
                            const origText = this.innerHTML;
                            this.innerHTML = '✅';
                            this.style.background = 'var(--success)';
                            setTimeout(() => {
                                this.innerHTML = origText;
                                this.style.background = 'var(--brand-primary)';
                            }, 1500);
                        } catch (err) {
                            alert('URL: ' + url);
                        }
                    });
                });
            } else {
                if (typeof showScyraAlert === 'function') {
                    showScyraAlert('Semua gambar gagal di-upload. Cek console F12 untuk detail.', '❌ Gagal', '⚠️');
                }
            }
            
        } catch (err) {
            console.error('Upload Error:', err);
            if (typeof showScyraAlert === 'function') {
                showScyraAlert('Error: ' + err.message, '⚠️ Error', '⚠️');
            }
        } finally {
            btnUpload.disabled = false;
            btnUpload.textContent = '📤 Upload ke Storage';
            fileInput.value = ''; // Reset input
        }
    });
}
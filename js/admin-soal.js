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

// 🎨 QUILL EDITOR INSTANCES
let quillPertanyaan = null;
let quillPembahasan = null;

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
    setupTemplateDownload();
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

function setupTemplateDownload() {
    const btn = document.getElementById('btnDownloadTemplate');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        try {
            const res = await fetch('template_soal_utbk.json');
            let jsonText = '';
            if (res.ok) {
                jsonText = await res.text();
            } else {
                jsonText = JSON.stringify([
                    {
                        "tipe": "pg",
                        "pertanyaan": "Sebuah mobil bergerak dengan kecepatan awal $v_0 = 10\\text{ m/s}$ dan percepatan $a = 2\\text{ m/s}^2$.\n\nBerapakah kecepatannya setelah $t = 5\\text{ detik}$?",
                        "opsi": {
                            "A": "15 m/s",
                            "B": "20 m/s",
                            "C": "25 m/s",
                            "D": "30 m/s",
                            "E": "35 m/s"
                        },
                        "kunci": "B",
                        "pembahasan": "Gunakan rumus GLBB:\n$$v_t = v_0 + a \\cdot t = 10 + (2 \\times 5) = 20\\text{ m/s}$$"
                    },
                    {
                        "tipe": "pgk",
                        "pertanyaan": "Manakah pernyataan yang BENAR mengenai sistem periodik unsur modern? [Pilih lebih dari satu]",
                        "opsi": {
                            "A": "Disusun berdasarkan kenaikan nomor atom",
                            "B": "Terdiri atas 7 periode",
                            "C": "Unsur golongan IA disebut halogen",
                            "D": "Unsur golongan VIIIA disebut gas mulia",
                            "E": "Disusun berdasarkan kenaikan massa atom relatif"
                        },
                        "kunci": "A,B,D",
                        "pembahasan": "A, B, dan D benar. Golongan IA adalah alkali, bukan halogen."
                    },
                    {
                        "tipe": "bs",
                        "pertanyaan": "Tentukan kebenaran pernyataan mengenai sistem respirasi berikut!",
                        "pernyataan": [
                            "Pertukaran gas oksigen dan karbon dioksida terjadi di alveolus.",
                            "Diafragma mendatar saat fase ekspirasi normal.",
                            "Hemoglobin mengikat oksigen membentuk oksihemoglobin."
                        ],
                        "kunci": "B,S,B",
                        "pembahasan": "Pernyataan 1 Benar, Pernyataan 2 Salah, Pernyataan 3 Benar."
                    },
                    {
                        "tipe": "isian",
                        "pertanyaan": "Ibu kota negara Indonesia yang baru di Kalimantan Timur adalah [ISIAN].",
                        "kunci": "Nusantara",
                        "pembahasan": "Ibu kota baru Indonesia dinamakan Nusantara."
                    }
                ], null, 2);
            }

            const blob = new Blob([jsonText], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'template_soal_utbk.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Gagal unduh template:', err);
            await showScyraAlert('Gagal mengunduh template: ' + err.message, '⚠️ Error', '⚠️');
        }
    });
}

function setupForm() {
    const form = document.getElementById('soalForm');
    const btnScan = document.getElementById('btnScan');
    form.onsubmit = async (e) => {
        e.preventDefault();
        btnScan.disabled = true;
        btnScan.textContent = '⏳ Sedang memproses file JSON...';
        parsedQuestions = [];
        const fileInput = document.getElementById('jsonSoalFile') || document.getElementById('pdfSoalFile');
        const files = fileInput ? fileInput.files : [];
        const katId = document.getElementById('kategoriSoal').value;
        const matId = document.getElementById('materiSoal').value;
        if (!katId || !matId) { 
            await showScyraAlert('Pilih kategori dan bab materi terlebih dahulu!', '⚠️ Peringatan', '⚠️'); 
            btnScan.disabled = false; 
            btnScan.textContent = '⚡ Parse & Preview Soal'; 
            return; 
        }
        if (!files || files.length === 0) {
            await showScyraAlert('Pilih setidaknya satu file JSON soal!', '⚠️ Peringatan', '⚠️');
            btnScan.disabled = false;
            btnScan.textContent = '⚡ Parse & Preview Soal';
            return;
        }
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (file.name.toLowerCase().endsWith('.pdf')) {
                    // Fallback jika ada yang coba upload PDF
                    const text = await extractTextFromPDF(file);
                    const questions = parseQuestions(text, katId, matId); 
                    parsedQuestions.push(...questions);
                } else {
                    // File JSON
                    const text = await file.text();
                    let json;
                    try {
                        json = JSON.parse(text);
                    } catch (parseErr) {
                        throw new Error(`File "${file.name}" bukan format JSON yang valid: ${parseErr.message}`);
                    }
                    const questions = parseJsonQuestions(json, katId, matId);
                    parsedQuestions.push(...questions);
                }
            }
            if (parsedQuestions.length === 0) throw new Error("Tidak ada soal yang valid terdeteksi dari file yang diupload.");
            showPreview();
        } catch (err) {
            await showScyraAlert('Gagal memproses file: ' + err.message, '⚠️ Error', '⚠️');
        } finally {
            btnScan.disabled = false;
            btnScan.textContent = '⚡ Parse & Preview Soal';
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
        
        const tr = document.createElement('tr');
        const tipeLabels = {
            'pg': '<span class="tipe-badge pg">📝 PG</span>',
            'bs': '<span class="tipe-badge bs">⚖️ B/S</span>',
            'isian': '<span class="tipe-badge isian">✏️ Isian</span>',
            'pgk': '<span class="tipe-badge pgk">☑️ PGK</span>'
        };
        const tipeBadge = tipeLabels[soal.tipe_soal] || tipeLabels['pg'];

        // 🚨 RENDER KUNCI JAWABAN BERDASARKAN TIPE SOAL
        let kunciDisplay = '';
        if (soal.tipe_soal === 'pg') {
            // Pilihan Ganda: badge warna A-E
            const kunciColors = {
                'A': '#4caf50', 'B': '#2196f3', 'C': '#ff9800', 
                'D': '#9c27b0', 'E': '#f44336'
            };
            const kunciColor = kunciColors[soal.kunci_jawaban] || '#666';
            kunciDisplay = `<span class="kunci-badge" style="background: ${kunciColor}; color: white; padding: 0.3rem 0.6rem; border-radius: 6px; font-weight: 600;">${soal.kunci_jawaban || '?'}</span>`;
        } else if (soal.tipe_soal === 'bs') {
            // Benar/Salah: tampilkan urutan B/S dengan warna
            const kunciArray = (soal.kunci_jawaban || '').split(',').map(k => k.trim());
            kunciDisplay = kunciArray.map(k => {
                const color = k.toUpperCase() === 'B' ? '#4caf50' : '#f44336';
                return `<span style="display:inline-block; background: ${color}; color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; margin: 0 2px; font-weight: 600;">${k}</span>`;
            }).join('');
        } else if (soal.tipe_soal === 'isian') {
            // Isian: tampilkan teks jawaban (max 20 char)
            const kunciText = soal.kunci_jawaban || '?';
            const displayText = kunciText.length > 20 ? kunciText.substring(0, 20) + '...' : kunciText;
            kunciDisplay = `<span class="kunci-badge" style="background: #607d8b; color: white; padding: 0.3rem 0.6rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600;" title="${kunciText}">${displayText}</span>`;
        } else if (soal.tipe_soal === 'pgk') {
            // PGK: tampilkan badge multi-jawaban
            const kunciArray = (soal.kunci_jawaban || '').split(',').map(k => k.trim());
            kunciDisplay = kunciArray.map(k => {
                const kunciColors = { 'A': '#4caf50', 'B': '#2196f3', 'C': '#ff9800', 'D': '#9c27b0', 'E': '#f44336' };
                return `<span style="display:inline-block; background: ${kunciColors[k] || '#666'}; color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; margin: 0 2px; font-weight: 600;">${k}</span>`;
            }).join('');
        } else {
            kunciDisplay = `<span class="kunci-badge" style="background: #666; color: white; padding: 0.3rem 0.6rem; border-radius: 6px;">${soal.kunci_jawaban || '?'}</span>`;
        }

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
            <td style="text-align: center;">${kunciDisplay}</td>
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
    
    // 🚨 DEBUG: Log raw text untuk lihat format aslinya
    console.log('=== RAW PDF TEXT START ===');
    console.log(fullText);
    console.log('=== RAW PDF TEXT END ===');
    
    return fullText;
}

// 🖼️ HELPER: Convert [GAMBAR: url] atau [GAMBAR: url | SIZE: 50%] jadi <img> tag
function convertGambarShortcode(text) {
    if (!text) return text;
    return text.replace(
        /\[GAMBAR:\s*([^\|\]]+?)(?:\s*\|\s*(?:SIZE:\s*)?([^\]]+?))?\]/gi, 
        (match, url, size) => {
            const cleanUrl = url.trim();
            const width = size ? size.trim() : '100%';
            return `<img src="${cleanUrl}" class="img-soal scyra-image" alt="Gambar Soal" style="max-width:${width}; height:auto; border-radius:8px; margin:0.8rem 0; display:block;">`;
        }
    );
}

// 📊 HELPER: Convert pipe table format markdown ke tabel HTML
function renderPipeTables(html) {
    if (!html || typeof html !== 'string') return html;
    
    let result = '';
    let tableRows = [];
    
    const flushTable = () => {
        if (!tableRows.length) return;
        const rows = tableRows
            .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
            .join('');
        result += `<table class="tabel-soal"><tbody>${rows}</tbody></table>`;
        tableRows = [];
    };
    
    const lines = html.split('\n');
    for (let line of lines) {
        const trimmed = line.trim();
        // Skip separator baris tabel markdown seperti |---|---|
        if (/^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(trimmed)) {
            continue;
        }

        // Jangan proses baris shortcode gambar sebagai tabel
        if (trimmed.includes('[GAMBAR:')) {
            flushTable();
            result += line + '\n';
            continue;
        }
        
        const isPipeRow = trimmed.includes('|') && /^\|?.*\|.*\|?$/.test(trimmed);
        if (isPipeRow) {
            const cells = trimmed.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
            if (cells.length > 1) {
                tableRows.push(cells);
                continue;
            }
        }
        flushTable();
        result += line + '\n';
    }
    flushTable();
    
    result = result.replace(/<tbody>\s*<tr>(.*?)<\/tr>/i, (_, firstRow) =>
        `<thead><tr>${firstRow.replace(/<td/g, '<th').replace(/<\/td>/g, '</th>')}</tr></thead><tbody>`
    );
    
    return result.trimEnd();
}

// 🔤 HELPER: Format teks dengan dukungan KaTeX, Tabel, Newline, dan Gambar
function formatTextContent(text) {
    if (!text) return '';
    if (typeof text !== 'string') text = String(text);
    let content = text.trim();
    if (!content) return '';

    // 1. Konversi shortcode [GAMBAR: ...] terlebih dahulu agar tanda '|' pada SIZE tidak dianggap pemisah tabel
    content = convertGambarShortcode(content);

    // 2. Render pipe table
    content = renderPipeTables(content);

    // 3. Lindungi block yang tidak boleh diinjeksi <br> (Tabel HTML & KaTeX Math)
    const preservedBlocks = [];
    
    // Protect <table>...</table>
    content = content.replace(/<table[\s\S]*?<\/table>/gi, (match) => {
        const id = `___PRESERVED_BLOCK_${preservedBlocks.length}___`;
        preservedBlocks.push(match);
        return id;
    });

    // Protect display math $$...$$
    content = content.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
        const id = `___PRESERVED_BLOCK_${preservedBlocks.length}___`;
        preservedBlocks.push(match);
        return id;
    });

    // Protect inline math $...$
    content = content.replace(/\$(?!\$)((?:\\.|[^$\\])+)\$/g, (match) => {
        const id = `___PRESERVED_BLOCK_${preservedBlocks.length}___`;
        preservedBlocks.push(match);
        return id;
    });

    // 4. Konversi newline \n menjadi <br> secara cerdas
    content = content
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n{2,}/g, '<br><br>')
        .replace(/\n/g, '<br>');

    // 5. Kembalikan block yang dilindungi
    preservedBlocks.forEach((block, idx) => {
        content = content.replace(`___PRESERVED_BLOCK_${idx}___`, block);
    });

    // 6. Konversi shortcode [GAMBAR: ...] (fallback jika ada shortcode di dalam block yang dilindungi)
    content = convertGambarShortcode(content);

    // 7. Konversi shortcode [BACAAN]...[/BACAAN]
    content = content.replace(/\[BACAAN\]([\s\S]*?)\[\/BACAAN\]/gi, (match, inner) => {
        return `<div class="teks-bacaan">${inner.trim()}</div>`;
    });

    return content;
}

// 🚀 PARSER UTAMA UNTUK FILE JSON
function parseJsonQuestions(jsonData, katId, matId) {
    let items = [];
    if (Array.isArray(jsonData)) {
        items = jsonData;
    } else if (jsonData && typeof jsonData === 'object') {
        if (Array.isArray(jsonData.soal)) items = jsonData.soal;
        else if (Array.isArray(jsonData.questions)) items = jsonData.questions;
        else if (Array.isArray(jsonData.data)) items = jsonData.data;
        else items = [jsonData];
    }

    const questions = [];

    items.forEach((item, index) => {
        if (!item || typeof item !== 'object') return;

        // 1. Teks Bacaan / Stimulus jika ada
        let bacaanHtml = '';
        const rawBacaan = item.bacaan || item.stimulus || item.teks || item.informasi || '';
        if (rawBacaan && rawBacaan.trim()) {
            bacaanHtml = `<div class="teks-bacaan">${formatTextContent(rawBacaan)}</div>`;
        }

        // 2. Pertanyaan
        let rawPertanyaan = item.pertanyaan || item.soal || item.question || '';
        let pertanyaanFinal = bacaanHtml + formatTextContent(rawPertanyaan);

        // 3. Kunci & Tipe Soal
        let rawKunci = item.kunci ?? item.kunci_jawaban ?? item.jawaban ?? item.key ?? '';
        let tipe = (item.tipe || item.tipe_soal || item.type || '').toLowerCase().trim();

        // Auto-detect tipe jika belum ditentukan di JSON
        if (!tipe) {
            if (item.pernyataan && Array.isArray(item.pernyataan)) {
                tipe = 'bs';
            } else if (/\[ISIAN\]|_{3,}/i.test(rawPertanyaan)) {
                tipe = 'isian';
            } else if (Array.isArray(rawKunci) || (typeof rawKunci === 'string' && /^[A-E]\s*,\s*[A-E]/i.test(rawKunci.trim()))) {
                tipe = 'pgk';
            } else {
                tipe = 'pg';
            }
        }

        // Penyesuaian kotak isian jika tipe isian
        if (tipe === 'isian') {
            pertanyaanFinal = pertanyaanFinal.replace(/\[ISIAN\]|_{3,}/gi, '<span class="kotak-isian"></span>');
            if (!pertanyaanFinal.includes('kotak-isian')) {
                pertanyaanFinal += ' <span class="kotak-isian"></span>';
            }
        }

        const opsi = { A: '', B: '', C: '', D: '', E: '' };
        let kunciFinal = '';

        if (tipe === 'bs') {
            // Tipe Benar / Salah
            if (Array.isArray(item.pernyataan)) {
                item.pernyataan.slice(0, 5).forEach((p, idx) => {
                    const letter = ['A', 'B', 'C', 'D', 'E'][idx];
                    opsi[letter] = formatTextContent(p);
                });
            } else if (item.opsi && typeof item.opsi === 'object') {
                ['A', 'B', 'C', 'D', 'E'].forEach(letter => {
                    const val = item.opsi[letter] ?? item.opsi[letter.toLowerCase()] ?? '';
                    if (val) opsi[letter] = formatTextContent(val);
                });
            }

            if (Array.isArray(rawKunci)) {
                kunciFinal = rawKunci.map(k => {
                    const s = String(k).trim().toUpperCase();
                    return (s === 'B' || s === 'BENAR' || s === 'TRUE' || s === '1') ? 'B' : 'S';
                }).join(',');
            } else if (typeof rawKunci === 'string') {
                kunciFinal = rawKunci.split(/[,;\-/\s]+/).filter(Boolean).map(k => {
                    const s = k.trim().toUpperCase();
                    return (s === 'B' || s === 'BENAR' || s === 'TRUE' || s === '1') ? 'B' : 'S';
                }).join(',');
            }
        } else if (tipe === 'isian') {
            // Tipe Isian Singkat
            kunciFinal = String(rawKunci).trim();
        } else if (tipe === 'pgk') {
            // Tipe Pilihan Ganda Kompleks (Multi-Select)
            if (Array.isArray(item.opsi)) {
                item.opsi.slice(0, 5).forEach((opt, idx) => {
                    const letter = ['A', 'B', 'C', 'D', 'E'][idx];
                    opsi[letter] = formatTextContent(opt);
                });
            } else if (item.opsi && typeof item.opsi === 'object') {
                ['A', 'B', 'C', 'D', 'E'].forEach(letter => {
                    const val = item.opsi[letter] ?? item.opsi[letter.toLowerCase()] ?? '';
                    if (val) opsi[letter] = formatTextContent(val);
                });
            }

            if (Array.isArray(rawKunci)) {
                kunciFinal = rawKunci.map(k => String(k).trim().toUpperCase()).filter(k => /^[A-E]$/.test(k)).sort().join(',');
            } else if (typeof rawKunci === 'string') {
                kunciFinal = rawKunci.split(/[,;\s]+/).filter(Boolean).map(k => k.trim().toUpperCase()).filter(k => /^[A-E]$/.test(k)).sort().join(',');
            }
        } else {
            // Tipe Pilihan Ganda Biasa (PG)
            tipe = 'pg';
            if (Array.isArray(item.opsi)) {
                item.opsi.slice(0, 5).forEach((opt, idx) => {
                    const letter = ['A', 'B', 'C', 'D', 'E'][idx];
                    opsi[letter] = formatTextContent(opt);
                });
            } else if (item.opsi && typeof item.opsi === 'object') {
                ['A', 'B', 'C', 'D', 'E'].forEach(letter => {
                    const val = item.opsi[letter] ?? item.opsi[letter.toLowerCase()] ?? '';
                    if (val) opsi[letter] = formatTextContent(val);
                });
            }

            kunciFinal = String(rawKunci).trim().toUpperCase();
            if (kunciFinal.length > 1 && /^[A-E]/.test(kunciFinal)) {
                kunciFinal = kunciFinal.charAt(0);
            }
        }

        const pembahasan = formatTextContent(item.pembahasan || item.explanation || item.bahas || '');

        if (!pertanyaanFinal || !kunciFinal) {
            console.warn(`[JSON PARSER] Soal index ${index + 1} dilewati karena pertanyaan atau kunci kosong:`, item);
            return;
        }

        questions.push({
            kategori_id: katId,
            materi_id: matId,
            pertanyaan: pertanyaanFinal,
            opsi: opsi,
            kunci: kunciFinal,
            tipe: tipe,
            pembahasan: pembahasan
        });
    });

    console.log(`[JSON PARSER] Selesai parsing: ${questions.length} soal berhasil diekstrak.`);
    return questions;
}

// 📦 FUNGSI PARSER PDF (FALLBACK/LEGACY)
function parseQuestions(text, katId, matId) {
    const questions = [];
    const lines = text.split('\n');
    let q = null;
    let currentOpt = null;
    let inPembahasan = false;
    let inTeks = false;
    let currentTeksBacaan = '';

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        const teksMatch = line.match(/^(?:TEKS|BACAAN|INFORMASI|STUDI KASUS)\s*[:\-]?\s*(.*)/i);
        if (teksMatch) {
            inTeks = true; inPembahasan = false; currentOpt = null;
            const isiTeks = teksMatch[1].trim();
            if (isiTeks === '-' || isiTeks.toLowerCase() === 'kosong') { 
                currentTeksBacaan = ''; 
                inTeks = false; 
            } else { 
                currentTeksBacaan = isiTeks ? (isiTeks + '\n') : ''; 
            }
            continue;
        }

        const soalMatch = line.match(/^(\d+)\.\s+(.*)/);
        if (soalMatch) {
            if (q && q.pertanyaan && q.kunci) {
                questions.push(q);
            }
            inTeks = false; inPembahasan = false; currentOpt = null;
            
            let pertanyaanFinal = '';
            if (currentTeksBacaan) {
                pertanyaanFinal = `<div class="teks-bacaan">${currentTeksBacaan}</div>`;
            }
            pertanyaanFinal += soalMatch[2];
            
            q = { 
                kategori_id: katId, 
                materi_id: matId, 
                pertanyaan: pertanyaanFinal, 
                opsi: { A: '', B: '', C: '', D: '', E: '' }, 
                kunci: '', 
                pembahasan: '', 
                tipe: null 
            };
            continue;
        }

        if (!q) { 
            currentTeksBacaan += line + '\n'; 
            continue; 
        }
        
        if (inTeks) { 
            currentTeksBacaan += line + '\n'; 
            continue; 
        }

        const optMatch = line.match(/^([A-E])\.\s*(.*)/i);
        if (optMatch) {
            currentOpt = optMatch[1].toUpperCase();
            q.opsi[currentOpt] = optMatch[2];
            inPembahasan = false;
            continue;
        }

        const kunciMatch = line.match(/^(?:kunci|jawaban)\s*[:\-]?\s*(.+)/i);
        if (kunciMatch) {
            q.kunci = kunciMatch[1].trim();
            inPembahasan = false; 
            currentOpt = null;
            continue;
        }

        const bahasMatch = line.match(/^pembahasan\s*[:\-]?\s*(.*)/i);
        if (bahasMatch) {
            inPembahasan = true; 
            currentOpt = null;
            q.pembahasan += bahasMatch[1] ? (bahasMatch[1] + '<br>') : '';
            continue;
        }

        if (inPembahasan) {
            q.pembahasan += line + '<br>';
        } else if (currentOpt) {
            q.opsi[currentOpt] += ' ' + line;
        } else if (q) {
            q.pertanyaan += '\n' + line;
        }
    }

    if (q && q.pertanyaan && q.kunci) {
        questions.push(q);
    }

    // Post-process untuk tipe soal
    questions.forEach((q) => {
        if (!q.pertanyaan || !q.kunci) return;
        
        // Cek Benar/Salah dari tabel pipe
        const qLines = q.pertanyaan.split('\n');
        let bsTableLines = [];
        let foundBSHeader = false;
        let bsTableStartLine = -1;
        let bsTableEndLine = -1;
        
        for (let idx = 0; idx < qLines.length; idx++) {
            const line = qLines[idx].trim();
            if (line.match(/^\|(.+)\|$/)) {
                const cols = line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
                if (cols.length >= 3 && /pernyataan/i.test(cols[0]) && /benar/i.test(cols[1]) && /salah/i.test(cols[2])) {
                    foundBSHeader = true;
                    bsTableStartLine = idx;
                    bsTableLines = [];
                } else if (foundBSHeader) {
                    bsTableLines.push(cols[0]);
                    bsTableEndLine = idx;
                }
            } else if (foundBSHeader) {
                break;
            }
        }
        
        if (foundBSHeader && bsTableLines.length > 0 && !Object.values(q.opsi).some(o => o.trim() !== '')) {
            const filteredLines = qLines.filter((l, idx) => idx < bsTableStartLine || idx > bsTableEndLine);
            q.pertanyaan = filteredLines.join('\n');
            q.opsi = {
                A: bsTableLines[0] || '',
                B: bsTableLines[1] || '',
                C: bsTableLines[2] || '',
                D: bsTableLines[3] || '',
                E: bsTableLines[4] || ''
            };
            q.tipe = 'bs';
            const keys = q.kunci.split(/[,;\-/\s]+/).filter(Boolean).map(key => {
                const val = key.toLowerCase();
                return (val === 'benar' || val === 'b' || val === '1' || val === 'a') ? 'B' : 'S';
            });
            q.kunci = keys.slice(0, bsTableLines.length).join(',');
        }

        if (!q.tipe && (q.pertanyaan.includes('[ISIAN]') || q.pertanyaan.includes('___'))) {
            q.pertanyaan = q.pertanyaan.replace(/\[ISIAN\]|_{3,}/g, '<span class="kotak-isian"></span>');
            q.tipe = 'isian';
        }

        if (!q.tipe && /\[(?:PGK|MULTI|MULTI[\s-]?SELECT|PILIHAN\s*GANDA\s*KOMPLEKS)\]/i.test(q.pertanyaan)) {
            q.pertanyaan = q.pertanyaan.replace(/\[(?:PGK|MULTI|MULTI[\s-]?SELECT|PILIHAN\s*GANDA\s*KOMPLEKS)\]/gi, '').trim();
            q.tipe = 'pgk';
        }
        if (!q.tipe && q.kunci && /^[A-E]\s*,\s*[A-E](?:\s*,\s*[A-E])*$/i.test(q.kunci.trim())) {
            q.tipe = 'pgk';
        }
        if (q.tipe === 'pgk' && q.kunci) {
            q.kunci = q.kunci.split(',').map(k => k.trim().toUpperCase()).sort().join(',');
        }

        if (!q.tipe) q.tipe = 'pg';

        q.pertanyaan = convertGambarShortcode(q.pertanyaan);
        ['A', 'B', 'C', 'D', 'E'].forEach(opt => {
            if (q.opsi[opt]) q.opsi[opt] = convertGambarShortcode(q.opsi[opt]);
        });
        if (q.pembahasan) q.pembahasan = convertGambarShortcode(q.pembahasan);
    });

    return questions;
}

// 👁️ TAMPILKAN PREVIEW HASIL PARSE
function showPreview() {
    const container = document.getElementById('resultsList');
    const resultsDiv = document.getElementById('scanResults');
    container.innerHTML = `<p style="margin-bottom:1rem; color: var(--brand-primary); font-weight:bold;">🎉 Berhasil memproses ${parsedQuestions.length} soal!</p>`;
    
    parsedQuestions.forEach((q, i) => {
        let opsiHTML = '';
        if (q.tipe === 'bs') {
            const statements = ['A', 'B', 'C', 'D', 'E'].filter(letter => q.opsi[letter]);
            const kunciArr = (q.kunci || '').split(',');
            opsiHTML = `
                <div style="margin: 0.6rem 0;">
                    <p style="color: var(--brand-primary); font-weight:bold; margin-bottom: 0.4rem;">⚖️ Tipe: Benar / Salah</p>
                    <table class="tabel-soal" style="margin: 0.5rem 0;">
                        <thead>
                            <tr>
                                <th style="width: 75%;">Pernyataan</th>
                                <th style="text-align: center;">Kunci</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${statements.map((letter, idx) => {
                                const k = kunciArr[idx] || '-';
                                return `
                                    <tr>
                                        <td>${q.opsi[letter]}</td>
                                        <td style="text-align: center; font-weight: bold; color: ${k === 'B' ? 'var(--brand-primary)' : 'var(--error, #e53935)'};">
                                            ${k === 'B' ? '✅ Benar' : k === 'S' ? '❌ Salah' : k}
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else if (q.tipe === 'isian') {
            opsiHTML = `
                <div style="margin: 0.6rem 0;">
                    <p style="color: var(--brand-primary); font-weight:bold;">✏️ Tipe: Isian Singkat</p>
                </div>
            `;
        } else if (q.tipe === 'pgk') {
            opsiHTML = `
                <div style="margin: 0.6rem 0;">
                    <p style="color: #00796b; font-weight:bold; margin-bottom:0.5rem;">☑️ Tipe: PG Kompleks (Multi-Select)</p>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; font-size: 0.9rem;">
                        <p><strong>A.</strong> ${q.opsi.A || '-'}</p>
                        <p><strong>B.</strong> ${q.opsi.B || '-'}</p>
                        <p><strong>C.</strong> ${q.opsi.C || '-'}</p>
                        <p><strong>D.</strong> ${q.opsi.D || '-'}</p>
                        <p style="grid-column: span 2;"><strong>E.</strong> ${q.opsi.E || '-'}</p>
                    </div>
                </div>
            `;
        } else {
            opsiHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; font-size: 0.9rem; margin: 0.6rem 0;">
                    <p><strong>A.</strong> ${q.opsi.A || '-'}</p>
                    <p><strong>B.</strong> ${q.opsi.B || '-'}</p>
                    <p><strong>C.</strong> ${q.opsi.C || '-'}</p>
                    <p><strong>D.</strong> ${q.opsi.D || '-'}</p>
                    <p style="grid-column: span 2;"><strong>E.</strong> ${q.opsi.E || '-'}</p>
                </div>
            `;
        }

        container.innerHTML += `
            <div class="soal-preview-item">
                <h4 style="margin-bottom: 0.8rem; display: flex; align-items: center; justify-content: space-between;">
                    <span>
                        Soal ${i + 1} 
                        <span class="tipe-badge ${q.tipe}">${q.tipe === 'bs' ? '⚖️ B/S' : q.tipe === 'isian' ? '✏️ Isian' : q.tipe === 'pgk' ? '☑️ PGK' : '📝 PG'}</span>
                    </span>
                    <select class="tipe-override" data-index="${i}" style="padding: 0.4rem; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-size: 0.9rem; cursor: pointer;">
                        <option value="pg" ${q.tipe === 'pg' ? 'selected' : ''}>📝 Pilihan Ganda</option>
                        <option value="bs" ${q.tipe === 'bs' ? 'selected' : ''}>⚖️ Benar/Salah</option>
                        <option value="isian" ${q.tipe === 'isian' ? 'selected' : ''}>✏️ Isian Singkat</option>
                        <option value="pgk" ${q.tipe === 'pgk' ? 'selected' : ''}>☑️ PG Kompleks</option>
                    </select>
                </h4>
                <div style="font-size: 0.95rem; line-height: 1.6; margin-bottom: 1rem; color: var(--text-primary); max-height: 300px; overflow-y: auto;">
                    ${q.pertanyaan}
                </div>
                ${opsiHTML}
                <p class="kunci" style="margin-top: 0.8rem; font-size: 0.95rem;">🔑 Kunci Jawaban: <strong>${q.kunci}</strong></p>
                ${q.pembahasan ? `
                    <details style="margin-top:0.8rem; background: var(--bg-tertiary); padding: 0.6rem 0.8rem; border-radius: 6px;">
                        <summary style="cursor:pointer; color:var(--brand-primary); font-weight: 600;">💡 Pembahasan</summary>
                        <div style="font-size:0.88rem; line-height: 1.5; color:var(--text-secondary); margin-top:0.6rem;">${q.pembahasan}</div>
                    </details>
                ` : ''}
            </div>
        `;
    });
    
    // Event listener untuk dropdown tipe override
    document.querySelectorAll('.tipe-override').forEach(select => {
        select.addEventListener('change', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            const newTipe = e.target.value;
            parsedQuestions[index].tipe = newTipe;
            console.log(`[OVERRIDE] Soal ${index + 1} tipe diubah menjadi: ${newTipe}`);
            
            const badge = e.target.closest('.soal-preview-item').querySelector('.tipe-badge');
            badge.className = `tipe-badge ${newTipe}`;
            badge.textContent = newTipe === 'bs' ? '⚖️ B/S' : newTipe === 'isian' ? '✏️ Isian' : newTipe === 'pgk' ? '☑️ PGK' : '📝 PG';
        });
    });

    // Render KaTeX pada seluruh kartu preview
    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(container, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true }
            ],
            throwOnError: false
        });
    }
    
    resultsDiv.style.display = 'block';
    resultsDiv.scrollIntoView({ behavior: 'smooth' });
}

// 💾 SIMPAN SEMUA HASIL PARSE KE SUPABASE DATABASE
async function saveToDatabase() {
    const btn = document.getElementById('btnConfirmSave');
    btn.disabled = true;
    btn.textContent = '⏳ Menyimpan ke Cloud Database...';
    const { data: { user } } = await window.db.auth.getUser();
    let success = 0;
    try {
        for (const q of parsedQuestions) {
            const { error } = await window.db.from('bank_soal').insert({
                kategori_id: q.kategori_id,
                materi_id: q.materi_id,
                pertanyaan_html: q.pertanyaan,
                opsi_a_html: q.opsi.A || null,
                opsi_b_html: q.opsi.B || null,
                opsi_c_html: q.opsi.C || null,
                opsi_d_html: q.opsi.D || null,
                opsi_e_html: q.opsi.E || null,
                kunci_jawaban: q.kunci,
                tipe_soal: q.tipe || 'pg',
                pembahasan_html: q.pembahasan ? `<p>${q.pembahasan}</p>` : null,
                created_by: user.id
            });
            if (error) throw error;
            success++;
        }
        await showScyraAlert(`${success} soal berhasil masuk ke Bank Soal Scyra!`, '🚀 Sukses Besar', '🏆');
        document.getElementById('scanResults').style.display = 'none';
        document.getElementById('soalForm').reset();
        parsedQuestions = [];
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

// 🚨 FUNGSI HELPER: Ubah tampilan form berdasarkan tipe soal
function updateFormByTipeSoal(tipe) {
    const opsiA = document.getElementById('editOpsiA');
    const opsiB = document.getElementById('editOpsiB');
    const opsiC = document.getElementById('editOpsiC');
    const opsiD = document.getElementById('editOpsiD');
    const opsiE = document.getElementById('editOpsiE');
    const labelA = document.getElementById('labelOpsiA');
    const labelB = document.getElementById('labelOpsiB');
    const labelC = document.getElementById('labelOpsiC');
    const labelD = document.getElementById('labelOpsiD');
    const labelE = document.getElementById('labelOpsiE');
    const kunciPG = document.getElementById('editKunciPG');
    const kunciText = document.getElementById('editKunciText');
    const hintKunci = document.getElementById('hintKunci');
    const labelKunci = document.getElementById('labelKunci');

    if (tipe === 'pg') {
        // Pilihan Ganda: tampilkan semua opsi A-E
        labelA.textContent = 'Opsi A';
        labelB.textContent = 'Opsi B';
        labelC.textContent = 'Opsi C';
        labelD.textContent = 'Opsi D';
        labelE.textContent = 'Opsi E';
        opsiA.required = true;
        opsiB.required = true;
        opsiC.required = true;
        opsiD.required = true;
        opsiE.required = true;
        opsiA.parentElement.style.display = 'block';
        opsiB.parentElement.style.display = 'block';
        opsiC.parentElement.style.display = 'block';
        opsiD.parentElement.style.display = 'block';
        opsiE.parentElement.style.display = 'block';
        
        kunciPG.style.display = 'block';
        kunciPG.required = true;
        kunciText.style.display = 'none';
        kunciText.required = false;
        labelKunci.textContent = 'Kunci Jawaban';
        hintKunci.textContent = '💡 Pilih jawaban yang benar dari opsi A-E';
    } else if (tipe === 'bs') {
        // Benar/Salah: ubah label jadi Pernyataan 1-5, D & E opsional
        labelA.textContent = 'Pernyataan 1';
        labelB.textContent = 'Pernyataan 2';
        labelC.textContent = 'Pernyataan 3';
        labelD.textContent = 'Pernyataan 4 (opsional)';
        labelE.textContent = 'Pernyataan 5 (opsional)';
        opsiA.required = true;
        opsiB.required = true;
        opsiC.required = false;
        opsiD.required = false;
        opsiE.required = false;
        opsiA.parentElement.style.display = 'block';
        opsiB.parentElement.style.display = 'block';
        opsiC.parentElement.style.display = 'block';
        opsiD.parentElement.style.display = 'block';
        opsiE.parentElement.style.display = 'block';
        
        kunciPG.style.display = 'none';
        kunciPG.required = false;
        kunciText.style.display = 'block';
        kunciText.required = true;
        labelKunci.textContent = 'Kunci Jawaban (Format: B,S,B atau Benar,Salah,Benar)';
        hintKunci.textContent = '💡 Urutan B/S sesuai urutan pernyataan. Contoh: B,S,B,B (artinya pernyataan 1,3,4 benar, pernyataan 2 salah)';
    } else if (tipe === 'isian') {
        // Isian: sembunyikan opsi, hanya tampilkan pertanyaan
        opsiA.required = false;
        opsiB.required = false;
        opsiC.required = false;
        opsiD.required = false;
        opsiE.required = false;
        opsiA.parentElement.style.display = 'none';
        opsiB.parentElement.style.display = 'none';
        opsiC.parentElement.style.display = 'none';
        opsiD.parentElement.style.display = 'none';
        opsiE.parentElement.style.display = 'none';
        
        kunciPG.style.display = 'none';
        kunciPG.required = false;
        kunciText.style.display = 'block';
        kunciText.required = true;
        labelKunci.textContent = 'Kunci Jawaban (Teks Bebas)';
        hintKunci.textContent = '💡 Ketik jawaban yang benar. Contoh: Jakarta, Fotosintesis, 42, dll.';
    } else if (tipe === 'pgk') {
        // PG Kompleks: tampilkan opsi A-E, kunci pakai checkbox
        labelA.textContent = 'Opsi A';
        labelB.textContent = 'Opsi B';
        labelC.textContent = 'Opsi C';
        labelD.textContent = 'Opsi D';
        labelE.textContent = 'Opsi E';
        opsiA.required = true;
        opsiB.required = true;
        opsiC.required = false;
        opsiD.required = false;
        opsiE.required = false;
        opsiA.parentElement.style.display = 'block';
        opsiB.parentElement.style.display = 'block';
        opsiC.parentElement.style.display = 'block';
        opsiD.parentElement.style.display = 'block';
        opsiE.parentElement.style.display = 'block';
        
        kunciPG.style.display = 'none';
        kunciPG.required = false;
        kunciText.style.display = 'none';
        kunciText.required = false;
        const kunciPGK = document.getElementById('editKunciPGK');
        if (kunciPGK) kunciPGK.style.display = 'flex';
        labelKunci.textContent = 'Kunci Jawaban (Centang semua yang benar)';
        hintKunci.textContent = '💡 Centang semua opsi yang merupakan jawaban benar. Contoh: A dan C.';
    }

    // Sembunyikan kunciPGK jika bukan pgk
    if (tipe !== 'pgk') {
        const kunciPGK = document.getElementById('editKunciPGK');
        if (kunciPGK) kunciPGK.style.display = 'none';
    }
}

function setupEditModal() {
    const modal = document.getElementById('editSoalModal');
    const btnClose = document.getElementById('btnCloseEditModal');
    
    btnClose.onclick = () => modal.classList.remove('active');
    modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('active'); };

    // 🎨 INIT QUILL EDITORS (hanya sekali)
    if (document.getElementById('quillPertanyaan') && !quillPertanyaan) {
        quillPertanyaan = new Quill('#quillPertanyaan', {
            theme: 'snow',
            placeholder: 'Ketik pertanyaan soal di sini...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    ['link', 'image'],
                    ['clean']
                ]
            }
        });
    }
    
    if (document.getElementById('quillPembahasan') && !quillPembahasan) {
        quillPembahasan = new Quill('#quillPembahasan', {
            theme: 'snow',
            placeholder: 'Ketik pembahasan di sini...',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    ['link', 'image'],
                    ['clean']
                ]
            }
        });
    }

    // 🚨 Event listener untuk perubahan tipe soal
    document.getElementById('editTipeSoal').addEventListener('change', (e) => {
        updateFormByTipeSoal(e.target.value);
    });

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
        const tipeSoal = document.getElementById('editTipeSoal').value;
        
        // 🚨 Ambil kunci jawaban dari field yang sesuai
        let kunciJawaban = '';
        if (tipeSoal === 'pg') {
            kunciJawaban = document.getElementById('editKunciPG').value;
        } else if (tipeSoal === 'pgk') {
            const checked = [...document.querySelectorAll('.pgk-kunci-cb:checked')].map(cb => cb.value).sort();
            kunciJawaban = checked.join(',');
        } else {
            kunciJawaban = document.getElementById('editKunciText').value;
        }

        if (tipeSoal === 'pgk' && !kunciJawaban) {
            btn.disabled = false;
            btn.textContent = '💾 Simpan Perubahan';
            await showScyraAlert('Pilih minimal satu opsi sebagai kunci jawaban PG Kompleks.', '⚠️ Kunci Belum Dipilih', '⚠️');
            return;
        }
        
        // 🎨 AMBIL CONTENT DARI QUILL EDITORS
        const rawPertanyaanHTML = quillPertanyaan ? quillPertanyaan.root.innerHTML : document.getElementById('editPertanyaan').value;
        const rawPembahasanHTML = quillPembahasan ? quillPembahasan.root.innerHTML : document.getElementById('editPembahasan').value;
        
        const updates = {
            kategori_id: document.getElementById('editKategoriSoal').value,
            materi_id: document.getElementById('editMateriSoal').value,
            pertanyaan_html: convertGambarShortcode(rawPertanyaanHTML),
            opsi_a_html: convertGambarShortcode(document.getElementById('editOpsiA').value),
            opsi_b_html: convertGambarShortcode(document.getElementById('editOpsiB').value),
            opsi_c_html: convertGambarShortcode(document.getElementById('editOpsiC').value),
            opsi_d_html: convertGambarShortcode(document.getElementById('editOpsiD').value),
            opsi_e_html: convertGambarShortcode(document.getElementById('editOpsiE').value),
            kunci_jawaban: kunciJawaban,
            tipe_soal: tipeSoal,
            pembahasan_html: convertGambarShortcode(rawPembahasanHTML)
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
    
    // 🎨 LOAD KE QUILL EDITORS
    if (quillPertanyaan) {
        quillPertanyaan.root.innerHTML = soal.pertanyaan_html || '';
    }
    document.getElementById('editPertanyaan').value = soal.pertanyaan_html || '';
    
    document.getElementById('editOpsiA').value = soal.opsi_a_html || '';
    document.getElementById('editOpsiB').value = soal.opsi_b_html || '';
    document.getElementById('editOpsiC').value = soal.opsi_c_html || '';
    document.getElementById('editOpsiD').value = soal.opsi_d_html || '';
    document.getElementById('editOpsiE').value = soal.opsi_e_html || '';
    
    if (quillPembahasan) {
        quillPembahasan.root.innerHTML = soal.pembahasan_html || '';
    }
    document.getElementById('editPembahasan').value = (soal.pembahasan_html || '').replace(/<\/?p>/g, '');
    
    document.getElementById('editTipeSoal').value = soal.tipe_soal || 'pg';
    
    // 🚨 Set kunci jawaban berdasarkan tipe soal
    const tipeSoal = soal.tipe_soal || 'pg';
    if (tipeSoal === 'pg') {
        document.getElementById('editKunciPG').value = soal.kunci_jawaban || 'A';
        document.getElementById('editKunciText').value = '';
    } else if (tipeSoal === 'pgk') {
        document.getElementById('editKunciPG').value = 'A';
        document.getElementById('editKunciText').value = '';
        // Set checkbox PGK
        document.querySelectorAll('.pgk-kunci-cb').forEach(cb => cb.checked = false);
        const kunciArr = (soal.kunci_jawaban || '').split(',').map(k => k.trim().toUpperCase());
        kunciArr.forEach(k => {
            const cb = document.querySelector(`.pgk-kunci-cb[value="${k}"]`);
            if (cb) cb.checked = true;
        });
    } else {
        document.getElementById('editKunciPG').value = 'A';
        document.getElementById('editKunciText').value = soal.kunci_jawaban || '';
    }
    
    // 🚨 Update tampilan form berdasarkan tipe soal
    updateFormByTipeSoal(tipeSoal);

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
                
                // Tambahin ke list hasil dengan opsi ukuran
                const item = document.createElement('div');
                item.className = 'url-gambar-item';
                item.innerHTML = `
                    <div style="display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 1.2rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color);">
                        <img src="${publicUrl}" alt="${file.name}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border-color); flex-shrink: 0;">
                        <div style="flex: 1; min-width: 0;">
                            <p style="margin: 0 0 0.5rem 0; font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${file.name}</p>
                            
                            <div style="margin-bottom: 0.8rem;">
                                <label style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.4rem;">Pilih Ukuran:</label>
                                <select class="size-selector" data-url="${publicUrl}" style="width: 100%; padding: 0.4rem 0.6rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-primary); color: var(--text-primary); font-size: 0.85rem;">
                                    <option value="small">Kecil (25% lebar)</option>
                                    <option value="medium" selected>Sedang (50% lebar)</option>
                                    <option value="large">Besar (75% lebar)</option>
                                    <option value="full">Penuh (100% lebar)</option>
                                    <option value="custom">Custom (ketik manual)</option>
                                </select>
                            </div>
                            
                            <code class="shortcode-display" style="display: block; background: var(--bg-tertiary); padding: 0.5rem 0.7rem; border-radius: 4px; font-size: 0.75rem; color: var(--text-secondary); word-break: break-all; margin-bottom: 0.5rem;">[GAMBAR: ${publicUrl} | SIZE: 50%]</code>
                            
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn-copy-shortcode" data-shortcode="[GAMBAR: ${publicUrl} | SIZE: 50%]" title="Salin Shortcode" style="background: var(--brand-primary); color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600; flex: 1;">📋 Salin Kode</button>
                                <button class="btn-preview-img" data-url="${publicUrl}" title="Preview" style="background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.5rem 0.8rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">👁️</button>
                            </div>
                        </div>
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
                
                // Pasang event listener ke size selector
                document.querySelectorAll('.size-selector').forEach(select => {
                    select.addEventListener('change', function() {
                        const url = this.getAttribute('data-url');
                        const size = this.value;
                        const item = this.closest('.url-gambar-item');
                        const codeDisplay = item.querySelector('.shortcode-display');
                        const copyBtn = item.querySelector('.btn-copy-shortcode');
                        
                        let shortcode = '';
                        let sizeText = '';
                        
                        switch(size) {
                            case 'small':
                                shortcode = `[GAMBAR: ${url} | SIZE: 25%]`;
                                sizeText = '25%';
                                break;
                            case 'medium':
                                shortcode = `[GAMBAR: ${url} | SIZE: 50%]`;
                                sizeText = '50%';
                                break;
                            case 'large':
                                shortcode = `[GAMBAR: ${url} | SIZE: 75%]`;
                                sizeText = '75%';
                                break;
                            case 'full':
                                shortcode = `[GAMBAR: ${url}]`;
                                sizeText = '100%';
                                break;
                            case 'custom':
                                const customSize = prompt('Masukkan ukuran custom (contoh: 300px, 60%, 400px):', '300px');
                                if (customSize) {
                                    shortcode = `[GAMBAR: ${url} | SIZE: ${customSize}]`;
                                    sizeText = customSize;
                                } else {
                                    this.value = 'medium';
                                    shortcode = `[GAMBAR: ${url} | SIZE: 50%]`;
                                    sizeText = '50%';
                                }
                                break;
                        }
                        
                        codeDisplay.textContent = shortcode;
                        copyBtn.setAttribute('data-shortcode', shortcode);
                    });
                });
                
                // Pasang event listener ke tombol copy
                document.querySelectorAll('.btn-copy-shortcode').forEach(btn => {
                    btn.addEventListener('click', async function() {
                        const shortcode = this.getAttribute('data-shortcode');
                        try {
                            await navigator.clipboard.writeText(shortcode);
                            const origText = this.innerHTML;
                            this.innerHTML = '✅ Tersalin!';
                            this.style.background = 'var(--success)';
                            setTimeout(() => {
                                this.innerHTML = origText;
                                this.style.background = 'var(--brand-primary)';
                            }, 2000);
                        } catch (err) {
                            console.error('Gagal copy:', err);
                            alert('Gagal menyalin. Copy manual dari kotak kode.');
                        }
                    });
                });
                
                // Pasang event listener ke tombol preview
                document.querySelectorAll('.btn-preview-img').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const url = this.getAttribute('data-url');
                        window.open(url, '_blank');
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

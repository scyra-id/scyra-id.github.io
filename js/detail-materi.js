document.addEventListener('DOMContentLoaded', async () => {
    // 🚨 STATE GLOBAL UNTUK KUIS INTERAKTIF (DIPINDAHKAN KE SINI AGAR BISA DIAKSES SEMUA FUNGSI)
    let currentCorrectAnswer = null;
    let hasAnswered = false;

    // =======================================================
    // 🚨 SCYRA MAGIC ENGINE (TRAP ALERT ANTI-BOCOR & KELUAR PEMBAHASAN)
    // =======================================================
    function applyScyraMagic(rawHtml) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawHtml, 'text/html');
        let finalHtml = '';
        
        // 🚨 FIX LAYOUT HP: Pisah jadi 3 wadah (Core, Algo, Right)
        let splitCore = '';
        let splitAlgo = '';
        let splitRight = '';
        let currentSection = 'core'; // Default masuk ke Core
        
        let inSplit = false; 
        let isSoalCardOpen = false;
        let isPembahasanOpen = false; 
        let peta = { fokus: '', frekuensi: '', ciri: '' };
        let algoHtml = '';
        let inAlgo = false;
        let pendingTableRow = ''; 
        let activeBlock = null; 
        let blockHtml = '';

        // 🚨 STATE BARU UNTUK TABEL MELEBAR
        let inTable = false;
        let tableCols = 0;
        let tableHtml = '';
        
        const closePembahasan = () => {
            if (isPembahasanOpen) {
                if (inSplit) {
                    if (currentSection === 'algo') splitAlgo += '</div></details>'; 
                    else splitCore += '</div></details>';
                } else finalHtml += '</div></details>';
                isPembahasanOpen = false;
            }
        };
        
        const closeActiveBlock = () => {
            if (activeBlock === 'trap') {
                let html = `<div class="scyra-trap"><strong>🚨 TRAP ALERT</strong>${blockHtml}</div>`;
                if (inSplit) { 
                    if (currentSection === 'algo') splitAlgo += html; 
                    else splitCore += html; 
                } else finalHtml += html;
            } else if (activeBlock === 'fyi') {
                let html = `<div class="scyra-fyi"><strong>ℹ️ FYI</strong>${blockHtml}</div>`;
                if (inSplit) { 
                    if (currentSection === 'algo') splitAlgo += html; 
                    else splitCore += html; 
                } else finalHtml += html;
            }
            activeBlock = null;
            blockHtml = '';
        };
        
        const renderPeta = () => {
            if (peta.fokus || peta.frekuensi || peta.ciri) {
                let html = `
                <div class="scyra-peta-grid">
                    <div class="peta-card-fokus">
                        <h4>🎯 Fokus Materi</h4>
                        <p>${peta.fokus || 'Materi penting untuk dikuasai.'}</p>
                    </div>
                    <div class="peta-card-bawah">
                        <div class="peta-card-half">
                            <h4>📊 Frekuensi & Estimasi</h4>
                            <p>${peta.frekuensi || 'Sering muncul di UTBK/SNBT.'}</p>
                        </div>
                        <div class="peta-card-half">
                            <h4>💡 Ciri Khas</h4>
                            <p>${peta.ciri || 'Pola soal membutuhkan ketelitian.'}</p>
                        </div>
                    </div>
                </div>`;
                if (inSplit) { 
                    if (currentSection === 'algo') splitAlgo += html; 
                    else splitCore += html; 
                } else finalHtml += html;
                peta = { fokus: '', frekuensi: '', ciri: '' };
            }
        };
        
        const closeAlgo = () => {
            if (inAlgo && algoHtml) {
                let html = `
                <div class="scyra-algo-container">
                    <div class="scyra-algo">
                        ${algoHtml}
                    </div>
                </div>`;
                if (inSplit) { 
                    if (currentSection === 'algo') splitAlgo += html; 
                    else splitCore += html; 
                } else finalHtml += html;
                algoHtml = '';
                inAlgo = false;
            }
        };
        
        const closeSplit = () => {
            closeActiveBlock();
            closeAlgo();
            renderPeta();
            closePembahasan(); 
            if (pendingTableRow !== '') {
                if (!inSplit) inSplit = true;
                splitRight += `<p>${pendingTableRow}</p>`;
                pendingTableRow = '';
            }

            // 🚨 PENANGANAN TABEL KETIKA SPLIT HARUS DITUTUP
            let wideTablePending = '';
            if (inTable) {
                tableHtml += '</tbody></table></div>';
                if (tableCols > 3) {
                    // Jika kolom lebih dari 3, simpan sementara untuk ditaruh di bawah split
                    wideTablePending = tableHtml;
                } else {
                    if (!inSplit) inSplit = true;
                    splitRight += tableHtml;
                }
                inTable = false;
                tableHtml = '';
                tableCols = 0;
            }
            
            if (inSplit) {
                finalHtml += `
                <div class="split-layout">
                    <div class="split-core">${splitCore}</div>
                    <div class="split-right">${splitRight}</div>
                    <div class="split-algo">${splitAlgo}</div>
                </div>`;
                splitCore = ''; 
                splitAlgo = '';
                splitRight = ''; 
                inSplit = false;
                currentSection = 'core';
            }

            // Letakkan tabel yang lebih dari 3 kolom di luar dari split layout agar melebar
            if (wideTablePending) {
                finalHtml += wideTablePending;
            }
        };

        const flushTable = () => {
            if (inTable) {
                if (tableCols > 3) {
                    // Paksa tutup split agar tabel melebar ke bawah
                    closeSplit(); 
                } else {
                    tableHtml += '</tbody></table></div>';
                    if (!inSplit) inSplit = true;
                    splitRight += tableHtml;
                    inTable = false;
                    tableHtml = '';
                    tableCols = 0;
                }
            }
        };
        
        Array.from(doc.body.children).forEach(el => {
            let text = el.textContent.trim(); 
            let lower = text.toLowerCase();
            let tag = el.tagName; 
            let inner = el.innerHTML; 
            let rawEl = el.outerHTML;
            
            // 🚨 HAPUS SIFAT SENSITIF BARIS KOSONG 🚨
            if (!text && tag === 'P' && !inner.includes('img') && !inner.includes('GAMBAR') && !inner.includes('SIMULASI')) {
                return;
            }
            
            // 🚨 SAFETY CHECK BUAT TABEL
            if (pendingTableRow !== '') {
                let isTrigger = tag.match(/^H[1-6]$/) || inner.includes('[GAMBAR:') || inner.includes('[SIMULASI:') || lower.match(/^(?:•|-|\*)?\s*(langkah|step|trik|cara|trap alert|jebakan maut|fyi|for your information)/i);
                if (isTrigger) {
                    flushTable();
                    if (!inSplit) inSplit = true;
                    splitRight += `<p>${pendingTableRow}</p>`;
                    pendingTableRow = '';
                }
            }

            // Identifikasi apakah baris saat ini adalah bagian dari tabel
            let isTableRow = text.includes('|') || pendingTableRow !== '' || (text.includes('","') && text.includes('"'));

            // Tutup dan proses tabel jika elemen saat ini bukan tabel
            if (!isTableRow) {
                flushTable();
            }
            
            // 1. DETEKSI PETA KONSEP
            if (lower.includes('fokus materi')) { 
                peta.fokus = inner.replace(/.*fokus materi[:\-]?\s*/i, '').replace(/^[•\-\*]\s*/, '').replace(/<\/?(p|div|strong|b|span)[^>]*>/gi, '').trim(); 
                return; 
            }
            if (lower.includes('frekuensi') && (lower.includes('estimasi') || lower.includes(':'))) { 
                peta.frekuensi = inner.replace(/.*(frekuensi & estimasi|frekuensi)[:\-]?\s*/i, '').replace(/^[•\-\*]\s*/, '').replace(/<\/?(p|div|strong|b|span)[^>]*>/gi, '').trim(); 
                return; 
            }
            if (lower.includes('ciri khas')) { 
                peta.ciri = inner.replace(/.*ciri khas[:\-]?\s*/i, '').replace(/^[•\-\*]\s*/, '').replace(/<\/?(p|div|strong|b|span)[^>]*>/gi, '').trim(); 
                return; 
            }
            renderPeta();
            
            // 2. DETEKSI GAMBAR SHORTCODE
            if (inner.includes('[GAMBAR:')) {
                let imgMatch = inner.match(/\[GAMBAR:\s*(.*?)\]/i);
                if (imgMatch) {
                    if (!inSplit) inSplit = true;
                    splitRight += `<img src="${imgMatch[1]}" class="scyra-image">`;
                    inner = inner.replace(/\[GAMBAR:\s*.*?\]/gi, '');
                    text = text.replace(/\[GAMBAR:\s*.*?\]/gi, '').trim();
                    if (!inner.trim()) return; 
                    rawEl = `<p>${inner}</p>`;
                }
            }
            
            // 3. DETEKSI SIMULASI SHORTCODE SUPABASE
            if (inner.includes('[SIMULASI:')) {
                let simMatch = inner.match(/\[SIMULASI:\s*(.*?)\]/i);
                if (simMatch) {
                    if (!inSplit) inSplit = true;
                    let simUrl = simMatch[1].trim();
                    let simHtml = `
                    <div class="simulasi-container scyra-sim-container" data-simurl="${simUrl}">
                        <div class="simulasi-header">
                            <span>🎮 Simulasi Interaktif</span>
                            <a href="${simUrl}" target="_blank" style="color: white; text-decoration: none; font-size: 0.9rem;">Buka Link Asli ↗</a>
                        </div>
                        <div class="sim-loading" style="padding: 2rem; text-align: center;">
                            <div class="spinner-sage" style="margin: 0 auto 1rem auto;"></div>
                            <p style="color: var(--text-secondary);">Memuat simulasi...</p>
                        </div>
                        <iframe style="width: 100%; height: 500px; border: none; background: #fff; display: none;"></iframe>
                    </div>`;
                    splitRight += simHtml;
                    inner = inner.replace(/\[SIMULASI:\s*.*?\]/gi, '');
                    text = text.replace(/\[SIMULASI:\s*.*?\]/gi, '').trim();
                    if (!inner.trim()) return; 
                    rawEl = `<p>${inner}</p>`;
                }
            }
            
            // 4. DETEKSI TABEL MULTI-LINE
            if (isTableRow) {
                if (text.includes('","') && text.includes('"') && pendingTableRow === '') {
                    // CSV Style
                    let rows = text.split('","');
                    let cols = rows.length;
                    let tRow = `<tr>` + rows.map(c => `<td>${c.replace(/"/g, '').trim()}</td>`).join('') + `</tr>`;
                    
                    if (!inTable) {
                        inTable = true;
                        tableCols = cols;
                        tableHtml = `<div class="scyra-table-wrapper${cols > 3 ? ' scyra-table-wide' : ''}"><table class="scyra-table"><tbody>${tRow}`;
                    } else {
                        tableHtml += tRow;
                    }
                    return;
                }
                
                // Markdown Style
                pendingTableRow += (pendingTableRow ? ' ' : '') + text;
                if (pendingTableRow.trim().endsWith('|')) {
                    let rows = pendingTableRow.split('|').map(c => c.trim());
                    if (rows[0] === '') rows.shift();
                    if (rows[rows.length - 1] === '') rows.pop();
                    
                    let cols = rows.length;
                    let tRow = `<tr>` + rows.map(c => `<td>${c}</td>`).join('') + `</tr>`;
                    
                    if (!inTable) {
                        inTable = true;
                        tableCols = cols;
                        tableHtml = `<div class="scyra-table-wrapper${cols > 3 ? ' scyra-table-wide' : ''}"><table class="scyra-table"><tbody>${tRow}`;
                    } else {
                        tableHtml += tRow;
                    }
                    pendingTableRow = ''; 
                }
                return; 
            }
            
            // 5. DETEKSI HEADINGS (Pemisah Core & Algo)
            if (tag.match(/^H[1-6]$/)) {
                closeActiveBlock();
                closeAlgo();
                closePembahasan(); 
                if (lower.includes('materi padat') || lower.includes('the core')) {
                    if (!inSplit) inSplit = true; 
                    currentSection = 'core'; 
                    splitCore += `<h2>🧠 ${text}</h2>`; 
                    return;
                } else if (lower.includes('algoritma') || lower.includes('trik cepat')) {
                    if (!inSplit) inSplit = true; 
                    currentSection = 'algo'; 
                    splitAlgo += `<h2>⚡ ${text}</h2>`; 
                    return;
                } else if (lower.includes('bedah soal')) {
                    closeSplit(); 
                    if (isSoalCardOpen) finalHtml += `</div>`; 
                    isSoalCardOpen = true;
                    // 🚨 RESET STATE KUIS SETIAP ADA SOAL BARU
                    hasAnswered = false;
                    currentCorrectAnswer = null;
                    finalHtml += `<div class="scyra-soal-card"><h2 class="soal-title">🎯 ${text}</h2>`; 
                    return;
                }
            }
            
            // 6. DETEKSI ALGORITMA DARI LIST
            if (tag === 'OL' || tag === 'UL') {
                let listItems = Array.from(el.querySelectorAll('li'));
                listItems.forEach((li, index) => {
                    let num = tag === 'OL' ? (index + 1) : '•';
                    algoHtml += `
                        <div class="algo-step">
                            <span class="step-num">${num}</span>
                            <div class="step-content"><p>${li.innerHTML}</p></div>
                        </div>`;
                });
                inAlgo = true;
                return;
            }
            
            // 7. INFOGRAFIS, TRAP, FYI, ALGORITMA BIASA
            let isAlgoMatch = lower.match(/^(?:•|-|\*)?\s*(langkah|step|trik|cara)\s*\d+/i) || lower.match(/^(?:•|-|\*)?\s*\d+[\.\)]\s/i);
            
            // 🚨 DETEKSI TRAP ALERT 🚨
            if (lower.includes('trap alert') || lower.includes('jebakan maut')) {
                closeActiveBlock();
                closeAlgo();
                closePembahasan(); // PAKSA KELUAR DARI DROPDOWN PEMBAHASAN
                activeBlock = 'trap';
                let clean = inner.replace(/.*?(trap alert|jebakan maut)[\s:\-\)]*/i, '');
                clean = clean.replace(/^(?:<[^>]*>)*\s*[•\-\*\d\.]\s*/, '').trim();
                if (clean) blockHtml = `<p>${clean}</p>`;
                return;
            } 
            else if (lower.includes('fyi:') || lower.includes('for your information')) {
                closeActiveBlock();
                closeAlgo();
                closePembahasan(); 
                activeBlock = 'fyi';
                let clean = inner.replace(/.*?(fyi|for your information)[\s:\-\)]*/i, '');
                clean = clean.replace(/^(?:<[^>]*>)*\s*[•\-\*\d\.]\s*/, '').trim();
                if (clean) blockHtml = `<p>${clean}</p>`;
                return;
            } 
            else if (isAlgoMatch && !tag.match(/^H[1-6]$/)) {
                closeActiveBlock();
                let numMatch = text.match(/\d+/);
                let num = numMatch ? numMatch[0] : '•';
                let clean = inner;
                if (lower.match(/(langkah|step|trik|cara)\s*\d+/i)) {
                    clean = inner.replace(/.*?(langkah|step|trik|cara)\s*\d+[:\-\.\)]?\s*/i, '');
                } else {
                    clean = inner.replace(/.*?\d+[\.\)]\s*/i, '');
                }
                clean = clean.replace(/^[•\-\*]\s*/, '').replace(/^<[^>]*>/, '').trim();
                algoHtml += `
                    <div class="algo-step">
                        <span class="step-num">${num}</span>
                        <div class="step-content"><p>${clean}</p></div>
                    </div>`;
                inAlgo = true;
                return;
            } 
            else if (lower.startsWith('pembahasan') && !inSplit) { 
                closeActiveBlock();
                closeAlgo();
                closePembahasan(); 
                let titleMatch = text.match(/^(pembahasan[^:]*):?/i);
                let cleanTitle = titleMatch ? titleMatch[1] : text;
                cleanTitle = cleanTitle.replace(/[^a-zA-Z0-9 ]/g, '').trim();
                finalHtml += `<details class="scyra-pembahasan"><summary>💡 ${cleanTitle}</summary><div class="pembahasan-isi">`;
                isPembahasanOpen = true; 
                let sisaTeks = text.replace(/^(pembahasan[^:]*):?/i, '').trim();
                if (sisaTeks) {
                    finalHtml += `<p>${sisaTeks}</p>`;
                }
            } 
            // 🚨 DETEKSI KUNCI JAWABAN
            else if (lower.match(/^(jawaban|kunci jawaban)[:\s]+[a-e]/i)) {
                const match = lower.match(/^(jawaban|kunci jawaban)[:\s]+([a-e])/i);
                if (match) {
                    currentCorrectAnswer = match[2].toUpperCase();
                    return; 
                }
            }
                    // 🚨 DETEKSI OPSI JAWABAN (BIAR BISA DIKLIK)
            else if (text.match(/^[a-e][\.\)]\s/i) && tag === 'P') {
                closeActiveBlock();
                closeAlgo();
                const answerLetter = text.match(/^[a-e]/i)[0].toUpperCase();
                finalHtml += `<div class="opsi-soal-btn" data-answer="${answerLetter}" onclick="handleAnswerClick('${answerLetter}', this)">${inner}</div>`;
            } 
        // 🚨 DETEKSI BENAR/SALAH (Format: | Soal | Benar | Salah |)
            else if (text.match(/^\|.*\|.*\|.*\|$/) && lower.includes('benar') && lower.includes('salah')) {
                closeActiveBlock();
                closeAlgo();
                finalHtml += `
                    <div class="bs-container" style="margin-top: 1rem;">
                        <button class="bs-btn" data-answer="A" onclick="handleAnswerClick('A', this)">✅ Benar</button>
                        <button class="bs-btn" data-answer="B" onclick="handleAnswerClick('B', this)">❌ Salah</button>
                    </div>`;
                return;
            }
        // 🚨 DETEKSI ISIAN SINGKAT ([ISIAN] atau ___)
            else if (inner.includes('[ISIAN]') || inner.includes('___')) {
                closeActiveBlock();
                closeAlgo();
                let replaced = inner.replace(/\[ISIAN\]|_{3,}/g, '<input type="text" class="kotak-isian" id="isianBedahSoal" placeholder="..." autocomplete="off">');
                finalHtml += `<p>${replaced}</p>`;
            // Tambahin tombol cek otomatis
                finalHtml += `<button class="opsi-soal-btn" style="margin-top: 0.5rem; text-align: center;" onclick="handleIsianClick(this)">Cek Jawaban</button>`;
                return;
            } 
            else {
                if (activeBlock === 'trap' || activeBlock === 'fyi') {
                    blockHtml += rawEl;
                    return;
                }
                if (inAlgo && text.length > 0) {
                     algoHtml += `<div class="step-content" style="margin-left: 3rem; margin-bottom: 1rem;"><p>${inner}</p></div>`;
                     return;
                }
                closeActiveBlock();
                closeAlgo();
                // 🚨 DISTRIBUSI TEKS BIASA 
                if (inSplit) {
                    if (currentSection === 'algo') splitAlgo += rawEl;
                    else splitCore += rawEl;
                } else {
                    finalHtml += rawEl;
                }
            }
        });
        
        // FINALIZE TUTUP SEMUA WADAH
        closeActiveBlock();
        closeAlgo();
        renderPeta(); 
        closePembahasan();
        closeSplit(); // 🚨 Akan otomatis men-trigger flushTable() dan meletakkan di bawah bila tersisa tabel > 3 kolom

        if (isSoalCardOpen) finalHtml += '</div>';

        // Konversi baris pertama tabel jadi Headings
        finalHtml = finalHtml.replace(/<tbody>\s*<tr>(.*?)<\/tr>/gi, (match, firstRow) => {
            return `<thead><tr>${firstRow.replace(/<td/g, '<th').replace(/<\/td>/g, '</th>')}</tr></thead><tbody>`;
        });

        return finalHtml;
    }

    // 🚨 FUNGSI HANDLE KLIK JAWABAN (HANYA 1, TIDAK ADA DUPLIKAT)
    window.handleAnswerClick = function(selectedAnswer, clickedElement) {
        if (hasAnswered) return;
        hasAnswered = true;
        const correctAnswer = currentCorrectAnswer;
        if (!correctAnswer) {
            console.warn('Kunci jawaban tidak ditemukan.');
            hasAnswered = false;
            return;
        }
        
        // Kalau tipe B/S
        if (clickedElement.classList.contains('bs-btn')) {
            document.querySelectorAll('.bs-btn').forEach(btn => {
                btn.style.pointerEvents = 'none';
                if (btn.getAttribute('data-answer') === correctAnswer) btn.classList.add('correct');
                else if (btn.getAttribute('data-answer') === selectedAnswer) btn.classList.add('wrong');
            });
        } else {
            // Tipe PG
            const allButtons = document.querySelectorAll('.opsi-soal-btn');
            allButtons.forEach(btn => {
                const answer = btn.getAttribute('data-answer');
                btn.style.pointerEvents = 'none';
                if (answer === correctAnswer) btn.classList.add('opsi-correct');
                else if (answer === selectedAnswer && answer !== correctAnswer) btn.classList.add('opsi-wrong');
                else btn.style.opacity = '0.5';
            });
        }

        const soalCard = document.querySelector('.scyra-soal-card');
        if (soalCard) {
            const feedbackDiv = document.createElement('div');
            const isCorrect = selectedAnswer === correctAnswer;
            feedbackDiv.className = `feedback-soal ${isCorrect ? 'feedback-correct' : 'feedback-wrong'}`;
            feedbackDiv.innerHTML = isCorrect 
                ? '<span class="feedback-icon">✅</span><strong>Benar Sekali!</strong>' 
                : `<span class="feedback-icon">❌</span><strong>Kurang Tepat.</strong> Jawaban yang benar adalah <strong>${correctAnswer === 'A' ? 'Benar' : 'Salah'}</strong>.`;
            soalCard.appendChild(feedbackDiv);
        }
    };

// Fungsi khusus buat Isian Singkat di Bedah Soal
    window.handleIsianClick = function(btn) {
        if (hasAnswered) return;
        const input = document.getElementById('isianBedahSoal');
        if (!input) return;
        const userAns = input.value.trim().toLowerCase();
        const keyAns = (currentCorrectAnswer || '').trim().toLowerCase();
        
        hasAnswered = true;
        btn.style.display = 'none';
        input.classList.add(userAns === keyAns ? 'correct' : 'wrong');
        
        const soalCard = document.querySelector('.scyra-soal-card');
        if (soalCard) {
            const feedbackDiv = document.createElement('div');
            feedbackDiv.className = `feedback-soal ${userAns === keyAns ? 'feedback-correct' : 'feedback-wrong'}`;
            feedbackDiv.innerHTML = userAns === keyAns 
                ? '<span class="feedback-icon">✅</span><strong>Benar Sekali!</strong>' 
                : `<span class="feedback-icon">❌</span><strong>Kurang Tepat.</strong> Jawaban yang benar adalah <strong>${currentCorrectAnswer}</strong>.`;
            soalCard.appendChild(feedbackDiv);
        }
    };

    // =======================================================
    // 🚨 FUNGSI RENDER MATERI & IFRAME SIMULASI 
    // =======================================================
    const loadDetail = async () => {
        if (!window.db) return setTimeout(loadDetail, 100);
        const loadingEl = document.getElementById('detailLoading');
        const contentEl = document.getElementById('detailContent');
        const errorEl = document.getElementById('detailError');
        const { data: { user } } = await window.db.auth.getUser();
        if (!user) {
            await showScyraAlert('Kamu harus login terlebih dahulu.', '⛔ Akses Ditolak', '🔒');
            window.location.href = 'login.html';
            return;
        }
        const urlParams = new URLSearchParams(window.location.search);
        const materiId = urlParams.get('id');
        if (!materiId) {
            loadingEl.style.display = 'none';
            errorEl.style.display = 'block';
            return;
        }
        const { data: materi, error } = await window.db
            .from('materi')
            .select('*, kategori(nama_mapel)')
            .eq('id', materiId)
            .eq('status', 'publik')
            .single();
             // 🚨 SATPAM RBAC: CEK AKSES BAB
        const isUserFree = (window.userRole === 'user' || !window.userRole);
        const babNum = materi.nomor_bab || 1;
     
        if (isUserFree && babNum > 1) {
            loadingEl.style.display = 'none';
            const contentEl = document.getElementById('detailContent');
            contentEl.innerHTML = `
                <div style="text-align: center; padding: 4rem 2rem; background: var(--bg-secondary); border-radius: 16px; border: 2px dashed var(--border-color);">
                    <div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div>
                    <h2 style="color: var(--text-primary); margin-bottom: 0.5rem;">Konten Premium</h2>
                    <p style="color: var(--text-secondary); margin-bottom: 2rem;">Bab ini hanya bisa diakses oleh member <strong>Silver</strong> atau <strong>Gold</strong>.</p>
                    <button class="btn-baca" style="padding: 0.8rem 2rem; font-size: 1.1rem;" onclick="window.location.href='paketbelajar.html'">🚀 Upgrade Sekarang</button>
                    <button class="btn-outline" style="margin-left: 1rem; padding: 0.8rem 2rem; font-size: 1.1rem;" onclick="window.location.href='materi.html'">← Kembali</button>
                </div>
            `;
            contentEl.style.display = 'block';
            return; // Hentikan eksekusi render materi
        }
        if (error || !materi) {
            loadingEl.style.display = 'none';
            errorEl.style.display = 'block';
            return;
        }
        const katName = materi.kategori ? materi.kategori.nama_mapel : 'Umum';
        const tgl = new Date(materi.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
        document.getElementById('detailKategori').textContent = katName;
        document.getElementById('detailJudul').textContent = materi.judul;
        document.getElementById('detailTanggal').textContent = `📅 Dipublikasikan pada ${tgl}`;
        
        // Eksekusi Magic Engine
        document.getElementById('detailBody').innerHTML = applyScyraMagic(materi.konten_html);
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';
        
        // PROSES FETCH GEOGEBRA ASLI
        const simLinks = document.querySelectorAll('a[href*="geogebra.org/m/"]');
        simLinks.forEach(link => {
            const linkAsli = link.href;
            const container = document.createElement('div');
            container.className = 'simulasi-container';
            container.innerHTML = `
                <div class="simulasi-header">
                    <span>📐 Simulasi Interaktif</span>
                    <a href="${linkAsli}" target="_blank" style="color: white; text-decoration: none; font-size: 0.9rem;">Buka Penuh ↗</a>
                </div>
                <div class="sim-loading" style="padding: 2rem; text-align: center;">
                    <div class="spinner-sage" style="margin: 0 auto 1rem auto;"></div>
                    <p style="color: var(--text-secondary);">Memuat simulasi...</p>
                </div>
                <iframe style="width: 100%; height: 450px; border: none; display: none;"></iframe>`;
            link.parentNode.replaceChild(container, link);
            const iframe = container.querySelector('iframe');
            const loading = container.querySelector('.sim-loading');
            fetch(linkAsli)
            .then(res => res.text()) 
            .then(htmlText => {
                const blob = new Blob([htmlText], { type: 'text/html' });
                iframe.src = URL.createObjectURL(blob);
                iframe.onload = () => { loading.style.display = 'none'; iframe.style.display = 'block'; };
            })
            .catch(error => {
                loading.innerHTML = `❌ Gagal memuat simulasi. <br> <a href="${linkAsli}" target="_blank" style="color: var(--error);">Buka langsung</a>`;
            });
        });
        
        // PROSES FETCH SIMULASI DARI SHORTCODE SUPABASE
        const simContainers = document.querySelectorAll('.scyra-sim-container[data-simurl]');
        simContainers.forEach(container => {
            const simUrl = container.getAttribute('data-simurl');
            const iframe = container.querySelector('iframe');
            const loading = container.querySelector('.sim-loading');
            fetch(simUrl)
            .then(res => {
                if (!res.ok) throw new Error('Gagal memuat dari Supabase');
                return res.text(); 
            })
            .then(htmlText => {
                const blob = new Blob([htmlText], { type: 'text/html' });
                iframe.src = URL.createObjectURL(blob);
                iframe.onload = () => { loading.style.display = 'none'; iframe.style.display = 'block'; };
            })
            .catch(error => {
                loading.innerHTML = `❌ Gagal memuat simulasi. <br> <a href="${simUrl}" target="_blank" style="color: var(--error);">Buka link asli</a>`;
            });
        });
        
        // ================= STATUS LATIHAN =================
        const btnDrill = document.getElementById('btnGoToDrill');
        const historyKey = `latihan_history_${user.id}_${materi.id}`; 
        const isDone = localStorage.getItem(historyKey);
        if (isDone) {
            btnDrill.innerHTML = '👁️ Lihat Hasil Latihan';
            btnDrill.classList.add('selesai');
        }
        btnDrill.onclick = () => { window.location.href = `latihan-soal.html?materi=${materi.id}`; };
    };
    loadDetail();
});
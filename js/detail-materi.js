document.addEventListener('DOMContentLoaded', async () => {
    // 🚨 STATE GLOBAL UNTUK KUIS INTERAKTIF (DIPINDAHKAN KE SINI AGAR BISA DIAKSES SEMUA FUNGSI)
    let currentCorrectAnswer = null;
    let hasAnswered = false;
    
    // Credit icon HTML helper
    const CREDIT_ICON = `<img src="images/credit_icon.webp" alt="Credit" style="width: 24px; height: 24px; vertical-align: middle;">`;

    // =======================================================
    // SINGLE-FLOW MATERIAL RENDERER
    // Semua elemen PDF (teks, tabel, gambar, simulasi) dirender vertikal
    // dalam urutan aslinya tanpa pembagian kolom kiri/kanan.
    // =======================================================
    function renderSingleFlow(rawHtml) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawHtml || '', 'text/html');
        let result = '';
        let tableRows = [];

        const flushTable = () => {
            if (!tableRows.length) return;
            const rows = tableRows
                .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
                .join('');
            result += `<div class="scyra-table-wrapper"><table class="scyra-table"><tbody>${rows}</tbody></table></div>`;
            tableRows = [];
        };

        const renderShortcodes = (html) => {
            let output = html;
            output = output.replace(/\[GAMBAR:\s*(.*?)\]/gi, (_, url) =>
                `<img src="${url.trim()}" class="scyra-image" alt="Gambar materi">`
            );
            output = output.replace(/\[SIMULASI:\s*(.*?)\]/gi, (_, url) => {
                const simUrl = url.trim();
                return `<div class="simulasi-container scyra-sim-container" data-simurl="${simUrl}">
                    <div class="simulasi-header"><span>🎮 Simulasi Interaktif</span><a href="${simUrl}" target="_blank" rel="noopener" style="color:white;text-decoration:none;font-size:0.9rem;">Buka Link Asli ↗</a></div>
                    <div class="sim-loading" style="padding:2rem;text-align:center;"><div class="spinner-sage" style="margin:0 auto 1rem;"></div><p style="color:var(--text-secondary);">Memuat simulasi...</p></div>
                    <iframe style="width:100%;height:500px;border:none;background:#fff;display:none;"></iframe>
                </div>`;
            });
            return output;
        };

        Array.from(doc.body.children).forEach((element) => {
            const tag = element.tagName;
            const text = element.textContent.trim();
            const html = element.innerHTML.trim();
            if (!text && !html) return;

            const isPipeRow = text.includes('|') && /^\|?.*\|.*\|?$/.test(text);
            const isCsvRow = text.includes('","') && text.includes('"');
            if (isPipeRow || isCsvRow) {
                const cells = isCsvRow
                    ? text.split('","').map((cell) => cell.replace(/"/g, '').trim())
                    : text.split('|').map((cell) => cell.trim()).filter(Boolean);
                if (cells.length > 1) {
                    tableRows.push(cells);
                    return;
                }
            }

            flushTable();
            const lower = text.toLowerCase();
            const rendered = renderShortcodes(html);

            if (lower.startsWith('pembahasan')) {
                const content = rendered.replace(/^pembahasan[^:]*:?\s*/i, '');
                result += `<details class="scyra-pembahasan"><summary>💡 Pembahasan</summary><div class="pembahasan-isi">${content || '<p>Pembahasan tersedia.</p>'}</div></details>`;
            } else if (lower.includes('trap alert') || lower.includes('jebakan maut')) {
                result += `<div class="scyra-trap"><strong>🚨 TRAP ALERT</strong>${rendered}</div>`;
            } else if (lower.includes('fyi:') || lower.includes('for your information')) {
                result += `<div class="scyra-fyi"><strong>ℹ️ FYI</strong>${rendered}</div>`;
            } else if (tag.match(/^H[1-6]$/)) {
                result += `<${tag.toLowerCase()}>${rendered}</${tag.toLowerCase()}>`;
            } else if (tag === 'UL' || tag === 'OL') {
                result += `<${tag.toLowerCase()}>${rendered}</${tag.toLowerCase()}>`;
            } else {
                result += `<${tag.toLowerCase()}>${rendered}</${tag.toLowerCase()}>`;
            }
        });

        flushTable();
        return result.replace(/<tbody>\s*<tr>(.*?)<\/tr>/gi, (_, firstRow) =>
            `<thead><tr>${firstRow.replace(/<td/g, '<th').replace(/<\/td>/g, '</th>')}</tr></thead><tbody>`
        );
    }

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
        const { data: { user }, error: authError } = await window.db.auth.getUser();
        if (authError || !user) {
            await showScyraAlert('Kamu harus login terlebih dahulu.', '⛔ Akses Ditolak', '🔒');
            window.location.href = 'login.html';
            return;
        }
        
        // Fetch user role safely (fallback to direct DB query if window.userRole not set yet)
        let userRole = window.userRole;
        if (!userRole) {
            const { data: profile } = await window.db.from('profiles').select('role').eq('id', user.id).single();
            userRole = profile?.role || 'user';
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
        
        if (error || !materi) {
            loadingEl.style.display = 'none';
            errorEl.style.display = 'block';
            return;
        }
        
        // 🚨 SATPAM RBAC: CEK AKSES BAB DENGAN CREDIT SYSTEM
        const isUserFree = (userRole === 'user' || !userRole);
        // 🚨 Silver, Gold, dan Admin = auto-unlock semua materi tanpa credit
        const isPremium = userRole === 'gold' || userRole === 'admin' || userRole === 'silver';
        const babNum = materi.nomor_bab || 1;
        const kategoriId = materi.kategori_id;
        
        // Cek apakah user perlu credit system dan sudah unlock subtest ini
        let isSubtestUnlocked = false;
        let needsCredit = false;
        
        if (window.CreditSystem && !isPremium) {
            needsCredit = await window.CreditSystem.needsCreditSystem();
            if (needsCredit && kategoriId) {
                isSubtestUnlocked = await window.CreditSystem.isContentUnlocked('subtest', kategoriId);
                // DEBUG
                console.log(`🔍 DEBUG Detail-Materi:`, {
                    kategoriId,
                    isSubtestUnlocked,
                    needsCredit,
                    userRole,
                    babNum,
                    dbPaymentReady: !!window.dbPayment,
                    dbReady: !!window.db
                });
            }
        }
        
        // BAB 1 selalu free, atau user Premium (Silver/Gold/Admin), atau sudah unlock subtest
        const canAccess = babNum === 1 || isPremium || isSubtestUnlocked;
        
        if (isUserFree && !canAccess) {
            loadingEl.style.display = 'none';
            const contentEl = document.getElementById('detailContent');
            
            // Jika perlu credit, tampilkan opsi unlock
            if (needsCredit) {
                const creditCost = 20; // Cost per subtest
                contentEl.innerHTML = `
                    <div style="text-align: center; padding: 4rem 2rem; background: var(--bg-secondary); border-radius: 16px; border: 2px dashed var(--border-color);">
                        <div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div>
                        <h2 style="color: var(--text-primary); margin-bottom: 0.5rem;">Subtest Terkunci</h2>
                        <p style="color: var(--text-secondary); margin-bottom: 1rem;">Bab ini adalah bagian dari subtest yang perlu di-unlock.</p>
                        <p style="color: var(--text-secondary); margin-bottom: 2rem;">Unlock seluruh subtest dengan <strong>${creditCost} ${CREDIT_ICON} credit</strong> untuk akses semua bab!</p>
                        <button class="btn-baca" style="padding: 0.8rem 2rem; font-size: 1.1rem; background: var(--brand-primary);" onclick="unlockSubtestFromDetail('${kategoriId}', ${creditCost})">🔓 Unlock Subtest (${creditCost} ${CREDIT_ICON})</button>
                        <button class="btn-outline" style="margin-left: 1rem; padding: 0.8rem 2rem; font-size: 1.1rem;" onclick="window.location.href='materi.html'">← Kembali</button>
                    </div>
                `;
            } else {
                contentEl.innerHTML = `
                    <div style="text-align: center; padding: 4rem 2rem; background: var(--bg-secondary); border-radius: 16px; border: 2px dashed var(--border-color);">
                        <div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div>
                        <h2 style="color: var(--text-primary); margin-bottom: 0.5rem;">Konten Premium</h2>
                        <p style="color: var(--text-secondary); margin-bottom: 2rem;">Bab ini hanya bisa diakses oleh member <strong>Silver</strong> atau <strong>Gold</strong>.</p>
                        <button class="btn-baca" style="padding: 0.8rem 2rem; font-size: 1.1rem;" onclick="window.location.href='paketbelajar.html'">🚀 Upgrade Sekarang</button>
                        <button class="btn-outline" style="margin-left: 1rem; padding: 0.8rem 2rem; font-size: 1.1rem;" onclick="window.location.href='materi.html'">← Kembali</button>
                    </div>
                `;
            }
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
        
        // ================= PROGRESS + STATUS LATIHAN =================
        if (window.ProgressSystem && user?.id) {
            try {
                const prog = await window.ProgressSystem.getMateriProgress(user.id, materi.id);
                if (!prog) {
                    await window.ProgressSystem.markMateriRead(user.id, materi.id, materi.kategori_id);
                }
                setupReadingProgress(user.id, materi.id, materi.kategori_id, prog?.ui_state?.scroll || 0);
            } catch (_) {}
        }

        const btnDrill = document.getElementById('btnGoToDrill');
        let isDone = false;
        if (window.ProgressSystem && user?.id) {
            const prog = await window.ProgressSystem.getMateriProgress(user.id, materi.id);
            isDone = prog && prog.status === 'completed';
        }
        if (!isDone) {
            const historyKey = `latihan_history_${user.id}_${materi.id}`;
            isDone = !!localStorage.getItem(historyKey);
        }
        if (isDone) {
            btnDrill.innerHTML = '👁️ Lihat Hasil Latihan';
            btnDrill.classList.add('selesai');
        }
        btnDrill.onclick = () => { window.location.href = `latihan-soal.html?materi=${materi.id}`; };
    };

    function setupReadingProgress(userId, materiId, kategoriId, initialScroll) {
        const scrollContainer = document.querySelector('.dashboard-body');
        const article = document.getElementById('detailContent');
        if (!scrollContainer || !article || !window.ProgressSystem) return;

        // Autoscroll jika ada history dan user baru saja mendarat di halaman (bukan merefresh paksa)
        if (initialScroll > 0 && !window.location.hash.includes('noscroll')) {
            setTimeout(() => {
                scrollContainer.scrollTo({
                    top: initialScroll,
                    behavior: 'smooth'
                });
            }, 600); // Tunggu sampai DOM & gambar selesai di-render
        }

        let lastSavedPercent = -1;
        let saveTimer = null;

        const calculatePercent = () => {
            const contentTop = article.offsetTop;
            const contentHeight = article.offsetHeight;
            const visibleBottom = scrollContainer.scrollTop + scrollContainer.clientHeight;
            if (contentHeight <= 0) return 0;
            return Math.max(0, Math.min(100, Math.round(((visibleBottom - contentTop) / contentHeight) * 100)));
        };

        const saveProgress = () => {
            const percent = calculatePercent();
            const scrollPos = Math.round(scrollContainer.scrollTop);
            if (percent <= lastSavedPercent && saveTimer !== 'force') return;
            lastSavedPercent = percent;
            window.ProgressSystem.saveReadingProgress(userId, materiId, kategoriId, percent, scrollPos).catch(() => {});
        };

        const onScroll = () => {
            if (saveTimer && saveTimer !== 'force') clearTimeout(saveTimer);
            saveTimer = setTimeout(saveProgress, 500);
        };

        scrollContainer.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('beforeunload', () => {
            saveTimer = 'force';
            saveProgress();
        }, { once: true });
    }

    // 🔓 FUNGSI UNLOCK SUBTEST DARI DETAIL-MATERI (GLOBAL)
    window.unlockSubtestFromDetail = async (subtestId, creditCost) => {
        if (!window.CreditSystem) {
            alert('❌ Credit system tidak tersedia');
            return;
        }
        
        try {
            // Get available credits
            const availableCredits = await window.CreditSystem.getAvailableCredits();
            
            // Confirm unlock
            if (typeof showScyraConfirm === 'function') {
                const confirmed = await showScyraConfirm(
                    `Unlock seluruh subtest dengan ${creditCost} ${CREDIT_ICON} credit?<br><br>Semua bab dalam subtest ini akan terbuka!<br><br>Credit tersedia: <strong>${availableCredits} ${CREDIT_ICON}</strong>`,
                    '🔓 Unlock Subtest',
                    '🔓'
                );
                
                if (!confirmed) return;
            } else {
                const confirmed = confirm(`Unlock subtest dengan ${creditCost} credit?\n\nSemua bab dalam subtest ini akan terbuka!\n\nCredit tersedia: ${availableCredits}`);
                if (!confirmed) return;
            }
            
            // Check sufficient credits
            if (availableCredits < creditCost) {
                if (typeof showScyraAlert === 'function') {
                    await showScyraAlert(
                        `Credit tidak cukup! Kamu perlu ${creditCost} ${CREDIT_ICON} credit tetapi hanya punya ${availableCredits} ${CREDIT_ICON}.<br><br>Beli credit atau ajak teman dengan kode referral untuk mendapat credit gratis!`,
                        '❌ Credit Tidak Cukup',
                        CREDIT_ICON
                    );
                } else {
                    alert(`Credit tidak cukup! Perlu ${creditCost} credit, tersedia ${availableCredits} credit.\n\nBeli credit atau gunakan referral code untuk mendapat credit gratis!`);
                }
                window.location.href = 'paketbelajar.html';
                return;
            }
            
            // Unlock subtest (content_type = 'subtest', content_id = kategori_id)
            const result = await window.CreditSystem.unlockContent('subtest', subtestId, creditCost);
            
            if (result.success) {
                // Show success message
                if (typeof showScyraAlert === 'function') {
                    await showScyraAlert(
                        `Berhasil unlock subtest!<br><br>Semua bab sekarang terbuka.<br><br>Credit tersisa: <strong>${availableCredits - creditCost} ${CREDIT_ICON}</strong>`,
                        '✅ Unlock Berhasil',
                        '✅'
                    );
                } else {
                    alert(`✅ Berhasil unlock subtest!\n\nSemua bab sekarang terbuka.\n\nCredit tersisa: ${availableCredits - creditCost}`);
                }
                
                // Update credit display di topbar
                await window.CreditSystem.updateTopbarCredit();
                
                // Reload halaman untuk tampilkan konten yang sudah di-unlock
                window.location.reload();
            }
        } catch (error) {
            console.error('Error unlocking subtest:', error);
            if (typeof showScyraAlert === 'function') {
                await showScyraAlert(
                    error.message || 'Terjadi kesalahan saat unlock subtest',
                    '❌ Unlock Gagal',
                    '❌'
                );
            } else {
                alert('❌ ' + (error.message || 'Gagal unlock subtest'));
            }
        }
    };

    loadDetail();
});

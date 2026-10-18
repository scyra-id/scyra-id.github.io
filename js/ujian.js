let questions = [];
let currentIndex = 0;
let userAnswers = {}; 
let timerInterval;

// Default penampung parameter URL
let timeLeft = 0; 
let targetLimit = 20;
let currentKategori = '';
let currentKategoriId = '';
let namaMapel = '';
let waktuTotalAwal = 0;
let paketTryoutId = null;
let paketTryout = null;
let examMode = 'regular';
let isIrtAttempt = false;
let isIrtLiveAttempt = false;

let violationCount = 0;
const MAX_VIOLATIONS = 3;
let isExamActive = true; 
let lastViolationTime = 0;
const VIOLATION_COOLDOWN = 2000;

// =======================================================
// FUNGSI KONVERSI SHORTCODE GAMBAR
// =======================================================
/**
 * Render pipe tables to HTML
 */
function renderPipeTables(html) {
    if (!html) return html;
    
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
    
    // Process each line
    const lines = html.split('\n');
    
    for (let line of lines) {
        line = line.trim();
        if (!line) {
            result += '\n';
            continue;
        }
        
        // Check if line is pipe table format
        const isPipeRow = line.includes('|') && /^\|?.*\|.*\|?$/.test(line);
        
        if (isPipeRow) {
            const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean);
            if (cells.length > 1) {
                tableRows.push(cells);
                continue;
            }
        }
        
        // Not a table row, flush any pending table
        flushTable();
        result += line + '\n';
    }
    
    // Flush any remaining table
    flushTable();
    
    // Convert first row to header
    result = result.replace(/<tbody>\s*<tr>(.*?)<\/tr>/i, (_, firstRow) =>
        `<thead><tr>${firstRow.replace(/<td/g, '<th').replace(/<\/td>/g, '</th>')}</tr></thead><tbody>`
    );
    
    return result;
}

/**
 * Render shortcodes (gambar)
 */
function renderShortcodes(html) {
    if (!html) return html;
    
    // First render pipe tables
    let output = renderPipeTables(html);
    
    // Then convert [GAMBAR: url] atau [GAMBAR: url | SIZE: 50%] menjadi <img>
    output = output.replace(/\[GAMBAR:\s*(.*?)(?:\s*\|\s*SIZE:\s*(.*?))?\]/gi, (match, url, size) => {
        const cleanUrl = url.trim();
        const width = size ? size.trim() : '100%';
        return `<img src="${cleanUrl}" class="scyra-image" alt="Gambar Soal" style="max-width: ${width}; height: auto; border-radius: 8px; margin: 1rem 0; display: block; cursor: pointer;">`;
    });
    
    return output;
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.db) return setTimeout(() => location.reload(), 100);

    const { data: { user } } = await window.db.auth.getUser();
    if (!user) {
        await showScyraAlert('Sesi habis. Silakan login ulang.', '⛔ Akses Ditolak', '🔒');
        return window.location.href = 'login.html';
    }

    // 1. Ekstrak Parameter URL (kat, limit, time, paket)
    const urlParams = new URLSearchParams(window.location.search);
    currentKategori = urlParams.get('kat');
    targetLimit = parseInt(urlParams.get('limit')) || 20; // Default 20 soal
    waktuTotalAwal = parseInt(urlParams.get('time')) || 15; // Default 15 menit
    paketTryoutId = urlParams.get('paket');
    examMode = urlParams.get('mode') || 'regular';
    timeLeft = waktuTotalAwal * 60; // Konversi ke detik

    if (!currentKategori) {
        await showScyraAlert('Parameter ujian tidak valid! Anda akan dikembalikan.', '⚠️ Kesalahan', '🛑');
        return window.location.href = 'tryout.html';
    }

    if (paketTryoutId) {
        const { data: paket, error: paketError } = await window.db
            .from('paket_tryout')
            .select('id, nama_paket, is_irt_enabled, irt_window_start, irt_window_end, irt_status')
            .eq('id', paketTryoutId)
            .single();

        if (paketError || !paket) {
            await showScyraAlert('Paket tryout tidak ditemukan.', '⚠️ Kesalahan', '🛑');
            return window.location.href = 'tryout.html';
        }

        paketTryout = paket;
        isIrtAttempt = Boolean(paket.is_irt_enabled);
        if (isIrtAttempt && (!paket.irt_window_start || !paket.irt_window_end)) {
            await showScyraAlert('Konfigurasi window IRT paket belum lengkap.', '⚠️ Kesalahan', '🛑');
            return window.location.href = `detail-tryout.html?id=${paketTryoutId}`;
        }
        const now = new Date();
        isIrtLiveAttempt = isIrtAttempt && now >= new Date(paket.irt_window_start) && now <= new Date(paket.irt_window_end);

        if (isIrtAttempt && examMode === 'live' && !isIrtLiveAttempt) {
            await showScyraAlert('Periode tryout ini sudah tidak aktif.', '🔒 Terkunci', '⚠️');
            return window.location.href = `detail-tryout.html?id=${paketTryoutId}`;
        }

        if (isIrtAttempt && !isIrtLiveAttempt) {
            const { data: profile } = await window.db.from('profiles').select('role').eq('id', user.id).single();
            if (!['gold', 'admin'].includes(profile?.role)) {
                await showScyraAlert('Akses ulang tryout tersedia untuk pengguna premium.', '🔒 Akses Premium', '⚠️');
                return window.location.href = `detail-tryout.html?id=${paketTryoutId}`;
            }
        }
    }

    // 2. RESOLVE KATEGORI KE UUID
    // Parameter `kat` bisa: UUID, slug, atau kode singkat (PU/PK/...)
    try {
        const kategoriResolved = await resolveKategori(currentKategori);
        if (!kategoriResolved) {
            await showScyraAlert('Subtes UTBK tidak ditemukan di database.', '⚠️ Kesalahan', '🛑');
            return window.location.href = 'tryout.html';
        }
        currentKategoriId = kategoriResolved.id;
        namaMapel = kategoriResolved.nama_mapel;
    } catch (err) {
        console.error(err);
        await showScyraAlert('Gagal memuat data subtes: ' + err.message, '⚠️ Error', '🛑');
        return window.location.href = 'tryout.html';
    }

    // Pasang Label UI
    document.getElementById('examTitle').textContent = 'Tryout SNBT';
    document.getElementById('examMapel').textContent = namaMapel;

    // Mulai Fetch Soal
    await loadGlobalQuestions(user);
    
    // 3. Pasang Event Listener Tombol Navigasi
    document.getElementById('btnPrev').onclick = () => { 
        if(currentIndex > 0) { currentIndex--; renderQuestion(); } 
    };
    document.getElementById('btnNext').onclick = () => { 
        if(currentIndex < questions.length - 1) { currentIndex++; renderQuestion(); } 
    };
    document.getElementById('btnFinish').onclick = () => finishExam(false);
});

// Fungsi untuk resolve kategori dari kode/slug/UUID ke objek kategori lengkap
async function resolveKategori(kat) {
    // A. Jika UUID langsung
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(kat)) {
        const { data, error } = await window.db.from('kategori').select('*').eq('id', kat).single();
        if (error) throw error;
        return data;
    }

    // B. Mapping kode singkat UTBK -> nama_mapel
    const mapelNames = {
        'PU': 'Penalaran Umum',
        'PK': 'Pengetahuan Kuantitatif',
        'PBM': 'Pemahaman Bacaan dan Menulis',
        'PPU': 'Pengetahuan dan Pemahaman Umum',
        'LBI': 'Literasi dalam Bahasa Indonesia',
        'LBE': 'Literasi dalam Bahasa Inggris',
        'PM': 'Penalaran Matematika'
    };
    const namaMapel = mapelNames[kat.toUpperCase()];

    if (namaMapel) {
        const { data, error } = await window.db.from('kategori').select('*').eq('nama_mapel', namaMapel).single();
        if (error) throw error;
        return data;
    }

    // C. Fallback: anggap slug
    const { data, error } = await window.db.from('kategori').select('*').eq('slug', kat).single();
    if (error) throw error;
    return data;
}

// FUNGSI FETCH SOAL GLOBAL BERDASARKAN KATEGORI
async function loadGlobalQuestions(user) {
    try {
        let selectedPoolIds = [];
        if (paketTryoutId) {
            const { data: subtes, error: subtesError } = await window.db
                .from('subtes_tryout')
                .select('soal_pool_ids')
                .eq('paket_id', paketTryoutId)
                .eq('kategori_db', currentKategori)
                .maybeSingle();
            if (subtesError) throw subtesError;
            selectedPoolIds = subtes?.soal_pool_ids || [];
        }

        // A configured pool is authoritative. Existing packages without one
        // continue to draw randomly from their category as before.
        let questionQuery = window.db.from('bank_soal').select('*').eq('kategori_id', currentKategoriId);
        if (selectedPoolIds.length) questionQuery = questionQuery.in('id', selectedPoolIds);
        const { data, error } = await questionQuery;
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            await showScyraAlert(`Bank soal untuk subtes ${namaMapel} masih kosong!`, '⚠️ Kosong', '⚠️');
            return window.location.href = 'tryout.html';
        }

        if (selectedPoolIds.length && data.length < targetLimit) {
            throw new Error(`Pool soal subtes hanya berisi ${data.length} soal, sedangkan paket membutuhkan ${targetLimit} soal.`);
        }

        // Acak keseluruhan soal, lalu potong sesuai LIMIT yang ditentukan parameter
        questions = data.sort(() => Math.random() - 0.5).slice(0, targetLimit);
        
        // Tampilkan UI
        document.getElementById('examLoading').style.display = 'none';
        document.getElementById('examContainer').style.display = 'flex';
        document.getElementById('totalNum').textContent = questions.length;

        renderNavigator();
        renderQuestion();
        startTimer();
        initSecurityProtocols(user);
    } catch (err) {
        console.error(err);
        await showScyraAlert('Gagal menyusun soal: ' + err.message, '⚠️ Error Server', '🛑');
        window.location.href = 'tryout.html';
    }
}

function renderNavigator() {
    const grid = document.getElementById('navigatorGrid');
    grid.innerHTML = '';
    questions.forEach((q, i) => {
        const btn = document.createElement('button');
        btn.className = 'nav-btn';
        btn.textContent = i + 1;
        btn.onclick = () => goToQuestion(i);
        grid.appendChild(btn);
    });
    updateNavigatorState();
}

function updateNavigatorState() {
    const btns = document.querySelectorAll('.nav-btn');
    btns.forEach((btn, i) => {
        btn.classList.remove('current', 'answered');
        if (i === currentIndex) btn.classList.add('current');
        else {
            const q = questions[i];
            const answer = userAnswers[q.id];
            const statementCount = q.tipe_soal === 'bs'
                ? ['a', 'b', 'c', 'd', 'e'].filter(opt => q[`opsi_${opt}_html`]).length
                : 0;
            const isAnswered = q.tipe_soal === 'bs'
                ? answer && Object.keys(answer).length === statementCount
                : Boolean(answer);
            if (isAnswered) btn.classList.add('answered');
        }
    });
}

function renderQuestion() {
    // Scroll to top when changing question
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    const q = questions[currentIndex];
    document.getElementById('currentNum').textContent = currentIndex + 1;
    document.getElementById('questionText').innerHTML = renderShortcodes(q.pertanyaan_html);
    const optsList = document.getElementById('optionsList');
    optsList.innerHTML = '';
    const tipe = q.tipe_soal || 'pg';

    if (tipe === 'bs') {
        const statements = ['A', 'B', 'C', 'D', 'E']
            .map(opt => ({ key: opt, text: q[`opsi_${opt.toLowerCase()}_html`] }))
            .filter(item => item.text);
        const answers = userAnswers[q.id] || {};
        optsList.innerHTML = `
            <table class="tabel-soal bs-table">
                <thead><tr><th>Pernyataan</th><th>Benar</th><th>Salah</th></tr></thead>
                <tbody>${statements.map(item => `<tr><td>${renderShortcodes(item.text)}</td><td><button type="button" class="bs-btn ${answers[item.key] === 'B' ? 'selected' : ''}" onclick="selectOptionBS('${q.id}', '${item.key}', 'B')">Benar</button></td><td><button type="button" class="bs-btn ${answers[item.key] === 'S' ? 'selected' : ''}" onclick="selectOptionBS('${q.id}', '${item.key}', 'S')">Salah</button></td></tr>`).join('')}</tbody>
            </table>`;
    } else if (tipe === 'isian') {
        const inputHtml = `<input type="text" class="kotak-isian" id="isianInputUjian" placeholder="..." autocomplete="off" value="${userAnswers[q.id] || ''}">`;
        document.getElementById('questionText').innerHTML = document.getElementById('questionText').innerHTML.replace(/<span class="kotak-isian"><\/span>/g, inputHtml);
        optsList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem; text-align: center;">Ketik jawabanmu di kotak yang tersedia.</p>`;
        document.getElementById('isianInputUjian').oninput = function() { userAnswers[q.id] = this.value.trim().toLowerCase(); updateNavigatorState(); };
    } else {
        ['A', 'B', 'C', 'D', 'E'].forEach(opt => {
            const optHtml = q[`opsi_${opt.toLowerCase()}_html`];
            if (optHtml) {
                const btn = document.createElement('button');
                btn.className = 'opt-btn';
                if (userAnswers[q.id] === opt) btn.classList.add('selected');
                btn.innerHTML = `<span class="opt-letter">${opt}</span> <span>${renderShortcodes(optHtml)}</span>`;
                btn.onclick = () => selectOption(q.id, opt);
                optsList.appendChild(btn);
            }
        });
    }
    const questionCard = document.querySelector('.question-card');
    if (questionCard && typeof renderMathInElement !== 'undefined') {
        renderMathInElement(questionCard, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true }
            ],
            throwOnError: false
        });
    }
    document.getElementById('btnPrev').style.display = currentIndex === 0 ? 'none' : 'block';
    document.getElementById('btnNext').style.display = currentIndex === questions.length - 1 ? 'none' : 'block';
    document.getElementById('btnFinish').style.display = currentIndex === questions.length - 1 ? 'block' : 'none';
    updateNavigatorState();
}

window.selectOptionBS = function(qId, statement, value) {
    userAnswers[qId] = { ...(userAnswers[qId] || {}), [statement]: value };
    renderQuestion();
};

function selectOption(qId, opt) {
    userAnswers[qId] = opt;
    renderQuestion(); 
}

function goToQuestion(i) {
    currentIndex = i;
    renderQuestion();
}

function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        if (timeLeft <= 0) finishExam(false);
    }, 1000);
}

function updateTimerDisplay() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    document.getElementById('timerDisplay').textContent = `${m}:${s}`;
    if (timeLeft < 60) document.getElementById('examTimer').style.color = 'var(--error)';
}

async function finishExam(isDisqualified = false) {
    clearInterval(timerInterval);
    isExamActive = false; 
    
    if (!isDisqualified) {
        const isConfirmed = await showScyraConfirm(
            "Apakah Anda yakin ingin mengumpulkan jawaban?\nAnda tidak dapat mengubah jawaban setelah dikumpulkan.",
            "Kumpulkan Jawaban?", "🏁"
        );
        
        if (!isConfirmed) {
            isExamActive = true; 
            startTimer(); 
            return;
        }
    }

    const btn = document.getElementById('btnFinish');
    if(btn) { btn.disabled = true; btn.textContent = '⏳ Menghitung skor...'; }

    let correct = 0;
    const detail = [];

    questions.forEach(q => {
        const ans = userAnswers[q.id] || null;
        const tipe = q.tipe_soal || 'pg';
        let isCorrect = false;
        
        if (tipe === 'isian') {
            const userAns = (ans || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
            const keyAns = (q.kunci_jawaban || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
            isCorrect = userAns === keyAns && userAns !== '';
        } else if (tipe === 'bs') {
            const statements = ['A', 'B', 'C', 'D', 'E'].filter(opt => q[`opsi_${opt.toLowerCase()}_html`]);
            const keys = (q.kunci_jawaban || '').split(',').map(key => key.trim().toUpperCase());
            isCorrect = statements.length > 0 && statements.every((statement, index) => ans?.[statement] === keys[index]);
        } else {
            isCorrect = ans === q.kunci_jawaban;
        }
        if (isCorrect) correct++;
        detail.push({ soal_id: q.id, jawaban: tipe === 'bs' ? (ans || null) : ans, is_correct: isCorrect });
    });

    const skor = isDisqualified ? 0 : Math.round((correct / questions.length) * 100);
    const waktuPengerjaan = (waktuTotalAwal * 60) - timeLeft;

    try {
        const { data: { user } } = await window.db.auth.getUser();
        const priorAttempts = paketTryoutId
            ? await window.db.from('hasil_tryout').select('id', { count: 'exact', head: true })
                .eq('user_id', user.id).eq('paket_tryout_id', paketTryoutId).eq('kategori_id', currentKategoriId)
            : { count: 0, error: null };

        if (priorAttempts.error) throw priorAttempts.error;
        if (isIrtLiveAttempt && priorAttempts.count > 0) {
            throw new Error('Subtes IRT ini sudah pernah Anda kerjakan selama periode berlangsung.');
        }

        const isPendingIrtScore = isIrtLiveAttempt && !isDisqualified;
        const replayIrtScore = isIrtAttempt && !isIrtLiveAttempt && !isDisqualified
            ? calculateReplayIrtScore(detail)
            : null;
        
        // Simpan hasil
        const { data: insertedData, error: insertError } = await window.db.from('hasil_tryout').insert({
            user_id: user.id,
            nama_paket: isDisqualified ? 'DIDISKUALIFIKASI' : (paketTryout?.nama_paket || `Tryout SNBT - ${namaMapel}`),
            paket_tryout_id: paketTryoutId,
            kategori_id: currentKategoriId,
            total_soal: questions.length,
            jumlah_benar: isDisqualified ? 0 : correct,
            skor: skor,
            waktu_detik: waktuPengerjaan,
            detail_jawaban: detail,
            is_irt_live: isIrtLiveAttempt,
            attempt_number: (priorAttempts.count || 0) + 1,
            irt_theta: replayIrtScore?.theta ?? null,
            irt_score: replayIrtScore?.score ?? null,
            score_status: isPendingIrtScore ? 'PENDING' : 'FINAL'
        }).select('id').single(); 

        if (insertError) throw insertError;

        if (isIrtLiveAttempt) {
            const responseRows = detail.map(item => ({
                paket_tryout_id: paketTryoutId,
                user_id: user.id,
                soal_id: item.soal_id,
                jawaban: item.jawaban === null ? null : JSON.stringify(item.jawaban),
                is_correct: item.is_correct
            }));
            const { error: responseError } = await window.db.from('irt_item_responses').insert(responseRows);
            if (responseError) throw responseError;
        }

        if (window.ProgressSystem && user?.id) {
            try {
                await window.ProgressSystem.logActivity(user.id, 'tryout_complete', insertedData?.id, {
                    skor,
                    total_soal: questions.length,
                    jumlah_benar: isDisqualified ? 0 : correct,
                    kategori_id: currentKategoriId,
                });
            } catch (_) {}
        }

        // 🎮 TRIGGER TRYOUT SUBMISSION XP (+100 XP First-Time)
        if (window.ScyraGamificationEngine && insertedData?.id) {
            try {
                const tryoutLabel = isDisqualified ? 'Tryout SNBT' : `Tryout SNBT - ${namaMapel}`;
                await window.ScyraGamificationEngine.triggerTryoutSubmission(insertedData.id, tryoutLabel, false, user.id);
            } catch (err) {
                console.warn('Tryout XP trigger warning:', err);
            }
        }

        if (isDisqualified) {
            await showScyraAlert("Anda didiskualifikasi.\nSkor Anda: 0", "🚫 Ujian Berakhir", "🚫");
            window.location.href = 'tryout.html';
        } else if (isPendingIrtScore) {
            const releaseDate = new Date(paketTryout.irt_window_end).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
            await showScyraAlert(
                `Jawabanmu sudah dikumpulkan. Nilai tryout akan tersedia setelah proses kalibrasi, paling cepat setelah ${releaseDate}.`,
                '🏁 Subtes Selesai!', '⏳'
            );
            window.location.href = `detail-tryout.html?id=${paketTryoutId}`;
        } else {
            const scoreText = replayIrtScore ? `Nilai IRT: ${replayIrtScore.score}\n` : `Skor Anda: ${skor}\n`;
            await showScyraAlert(
                `${scoreText}Benar: ${correct} dari ${questions.length}\nWaktu: ${Math.floor(waktuPengerjaan/60)}m ${waktuPengerjaan%60}s`,
                "🏁 Subtes Selesai!", "🏆"
            );
            // Kembali ke detail tryout untuk lanjut subtes berikutnya
            window.history.back(); 
        }
    } catch (err) {
        console.error("Error Finish Exam:", err);
        await showScyraAlert('Gagal menyimpan hasil: ' + err.message, "⚠️ Error", "⚠️");
        if(btn) { btn.disabled = false; btn.textContent = '🏁 Selesai & Kumpulkan'; }
        isExamActive = true;
        startTimer();
    }
}

function calculateReplayIrtScore(detail) {
    if (!window.ScyraIRTEngine) return null;
    const itemParameters = {};
    questions.forEach(question => {
        const byPaket = question.irt_parameters?.pakets?.[paketTryoutId];
        const fallback = question.irt_parameters?.global || { b: 0, a: 1, c: 0.2 };
        itemParameters[question.id] = byPaket || fallback;
    });
    const theta = window.ScyraIRTEngine.estimateTheta(detail, itemParameters);
    return { theta, score: window.ScyraIRTEngine.thetaToUTBKScore(theta) };
}

// ==========================================
// 🛡️ SISTEM KEAMANAN (ANTI CHEAT)
// ==========================================
function initSecurityProtocols(user) {
    const requestFS = () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
    };
    document.body.addEventListener('click', requestFS, { once: true }); 

    document.addEventListener('contextmenu', e => { if(isExamActive) e.preventDefault(); });
    document.addEventListener('copy', e => { if(isExamActive) e.preventDefault(); });
    
    document.addEventListener('keydown', (e) => {
        if (!isExamActive) return;
        if (e.keyCode === 123 || (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) || (e.ctrlKey && e.keyCode === 85)) { 
            e.preventDefault(); handleViolation("Inspect Element dilarang!"); return false; 
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (!isExamActive) return;
        if (document.hidden) {
            document.body.classList.add('window-blurred'); 
            handleViolation("Meninggalkan tab / Minimize dilarang!");
        } else {
            document.body.classList.remove('window-blurred'); 
        }
    });

    window.addEventListener('blur', () => {
        if (!isExamActive) return;
        document.body.classList.add('window-blurred'); 
        handleViolation("Jendela ujian kehilangan fokus!");
    });

    window.addEventListener('focus', () => {
        document.body.classList.remove('window-blurred'); 
    });

    document.addEventListener('keyup', (e) => {
        if (!isExamActive) return;
        if (e.key === 'PrintScreen' || e.keyCode === 44) {
            document.body.style.filter = 'blur(50px) brightness(0)';
            handleViolation("Screenshot/Screen Record terdeteksi!");
            setTimeout(() => { document.body.style.filter = ''; }, 2000);
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (!isExamActive) return;
        if (!document.fullscreenElement) {
            handleViolation("Keluar dari layar penuh (Fullscreen)!");
            setTimeout(() => document.documentElement.requestFullscreen().catch(()=>{}), 500);
        }
    });

    const btnCloseViolation = document.getElementById('btnCloseViolation');
    if (btnCloseViolation) {
        btnCloseViolation.onclick = () => {
            document.getElementById('violationModal').style.display = 'none';
        };
    }
}

function handleViolation(reason) {
    if (!isExamActive) return; 
    const now = Date.now();
    if (now - lastViolationTime < VIOLATION_COOLDOWN) return;
    lastViolationTime = now; 
    
    violationCount++;
    if (violationCount >= MAX_VIOLATIONS) {
        showScyraAlert(`Anda didiskualifikasi!`, "🚫 DISKUALIFIKASI", "🚫").then(() => finishExam(true));
        return;
    }

    const modal = document.getElementById('violationModal');
    if (modal) {
        document.getElementById('violationText').innerHTML = `
            <strong>PELANGGARAN ${violationCount} / ${MAX_VIOLATIONS}</strong><br><br>
            ${reason}<br><br>
            <strong>Peringatan! Pelanggaran ke-${MAX_VIOLATIONS} akan menyebabkan Diskualifikasi Otomatis.</strong>
        `;
        modal.style.display = 'flex';
    }
}

// 🚀 TEXT ZOOM ENGINE
function initZoom() {
    const savedZoom = parseFloat(localStorage.getItem('scyra_text_zoom')) || 1;
    applyZoom(savedZoom);
}
window.adjustZoom = function(step) {
    const container = document.querySelector('.question-card');
    if (!container) return;
    let current = parseFloat(getComputedStyle(container).getPropertyValue('--zoom-level')) || 1;
    let newZoom = Math.max(0.8, Math.min(1.5, current + step));
    applyZoom(newZoom);
};
function applyZoom(level) {
    const container = document.querySelector('.question-card');
    if (container) container.style.setProperty('--zoom-level', level);
    localStorage.setItem('scyra_text_zoom', level);
}
initZoom();

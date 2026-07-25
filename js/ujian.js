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

let violationCount = 0;
const MAX_VIOLATIONS = 3;
let isExamActive = true; 
let lastViolationTime = 0;
const VIOLATION_COOLDOWN = 2000;

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
    timeLeft = waktuTotalAwal * 60; // Konversi ke detik

    if (!currentKategori) {
        await showScyraAlert('Parameter ujian tidak valid! Anda akan dikembalikan.', '⚠️ Kesalahan', '🛑');
        return window.location.href = 'tryout.html';
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
        // Ambil soal dari kategori UUID yang sudah diresolve
        const { data, error } = await window.db.from('bank_soal')
            .select('*')
            .eq('kategori_id', currentKategoriId);
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            await showScyraAlert(`Bank soal untuk subtes ${namaMapel} masih kosong!`, '⚠️ Kosong', '⚠️');
            return window.location.href = 'tryout.html';
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
        else if (userAnswers[questions[i].id]) btn.classList.add('answered');
    });
}

function renderQuestion() {
    const q = questions[currentIndex];
    document.getElementById('currentNum').textContent = currentIndex + 1;
    document.getElementById('questionText').innerHTML = q.pertanyaan_html;
    const optsList = document.getElementById('optionsList');
    optsList.innerHTML = '';
    const tipe = q.tipe_soal || 'pg';

    if (tipe === 'bs') {
        optsList.innerHTML = `
            <div class="bs-container">
                <button class="bs-btn ${userAnswers[q.id] === 'A' ? 'selected' : ''}" data-value="A" onclick="selectOptionBS('${q.id}', 'A')">✅ Benar</button>
                <button class="bs-btn ${userAnswers[q.id] === 'B' ? 'selected' : ''}" data-value="B" onclick="selectOptionBS('${q.id}', 'B')">❌ Salah</button>
            </div>`;
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
                btn.innerHTML = `<span class="opt-letter">${opt}</span> <span>${optHtml}</span>`;
                btn.onclick = () => selectOption(q.id, opt);
                optsList.appendChild(btn);
            }
        });
    }
    document.getElementById('btnPrev').style.display = currentIndex === 0 ? 'none' : 'block';
    document.getElementById('btnNext').style.display = currentIndex === questions.length - 1 ? 'none' : 'block';
    document.getElementById('btnFinish').style.display = currentIndex === questions.length - 1 ? 'block' : 'none';
    updateNavigatorState();
}

window.selectOptionBS = function(qId, opt) {
    userAnswers[qId] = opt;
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
        } else {
            isCorrect = ans === q.kunci_jawaban;
        }
        if (isCorrect) correct++;
        detail.push({ soal_id: q.id, jawaban: ans, is_correct: isCorrect });
    });

    const skor = isDisqualified ? 0 : Math.round((correct / questions.length) * 100);
    const waktuPengerjaan = (waktuTotalAwal * 60) - timeLeft;

    try {
        const { data: { user } } = await window.db.auth.getUser();
        
        // Simpan hasil
        const { data: insertedData, error: insertError } = await window.db.from('hasil_tryout').insert({
            user_id: user.id,
            nama_paket: isDisqualified ? 'DIDISKUALIFIKASI' : `Tryout SNBT - ${namaMapel}`,
            kategori_id: currentKategoriId,
            total_soal: questions.length,
            jumlah_benar: isDisqualified ? 0 : correct,
            skor: skor,
            waktu_detik: waktuPengerjaan,
            detail_jawaban: detail
        }).select('id').single(); 

        if (insertError) throw insertError;

        if (isDisqualified) {
            await showScyraAlert("Anda didiskualifikasi.\nSkor Anda: 0", "🚫 Ujian Berakhir", "🚫");
            window.location.href = 'tryout.html';
        } else {
            await showScyraAlert(
                `Skor Anda: ${skor}\nBenar: ${correct} dari ${questions.length}\nWaktu: ${Math.floor(waktuPengerjaan/60)}m ${waktuPengerjaan%60}s`,
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

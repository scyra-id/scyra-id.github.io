// ==========================================
// BANK SOAL MINI
// ==========================================
const bankSoalMini = [
    {
        mapel: "🧠 Penalaran Umum • Mini Quiz",
        pertanyaan: "Semua peserta UTBK membawa kartu ujian. Sebagian yang membawa kartu ujian juga membawa alat tulis lengkap. Kesimpulan yang paling tepat adalah...",
        opsi: { A: "Semua peserta UTBK membawa alat tulis lengkap", B: "Semua yang membawa alat tulis lengkap adalah peserta UTBK", C: "Sebagian peserta UTBK membawa alat tulis lengkap", D: "Tidak ada peserta UTBK yang membawa alat tulis lengkap", E: "Sebagian yang membawa alat tulis lengkap tidak membawa kartu ujian" },
        kunci: "C",
        pembahasan: "Tepat! Karena sebagian pembawa kartu ujian membawa alat tulis, dan semua peserta UTBK membawa kartu ujian, maka logis jika sebagian peserta UTBK membawa alat tulis lengkap."
    },
    {
        mapel: "🔢 Pengetahuan Kuantitatif • Mini Quiz",
        pertanyaan: "Jika x = 1/16 dan y = 16%, maka hubungan antara x dan y yang benar adalah...",
        opsi: { A: "x > y", B: "x < y", C: "x = y", D: "x dan y tidak bisa ditentukan hubungannya", E: "2x = y" },
        kunci: "B",
        pembahasan: "Tepat! x = 1/16 = 0.0625. Sedangkan y = 16% = 0.16. Karena 0.0625 lebih kecil dari 0.16, maka x < y."
    },
    {
        mapel: "📖 Literasi Bahasa Indonesia • Mini Quiz",
        pertanyaan: "Kata 'signifikan' dalam kalimat 'Perkembangan teknologi memberikan dampak signifikan' memiliki makna yang paling dekat dengan...",
        opsi: { A: "Kecil dan tidak berarti", B: "Penting dan berpengaruh besar", C: "Lambat dan bertahap", D: "Negatif dan merugikan", E: "Sementara dan tidak tetap" },
        kunci: "B",
        pembahasan: "Tepat! Dalam konteks kalimat tersebut, 'signifikan' bermakna sesuatu yang penting, besar, dan memberikan pengaruh yang nyata."
    }
];

// ==========================================
// LOGIKA MINI QUIZ (Dibungkus dalam fungsi)
// ==========================================
function initMiniQuiz() {
    const mapelEl = document.getElementById('mockupMapel');
    const teksEl = document.getElementById('mockupTeks');
    const opsiContainer = document.getElementById('mockupOptions');
    const feedbackEl = document.getElementById('mockupFeedback');

    if (!mapelEl || !opsiContainer) return;

    function renderRandomQuiz() {
        const soal = bankSoalMini[Math.floor(Math.random() * bankSoalMini.length)];
        mapelEl.textContent = soal.mapel;
        teksEl.textContent = soal.pertanyaan;
        feedbackEl.style.display = 'none';
        feedbackEl.className = 'mockup-feedback';
        opsiContainer.innerHTML = '';
        
        ['A', 'B', 'C', 'D', 'E'].forEach(h => {
            const div = document.createElement('div');
            div.className = 'option';
            div.textContent = `${h}. ${soal.opsi[h]}`;
            div.dataset.correct = (h === soal.kunci).toString();
            div.dataset.explanation = soal.pembahasan;
            opsiContainer.appendChild(div);
        });
    }

    renderRandomQuiz();

    opsiContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('option') && !e.target.classList.contains('disabled')) {
            const isCorrect = e.target.dataset.correct === 'true';
            const explanation = e.target.dataset.explanation;
            const allOptions = document.querySelectorAll('#mockupOptions .option');
            
            allOptions.forEach(opt => opt.classList.add('disabled'));
            
            if (isCorrect) {
                e.target.classList.add('correct');
                feedbackEl.className = 'mockup-feedback correct-fb';
                feedbackEl.innerHTML = `<strong>✅ Jawaban Tepat!</strong><br>${explanation}`;
            } else {
                e.target.classList.add('wrong');
                document.querySelector('#mockupOptions .option[data-correct="true"]').classList.add('correct');
                feedbackEl.className = 'mockup-feedback wrong-fb';
                feedbackEl.innerHTML = `<strong>❌ Kurang Tepat.</strong><br>${explanation}`;
            }
            feedbackEl.style.display = 'block';
            setTimeout(renderRandomQuiz, 6000);
        }
    });
}

// ==========================================
// 🚀 SMART ROUTER (PENGATUR LALU LINTAS)
// ==========================================
async function checkAuthAndRoute() {
    const loadingScreen = document.getElementById('auth-loading');
    
    // Tunggu koneksi Supabase siap
    if (!window.db) {
        setTimeout(checkAuthAndRoute, 100); 
        return;
    }

    // Cek Session (Lebih akurat untuk auto-login)
    const { data: { session } } = await window.db.auth.getSession();

    if (session) {
        // 👑 KONDISI 1: USER SUDAH LOGIN
        // Langsung teleportasi ke Dashboard tanpa memuat Landing Page
        window.location.href = 'dashboard.html';
    } else {
        // 👤 KONDISI 2: USER BELUM LOGIN (TAMU)
        // Buka tirai loading dan tampilkan Landing Page + Mini Quiz
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
            setTimeout(() => loadingScreen.remove(), 500); // Hapus dari memori
        }
        initMiniQuiz();
        if (typeof initMascotGreeting === 'function') initMascotGreeting();
    }
}

// ==========================================
// 🚀 HANDLER TOMBOL "MULAI BELAJAR"
// ==========================================
function handleMulaiBelajar(event) {
    event.preventDefault();

    // Cek apakah survey aktif
    window.db.from('survey_settings')
        .select('setting_value')
        .eq('setting_key', 'survey_active')
        .single()
        .then(({ data }) => {
            const surveyActive = data && data.setting_value === true;
            
            if (surveyActive) {
                // Cek apakah user sudah isi survey
                const hasSurveyDone = localStorage.getItem('scyra_survey_done');
                if (!hasSurveyDone) {
                    // Belum isi survey → arahkan ke survey
                    window.location.href = 'survey.html';
                    return;
                }
            }
            
            // Survey nonaktif ATAU sudah isi survey → fungsi normal
            const hasRegisteredBefore = localStorage.getItem('scyra_has_registered');
            const supabaseAuthToken = localStorage.getItem('sb-qqouccbtjywanmgktdty-auth-token');
            let hasSupabaseData = false;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('sb-') && key.includes('auth')) {
                    hasSupabaseData = true;
                    break;
                }
            }
            
            if (hasRegisteredBefore || supabaseAuthToken || hasSupabaseData) {
                window.location.href = 'login.html';
            } else {
                window.location.href = 'register.html';
            }
        })
        .catch(() => {
            // Fallback: fungsi normal
            const hasRegisteredBefore = localStorage.getItem('scyra_has_registered');
            const supabaseAuthToken = localStorage.getItem('sb-qqouccbtjywanmgktdty-auth-token');
            let hasSupabaseData = false;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('sb-') && key.includes('auth')) {
                    hasSupabaseData = true;
                    break;
                }
            }
            
            if (hasRegisteredBefore || supabaseAuthToken || hasSupabaseData) {
                window.location.href = 'login.html';
            } else {
                window.location.href = 'register.html';
            }
        });
}

// ==========================================
// SIMPAN STATUS REGISTRASI SAAT USER REGISTER
// ==========================================
function setUserRegistered(email) {
    localStorage.setItem('scyra_has_registered', 'true');
    localStorage.setItem('scyra_saved_email', email);
}

// Fungsi untuk clear status (logout)
function clearUserStatus() {
    localStorage.removeItem('scyra_has_registered');
    localStorage.removeItem('scyra_saved_email');
}

// ==========================================
// EXPORT KE GLOBAL WINDOW
// ==========================================
window.handleMulaiBelajar = handleMulaiBelajar;
window.setUserRegistered = setUserRegistered;
window.clearUserStatus = clearUserStatus;

// Jalankan Smart Router segera setelah HTML dimuat
document.addEventListener('DOMContentLoaded', checkAuthAndRoute);

// Fallback: Remove auth-loading after 3 seconds if still stuck
setTimeout(() => {
    const loadingScreen = document.getElementById('auth-loading');
    if (loadingScreen && !loadingScreen.classList.contains('hidden')) {
        console.warn('Auth check timeout - removing loading screen');
        loadingScreen.classList.add('hidden');
        setTimeout(() => loadingScreen.remove(), 500);
        initMiniQuiz();
        if (typeof initMascotGreeting === 'function') initMascotGreeting();
    }
}, 3000);

// ==========================================
// 1. TEMA (Jalankan Sync agar tidak kedip)
// ==========================================
(function() {
    const savedTheme = localStorage.getItem('scyra_theme') || localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.classList.add('dark-mode');
    }
})();

// ==========================================
// 2. SCYRA MODAL INJECTOR (Global Alert/Confirm)
// ==========================================
function injectScyraModal() {
    if (document.getElementById('scyraModal')) return;
    const modalHTML = `
    <div id="scyraModal" class="scyra-modal">
        <div class="scyra-modal-box">
            <div class="scyra-modal-icon" id="modalIcon">✅</div>
            <h3 id="modalTitle">Info</h3>
            <div id="modalMessage" style="margin-bottom:1.5rem; color:var(--text-secondary); line-height:1.6; font-size:1rem;">Pesan</div>
            <div class="scyra-modal-actions">
                <button id="modalBtnCancel" class="btn-modal cancel" style="display:none;">Batal</button>
                <button id="modalBtnOk" class="btn-modal ok">Mengerti</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}
// Eksekusi injeksi modal saat web dimuat
document.addEventListener('DOMContentLoaded', injectScyraModal);

window.showScyraAlert = function(message, title = "Info", icon = "✅") {
    return new Promise((resolve) => {
        let modal = document.getElementById('scyraModal');
        
        // Paksa injeksi jika modal belum ada di HTML
        if(!modal) { 
            injectScyraModal(); 
            modal = document.getElementById('scyraModal'); 
        }

        // Fallback terakhir kalau document.body belum siap sama sekali
        if (!modal) {
            alert(message.replace(/<[^>]*>?/gm, '')); // Bersihkan tag HTML untuk alert asli
            return resolve(true);
        }
        
        // 🚨 PENTING: Gunakan innerHTML agar tag <br> dan style terbaca!
        document.getElementById('modalIcon').innerHTML = icon;
        document.getElementById('modalTitle').innerHTML = title;
        document.getElementById('modalMessage').innerHTML = message; 
        
        const btnOk = document.getElementById('modalBtnOk');
        const btnCancel = document.getElementById('modalBtnCancel');
        
        btnCancel.style.display = 'none';
        btnOk.textContent = 'Mengerti';
        
        modal.classList.add('active');
        
        btnOk.onclick = () => { 
            modal.classList.remove('active'); 
            resolve(true); 
        };
    });
};

window.showScyraConfirm = function(message, title = "Konfirmasi", icon = "❓") {
    return new Promise((resolve) => {
        let modal = document.getElementById('scyraModal');
        
        if(!modal) { 
            injectScyraModal(); 
            modal = document.getElementById('scyraModal'); 
        }

        if(!modal) {
            const ans = confirm(message.replace(/<[^>]*>?/gm, ''));
            return resolve(ans);
        }

        document.getElementById('modalIcon').innerHTML = icon;
        document.getElementById('modalTitle').innerHTML = title;
        document.getElementById('modalMessage').innerHTML = message;
        
        const btnOk = document.getElementById('modalBtnOk');
        const btnCancel = document.getElementById('modalBtnCancel');
        
        btnCancel.style.display = 'inline-block';
        btnOk.textContent = 'Ya, Lanjutkan';
        btnCancel.textContent = 'Batal';
        
        modal.classList.add('active');
        
        btnOk.onclick = () => { 
            modal.classList.remove('active'); 
            resolve(true); 
        };
        btnCancel.onclick = () => { 
            modal.classList.remove('active'); 
            resolve(false); 
        };
    });
};

// ==========================================
// 3. KOMPONEN MODULAR (Header, Sidebar, Topbar)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    
    // A. Landing Page: Fetch Header
    const headerPlaceholder = document.getElementById('header-placeholder');
    if (headerPlaceholder) {
        try {
            const resp = await fetch('components/header.html');
            headerPlaceholder.innerHTML = await resp.text();
            
            // 💡 TAMBAHKAN INI: Inisialisasi logika header
            initHeaderLogic();
            
            document.dispatchEvent(new Event('headerLoaded'));
        } catch (e) { console.error('Gagal load header:', e); }
    }

    // B. Dashboard: Fetch Sidebar
    const sidebarPlaceholder = document.getElementById('sidebar-placeholder');
    if (sidebarPlaceholder) {
        try {
            const resp = await fetch('components/sidebar.html');
            sidebarPlaceholder.innerHTML = await resp.text();
            initSidebarLogic();
            document.dispatchEvent(new Event('sidebarLoaded'));
        } catch (e) { console.error('Gagal load sidebar:', e); }
    }

    // C. Dashboard: Fetch Topbar
    const topbarPlaceholder = document.getElementById('topbar-placeholder');
    if (topbarPlaceholder) {
        try {
            const resp = await fetch('components/topbar.html');
            topbarPlaceholder.innerHTML = await resp.text();
            
            const pageTitle = document.title.split(' - ')[0] || 'Dashboard';
            const titleEl = document.getElementById('topbarTitle');
            if (titleEl) titleEl.textContent = pageTitle;

            document.dispatchEvent(new Event('topbarLoaded'));
            document.dispatchEvent(new Event('headerLoaded')); 

            // Modul notifikasi hanya dimuat pada layout yang memiliki topbar.
            // Script ini sendiri akan menyembunyikan seluruh UI bagi pengunjung.
            if (!document.getElementById('notifications-styles')) {
                const notificationStyles = document.createElement('link');
                notificationStyles.id = 'notifications-styles';
                notificationStyles.rel = 'stylesheet';
                notificationStyles.href = 'css/notifications.css';
                document.head.appendChild(notificationStyles);
            }
            if (!document.getElementById('notifications-script')) {
                const notificationScript = document.createElement('script');
                notificationScript.id = 'notifications-script';
                notificationScript.src = 'js/notifications.js';
                document.body.appendChild(notificationScript);
            }
        } catch (e) { console.error('Gagal load topbar:', e); }
    }

    // D. Footer
    const footerPlaceholder = document.getElementById('footer-placeholder');
    if (footerPlaceholder) {
        try {
            const resp = await fetch('components/footer.html');
            footerPlaceholder.innerHTML = await resp.text();
        } catch (e) { console.error('Gagal load footer:', e); }
    }
});

// ==========================================
// 4. LOGIKA SIDEBAR (Collapse Desktop)
// ==========================================
function initSidebarLogic() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggleSidebarBtn');
    
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }

    const path = window.location.pathname;
    const navDashboard = document.getElementById('nav-dashboard');
    const navMateri = document.getElementById('nav-materi');
    const navTryout = document.getElementById('nav-tryout');
    const navRiwayat = document.getElementById('nav-riwayat');
    const navPaket = document.getElementById('nav-paket');
    const navTentang = document.getElementById('nav-tentang');
    const navKontak = document.getElementById('nav-kontak');

    [navDashboard, navMateri, navTryout, navRiwayat, navPaket, navTentang, navKontak].forEach(el => { if(el) el.classList.remove('active'); });

    if(path.includes('paketbelajar')) navPaket?.classList.add('active');
    else if(path.includes('tentang')) navTentang?.classList.add('active');
    else if(path.includes('kontak')) navKontak?.classList.add('active');
    else if(path.includes('dashboard')) navDashboard?.classList.add('active');
    else if(path.includes('materi')) navMateri?.classList.add('active');
    else if(path.includes('tryout')) navTryout?.classList.add('active');
    else if(path.includes('riwayat')) navRiwayat?.classList.add('active');
    else navDashboard?.classList.add('active'); 
}

function initHeaderLogic() {
    requestAnimationFrame(() => {
        // Ambil nama file halaman saat ini (misal: "paketbelajar.html", "kontak.html", atau "")
        let currentPath = window.location.pathname.split('/').pop().toLowerCase();
        
        if (!currentPath || currentPath === '' || currentPath === '/') {
            currentPath = 'index.html';
        }

        // Ambil semua link navigasi di header desktop maupun mobile
        const headerLinks = document.querySelectorAll('.desktop-nav a, .mobile-nav a');

        headerLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (!href) return;

            // Bersihkan href dari query param / hash (#)
            const cleanHref = href.split('?')[0].split('#')[0].toLowerCase();

            // Hapus class active sebelumnya
            link.classList.remove('active');

            // Jika href cocok persis dengan nama file halaman saat ini
            if (cleanHref && cleanHref === currentPath) {
                link.classList.add('active');
            }
        });
    });
}

// Script mendeteksi scroll untuk memicu blur Topbar
document.addEventListener('DOMContentLoaded', () => {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.addEventListener('scroll', () => {
            const topbar = document.getElementById('topbar');
            if (topbar) {
                if (mainContent.scrollTop > 10) {
                    topbar.classList.add('scrolled'); 
                } else {
                    topbar.classList.remove('scrolled'); 
                }
            }
        });
    }
});

// Sensor scroll untuk Landing Page Header
window.addEventListener('scroll', () => {
    const siteHeader = document.querySelector('.site-header');
    if (siteHeader) {
        if (window.scrollY > 20) {
            siteHeader.classList.add('scrolled'); 
        } else {
            siteHeader.classList.remove('scrolled'); 
        }
    }
});

// ==========================================
// 5. LOAD CREDIT DI DROPDOWN PROFILE & SIDEBAR
// ==========================================
document.addEventListener('topbarLoaded', async () => { await loadCreditDisplay(); });
// 💡 TAMBAHAN: Jalankan juga saat sidebar selesai di-fetch
document.addEventListener('sidebarLoaded', async () => { await loadCreditDisplay(); });

async function loadCreditDisplay() {
    try {
        if (!window.db) {
            setTimeout(loadCreditDisplay, 100);
            return;
        }

        const { data: { user } } = await window.db.auth.getUser();
        if (!user) return;

        const db = window.dbPayment || window.db;
        
        if (window.syncAuthToPaymentDB && !window._authSyncedToPaymentDB) {
            await window.syncAuthToPaymentDB();
        }
        
        const { data: creditData, error } = await db
            .from('user_credits')
            .select('total_credits, bonus_credits, used_credits')
            .eq('user_id', user.id)
            .single();

        if (error) {
            console.warn('⚠️ Credit data fetch failed (non-critical):', error.message);
            return;
        }

        let totalCredit = 0;
        if (creditData) {
            totalCredit = (creditData.total_credits || 0) + (creditData.bonus_credits || 0) - (creditData.used_credits || 0);
        }

        // 💡 Update credit badge di Topbar Dropdown & Sidebar Footer
        const dropdownCreditAmount = document.getElementById('dropdownCreditAmount');
        const sidebarCreditAmount = document.getElementById('sidebarCreditAmount');
        
        if (dropdownCreditAmount) dropdownCreditAmount.textContent = totalCredit;
        if (sidebarCreditAmount) sidebarCreditAmount.textContent = totalCredit;

    } catch (err) {
        console.warn('⚠️ Credit display load failed (non-critical):', err.message);
    }
}

// Dengarkan event headerLoaded dari script manapun (termasuk paketbelajar.js & kontak.js)
document.addEventListener('headerLoaded', () => {
    if (typeof initHeaderLogic === 'function') {
        initHeaderLogic();
    }
});

// ==========================================
// 6. SCYRA FEATURE SHOWCASE MODAL (Global)
// ==========================================
const SCYRA_FEATURES = {
    'focus-mode': {
        title: 'UTBK Focus Mode',
        desc: 'Mode ujian CBT yang dirancang persis seperti layar UTBK SNBT sesungguhnya. Dilengkapi pengatur waktu presisi, navigasi soal adaptif, dan deteksi anti-ganti tab agar fokusmu tetap 100%.',
        tags: ['⏱️ Simulasi CBT Asli', '🛡️ Anti-Distraksi', '📊 Hasil Instan'],
        anim: `
            <div class="scyra-anim-focus">
                <div class="anim-focus-screen">
                    <div class="anim-focus-topbar">
                        <span class="anim-focus-dot red"></span>
                        <span class="anim-focus-dot yellow"></span>
                        <span class="anim-focus-dot green"></span>
                        <span class="anim-focus-badge">⏱️ 14:58</span>
                        <span class="anim-focus-shield">🛡️ Guard: ON</span>
                    </div>
                    <div class="anim-focus-body">
                        <div class="anim-focus-q">Soal 14: Manakah pernyataan yang paling tepat?</div>
                        <div class="anim-focus-opt">A. Premis belum mencukupi</div>
                        <div class="anim-focus-opt correct">B. Pernyataan (1) & (3) Benar <span class="check-mark">✓</span></div>
                        <div class="anim-focus-opt">C. Pernyataan (2) saja</div>
                    </div>
                    <div class="anim-focus-radar"></div>
                </div>
            </div>`
    },
    'smart-mark': {
        title: 'Smart Mark',
        desc: 'Fitur penanda cerdas yang membantumu menyorot premis, kata kunci penting, fakta kuantitatif, dan kesimpulan langsung di teks soal dengan warna stabilo interaktif.',
        tags: ['🖊️ Sorot Premis', '✨ Deteksi Kata Kunci', '⚡ Pemahaman Cepat'],
        anim: `
            <div class="scyra-anim-marker">
                <div class="anim-paper">
                    <div class="anim-text-line">Berdasarkan data riset seleksi PTN tahun sebelumnya:</div>
                    <div class="anim-text-line highlight-yellow"><span class="highlight-fill yellow"></span>Premis: Jumlah pelamar meningkat drastis</div>
                    <div class="anim-text-line">Maka daya tampung terbagi secara kompetitif:</div>
                    <div class="anim-text-line highlight-green"><span class="highlight-fill green"></span>Kesimpulan: Rasio kelulusan lebih selektif</div>
                    <div class="anim-pen-tool">🖊️</div>
                </div>
                <div class="anim-marker-tooltip">✦ Kata Kunci Terdeteksi</div>
            </div>`
    },
    'beat-timer': {
        title: 'Beat Timer',
        desc: 'Metronom waktu khusus UTBK yang memberikan penanda ritme halus saat kamu berlatih soal, melatih insting agar tidak terjebak terlalu lama pada satu nomor yang sulit.',
        tags: ['⏱️ Pacemaker UTBK', '🎯 Target 50s/Soal', '⚡ Manajemen Waktu'],
        anim: `
            <div class="scyra-anim-clock">
                <div class="anim-clock-face">
                    <div class="anim-clock-ring ring-1"></div>
                    <div class="anim-clock-ring ring-2"></div>
                    <div class="anim-clock-ring ring-3"></div>
                    <div class="anim-clock-hand"></div>
                    <div class="anim-clock-pin"></div>
                </div>
                <div class="anim-clock-badge">♩ Beat: 50 detik/soal</div>
            </div>`
    },
    'learn-flow': {
        title: 'Learn Flow',
        desc: 'Alur belajar bertahap yang membimbingmu mulai dari pemahaman konsep dasar, studi kasus visual, hingga latihan soal mandiri tanpa rasa bosan membaca modul tebal.',
        tags: ['💡 Konsep Intuitif', '🔍 Studi Kasus Visual', '🎯 Kuis Mandiri'],
        anim: `
            <div class="scyra-anim-flow">
                <div class="anim-flow-step step-1"><span class="step-icon">💡</span><span class="step-label">Konsep</span></div>
                <div class="anim-flow-line"><span class="flow-particle"></span></div>
                <div class="anim-flow-step step-2"><span class="step-icon">🔍</span><span class="step-label">Contoh</span></div>
                <div class="anim-flow-line"><span class="flow-particle"></span></div>
                <div class="anim-flow-step step-3"><span class="step-icon">🎯</span><span class="step-label">Kuis</span></div>
            </div>`
    },
    'question-vault': {
        title: 'Question Vault',
        desc: 'Brankas terlengkap dengan ribuan koleksi soal UTBK SNBT berkualitas tinggi, diklasifikasikan berdasarkan subtes, tingkat kesulitan (Easy, Medium, HOTS), dan pembahasan tuntas.',
        tags: ['📚 Ribuan Soal UTBK', '🔥 Level HOTS', '📖 Pembahasan Lengkap'],
        anim: `
            <div class="scyra-anim-vault">
                <div class="anim-vault-door">
                    <div class="anim-vault-wheel"></div>
                    <div class="anim-vault-glow"></div>
                </div>
                <div class="anim-vault-cards">
                    <div class="vcard c1">📝 Penalaran Umum</div>
                    <div class="vcard c2">🔥 Kuantitatif HOTS</div>
                    <div class="vcard c3">✨ Literasi Bahasa</div>
                </div>
            </div>`
    },
    'progress-insight': {
        title: 'Progress Insight',
        desc: 'Analisis mendalam mengenai peta perkembangan belajarmu: memantau akurasi per subtes, kecepatan pengerjaan, bab yang sudah dikuasai, serta topik yang perlu diperkuat.',
        tags: ['📈 Radar Akurasi', '🔍 Deteksi Kelemahan', '🎯 Prediksi SNBT'],
        anim: `
            <div class="scyra-anim-progress">
                <div class="anim-chart-bars">
                    <div class="anim-bar bar-1" style="--h:55%"><span>PU</span></div>
                    <div class="anim-bar bar-2" style="--h:82%"><span>PK</span></div>
                    <div class="anim-bar bar-3" style="--h:94%"><span>PPU</span></div>
                    <div class="anim-bar bar-4" style="--h:70%"><span>LIT</span></div>
                </div>
                <div class="anim-chart-badge">Akurasi +28% 📈</div>
            </div>`
    },
    'kyra-companion': {
        title: 'Kyra Companion',
        desc: 'Teman belajar virtual setiamu di Scyra! Kyra selalu hadir menyemangati, merayakan setiap peningkatan skormu, dan dapat dikustomisasi dengan aneka item kostum lucu.',
        tags: ['🦊 Maskot Interaktif', '💜 Motivator Belajar', '✨ Kustomisasi Kostum'],
        anim: `
            <div class="scyra-anim-kyra">
                <div class="anim-kyra-aura"></div>
                <img src="images/maskot-semangat.webp" alt="Kyra" class="anim-kyra-img" onerror="this.src='images/maskot.webp'">
                <div class="anim-kyra-sparkle s1">✦</div>
                <div class="anim-kyra-sparkle s2">✧</div>
                <div class="anim-kyra-sparkle s3">✦</div>
                <div class="anim-kyra-bubble">“Aku temani sampai lolos! 💜”</div>
            </div>`
    },
    'streak-quest': {
        title: 'Streak Quest',
        desc: 'Tantangan konsistensi belajar harian! Bangun kebiasaan belajar rutin setiap hari untuk melipatgandakan perolehan XP, membuka badge pencapaian, dan item langka.',
        tags: ['🔥 Konsistensi Harian', '⚡ XP Multiplier', '🏆 Koleksi Badge'],
        anim: `
            <div class="scyra-anim-streak">
                <div class="anim-flame-wrapper">
                    <div class="anim-flame flame-outer"></div>
                    <div class="anim-flame flame-mid"></div>
                    <div class="anim-flame flame-core"></div>
                    <div class="anim-ember e1">✦</div>
                    <div class="anim-ember e2">✧</div>
                    <div class="anim-ember e3">✦</div>
                </div>
                <div class="anim-streak-badge">🔥 7 Hari Belajar Rutin!</div>
            </div>`
    },
    'dual-theme': {
        title: 'Dual Theme',
        desc: 'Kenyamanan visual maksimal di segala kondisi: Mode Cream yang hangat dan elegan di siang hari, serta Mode Charcoal Night yang ramah mata untuk sesi belajar malam.',
        tags: ['☀️ Cream (Day)', '🌙 Charcoal (Night)', '🌓 Ramah Mata'],
        anim: `
            <div class="scyra-anim-theme">
                <div class="anim-theme-orb">
                    <div class="anim-theme-half day">
                        <span class="anim-theme-icon">☀️</span>
                        <span class="anim-theme-label">Cream</span>
                    </div>
                    <div class="anim-theme-half night">
                        <span class="anim-theme-icon">🌙</span>
                        <span class="anim-theme-label">Charcoal</span>
                    </div>
                </div>
                <div class="anim-theme-hint">🌓 Harmoni Siang & Malam</div>
            </div>`
    }
};

function ensureFeatureModalExists() {
    let modal = document.getElementById('featureModal');
    if (!modal) {
        const modalHTML = `
        <div id="featureModal" class="feature-modal" aria-hidden="true" onclick="if(event.target===this)closeFeatureModal()">
            <div class="feature-modal-box" role="dialog" aria-modal="true">
                <button type="button" class="feature-modal-close" onclick="closeFeatureModal()" aria-label="Tutup Modal">&times;</button>
                <div class="feature-modal-kicker">✦ FITUR UNGGULAN SCYRA</div>
                <div class="feature-animation-stage" id="featureAnimStage"></div>
                <h3 class="feature-modal-title" id="featureModalTitle">Nama Fitur</h3>
                <p class="feature-modal-desc" id="featureModalDesc">Deskripsi fitur</p>
                <div class="feature-modal-tags" id="featureModalTags"></div>
                <div class="feature-modal-actions">
                    <button type="button" class="feature-modal-btn" onclick="closeFeatureModal()">Keren, Paham! ✨</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('featureModal');
    }
    return modal;
}

window.openFeatureModal = function(key) {
    const data = SCYRA_FEATURES[key];
    if (!data) return;

    const modal = ensureFeatureModalExists();
    const titleEl = document.getElementById('featureModalTitle');
    const descEl = document.getElementById('featureModalDesc');
    const stageEl = document.getElementById('featureAnimStage');
    const tagsEl = document.getElementById('featureModalTags');

    if (titleEl) titleEl.textContent = data.title;
    if (descEl) descEl.textContent = data.desc;
    if (stageEl) stageEl.innerHTML = data.anim;
    if (tagsEl) {
        tagsEl.innerHTML = (data.tags || []).map(t => `<span>${t}</span>`).join('');
    }

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
};

window.closeFeatureModal = function() {
    const modal = document.getElementById('featureModal');
    if (modal) {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeFeatureModal();
    }
});

// =========================================================
// 💡 GLOBAL SCYRA PEMBAHASAN UI BUILDER (LATIHAN & DRILL)
// =========================================================
window.buildPembahasanUI = function({
    dataSoal,
    subtes = 'Subtes',
    subbab = 'Subbab',
    isBenar = null,
    showFeedback = true
}) {
    if (!dataSoal) return '';

    // 1. Banner Feedback (Benar / Salah)
    let feedbackBannerHTML = '';
    if (showFeedback && isBenar !== null && isBenar !== undefined) {
        feedbackBannerHTML = `
            <div class="pembahasan-feedback-banner ${isBenar ? 'correct' : 'wrong'}">
                <span class="feedback-icon">${isBenar ? '🎉' : '❌'}</span>
                <span>${isBenar ? 'TEPAT SEKALI! JAWABANMU BENAR' : 'YAAH, KURANG TEPAT!'}</span>
            </div>
        `;
    }

    // 2. Tingkat Kesulitan
    const rawKesulitan = String(dataSoal.tingkat_kesulitan || dataSoal.kesulitan || 'sedang').toLowerCase().trim();
    let diffClass = 'diff-sedang';
    let diffLabel = 'Sedang';
    if (rawKesulitan === 'mudah' || rawKesulitan === 'easy') {
        diffClass = 'diff-mudah';
        diffLabel = 'Mudah';
    } else if (rawKesulitan === 'sulit' || rawKesulitan === 'hard' || rawKesulitan === 'hots') {
        diffClass = 'diff-sulit';
        diffLabel = 'Sulit / HOTS';
    }

    // 3. Tipe Soal
    const tipeRaw = String(dataSoal.tipe_soal || dataSoal.tipe || 'pg').toLowerCase().trim();
    let tipeLabel = 'Pilihan Ganda';
    if (tipeRaw === 'pgk') tipeLabel = 'PG Kompleks';
    else if (tipeRaw === 'isian') tipeLabel = 'Isian Singkat';
    else if (tipeRaw === 'bs') tipeLabel = 'Benar / Salah';

    // 4. Kunci Jawaban
    let kunciTampil = dataSoal.kunci_jawaban || dataSoal.kunci || '-';
    if (tipeRaw === 'pgk') {
        kunciTampil = String(kunciTampil).split(',').map(k => k.trim()).join(', ');
    } else if (tipeRaw === 'bs') {
        kunciTampil = String(kunciTampil).split(',').map(k => {
            const trimmed = k.trim().toUpperCase();
            return trimmed === 'B' ? 'Benar' : trimmed === 'S' ? 'Salah' : trimmed;
        }).join(', ');
    }

    // 5. Breadcrumb (Opsi A)
    const breadcrumbHTML = `
        <div class="pembahasan-breadcrumb">
            <span class="bc-icon">📁</span>
            <span class="bc-subtes"><em>${subtes || 'Subtes'}</em></span>
            <span class="bc-sep">›</span>
            <strong class="bc-subbab"><u>${subbab || 'Subbab'}</u></strong>
        </div>
    `;

    // 6. Section Pembahasan (Opsi 2: Clean Divider Block)
    let rawPembahasan = dataSoal.pembahasan_html || dataSoal.pembahasan || '';
    let sectionsHTML = '';

    if (rawPembahasan.includes('pembahasan-section-block')) {
        sectionsHTML = rawPembahasan;
    } else {
        // Cek pola "01 / Judul"
        const sectionRegex = /(?:^|\n)(?:(\d{1,2})\s*\/\s*([^\n<]+))[\r\n]+([\s\S]*?)(?=(?:\n\d{1,2}\s*\/)|$)/g;
        const matches = [...rawPembahasan.matchAll(sectionRegex)];

        if (matches.length > 0) {
            sectionsHTML = matches.map((m, idx) => {
                const num = String(m[1] || (idx + 1)).padStart(2, '0');
                const judul = m[2].trim().toUpperCase();
                const isi = (typeof renderShortcodes === 'function' ? renderShortcodes(m[3].trim()) : m[3].trim());
                return `
                    <div class="pembahasan-section-block">
                        <div class="section-header">
                            <span class="section-num">${num} /</span>
                            <span class="section-title">${judul}</span>
                        </div>
                        <div class="section-body">${isi}</div>
                    </div>
                `;
            }).join('');
        } else {
            const isi = typeof renderShortcodes === 'function' ? renderShortcodes(rawPembahasan) : rawPembahasan;
            sectionsHTML = `
                <div class="pembahasan-section-block">
                    <div class="section-header">
                        <span class="section-num">01 /</span>
                        <span class="section-title">PEMBAHASAN LENGKAP</span>
                    </div>
                    <div class="section-body">${isi || '<p>Pembahasan belum tersedia.</p>'}</div>
                </div>
            `;
        }
    }

    return `
        <div class="scyra-pembahasan-card">
            ${feedbackBannerHTML}
            <div class="pembahasan-meta-grid">
                <div class="pembahasan-meta-card">
                    <span class="pembahasan-meta-label">⚡ TINGKAT KESULITAN</span>
                    <div class="pembahasan-meta-value">
                        <span class="diff-badge ${diffClass}">
                            <span class="diff-dot"></span>
                            ${diffLabel}
                        </span>
                    </div>
                </div>
                <div class="pembahasan-meta-card">
                    <span class="pembahasan-meta-label">📝 TIPE SOAL</span>
                    <div class="pembahasan-meta-value">${tipeLabel}</div>
                </div>
                <div class="pembahasan-meta-card">
                    <span class="pembahasan-meta-label">🔑 KUNCI JAWABAN</span>
                    <div class="pembahasan-meta-value kunci-jawaban-val">${kunciTampil}</div>
                </div>
            </div>

            ${breadcrumbHTML}
            <div class="pembahasan-divider"></div>

            <div class="pembahasan-sections">
                ${sectionsHTML}
            </div>
        </div>
    `;
};

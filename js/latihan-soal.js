document.addEventListener('DOMContentLoaded', async () => {
    let state = { currentIndex: 0, listSoal: [], jawabanHistory: [], userId: null, materiId: null, kategoriId: null };

    const urlParams = new URLSearchParams(window.location.search);
    state.materiId = urlParams.get('materi');

    if (!state.materiId) {
        // UBAH ALERT KUNO 1
        await showScyraAlert('Materi tidak ditemukan atau URL tidak valid.', '⚠️ Oops!', '🛑'); 
        window.location.href = 'materi.html'; 
        return;
    }

    const sfxBenar = document.getElementById('sfxBenar');
    const sfxSalah = document.getElementById('sfxSalah');

    const cekKoneksi = setInterval(async () => {
        if (window.db) {
            clearInterval(cekKoneksi);
            const { data: { user } } = await window.db.auth.getUser();
            if (!user) { window.location.href = 'login.html'; return; }
            
            state.userId = user.id;

            // CEK APAKAH UDAH PERNAH DIKERJAIN SEBELUMNYA?
            const historyKey = `latihan_history_${state.userId}_${state.materiId}`;
            const savedHistory = localStorage.getItem(historyKey);

            if (savedHistory) {
                // TAMPILKAN HASILNYA LANGSUNG (Memory 5 soal yang pernah dia kerjain)
                state.jawabanHistory = JSON.parse(savedHistory);
                
                // Ambil Kategori ID untuk fitur Next Bab
                const { data: info } = await window.db.from('materi').select('kategori_id').eq('id', state.materiId).single();
                if(info) state.kategoriId = info.kategori_id;
                
                renderLayarHasil();
            } else {
                // MULAI DARI AWAL
                fetchSoal();
            }
        }
    }, 100);

    async function fetchSoal() {
        try {
            const { data, error } = await window.db.from('bank_soal').select('*').eq('materi_id', state.materiId);
            
            if (error || !data || data.length === 0) {
                document.getElementById('soalText').innerHTML = '<p>🚧 Belum ada soal tersedia untuk bab ini.</p>'; 
                return;
            }
            
            state.kategoriId = data[0].kategori_id;
            
            // 🚨 LOGIKA BARU: ACAK SOAL DAN AMBIL MAKSIMAL 5 🚨
            const soalDiacak = data.sort(() => Math.random() - 0.5);
            state.listSoal = soalDiacak.slice(0, 5);
            
            renderSoalActive(0);
        } catch (err) { console.error(err); }
    }

    function renderSoalActive(index) {
        if (index >= state.listSoal.length) {
            localStorage.setItem(`latihan_history_${state.userId}_${state.materiId}`, JSON.stringify(state.jawabanHistory));
            renderLayarHasil();
            return;
        }
        const dataSoal = state.listSoal[index];
        document.getElementById('latihanBadge').textContent = `Soal ${index + 1} dari ${state.listSoal.length}`;
        document.getElementById('soalText').innerHTML = dataSoal.pertanyaan_html;
        const opsiContainer = document.getElementById('opsiContainer');
        const tipe = dataSoal.tipe_soal || 'pg';
    
        opsiContainer.innerHTML = '';
        if (tipe === 'bs') {
            opsiContainer.innerHTML = `
                <div class="bs-container">
                    <button class="bs-btn" data-value="A" onclick="selectBSLatihan(this)">✅ Benar</button>
                    <button class="bs-btn" data-value="B" onclick="selectBSLatihan(this)">❌ Salah</button>
                </div>`;
        } else if (tipe === 'isian') {
            const inputHtml = `<input type="text" class="kotak-isian" id="isianInputLatihan" placeholder="..." autocomplete="off">`;
            document.getElementById('soalText').innerHTML = document.getElementById('soalText').innerHTML.replace(/<span class="kotak-isian"><\/span>/g, inputHtml);
            opsiContainer.innerHTML = `<button id="btnCekIsian" class="btn-lanjut-bab" style="margin-top:1rem; background: var(--brand-primary); color:white;">Cek Jawaban</button>`;
        } else {
            const opsiList = ['A', 'B', 'C', 'D', 'E'];
            let htmlOpsi = '';
            opsiList.forEach(opt => {
                const val = dataSoal[`opsi_${opt.toLowerCase()}_html`];
                if(val) {
                    htmlOpsi += `
                    <div class="opsi-item-box" data-value="${opt}">
                        <div class="huruf-opsi">${opt}.</div>
                        <div style="flex:1;">${val}</div>
                        <div class="icon-status"></div>
                    </div>`;
                }
            });
            opsiContainer.innerHTML = htmlOpsi;
        }

        const boxBahas = document.getElementById('instanPembahasan');
        boxBahas.style.display = 'none';
        const btnLanjut = document.getElementById('btnLanjutSoal');
        btnLanjut.style.display = 'none';
        btnLanjut.onclick = () => renderSoalActive(state.currentIndex + 1);

        let sudahJawab = false;
        const processAnswer = (jawabanUser) => {
            if (sudahJawab) return;
            sudahJawab = true;
            const kunciAsli = dataSoal.kunci_jawaban;
            let isBenar = false;
        
            if (tipe === 'isian') {
                const userAns = (jawabanUser || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
                const keyAns = (kunciAsli || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
                isBenar = userAns === keyAns && userAns !== '';
                const input = document.getElementById('isianInputLatihan');
                if (input) input.classList.add(isBenar ? 'correct' : 'wrong');
            } else {
                isBenar = jawabanUser === kunciAsli;
            }

            if (isBenar) { sfxBenar.currentTime = 0; sfxBenar.play().catch(e=>{}); } 
            else { sfxSalah.currentTime = 0; sfxSalah.play().catch(e=>{}); }

        // Visual feedback untuk PG & BS
            if (tipe === 'pg') {
                document.querySelectorAll('.opsi-item-box').forEach(b => {
                    const val = b.getAttribute('data-value');
                    b.style.cursor = 'default';
                    if (val === kunciAsli) { b.style.borderColor = '#4caf50'; b.style.background = 'rgba(76, 175, 80, 0.15)'; b.querySelector('.icon-status').innerHTML = '✔️'; }
                    else if (val === jawabanUser && !isBenar) { b.style.borderColor = '#f44336'; b.style.background = 'rgba(244, 67, 54, 0.1)'; b.querySelector('.icon-status').innerHTML = '❌'; }
                    else { b.style.opacity = '0.4'; }
                });
            } else if (tipe === 'bs') {
                document.querySelectorAll('.bs-btn').forEach(b => {
                    const val = b.getAttribute('data-value');
                    if (val === kunciAsli) b.classList.add('correct');
                    else if (val === jawabanUser && !isBenar) b.classList.add('wrong');
                });
            }

            boxBahas.style.display = 'block';
            boxBahas.innerHTML = `
                <h4 style="margin-bottom:0.5rem; font-size:1.2rem; color:${isBenar ? '#4caf50' : '#f44336'};">${isBenar ? '🎉 TEPAT SEKALI!' : '❌ YAAH, KURANG TEPAT'}</h4>
                <div style="font-size:0.95rem; margin-bottom:1rem; font-weight:bold; color:var(--text-secondary);">Kunci Jawaban: ${kunciAsli}</div>
                <div style="line-height: 1.6;">${dataSoal.pembahasan_html || 'Pembahasan belum tersedia.'}</div>
            `;
            state.jawabanHistory.push({ soal: dataSoal, jawaban_user: jawabanUser, kunci_asli: kunciAsli });
            state.currentIndex++;
            btnLanjut.style.display = 'block';
            setTimeout(() => { btnLanjut.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
        };

        if (tipe === 'pg') {
            document.querySelectorAll('.opsi-item-box').forEach(box => {
                box.addEventListener('click', function() { processAnswer(this.getAttribute('data-value')); });
            });
        } else if (tipe === 'isian') {
            document.getElementById('btnCekIsian').onclick = () => {
                const input = document.getElementById('isianInputLatihan');
                processAnswer(input ? input.value.trim() : '');
            };
        }
    }

window.selectBSLatihan = function(btn) {
    document.querySelectorAll('.bs-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    setTimeout(() => processAnswer(btn.getAttribute('data-value')), 300); // Auto cek setelah klik
};

    // ===============================================
    // RENDER LAYAR SUMMARY & LIHAT HASIL
    // ===============================================
    function renderLayarHasil() {
        let totalBenar = 0;
        let reviewHTML = '';

        state.jawabanHistory.forEach((item, index) => {
            const isBenar = item.jawaban_user === item.kunci_asli;
            if (isBenar) totalBenar++;
            
            reviewHTML += `
                <div style="background:var(--bg-secondary); padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border: 1px solid var(--border-color);">
                    <div style="display:flex; justify-content:space-between; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
                        <strong>Soal ${index + 1}</strong>
                        <strong style="color:${isBenar ? '#4caf50' : '#f44336'}">${isBenar ? '✔️ Benar' : '❌ Salah'}</strong>
                    </div>
                    <div style="margin-bottom: 1rem;">${item.soal.pertanyaan_html}</div>
                    
                    <div style="font-size:0.95rem; background:var(--bg-primary); padding: 1rem; border-radius:8px;">
                        <span style="color:var(--text-secondary);">Jawabanmu: <strong>${item.jawaban_user}</strong></span> | 
                        <strong style="color:#4caf50;">Kunci: ${item.kunci_asli}</strong>
                        
                        <div style="margin-top: 1rem; border-top: 1px dashed var(--border-color); padding-top: 1rem;">
                            <strong style="color:var(--brand-primary);">💡 Pembahasan:</strong><br> 
                            <div style="margin-top:0.5rem;">${item.soal.pembahasan_html}</div>
                        </div>
                    </div>
                </div>
            `;
        });

        const skorTotal = Math.round((totalBenar / state.jawabanHistory.length) * 100) || 0;

        document.querySelector('.latihan-header').style.display = 'none';
        const container = document.getElementById('latihanContent');
        
        container.innerHTML = `
            <div style="text-align:center; padding: 1rem 0 2rem; border-bottom: 2px dashed var(--border-color); margin-bottom: 2rem;">
                <h2 style="color:var(--text-secondary); margin-bottom:1rem;">🎉 LATIHAN SELESAI</h2>
                <div style="font-size: 5rem; font-weight:800; color:var(--brand-primary); line-height: 1;">${skorTotal}</div>
                <p style="margin-top:1rem; font-size:1.1rem;">Kamu menjawab benar <strong>${totalBenar}</strong> dari <strong>${state.jawabanHistory.length}</strong> soal.</p>
            </div>
            
            <h3 style="margin-bottom: 1.5rem;">Review Pekerjaanmu:</h3>
            ${reviewHTML}

            <button id="btnLanjutBab" class="btn-lanjut-bab">🚀 Lanjut ke Bab Berikutnya</button>
        `;

        // LOGIKA AUTO NEXT BAB
        document.getElementById('btnLanjutBab').onclick = async () => {
            const btn = document.getElementById('btnLanjutBab');
            btn.textContent = 'Mencari bab berikutnya... ⏳';
            
            // Tarik semua bab di mapel ini berurutan
            const { data: semuaBab } = await window.db.from('materi')
                .select('id').eq('kategori_id', state.kategoriId).eq('status', 'publik').order('created_at');
            
            const indexSekarang = semuaBab.findIndex(b => b.id === state.materiId);
            
            if (indexSekarang !== -1 && indexSekarang < semuaBab.length - 1) {
                // Lempar ke detail-materi bab selanjutnya
                window.location.href = `detail-materi.html?id=${semuaBab[indexSekarang + 1].id}`;
            } else {
                // UBAH ALERT KUNO 2
                await showScyraAlert('Kamu sudah menyelesaikan materi terakhir di mata pelajaran ini.', '🎉 Luar Biasa!', '🏆');
                window.location.href = 'materi.html';
            }
        };
    }

    // 🚀 TEXT ZOOM ENGINE
    function initZoom() {
        const savedZoom = parseFloat(localStorage.getItem('scyra_text_zoom')) || 1;
        applyZoom(savedZoom);
    }
    window.adjustZoom = function(step) {
        const container = document.querySelector('.latihan-content');
        if (!container) return;
        let current = parseFloat(getComputedStyle(container).getPropertyValue('--zoom-level')) || 1;
        let newZoom = Math.max(0.8, Math.min(1.5, current + step));
        applyZoom(newZoom);
    };
    function applyZoom(level) {
        const container = document.querySelector('.latihan-content');
        if (container) container.style.setProperty('--zoom-level', level);
        localStorage.setItem('scyra_text_zoom', level);
    }
    initZoom();
});
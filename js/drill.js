document.addEventListener('DOMContentLoaded', async () => {
    // =======================================================
    // 1. SETUP KANVAS CORET-CORETAN (KEMBALI KE VERSI PRESISI)
    // =======================================================
    const canvas = document.getElementById('scratchpad');
    const ctx = canvas.getContext('2d');
    
    const btnJawab = document.getElementById('btnModeJawab');
    const btnCoret = document.getElementById('btnModeCoret');
    const btnHapus = document.getElementById('btnModeHapus');
    const btnClear = document.getElementById('btnClear');

    // RUMUS YANG UDAH BENER: Pakai skala .scrollWidth dan css px
    function resizeCanvas() {
        const scrollElement = document.querySelector('.drill-container');
        if (!scrollElement) return;
        
        requestAnimationFrame(() => {
            // Hitung tinggi total: tinggi konten + padding atas/bawah
            const totalHeight = scrollElement.scrollHeight;
            const totalWidth = scrollElement.scrollWidth;
            
            canvas.width = totalWidth;
            canvas.height = totalHeight;
            canvas.style.width = totalWidth + 'px';
            canvas.style.height = totalHeight + 'px';
        });
    }
    window.addEventListener('resize', resizeCanvas);
    setTimeout(resizeCanvas, 100);

    let isDrawing = false;
    let currentMode = 'jawab'; 

    function setMode(mode) {
        currentMode = mode;
        [btnJawab, btnCoret, btnHapus].forEach(b => { if(b) b.classList.remove('active'); });
        
        if (mode === 'jawab') {
            if(btnJawab) btnJawab.classList.add('active');
            canvas.style.pointerEvents = 'none'; 
            if(btnHapus) btnHapus.style.display = 'none';
            if(btnClear) btnClear.style.display = 'none';
        } else {
            canvas.style.pointerEvents = 'auto'; 
            canvas.style.cursor = mode === 'hapus' ? 'cell' : 'crosshair';
            if(btnHapus) btnHapus.style.display = 'inline-block';
            if(btnClear) btnClear.style.display = 'inline-block';
            
            if (mode === 'coret' && btnCoret) btnCoret.classList.add('active');
            if (mode === 'hapus' && btnHapus) btnHapus.classList.add('active');
        }
    }

    if(btnJawab) btnJawab.addEventListener('click', () => setMode('jawab'));
    if(btnCoret) btnCoret.addEventListener('click', () => setMode('coret'));
    if(btnHapus) btnHapus.addEventListener('click', () => setMode('hapus'));
    
    // 🚨 FULL NATIVE WEB CONFIRM 🚨
    if(btnClear) {
        btnClear.addEventListener('click', async () => {
            const yakin = await showScyraConfirm('Hapus semua coretan di halaman ini?', 'Bersihkan Kanvas?', '🗑️');
            if(yakin) ctx.clearRect(0, 0, canvas.width, canvas.height);
        });
    }

    // RUMUS KOORDINAT YANG UDAH BENER: Pakai ScaleX dan ScaleY
    function getCanvasCoordinates(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        let clientX = e.clientX;
        let clientY = e.clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    function startPosition(e) {
        if (currentMode === 'jawab') return;
        isDrawing = true;
        draw(e);
    }
    
    function endPosition() {
        isDrawing = false;
        ctx.beginPath(); 
    }
    
    function draw(e) {
        if (!isDrawing) return;
        if(e.cancelable) e.preventDefault(); 

        const coords = getCanvasCoordinates(e);

        ctx.lineWidth = currentMode === 'hapus' ? 30 : 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = currentMode === 'hapus' ? '#ffffff' : '#e63946'; 
        ctx.globalCompositeOperation = currentMode === 'hapus' ? 'destination-out' : 'source-over';

        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(coords.x, coords.y);
    }

    canvas.addEventListener('mousedown', startPosition);
    canvas.addEventListener('mouseup', endPosition);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseleave', endPosition);
    canvas.addEventListener('touchstart', startPosition, {passive: false});
    canvas.addEventListener('touchend', endPosition);
    canvas.addEventListener('touchmove', draw, {passive: false});

    // =======================================================
    // 2. STATE APLIKASI & FETCH SOAL
    // =======================================================
    let state = {
        waktuPerSoal: 0,
        sisaWaktu: 0,
        timerInt: null,
        currentIndex: 0,
        listSoal: [],    
        jawabanHistory: [], 
        waktuMulai: null, 
        totalWaktuDetik: 0
    };

    async function fetchSoalDariDB() {
        const urlParams = new URLSearchParams(window.location.search);
        const babsParam = urlParams.get('babs');
     
     // 1. Cek apakah ada parameter bab
        if (!babsParam) {
            await showScyraAlert("Tidak ada bab materi yang dipilih!", "⚠️ Oops!", "🛑");
            window.location.href = 'materi.html'; 
            return;
        }

        const ids = babsParam.split(',');

     // 🚨 SATPAM RBAC: CEK HAK AKSES BAB (ANTI-BYPASS URL)
        try {
         // A. Ambil data bab yang diminta dari URL (Cek nomor_bab-nya)
            const { data: materiList, error: matErr } = await window.db
                .from('materi')
                .select('id, judul, nomor_bab')
                .in('id', ids);

            if (matErr || !materiList) throw new Error("Gagal memuat data bab.");

         // B. Pastikan Role User sudah terdeteksi (Fallback fetch kalau session.js telat load)
            let currentRole = window.userRole;
            if (!currentRole) {
                const { data: { user } } = await window.db.auth.getUser();
                if (user) {
                    const { data: prof } = await window.db.from('profiles').select('role').eq('id', user.id).single();
                    currentRole = prof ? prof.role : 'user';
                } else {
                    currentRole = 'guest';
                }
            }

            const isUserFree = (currentRole === 'user' || currentRole === 'guest');
         
         // C. Cek apakah ada bab premium (nomor_bab > 1) yang diminta
         // Kalau user minta campuran (Bab 1 + Bab 2), dan dia Free, tetep blokir karena ada Bab 2-nya
            const premiumBab = materiList.find(m => (m.nomor_bab || 1) > 1);

            if (isUserFree && premiumBab) {
                await showScyraAlert(
                    `Drill soal untuk <strong>${premiumBab.judul}</strong> adalah konten Premium.<br>Upgrade ke Silver/Gold untuk melatih semua bab!`, 
                    '🔒 Akses Ditolak', 
                    '🔒'
                );
                window.location.href = 'paketbelajar.html';
                return; // Stop execution, jangan fetch soal
            }
        } catch (e) {
            console.error("RBAC Check Error:", e);
        }

     // 2. Kalau lolos satpam, baru ambil soal dari bank_soal
        try {
            document.querySelector('.soal-text').innerHTML = '<p>⏳ Mengambil data soal dari server...</p>';
            const { data, error } = await window.db.from('bank_soal').select('*').in('materi_id', ids); 
         
            if (error) throw error;
            if (!data || data.length === 0) {
                document.querySelector('.soal-text').innerHTML = '<p>🚧 Belum ada soal tersedia untuk bab ini.</p>';
                return;
            }
         
            state.listSoal = data.sort(() => Math.random() - 0.5);
            setupModalDifficulty("Drill Soal"); 
        } catch (error) {
            console.error(error);
            document.querySelector('.soal-text').innerHTML = '<p>❌ Gagal terhubung ke server database.</p>';
        }
    }

    const cekKoneksi = setInterval(async () => {
        if (window.db) {
            clearInterval(cekKoneksi);
            const { data: { user } } = await window.db.auth.getUser();
            if (!user) { window.location.href = 'login.html'; return; }
            fetchSoalDariDB();
        }
    }, 100);

    // =======================================================
    // 3. SISTEM TIMER
    // =======================================================
    function setupModalDifficulty(mapel) {
        let waktuAsli = 60;
        document.getElementById('diffGrid').innerHTML = `
            <button class="diff-btn" onclick="mulaiTimer('easy', 0)">🟢 Easy (Tanpa Batas)</button>
            <button class="diff-btn" onclick="mulaiTimer('normal', ${Math.round(waktuAsli * 1.4)})">🟡 Normal</button>
            <button class="diff-btn" onclick="mulaiTimer('hard', ${waktuAsli})">🟠 Hard (Asli UTBK)</button>
            <button class="diff-btn" onclick="mulaiTimer('speedrun', ${Math.round(waktuAsli * 0.5)})">🔴 Speedrun</button>
        `;
    }

    window.mulaiTimer = (diff, detik) => {
        const modal = document.getElementById('setupModal');
        if(modal) modal.style.display = 'none';
        state.waktuPerSoal = detik;
        state.waktuMulai = new Date(); 
        renderSoal(state.currentIndex); 
    };

    function resetDanJalanTimer() {
        if(state.timerInt) clearInterval(state.timerInt);
        const timerUI = document.querySelector('.timer');
        if(!timerUI) return;
        
        if(state.waktuPerSoal === 0) {
            timerUI.textContent = "⏱️ No Limit";
            timerUI.style.color = "var(--text-secondary)";
            return;
        }
        
        state.sisaWaktu = state.waktuPerSoal;
        timerUI.style.color = "var(--error)"; 
        timerUI.textContent = `⏱️ ${state.sisaWaktu}s`; 
        
        state.timerInt = setInterval(async () => {
            state.sisaWaktu--;
            timerUI.textContent = `⏱️ ${state.sisaWaktu}s`;
            if(state.sisaWaktu <= 0) {
                clearInterval(state.timerInt);
                // 🚨 FULL NATIVE WEB ALERT 🚨
                await showScyraAlert("Waktu Habis! Lanjut ke soal berikutnya...", "⏱️ Timeout", "⏳");
                window.nextSoal(); 
            }
        }, 1000);
    }

    // =======================================================
    // 4. RENDER SOAL DINAMIS
    // =======================================================
    function renderSoal(index) {
        if (index >= state.listSoal.length) { window.akhiriDrill(true); return; }
        const dataSoal = state.listSoal[index];
        const badge = document.querySelector('.soal-header .badge');
        if(badge) badge.textContent = `Soal ${index + 1} dari ${state.listSoal.length}`;
        const teks = document.querySelector('.soal-text');
        if(teks) teks.innerHTML = dataSoal.pertanyaan_html;
    
        const opsiContainer = document.querySelector('.opsi-jawaban');
        if(opsiContainer) {
            opsiContainer.innerHTML = '';
            const tipe = dataSoal.tipe_soal || 'pg';
        
            if (tipe === 'bs') {
                opsiContainer.innerHTML = `
                    <div class="bs-container">
                        <button class="bs-btn" data-value="A" onclick="selectBS(this)">✅ Benar</button>
                        <button class="bs-btn" data-value="B" onclick="selectBS(this)">❌ Salah</button>
                    </div>`;
            } else if (tipe === 'isian') {
                const inputHtml = `<input type="text" class="kotak-isian" id="isianInput" placeholder="..." autocomplete="off">`;
                teks.innerHTML = teks.innerHTML.replace(/<span class="kotak-isian"><\/span>/g, inputHtml);
                opsiContainer.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem; text-align: center;">Ketik jawabanmu di kotak yang tersedia pada soal di atas.</p>`;
            } else {
                opsiContainer.innerHTML = `
                    <label class="opsi-item"><input type="radio" name="jawaban" value="A"> <span>A. ${dataSoal.opsi_a_html}</span></label>
                    <label class="opsi-item"><input type="radio" name="jawaban" value="B"> <span>B. ${dataSoal.opsi_b_html}</span></label>
                    <label class="opsi-item"><input type="radio" name="jawaban" value="C"> <span>C. ${dataSoal.opsi_c_html}</span></label>
                    <label class="opsi-item"><input type="radio" name="jawaban" value="D"> <span>D. ${dataSoal.opsi_d_html}</span></label>
                    <label class="opsi-item"><input type="radio" name="jawaban" value="E"> <span>E. ${dataSoal.opsi_e_html}</span></label>`;
            }
        }
        setTimeout(resizeCanvas, 100);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        resetDanJalanTimer();
    }

    window.selectBS = function(btn) {
        document.querySelectorAll('.bs-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    };

    window.nextSoal = () => {
        if (state.currentIndex >= state.listSoal.length) return;
        const dataSoalSekarang = state.listSoal[state.currentIndex];
        const tipe = dataSoalSekarang.tipe_soal || 'pg';
        let jawaban_user = null;

        if (tipe === 'bs') {
            const selected = document.querySelector('.bs-btn.selected');
            jawaban_user = selected ? selected.getAttribute('data-value') : null;
        } else if (tipe === 'isian') {
            const input = document.getElementById('isianInput');
            jawaban_user = input ? input.value.trim().toLowerCase() : null;
        } else {
            const selected = document.querySelector('input[name="jawaban"]:checked');
            jawaban_user = selected ? selected.value : null;
        }

        state.jawabanHistory.push({
            soal: dataSoalSekarang,
            jawaban_user: jawaban_user,
            kunci_asli: dataSoalSekarang.kunci_jawaban 
        });
        state.currentIndex++;
        renderSoal(state.currentIndex);
    };

    // =======================================================
    // 6. AKHIRI DRILL (BERSIH DARI ALERT KUNO BROWSER)
    // =======================================================
    window.akhiriDrill = async (isAuto = false) => {
        // 🚨 FULL NATIVE WEB CONFIRM 🚨
        if (isAuto !== true) {
            const isYakin = await showScyraConfirm("Kamu yakin ingin mengakhiri sesi Drill ini?", "Selesai Sekarang?", "🏁");
            if (!isYakin) return; 
        }
        
        if (state.timerInt) clearInterval(state.timerInt); 

        // Simpan soal terakhir ke memori
        const jawabanDipilih = document.querySelector('input[name="jawaban"]:checked');
        const dataSoalSekarang = state.listSoal[state.currentIndex];
        
        if (dataSoalSekarang && state.jawabanHistory.length === state.currentIndex) {
            state.jawabanHistory.push({
                soal: dataSoalSekarang,
                jawaban_user: jawabanDipilih ? jawabanDipilih.value : null,
                kunci_asli: dataSoalSekarang.kunci_jawaban 
            });
        }

        if (state.waktuMulai) {
            state.totalWaktuDetik = Math.floor((new Date() - state.waktuMulai) / 1000);
        }
        
        // Matikan UI
        if (canvas) canvas.style.display = 'none';
        
        const navElem = document.getElementById('navDrill');
        if (navElem) navElem.style.display = 'none';

        let totalBenar = 0; let totalSalah = 0; let totalKosong = 0; let reviewHTML = '';

        state.jawabanHistory.forEach((item, index) => {
            const tipe = item.soal.tipe_soal || 'pg';
    
            let isBenar = false;
            const isKosong = !item.jawaban_user; 
            let statusBadge = '';

            if (tipe === 'isian') {
                const userAns = (item.jawaban_user || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
                const keyAns = (item.kunci_asli || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
                isBenar = (userAns === keyAns) && (userAns !== ''); 
            } else {
                isBenar = item.jawaban_user === item.kunci_asli;
            }

            if (isKosong) {
                totalKosong++;
                statusBadge = '<span style="background:#e0e0e0; padding:4px 10px; border-radius:10px; font-weight:bold; font-size:0.85rem; color:#333;">⚪ Kosong</span>';
            } else if (isBenar) {
                totalBenar++;
                statusBadge = '<span style="background:rgba(76,175,80,0.15); color:#4caf50; padding:4px 10px; border-radius:10px; font-weight:bold; font-size:0.85rem;">✔️ Benar</span>';
            } else {
                totalSalah++;
                statusBadge = '<span style="background:rgba(244,67,54,0.15); color:#f44336; padding:4px 10px; border-radius:10px; font-weight:bold; font-size:0.85rem;">❌ Salah</span>';
            }

            let opsiHTML = '<div style="display: flex; flex-direction: column; gap: 0.8rem; margin: 1.5rem 0;">';
            ['A', 'B', 'C', 'D', 'E'].forEach(opt => {
                const optText = item.soal[`opsi_${opt.toLowerCase()}_html`];
                if (!optText) return; 

                let optStyle = `padding: 0.8rem 1.2rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary);`;
                let icon = '';

                if (opt === item.kunci_asli) {
                    optStyle = `padding: 0.8rem 1.2rem; border: 2px solid #4caf50; border-radius: 8px; background: rgba(76, 175, 80, 0.1); color: #4caf50; font-weight: 600;`;
                    icon = '<span style="float:right;">✔️ Kunci</span>';
                } else if (opt === item.jawaban_user) {
                    optStyle = `padding: 0.8rem 1.2rem; border: 2px solid #f44336; border-radius: 8px; background: rgba(244, 67, 54, 0.1); color: #f44336; font-weight: 600;`;
                    icon = '<span style="float:right;">❌ Jawabanmu</span>';
                }
                opsiHTML += `<div style="${optStyle}"><strong>${opt}.</strong> ${optText} ${icon}</div>`;
            });
            opsiHTML += '</div>';

            reviewHTML += `
                <div style="text-align: left; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                        <span style="font-weight: bold; color: var(--text-secondary);">Soal ${index + 1}</span>
                        ${statusBadge}
                    </div>
                    <div style="font-size: 1.1rem; margin-bottom: 1rem;">${item.soal.pertanyaan_html}</div>
                    ${opsiHTML} 
                    <div style="margin-top:1rem; border-top: 1px dashed var(--border-color); padding-top:1rem;">
                        <h4>💡 Pembahasan:</h4>
                        <div style="margin-top:0.5rem;">${item.soal.pembahasan_html || '<p>Pembahasan belum tersedia.</p>'}</div>
                    </div>
                </div>
            `;
        });

        const skorTotal = state.jawabanHistory.length > 0 ? Math.round((totalBenar / state.jawabanHistory.length) * 100) : 0;
        const rataWaktu = state.jawabanHistory.length > 0 ? Math.round(state.totalWaktuDetik / state.jawabanHistory.length) : 0;

        // 🚨 NAMA CLASS SUDAH PASTI BENAR SESUAI HTML: .soal-content 🚨
        const container = document.querySelector('.soal-content');
        
        if (!container) {
            await showScyraAlert("Error: Elemen '.soal-content' tidak ditemukan di halaman!", "⚠️ Gagal Render", "🛑");
            return;
        }

        container.style.maxWidth = "900px"; 
        container.style.margin = "0 auto";
        container.style.padding = "2rem 1rem"; 

        container.innerHTML = `
            <div class="result-wrapper">
                <div style="text-align:center; margin-bottom: 3rem;">
                    <h2 style="color:var(--text-secondary); margin-bottom:1rem;">SKOR AKHIR KAMU</h2>
                    <div style="font-size: 5rem; font-weight:800; color:var(--brand-primary); line-height: 1; margin-bottom:2rem;">${skorTotal}</div>
                    
                    <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom:1rem;">
                        <div style="background:var(--bg-secondary); padding:1rem; border-radius:8px; border:1px solid var(--border-color);"><h3>${state.jawabanHistory.length}</h3><p style="font-size:0.9rem;">Dikerjakan</p></div>
                        <div style="background:var(--bg-secondary); padding:1rem; border-radius:8px; border:1px solid #4caf50; color:#4caf50;"><h3>${totalBenar}</h3><p style="font-size:0.9rem;">Benar</p></div>
                        <div style="background:var(--bg-secondary); padding:1rem; border-radius:8px; border:1px solid #f44336; color:#f44336;"><h3>${totalSalah}</h3><p style="font-size:0.9rem;">Salah</p></div>
                        <div style="background:var(--bg-secondary); padding:1rem; border-radius:8px; border:1px solid var(--border-color);"><h3>${totalKosong}</h3><p style="font-size:0.9rem;">Kosong</p></div>
                    </div>
                    
                    <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                        <div style="background:var(--bg-secondary); padding:1rem; border-radius:8px; border:1px solid var(--border-color);"><h3>⏱️ ${Math.floor(state.totalWaktuDetik/60)}m ${state.totalWaktuDetik%60}s</h3><p style="font-size:0.9rem;">Total Waktu</p></div>
                        <div style="background:var(--bg-secondary); padding:1rem; border-radius:8px; border:1px solid var(--border-color);"><h3>⚡ ${rataWaktu}s / soal</h3><p style="font-size:0.9rem;">Kecepatan</p></div>
                    </div>
                </div>
                
                <div class="review-section">
                    <h3 style="margin-bottom: 1.5rem; border-bottom: 2px solid var(--border-color); padding-bottom: 0.5rem;">Review Jawaban & Pembahasan</h3>
                    ${state.jawabanHistory.length === 0 ? '<p style="text-align:center;">Tidak ada jawaban.</p>' : reviewHTML}
                </div>
                
                <div style="text-align: center; margin-top: 3rem;">
                    <button class="btn-outline" onclick="window.location.href='materi.html'">🔙 Kembali ke Menu Belajar</button>
                </div>
            </div>
        `;
    };

    // 🚀 TEXT ZOOM ENGINE
    function initZoom() {
        const savedZoom = parseFloat(localStorage.getItem('scyra_text_zoom')) || 1;
        applyZoom(savedZoom);
    }
    window.adjustZoom = function(step) {
        const container = document.querySelector('.soal-content');
        if (!container) return;
        let current = parseFloat(getComputedStyle(container).getPropertyValue('--zoom-level')) || 1;
        let newZoom = Math.max(0.8, Math.min(1.5, current + step)); // Batas 0.8x - 1.5x
        applyZoom(newZoom);
    };
    function applyZoom(level) {
        const container = document.querySelector('.soal-content');
        if (container) {
            container.style.setProperty('--zoom-level', level);
            localStorage.setItem('scyra_text_zoom', level);
            
            // 🚨 PENTING: Tunggu transisi font-size selesai (0.2s) + reflow layout, 
            // lalu resize canvas biar area coretan pas nutupin teks yang udah di-zoom
            setTimeout(resizeCanvas, 250);
        }
    }
    initZoom();
});
document.addEventListener('DOMContentLoaded', async () => {
    // =======================================================
    // FUNGSI KONVERSI SHORTCODE GAMBAR
    // =======================================================
    function renderShortcodes(html) {
        if (!html) return html;
        // Convert [GAMBAR: url] atau [GAMBAR: url | SIZE: 50%] menjadi <img>
        return html.replace(/\[GAMBAR:\s*(.*?)(?:\s*\|\s*SIZE:\s*(.*?))?\]/gi, (match, url, size) => {
            const cleanUrl = url.trim();
            const width = size ? size.trim() : '100%';
            return `<img src="${cleanUrl}" class="scyra-image" alt="Gambar Soal" style="max-width: ${width}; height: auto; border-radius: 8px; margin: 1rem 0; display: block; cursor: pointer;">`;
        });
    }

    const loadReview = async () => {
        if (!window.db) return setTimeout(loadReview, 100);

        const urlParams = new URLSearchParams(window.location.search);
        const hasilId = urlParams.get('id');

        if (!hasilId) {
            window.location.href = 'dashboard.html';
            return;
        }

        try {
            // 1. Ambil Data Hasil Tryout
            const { data: hasil, error: hasilError } = await window.db
                .from('hasil_tryout')
                .select('*')
                .eq('id', hasilId)
                .single();

            if (hasilError || !hasil) throw new Error("Data tryout tidak ditemukan.");

            // Proteksi: Pastikan user hanya bisa lihat review miliknya sendiri
            const { data: { user } } = await window.db.auth.getUser();
            if (hasil.user_id !== user.id) {
                alert("⛔ Anda tidak memiliki akses ke halaman ini.");
                return window.location.href = 'dashboard.html';
            }

            // 2. Render Ringkasan Skor. IRT submissions stay pending until the
            // live window is calibrated; normal tryouts keep their percentage.
            const isPendingIrt = hasil.is_irt_live && hasil.score_status === 'PENDING';
            document.getElementById('sumSkor').textContent = isPendingIrt
                ? 'Menunggu'
                : (hasil.irt_score ?? hasil.skor);
            document.getElementById('sumBenar').textContent = hasil.jumlah_benar;
            
            const salah = hasil.total_soal - hasil.jumlah_benar - (hasil.detail_jawaban.filter(d => !d.jawaban).length);
            const kosong = hasil.detail_jawaban.filter(d => !d.jawaban).length;
            
            document.getElementById('sumSalah').textContent = salah;
            document.getElementById('sumKosong').textContent = kosong;
            document.getElementById('reviewPaket').textContent = hasil.nama_paket;

            // 3. Ambil Data Soal dari Bank Soal berdasarkan ID di detail_jawaban
            const soalIds = hasil.detail_jawaban.map(d => d.soal_id);
            const { data: soals, error: soalError } = await window.db
                .from('bank_soal')
                .select('*')
                .in('id', soalIds);

            if (soalError) throw new Error("Gagal memuat bank soal.");

            // Buat Map agar mudah dicari: Map<soal_id, soal_object>
            const soalMap = new Map(soals.map(s => [s.id, s]));

            // 4. Render Daftar Soal
            const listContainer = document.getElementById('questionsList');
            listContainer.innerHTML = '';

            hasil.detail_jawaban.forEach((detail, index) => {
                const soal = soalMap.get(detail.soal_id);
                if (!soal) return;

                let statusClass = 'empty';
                let statusText = 'Tidak Dijawab';
                
                if (detail.jawaban) {
                    if (detail.is_correct) {
                        statusClass = 'correct';
                        statusText = 'Benar';
                    } else {
                        statusClass = 'wrong';
                        statusText = 'Salah';
                    }
                }

                // Generate Opsi HTML
                let optionsHtml = '';
                if (soal.tipe_soal === 'bs') {
                    const keys = (soal.kunci_jawaban || '').split(',').map(key => key.trim().toUpperCase());
                    const statements = ['A', 'B', 'C', 'D', 'E']
                        .map(opt => ({ key: opt, text: soal[`opsi_${opt.toLowerCase()}_html`] }))
                        .filter(item => item.text);
                    optionsHtml = `<table class="tabel-soal bs-table"><thead><tr><th>Pernyataan</th><th>Jawabanmu</th><th>Kunci</th></tr></thead><tbody>${statements.map((item, index) => {
                        const answer = detail.jawaban?.[item.key] || '-';
                        const key = keys[index] || '-';
                        const isCorrect = answer === key;
                        return `<tr><td>${renderShortcodes(item.text)}</td><td class="${isCorrect ? 'user-correct' : 'user-wrong'}">${answer === 'B' ? 'Benar' : answer === 'S' ? 'Salah' : '-'}</td><td>${key === 'B' ? 'Benar' : key === 'S' ? 'Salah' : '-'}</td></tr>`;
                    }).join('')}</tbody></table>`;
                } else if (soal.tipe_soal === 'isian') {
                    const userAns = detail.jawaban || '';
                    const kunciAns = soal.kunci_jawaban || '';
                    const isCorrect = detail.is_correct;
                    const hasAnswer = userAns !== '';

                    optionsHtml = `
                        <div class="isian-review">
                            <div class="isian-review-row">
                                <div class="isian-review-item ${hasAnswer ? (isCorrect ? 'isian-correct' : 'isian-wrong') : 'isian-empty'}">
                                    <span class="isian-review-label">Jawabanmu</span>
                                    <span class="isian-review-value">${hasAnswer ? userAns : '<em>Tidak dijawab</em>'}</span>
                                </div>
                                <div class="isian-review-item isian-key">
                                    <span class="isian-review-label">Kunci Jawaban</span>
                                    <span class="isian-review-value">${kunciAns}</span>
                                </div>
                            </div>
                            ${!isCorrect && hasAnswer ? `<div class="isian-review-hint">Penilaian mengabaikan huruf besar-kecil dan tanda baca.</div>` : ''}
                        </div>
                    `;
                } else if (soal.tipe_soal === 'pgk') {
                    const userArr = detail.jawaban ? detail.jawaban.split(',').map(k => k.trim().toUpperCase()) : [];
                    const keyArr = (soal.kunci_jawaban || '').split(',').map(k => k.trim().toUpperCase());
                    ['A', 'B', 'C', 'D', 'E'].forEach(opt => {
                        const optText = soal[`opsi_${opt.toLowerCase()}_html`];
                        if (!optText) return;
                        const isKey = keyArr.includes(opt);
                        const isPicked = userArr.includes(opt);
                        let optClass = '';
                        let marker = '';
                        if (isPicked && isKey) { optClass = 'user-correct'; marker = '✔️'; }
                        else if (isPicked && !isKey) { optClass = 'user-wrong'; marker = '❌'; }
                        else if (!isPicked && isKey) { optClass = 'actual-correct'; marker = '⬅ Kunci'; }
                        optionsHtml += `
                            <div class="q-opt ${optClass}">
                                <span class="opt-letter">${isPicked ? '☑' : '☐'} ${opt}.</span>
                                <span>${renderShortcodes(optText)}</span>
                                ${marker ? `<span style="margin-left:auto; font-size:0.85rem; font-weight:600; flex-shrink:0;">${marker}</span>` : ''}
                            </div>
                        `;
                    });
                } else {
                    ['A', 'B', 'C', 'D', 'E'].forEach(opt => {
                        const optText = soal[`opsi_${opt.toLowerCase()}_html`];
                        if (!optText) return;

                        let optClass = '';
                        if (detail.jawaban === opt && detail.is_correct) optClass = 'user-correct';
                        else if (detail.jawaban === opt && !detail.is_correct) optClass = 'user-wrong';
                        else if (opt === soal.kunci_jawaban && !detail.is_correct) optClass = 'actual-correct';

                        optionsHtml += `
                            <div class="q-opt ${optClass}">
                                <span class="opt-letter">${opt}.</span>
                                <span>${renderShortcodes(optText)}</span>
                            </div>
                        `;
                    });
                }

                // Gabungkan jadi Card
                listContainer.innerHTML += `
                    <div class="q-card">
                        <div class="q-header">
                            <span>Soal ${index + 1}</span>
                            <span class="q-status ${statusClass}">${statusText}</span>
                        </div>
                        <div class="q-body">
                            <div class="q-text">${renderShortcodes(soal.pertanyaan_html)}</div>
                            <div class="q-options">${optionsHtml}</div>
                            
                            <div class="q-pembahasan">
                                <h4>💡 Pembahasan</h4>
                                ${renderShortcodes(soal.pembahasan_html) || '<p>Tidak ada pembahasan untuk soal ini.</p>'}
                            </div>
                        </div>
                    </div>
                `;
            });

            if (listContainer && typeof renderMathInElement !== 'undefined') {
                renderMathInElement(listContainer, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false },
                        { left: '\\(', right: '\\)', display: false },
                        { left: '\\[', right: '\\]', display: true }
                    ],
                    throwOnError: false
                });
            }

            // Tampilkan Konten
            document.getElementById('reviewLoading').style.display = 'none';
            document.getElementById('reviewContent').style.display = 'block';

        } catch (err) {
            console.error(err);
            if(window.showScyraAlert) await window.showScyraAlert('Gagal memuat review: ' + err.message, '⚠️ Error', '⚠️');
            else alert('Error: ' + err.message);
        }
    };

    loadReview();
});

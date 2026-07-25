document.addEventListener('DOMContentLoaded', async () => {
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

            // 2. Render Ringkasan Skor
            document.getElementById('sumSkor').textContent = hasil.skor;
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
                            <span>${optText}</span>
                        </div>
                    `;
                });

                // Gabungkan jadi Card
                listContainer.innerHTML += `
                    <div class="q-card">
                        <div class="q-header">
                            <span>Soal ${index + 1}</span>
                            <span class="q-status ${statusClass}">${statusText}</span>
                        </div>
                        <div class="q-body">
                            <div class="q-text">${soal.pertanyaan_html}</div>
                            <div class="q-options">${optionsHtml}</div>
                            
                            <div class="q-pembahasan">
                                <h4>💡 Pembahasan</h4>
                                ${soal.pembahasan_html || '<p>Tidak ada pembahasan untuk soal ini.</p>'}
                            </div>
                        </div>
                    </div>
                `;
            });

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
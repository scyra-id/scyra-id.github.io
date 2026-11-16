const SUBTES_MAP = {
    'PU': { full: 'Penalaran Umum', bobot: 1 },
    'PK': { full: 'Pengetahuan Kuantitatif', bobot: 1 },
    'PBM': { full: 'Pemahaman Bacaan dan Menulis', bobot: 1 },
    'PPU': { full: 'Pengetahuan dan Pemahaman Umum', bobot: 1 },
    'LBI': { full: 'Literasi Bahasa Indonesia', bobot: 1 },
    'LBE': { full: 'Literasi Bahasa Inggris', bobot: 1 },
    'PM': { full: 'Penalaran Matematika', bobot: 1 }
};

function getKodeSubtes(namaPaket) {
    if (!namaPaket) return 'PU';
    const upper = namaPaket.toUpperCase();
    if (upper.includes('PENALARAN UMUM')) return 'PU';
    if (upper.includes('KUANTITATIF')) return 'PK';
    if (upper.includes('BACAAN') || upper.includes('PBM')) return 'PBM';
    if (upper.includes('PPU') || upper.includes('PENGETAHUAN DAN PEMAHAMAN')) return 'PPU';
    if (upper.includes('BAHASA INDONESIA') || upper.includes('LBI')) return 'LBI';
    if (upper.includes('BAHASA INGGRIS') || upper.includes('LBE')) return 'LBE';
    if (upper.includes('MATEMATIKA') || upper.includes('PM')) return 'PM';
    return 'PU';
}

function hitungSkorIRT(jumlahBenar, totalSoal) {
    // Placeholder IRT: linear dari 0-1000 berdasarkan proporsi benar
    // Nanti bisa diganti dengan perhitungan IRT yang sebenarnya
    if (!totalSoal || totalSoal === 0) return 0;
    const proporsi = Math.min(jumlahBenar / totalSoal, 1);
    return Math.round(proporsi * 1000);
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.db) return setTimeout(() => location.reload(), 100);

    const { data: { user } } = await window.db.auth.getUser();
    if (!user) {
        await showScyraAlert('Sesi habis. Silakan login ulang.', '⛔ Akses Ditolak', '🔒');
        return window.location.href = 'login.html';
    }

    const params = new URLSearchParams(window.location.search);
    const hasilId = params.get('id');
    if (!hasilId) {
        await showScyraAlert('ID tryout tidak valid.', '⚠️ Error', '🛑');
        return window.location.href = 'riwayat-snbt.html';
    }

    try {
        // Load hasil tryout + profile user
        const { data: hasil, error: hasilError } = await window.db
            .from('hasil_tryout')
            .select('*')
            .eq('id', hasilId)
            .eq('user_id', user.id)
            .single();
        if (hasilError) throw hasilError;
        if (!hasil) throw new Error('Data tryout tidak ditemukan');

        const { data: profile, error: profileError } = await window.db
            .from('profiles')
            .select('full_name, username, email')
            .eq('id', user.id)
            .single();

        if (profileError) console.error('Gagal load profile:', profileError);

        // Update header
        const date = new Date(hasil.created_at);
        const dateStr = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        document.getElementById('detailTitle').textContent = '📝 Detail Hasil Tryout SNBT';
        document.getElementById('detailSubtitle').textContent = `Dikerjakan pada ${dateStr}`;

        // Identity card
        document.getElementById('idNama').textContent = profile?.full_name || '-';
        document.getElementById('idUsername').textContent = profile?.username || '-';
        document.getElementById('idEmail').textContent = profile?.email || '-';

        // Build 7 subtest scores (one real, rest placeholder zeros)
        const kodeReal = getKodeSubtes(hasil.nama_paket);
        const skorReal = hitungSkorIRT(hasil.jumlah_benar ?? 0, hasil.total_soal ?? 1);
        const waktuReal = hasil.waktu_detik ?? 0;
        const benarReal = hasil.jumlah_benar ?? 0;

        const subtestData = Object.keys(SUBTES_MAP).map(kode => {
            const isReal = kode === kodeReal;
            return {
                kode,
                ...SUBTES_MAP[kode],
                benar: isReal ? benarReal : 0,
                total: isReal ? (hasil.total_soal ?? 0) : 0,
                skorIRT: isReal ? skorReal : 0,
                waktu: isReal ? waktuReal : 0
            };
        });

        // Render bar chart
        const barChart = document.getElementById('barChart');
        barChart.innerHTML = subtestData.map(st => {
            const height = Math.max((st.skorIRT / 1000) * 100, 4);
            return `
                <div class="bar-item">
                    <div class="bar-value">${st.skorIRT}</div>
                    <div class="bar-visual" style="height: ${height}%;"></div>
                    <div class="bar-label">${st.kode}</div>
                </div>
            `;
        }).join('');

        // Render score table
        const scoreTableBody = document.getElementById('scoreTableBody');
        scoreTableBody.innerHTML = subtestData.map(st => {
            const waktuMenit = Math.floor(st.waktu / 60);
            return `
                <tr>
                    <td>${st.full}</td>
                    <td>${st.benar} / ${st.total}</td>
                    <td>${st.bobot}</td>
                    <td><strong>${st.skorIRT}</strong></td>
                    <td>${waktuMenit} m</td>
                </tr>
            `;
        }).join('');

        // Tampilkan layout utama
        document.getElementById('detailContent').style.display = 'grid';

        // Load Analisis Kelolosan Target PTN
        const userOverallScore = hasil.irt_score || hasil.skor || skorReal || 0;
        await loadAnalisisKelolosan(hasil, user, userOverallScore);

    } catch (err) {
        console.error('Gagal memuat detail:', err);
        await showScyraAlert('Gagal memuat detail tryout: ' + err.message, '⚠️ Error', '🛑');
        window.location.href = 'riwayat-snbt.html';
    }
});

// ==========================================
// ANALISIS KELOLOSAN TARGET PTN (SNBT)
// ==========================================
async function loadAnalisisKelolosan(hasil, user, userScore) {
    const ptnContainer = document.getElementById('ptnListContainer');
    const ptnSubtext = document.getElementById('ptnSubtext');
    if (!ptnContainer) return;

    try {
        // Cari pendaftaran terkait paket ini
        let pendaftaran = null;
        if (hasil.paket_tryout_id) {
            const { data, error } = await window.db
                .from('tryout_pendaftaran')
                .select('id, pilihan_1_prodi_id, pilihan_2_prodi_id, pilihan_3_prodi_id, pilihan_4_prodi_id')
                .eq('user_id', user.id)
                .eq('paket_id', hasil.paket_tryout_id)
                .maybeSingle();
            if (!error && data) pendaftaran = data;
        }

        // Jika tidak ada paket_tryout_id di record hasil, coba cari pendaftaran terbaru user
        if (!pendaftaran) {
            const { data } = await window.db
                .from('tryout_pendaftaran')
                .select('id, pilihan_1_prodi_id, pilihan_2_prodi_id, pilihan_3_prodi_id, pilihan_4_prodi_id')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (data) pendaftaran = data;
        }

        if (!pendaftaran) {
            ptnContainer.innerHTML = `
                <div style="background: var(--bg-tertiary); padding: 1.25rem; border-radius: 10px; border: 1px dashed var(--border-color); text-align: center;">
                    <span style="font-size: 1.5rem; display: block; margin-bottom: 0.5rem;">🏛️</span>
                    <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.5rem;">Tidak ada data pilihan target PTN untuk sesi ujian ini.</p>
                    <small style="color: var(--text-muted);">Pilihan target prodi didaftarkan sebelum memulai paket tryout.</small>
                </div>
            `;
            if (ptnSubtext) ptnSubtext.textContent = 'Data target PTN tidak ditemukan.';
            return;
        }

        const prodiIds = [
            pendaftaran.pilihan_1_prodi_id,
            pendaftaran.pilihan_2_prodi_id,
            pendaftaran.pilihan_3_prodi_id,
            pendaftaran.pilihan_4_prodi_id
        ].filter(Boolean);

        if (!prodiIds.length) {
            ptnContainer.innerHTML = '<p style="color:var(--text-secondary);">Belum ada pilihan prodi yang disimpan.</p>';
            return;
        }

        // Ambil data prodi, ptn, estimasi skor, daya tampung, subtes prioritas
        const { data: prodiList, error: pErr } = await window.db
            .from('prodi')
            .select(`
                id, nama_prodi, jenjang, rumpun, kode_prodi,
                ptn ( id, nama_ptn, kode_ptn ),
                prodi_daya_tampung ( tahun, daya_tampung, peminat ),
                prodi_estimasi_skor ( estimasi_skor_min, estimasi_skor_aman, confidence_label ),
                prodi_subtes_prioritas ( nama_subtes, urutan_prioritas )
            `)
            .in('id', prodiIds);

        if (pErr) throw pErr;

        const prodiMap = new Map((prodiList || []).map(p => [p.id, p]));

        const slotLabels = ['Pilihan 1', 'Pilihan 2', 'Pilihan 3', 'Pilihan 4'];
        const slots = [
            { label: slotLabels[0], id: pendaftaran.pilihan_1_prodi_id },
            { label: slotLabels[1], id: pendaftaran.pilihan_2_prodi_id },
            { label: slotLabels[2], id: pendaftaran.pilihan_3_prodi_id },
            { label: slotLabels[3], id: pendaftaran.pilihan_4_prodi_id }
        ].filter(s => Boolean(s.id));

        let html = '';
        slots.forEach(slot => {
            const prodi = prodiMap.get(slot.id);
            if (!prodi) return;

            const ptn = prodi.ptn || {};
            const estimasi = prodi.prodi_estimasi_skor?.[0];
            const dayaTampung = prodi.prodi_daya_tampung?.[0];
            const subtesPrioritas = (prodi.prodi_subtes_prioritas || [])
                .sort((a, b) => a.urutan_prioritas - b.urutan_prioritas);

            const skorMin = estimasi?.estimasi_skor_min || 500;
            const skorAman = estimasi?.estimasi_skor_aman || 600;

            let statusClass = 'status-berisiko';
            let badgeClass = 'berisiko';
            let badgeIcon = '🔴';
            let badgeText = 'Perlu Peningkatan';
            let desc = '';

            if (userScore >= skorAman) {
                statusClass = 'status-aman';
                badgeClass = 'aman';
                badgeIcon = '🟢';
                badgeText = 'Peluang Lolos Tinggi';
                desc = `Skor kamu (<strong>${userScore}</strong>) telah melampaui estimasi batas aman (<strong>${skorAman}</strong>). Pertahankan konsistensi belajarmu!`;
            } else if (userScore >= skorMin) {
                statusClass = 'status-kompetitif';
                badgeClass = 'kompetitif';
                badgeIcon = '🟡';
                badgeText = 'Bersaing Ketat';
                const selisih = skorAman - userScore;
                desc = `Skor kamu (<strong>${userScore}</strong>) berada di atas batas minimal (<strong>${skorMin}</strong>). Butuh <strong>+${selisih} poin</strong> lagi untuk masuk zona aman.`;
            } else {
                statusClass = 'status-berisiko';
                badgeClass = 'berisiko';
                badgeIcon = '🔴';
                badgeText = 'Zona Berisiko';
                const selisih = skorMin - userScore;
                desc = `Skor kamu (<strong>${userScore}</strong>) masih di bawah batas minimal (<strong>${skorMin}</strong>). Perlu peningkatan minimal <strong>+${selisih} poin</strong>.`;
            }

            const prioritasText = subtesPrioritas.length > 0
                ? `<div class="ptn-subtes-tag">🎯 <strong>Subtes Penentu:</strong> ${subtesPrioritas.map(s => escapeHtml(s.nama_subtes)).join(', ')}</div>`
                : '';

            html += `
                <div class="ptn-item ${statusClass}">
                    <div class="ptn-item-header">
                        <div>
                            <span class="ptn-choice-label">${slot.label} &bull; ${escapeHtml(prodi.jenjang || 'S1')}</span>
                            <h4>${escapeHtml(prodi.nama_prodi)}</h4>
                            <div class="ptn-univ-name">🏛️ ${escapeHtml(ptn.nama_ptn || 'Perguruan Tinggi Negeri')}</div>
                        </div>
                        <span class="ptn-badge-status ${badgeClass}">
                            <span>${badgeIcon}</span> ${badgeText}
                        </span>
                    </div>

                    <div class="ptn-score-comparison">
                        <div><span>Skor Kamu:</span> <strong>${userScore}</strong></div>
                        <div><span>Batas Min:</span> <strong>${skorMin}</strong></div>
                        <div><span>Batas Aman:</span> <strong>${skorAman}</strong></div>
                        ${dayaTampung ? `<div><span>Kuota:</span> <strong>${dayaTampung.daya_tampung || '-'}</strong></div>` : ''}
                    </div>

                    <div class="ptn-status-description">${desc}</div>
                    ${prioritasText}
                </div>
            `;
        });

        ptnContainer.innerHTML = html;
        if (ptnSubtext) {
            ptnSubtext.textContent = `Prediksi kelolosan berdasarkan perolehan skor kamu (${userScore}) terhadap data historis keketatan SNBT:`;
        }

    } catch (e) {
        console.error('Error loading PTN analysis:', e);
        ptnContainer.innerHTML = '<p style="color:var(--error);">Gagal memuat analisis PTN: ' + e.message + '</p>';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

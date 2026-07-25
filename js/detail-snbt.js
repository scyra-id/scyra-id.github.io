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

        document.getElementById('detailContent').style.display = 'grid';

    } catch (err) {
        console.error('Gagal memuat detail:', err);
        await showScyraAlert('Gagal memuat detail tryout: ' + err.message, '⚠️ Error', '🛑');
        window.location.href = 'riwayat-snbt.html';
    }
});

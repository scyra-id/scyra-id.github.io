document.addEventListener('DOMContentLoaded', async () => {
    if (!window.db) return setTimeout(() => location.reload(), 100);

    const { data: { user } } = await window.db.auth.getUser();
    if (!user) {
        await showScyraAlert('Sesi habis. Silakan login ulang.', '⛔ Akses Ditolak', '🔒');
        return window.location.href = 'login.html';
    }

    const listEl = document.getElementById('snbtList');
    if (!listEl) return;

    try {
        const { data: results, error } = await window.db
            .from('hasil_tryout')
            .select('id, nama_paket, total_soal, jumlah_benar, skor, waktu_detik, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!results || results.length === 0) {
            listEl.innerHTML = '<p class="empty-text">Belum ada tryout SNBT yang dikerjakan.</p>';
            return;
        }

        listEl.innerHTML = results.map((row, index) => {
            const date = new Date(row.created_at);
            const dateStr = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            const title = `TRYOUT ${results.length - index - 1} SNBT`;
            const skor = row.skor ?? 0;
            const waktuMenit = Math.floor((row.waktu_detik ?? 0) / 60);

            return `
                <div class="snbt-card">
                    <div class="snbt-info">
                        <h3>${title}</h3>
                        <div class="snbt-meta">📅 ${dateStr} &bull; 🕐 ${timeStr} &bull; ⏱️ ${waktuMenit} menit</div>
                    </div>
                    <div class="snbt-score">Skor: ${skor}</div>
                    <a href="detail-snbt.html?id=${row.id}" class="btn-detail">Lihat Detail</a>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Gagal memuat riwayat SNBT:', err);
        listEl.innerHTML = '<p class="empty-text">Gagal memuat data. Coba lagi nanti.</p>';
    }
});

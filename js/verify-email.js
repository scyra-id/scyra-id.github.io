document.addEventListener('DOMContentLoaded', async () => {
    const state = document.getElementById('verificationState');
    if (!state) return;

    const show = (title, message) => {
        state.innerHTML = `<h2>${title}</h2><p>${message}</p>`;
    };

    if (!window.db) {
        show('Verifikasi gagal', 'Koneksi ke layanan autentikasi belum siap. Silakan coba lagi.');
        return;
    }

    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const queryParams = new URLSearchParams(window.location.search);
    const errorDescription = hashParams.get('error_description') || queryParams.get('error_description');

    if (errorDescription) {
        show('Link tidak dapat digunakan', decodeURIComponent(errorDescription.replace(/\+/g, ' ')));
        return;
    }

    const { data, error } = await window.db.auth.getSession();
    if (error || !data.session?.user) {
        show('Link tidak valid atau kedaluwarsa', 'Minta link verifikasi baru dari halaman daftar, lalu coba kembali.');
        return;
    }

    localStorage.setItem('scyra_has_registered', 'true');
    localStorage.setItem('scyra_saved_email', data.session.user.email || '');
    show('Email berhasil diverifikasi', 'Akunmu sudah aktif. Kamu akan diarahkan ke dashboard.');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1800);
});

document.addEventListener('DOMContentLoaded', () => {
    if (!window.db) {
        console.error("Koneksi database (window.db) belum siap!");
        // Delay sedikit agar modal injector hin selesai
        setTimeout(() => {
            showScyraAlert("Gagal terhubung ke database.\nPastikan URL/Key Supabase sudah benar.", "⚠️ Error Koneksi", "⚠️");
        }, 500);
        return;
    }

    const toggleBtns = document.querySelectorAll('.toggle-password');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.previousElementSibling;
            if (input.type === 'password') {
                input.type = 'text';
                btn.textContent = '🙈';
            } else {
                input.type = 'password';
                btn.textContent = '👁️';
            }
        });
    });

    const registerForm = document.getElementById('registerForm');
    if (registerForm) registerForm.addEventListener('submit', handleRegister);

    const resendButton = document.getElementById('btnResendVerification');
    if (resendButton) resendButton.addEventListener('click', handleResendVerification);

    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
});

function showError(elementId, message) {
    const errorEl = document.getElementById(elementId);
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.classList.add('active');
    const input = errorEl.parentElement.querySelector('input');
    if(input) input.classList.add('error');
}

function clearError(elementId) {
    const errorEl = document.getElementById(elementId);
    if(!errorEl) return;
    errorEl.textContent = '';
    errorEl.classList.remove('active');
    const input = errorEl.parentElement.querySelector('input');
    if(input) input.classList.remove('error');
}

async function handleRegister(e) {
    e.preventDefault();
    const btn = e.target.querySelector('.btn-submit');
    const originalText = btn.textContent;
    btn.textContent = 'Memproses...';
    btn.disabled = true;
    
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    let isValid = true;
    clearError('passwordError');
    clearError('confirmError');

    if (password.length < 6) {
        showError('passwordError', 'Password minimal 6 karakter');
        isValid = false;
    }
    if (password !== confirmPassword) {
        showError('confirmError', 'Password tidak cocok');
        isValid = false;
    }

    if (isValid) {
        try {
            const { data, error } = await window.db.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: { full_name: name },
                    emailRedirectTo: new URL('verify-email.html', window.location.href).href
                }
            });
            if (error) {
                await showScyraAlert('Gagal mendaftar: ' + error.message, '⚠️ Error', '⚠️');
            } else {
                showVerificationNotice(email);
                const isExistingUnverifiedUser = data.user?.identities?.length === 0;
                const message = isExistingUnverifiedUser
                    ? 'Email ini sudah terdaftar tetapi belum diverifikasi. Link verifikasi baru telah dikirim. Periksa inbox atau folder spam.'
                    : 'Pendaftaran berhasil, tetapi akunmu belum aktif. Kami telah mengirim link verifikasi ke emailmu. Klik link tersebut sebelum masuk ke Scyra.';
                await showScyraAlert(message, '📧 Verifikasi Email Diperlukan', '📧');
            }
        } catch (err) {
            await showScyraAlert('Terjadi kesalahan sistem: ' + err.message, '⚠️ Error', '⚠️');
        }
    }
    btn.textContent = originalText;
    btn.disabled = false;
}

function showVerificationNotice(email) {
    const form = document.getElementById('registerForm');
    const notice = document.getElementById('verificationNotice');
    const emailNode = document.getElementById('verificationEmail');
    if (emailNode) emailNode.textContent = email;
    if (form) form.hidden = true;
    if (notice) notice.hidden = false;
    sessionStorage.setItem('scyra_pending_verification_email', email);
}

async function handleResendVerification(e) {
    const button = e.currentTarget;
    const email = sessionStorage.getItem('scyra_pending_verification_email');
    if (!email) {
        await showScyraAlert('Masukkan email dan daftar kembali untuk mengirim link verifikasi.', '⚠️ Email Tidak Ditemukan', '⚠️');
        return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Mengirim...';

    try {
        const { error } = await window.db.auth.resend({
            type: 'signup',
            email,
            options: {
                emailRedirectTo: new URL('verify-email.html', window.location.href).href
            }
        });
        if (error) throw error;
        await showScyraAlert('Link verifikasi baru sudah dikirim. Periksa inbox atau folder spam emailmu.', '📧 Link Terkirim', '📧');
    } catch (err) {
        await showScyraAlert('Gagal mengirim ulang link: ' + err.message, '⚠️ Error', '⚠️');
    } finally {
        button.textContent = originalText;
        button.disabled = false;
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('.btn-submit');
    const originalText = btn.textContent;
    btn.textContent = 'Memproses...';
    btn.disabled = true;
    
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    
    clearError('emailError');
    clearError('passwordError');

    try {
        const { data, error } = await window.db.auth.signInWithPassword({
            email: email,
            password: password
        });
        if (error) {
            const message = error.message || '';
            if (/email not confirmed/i.test(message)) {
                sessionStorage.setItem('scyra_pending_verification_email', email);
                showError('passwordError', 'Email belum diverifikasi. Periksa inbox atau daftar ulang untuk mengirim link baru.');
            } else {
                showError('passwordError', 'Email atau password salah!');
            }
        } else {
            // Simpan status registrasi ke cache - langsung set tanpa fungsi
            localStorage.setItem('scyra_has_registered', 'true');
            localStorage.setItem('scyra_saved_email', email);
            
            await showScyraAlert('Login berhasil! Selamat datang kembali di Scyra.', '✅ Sukses Login', '✅');
            window.location.href = 'index.html';
        }
    } catch (err) {
        await showScyraAlert('Terjadi kesalahan sistem: ' + err.message, '⚠️ Error', '⚠️');
    }
    btn.textContent = originalText;
    btn.disabled = false;
}
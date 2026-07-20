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
                options: { data: { full_name: name } }
            });
            if (error) {
                await showScyraAlert('Gagal mendaftar: ' + error.message, '⚠️ Error', '⚠️');
            } else {
                await showScyraAlert('Registrasi berhasil! Silakan login dengan akun Anda.', '🎉 Sukses Daftar', '🎉');
                window.location.href = 'login.html';
            }
        } catch (err) {
            await showScyraAlert('Terjadi kesalahan sistem: ' + err.message, '⚠️ Error', '⚠️');
        }
    }
    btn.textContent = originalText;
    btn.disabled = false;
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
            showError('passwordError', 'Email atau password salah!');
        } else {
            await showScyraAlert('Login berhasil! Selamat datang kembali di Scyra.', '✅ Sukses Login', '✅');
            window.location.href = 'index.html';
        }
    } catch (err) {
        await showScyraAlert('Terjadi kesalahan sistem: ' + err.message, '⚠️ Error', '⚠️');
    }
    btn.textContent = originalText;
    btn.disabled = false;
}
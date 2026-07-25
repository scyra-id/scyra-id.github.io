document.addEventListener('DOMContentLoaded', async () => {
    const checkAuth = async () => {
        if (!window.db) return setTimeout(checkAuth, 100);
        const { data: { user } } = await window.db.auth.getUser();
        if (!user) {
            if(window.showScyraAlert) await window.showScyraAlert('Kamu harus login.', '⛔ Akses Ditolak', '🔒');
            return window.location.href = 'login.html';
        }
        await loadProfileData(user);
        setupProfileForm(user);
        setupAvatarUpload(user);
        setupEmailForm(user);
        setupPasswordForm(user);
        generateCaptcha('email');
        generateCaptcha('pass');
    };
    checkAuth();
});

// 🕵️‍♂️ RADAR MULTI-ID (Mencari berbagai kemungkinan ID/Name HTML)
function getInput(...ids) {
    for (const id of ids) {
        const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
        if (el) return el;
    }
    return null;
}

// 📡 X-RAY AVATAR (Tembakkan foto ke elemen apa pun yang berbau avatar)
function injectAvatar(urlFoto) {
    let ketemu = false;
    document.querySelectorAll('img').forEach(img => {
        const identitas = (img.id + ' ' + img.className).toLowerCase();
        if (identitas.includes('avatar') || identitas.includes('profile') || identitas.includes('pic') || identitas.includes('foto') || identitas.includes('user-img')) {
            img.src = urlFoto;
            ketemu = true;
        }
    });
    if (!ketemu) {
        document.querySelectorAll('div').forEach(div => {
            const identitas = (div.id + ' ' + div.className).toLowerCase();
            if (identitas.includes('avatar') || identitas.includes('profile-pic') || identitas.includes('foto')) {
                div.style.backgroundImage = `url('${urlFoto}')`;
                div.style.backgroundSize = 'cover';
                div.style.backgroundPosition = 'center';
            }
        });
    }
}

// === 1. MUAT DATA SAAT HALAMAN DIBUKA ===
async function loadProfileData(user) {
    const { data: profile, error } = await window.db.from('profiles').select('*').eq('id', user.id).single();
    if (error || !profile) return;

    // Cari input dengan berbagai kemungkinan ID
    const nameInput = getInput('profileName', 'name', 'fullName', 'full_name', 'nama', 'namaLengkap');
    const usernameInput = getInput('profileUsername', 'username', 'userName', 'namaPengguna');
    const bioInput = getInput('profileBio', 'bio', 'tentang', 'about');
    const emailInput = getInput('profileEmail', 'email');
    
    if(nameInput) nameInput.value = profile.full_name || '';
    if(usernameInput) usernameInput.value = profile.username || '';
    if(bioInput) bioInput.value = profile.bio || '';
    if(emailInput) emailInput.value = user.email;

    if (profile.avatar_url) {
        injectAvatar(profile.avatar_url + '?t=' + new Date().getTime());
    }
}

// === 2. SIMPAN FORM PROFIL (ANTI-OVERWRITE KOSONG) ===
function setupProfileForm(user) {
    const form = document.getElementById('profileForm') || document.querySelector('main form') || document.querySelector('form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        if(!btn) return;
        const origText = btn.textContent;
        btn.disabled = true; btn.textContent = 'Menyimpan...';

        const nameInput = getInput('profileName', 'name', 'fullName', 'full_name', 'nama', 'namaLengkap');
        const usernameInput = getInput('profileUsername', 'username', 'userName', 'namaPengguna');
        const bioInput = getInput('profileBio', 'bio', 'tentang', 'about');

        // 🛡️ HANYA MASUKKAN KE DATABASE JIKA INPUTNYA KETEMU DI HTML
        const payload = { updated_at: new Date().toISOString() };
        if(nameInput) payload.full_name = nameInput.value.trim();
        if(usernameInput) payload.username = usernameInput.value.trim();
        if(bioInput) payload.bio = bioInput.value.trim();

        try {
            const { error } = await window.db.from('profiles').update(payload).eq('id', user.id);
            if (error) throw error;
            
            if(window.showScyraAlert) await window.showScyraAlert('Profil diperbarui!', '✅ Sukses', '✅');
            else alert('Profil diperbarui!');
            
            document.dispatchEvent(new Event('headerLoaded'));
        } catch (err) {
            console.error("❌ Error Update:", err);
            let msg = 'Gagal: ' + err.message;
            if (err.message.includes('duplicate')) msg = 'Username sudah dipakai.';
            if (err.message.includes('bio')) msg = 'Kolom bio belum ada di database. Jalankan SQL ALTER TABLE.';
            
            if(window.showScyraAlert) await window.showScyraAlert(msg, '⚠️ Gagal', '⚠️');
            else alert(msg);
        } finally {
            btn.disabled = false; btn.textContent = origText;
        }
    });
}

// === 3. UPLOAD AVATAR (ANTI-BAJAK HEADER) ===
function setupAvatarUpload(user) {
    const avatarInput = document.querySelector('main input[type="file"]') || 
                        document.querySelector('.profile-container input[type="file"]') || 
                        document.getElementById('avatarInput') ||
                        document.querySelector('input[type="file"][accept*="image"]');
    
    let btnUpload = null;
    const allButtons = document.querySelectorAll('button');
    allButtons.forEach(btn => {
        if (btn.closest('#header-placeholder')) return; // 🛡️ SKIP HEADER
        const id = (btn.id || '').toLowerCase();
        const text = (btn.textContent || '').toLowerCase();
        if (id.includes('upload') || id.includes('avatar') || text.includes('ganti') || text.includes('upload') || text.includes('foto')) {
            btnUpload = btn;
        }
    });

    if (!avatarInput || !btnUpload) return;

    btnUpload.addEventListener('click', (e) => {
        e.preventDefault();
        avatarInput.click();
    });

    avatarInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            if(window.showScyraAlert) await window.showScyraAlert('Maksimal 2MB!', '⚠️ Peringatan', '⚠️');
            else alert('Maksimal 2MB!');
            return;
        }

        btnUpload.disabled = true; 
        const origText = btnUpload.textContent;
        btnUpload.textContent = 'Mengupload...';
        
        try {
            const ext = file.name.split('.').pop();
            const path = `${user.id}/${Date.now()}.${ext}`;
            
            const { error: upErr } = await window.db.storage.from('avatars').upload(path, file, { upsert: true });
            if (upErr) throw upErr;

            const { data: urlData } = window.db.storage.from('avatars').getPublicUrl(path);
            const urlFoto = urlData.publicUrl;

            await window.db.from('profiles').update({ avatar_url: urlFoto }).eq('id', user.id);
            injectAvatar(urlFoto + '?t=' + new Date().getTime());
            
            if(window.showScyraAlert) await window.showScyraAlert('Avatar diganti!', '✅ Sukses', '🎉');
            else alert('Avatar diganti!');
            
            document.dispatchEvent(new Event('headerLoaded'));
        } catch (err) {
            if(window.showScyraAlert) await window.showScyraAlert('Gagal upload: ' + err.message, '⚠️ Error', '⚠️');
            else alert('Gagal upload: ' + err.message);
        } finally {
            btnUpload.disabled = false; 
            btnUpload.textContent = origText;
            avatarInput.value = '';
        }
    });
}

// ==========================================
// 🤖 MATH CAPTCHA GENERATOR (Anti-Bot)
// ==========================================
function generateCaptcha(type) {
    const operators = ['+', '-', '×'];
    const op = operators[Math.floor(Math.random() * operators.length)];
    let a, b, answer;

    if (op === '+') {
        a = Math.floor(Math.random() * 20) + 1;
        b = Math.floor(Math.random() * 20) + 1;
        answer = a + b;
    } else if (op === '-') {
        a = Math.floor(Math.random() * 20) + 10;
        b = Math.floor(Math.random() * 10) + 1;
        answer = a - b;
    } else {
        a = Math.floor(Math.random() * 9) + 2;
        b = Math.floor(Math.random() * 9) + 2;
        answer = a * b;
    }

    const el = document.getElementById(`${type}Captcha`);
    if (el) {
        el.textContent = `${a} ${op} ${b} = ?`;
        el.dataset.answer = answer;
    }
}

// ==========================================
// 📧 FORM GANTI EMAIL (Dengan Reauth + CAPTCHA)
// ==========================================
function setupEmailForm(user) {
    const form = document.getElementById('emailForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const origText = btn.textContent;
        btn.disabled = true; btn.textContent = 'Memverifikasi...';

        const newEmail = document.getElementById('newEmail').value.trim();
        const password = document.getElementById('emailPassword').value;
        const captchaAnswer = document.getElementById('emailCaptchaAnswer').value.trim();
        const correctAnswer = document.getElementById('emailCaptcha').dataset.answer;

        // Validasi CAPTCHA
        if (parseInt(captchaAnswer) !== parseInt(correctAnswer)) {
            if(window.showScyraAlert) await window.showScyraAlert('Jawaban CAPTCHA salah! Silakan coba lagi.', '🤖 CAPTCHA Gagal', '⚠️');
            else alert('Jawaban CAPTCHA salah!');
            generateCaptcha('email');
            document.getElementById('emailCaptchaAnswer').value = '';
            btn.disabled = false; btn.textContent = origText;
            return;
        }

        // Validasi format email
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
            if(window.showScyraAlert) await window.showScyraAlert('Format email tidak valid.', '⚠️ Error', '⚠️');
            btn.disabled = false; btn.textContent = origText;
            return;
        }

        try {
            // 1. Verifikasi password lama (Reauthentication)
            const { error: authError } = await window.db.auth.signInWithPassword({
                email: user.email,
                password: password
            });
            if (authError) throw new Error('Password lama salah! Verifikasi gagal.');

            // 2. Kirim request ubah email (akan trigger email verifikasi dari Supabase)
            const { error: updateError } = await window.db.auth.updateUser({
                email: newEmail
            });
            if (updateError) throw updateError;

            if(window.showScyraAlert) await window.showScyraAlert(
                `Link verifikasi telah dikirim ke ${newEmail}.\nSilakan cek inbox (atau folder spam) email baru Anda untuk menyelesaikan proses.\n\nEmail lama tetap aktif sampai verifikasi selesai.`,
                '📧 Verifikasi Email Terkirim',
                '✅'
            );
            else alert('Link verifikasi telah dikirim ke email baru Anda!');
            
            form.reset();
            generateCaptcha('email');
        } catch (err) {
            const msg = err.message.includes('Password') ? err.message : 'Gagal: ' + err.message;
            if(window.showScyraAlert) await window.showScyraAlert(msg, '⚠️ Gagal Ubah Email', '⚠️');
            else alert(msg);
            generateCaptcha('email');
        } finally {
            btn.disabled = false; btn.textContent = origText;
        }
    });
}

// ==========================================
// 🔒 FORM GANTI PASSWORD (Dengan Reauth + CAPTCHA)
// ==========================================
function setupPasswordForm(user) {
    const form = document.getElementById('passwordForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const origText = btn.textContent;
        btn.disabled = true; btn.textContent = 'Memverifikasi...';

        const currentPass = document.getElementById('currentPassword').value;
        const newPass = document.getElementById('newPassword').value;
        const confirmPass = document.getElementById('confirmNewPassword').value;
        const captchaAnswer = document.getElementById('passCaptchaAnswer').value.trim();
        const correctAnswer = document.getElementById('passCaptcha').dataset.answer;

        // Validasi CAPTCHA
        if (parseInt(captchaAnswer) !== parseInt(correctAnswer)) {
            if(window.showScyraAlert) await window.showScyraAlert('Jawaban CAPTCHA salah! Silakan coba lagi.', '🤖 CAPTCHA Gagal', '⚠️');
            else alert('Jawaban CAPTCHA salah!');
            generateCaptcha('pass');
            document.getElementById('passCaptchaAnswer').value = '';
            btn.disabled = false; btn.textContent = origText;
            return;
        }

        // Validasi password baru
        if (newPass.length < 8) {
            if(window.showScyraAlert) await window.showScyraAlert('Password baru minimal 8 karakter.', '⚠️ Peringatan', '⚠️');
            btn.disabled = false; btn.textContent = origText;
            return;
        }
        if (newPass !== confirmPass) {
            if(window.showScyraAlert) await window.showScyraAlert('Konfirmasi password baru tidak cocok.', '⚠️ Peringatan', '⚠️');
            btn.disabled = false; btn.textContent = origText;
            return;
        }
        if (newPass === currentPass) {
            if(window.showScyraAlert) await window.showScyraAlert('Password baru tidak boleh sama dengan password lama.', '⚠️ Peringatan', '⚠️');
            btn.disabled = false; btn.textContent = origText;
            return;
        }

        try {
            // 1. Verifikasi password lama (Reauthentication)
            const { error: authError } = await window.db.auth.signInWithPassword({
                email: user.email,
                password: currentPass
            });
            if (authError) throw new Error('Password lama salah! Verifikasi gagal.');

            // 2. Update password
            const { error: updateError } = await window.db.auth.updateUser({
                password: newPass
            });
            if (updateError) throw updateError;

            if(window.showScyraAlert) await window.showScyraAlert(
                'Password berhasil diubah!\n\nAnda akan tetap login di perangkat ini, tapi harus pakai password baru saat login di perangkat lain.',
                '🔒 Password Diperbarui',
                '✅'
            );
            else alert('Password berhasil diubah!');
            
            form.reset();
            generateCaptcha('pass');
        } catch (err) {
            const msg = err.message.includes('Password') ? err.message : 'Gagal: ' + err.message;
            if(window.showScyraAlert) await window.showScyraAlert(msg, '⚠️ Gagal Ubah Password', '⚠️');
            else alert(msg);
            generateCaptcha('pass');
        } finally {
            btn.disabled = false; btn.textContent = origText;
        }
    });
}
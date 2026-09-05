document.addEventListener('DOMContentLoaded', async () => {
    const checkAuth = async () => {
        if (!window.db) return setTimeout(checkAuth, 100);
        const { data: { user } } = await window.db.auth.getUser();
        if (!user) {
            if(window.showScyraAlert) await window.showScyraAlert('Kamu harus login.', '⛔ Akses Ditolak', '🔒');
            return window.location.href = 'login.html';
        }
        await loadProfileData(user);
        await loadFeaturedBadges(user);
        await loadProfileGamificationIdentity(user);
        setupProfileForm(user);
        setupAvatarUpload(user);
        setupEmailForm(user);
        setupPasswordForm(user);
        setupAccountDeletion(user);
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

async function loadFeaturedBadges(user) {
    const container = document.getElementById('profileFeaturedBadges');
    if (!container || !window.ScyraAchievementEngine) return;

    try {
        if (window.syncAuthToPaymentDB) await window.syncAuthToPaymentDB();

        const [featured, summary] = await Promise.all([
            window.ScyraAchievementEngine.getFeaturedBadges(user.id),
            window.ScyraAchievementEngine.getFullAchievementSummary(user.id)
        ]);

        container.innerHTML = [1, 2, 3].map((slot) => {
            const badge = featured.find((item) => item.slot_position === slot);
            if (!badge) {
                return `<a href="achievements.html" class="profile-badge-slot" title="Atur featured badges di Achievement Hall"><span>+</span><span class="profile-badge-label">Slot ${slot}</span></a>`;
            }

            const category = window.ScyraAchievementEngine.CATEGORIES[badge.achievement_category];
            const categorySummary = summary.categories.find((item) => item.key === badge.achievement_category);
            if (!category) {
                return `<a href="achievements.html" class="profile-badge-slot" title="Atur featured badges di Achievement Hall"><span>+</span><span class="profile-badge-label">Slot ${slot}</span></a>`;
            }

            return `<a href="achievements.html" class="profile-badge-slot filled" title="${category.name} · ${categorySummary?.currentTierLabel || 'Bronze'}"><span>${category.icon}</span><span class="profile-badge-label">${categorySummary?.currentTierLabel || 'Bronze'}</span></a>`;
        }).join('');
    } catch (err) {
        console.warn('Featured badges unavailable:', err);
    }
}

async function loadProfileGamificationIdentity(user) {
    const levelEl = document.getElementById('profilePublicLevel');
    const streakEl = document.getElementById('profilePublicStreak');
    if (!window.ScyraGamification) return;

    const profileLayers = {
        EFFECT: document.getElementById('profileLayerEffect'),
        BODY: document.getElementById('profileLayerBody'),
        OUTFIT: document.getElementById('profileLayerOutfit'),
        BACK: document.getElementById('profileLayerBack'),
        EXPRESSION: document.getElementById('profileLayerExpression'),
        FACE: document.getElementById('profileLayerFace'),
        ANTENNA: document.getElementById('profileLayerAntenna'),
        HEAD: document.getElementById('profileLayerHead')
    };

    const slotToColumn = {
        BODY: 'body_item_id',
        EXPRESSION: 'expression_item_id',
        ANTENNA: 'antenna_item_id',
        HEAD: 'head_item_id',
        FACE: 'face_item_id',
        OUTFIT: 'outfit_item_id',
        BACK: 'back_item_id',
        EFFECT: 'effect_item_id'
    };

    try {
        const [journey, equipped, items] = await Promise.all([
            window.ScyraGamification.getUserJourneyProgress(),
            window.ScyraGamification.getUserEquippedMascot(),
            window.ScyraGamification.getItemDefinitions()
        ]);

        if (levelEl && journey) {
            levelEl.textContent = `LV. ${journey.current_level || 1}`;
        }
        if (streakEl && journey) {
            streakEl.textContent = `🔥 ${journey.daily_streak || 1} Hari Streak`;
        }

        const itemMap = new Map((items || []).map(i => [i.id, i]));
        Object.entries(profileLayers).forEach(([slot, layerNode]) => {
            if (!layerNode) return;
            const itemId = equipped?.[slotToColumn[slot]];
            const item = itemId ? itemMap.get(itemId) : null;
            if (item?.asset_url) {
                layerNode.innerHTML = `<img src="${item.asset_url}" alt="">`;
                layerNode.style.display = 'block';
            } else {
                layerNode.innerHTML = '';
                layerNode.style.display = 'none';
            }
        });
    } catch (err) {
        console.warn('Profile gamification identity load warning:', err);
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

function setupAccountDeletion(user) {
    const button = document.getElementById('btnDeleteAccount');
    const modal = document.getElementById('deleteAccountModal');
    const passwordInput = document.getElementById('deleteAccountPassword');
    const confirmationInput = document.getElementById('deleteAccountConfirmation');
    const confirmButton = document.getElementById('btnConfirmDeleteAccount');
    const errorEl = document.getElementById('deleteAccountError');
    if (!button || !modal || !passwordInput || !confirmationInput || !confirmButton) return;

    const closeModal = () => {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        passwordInput.value = '';
        confirmationInput.value = '';
        confirmButton.disabled = true;
        if (errorEl) errorEl.classList.remove('active');
        button.focus();
    };

    const validate = () => {
        confirmButton.disabled = !passwordInput.value || confirmationInput.value.trim() !== 'HAPUS AKUN';
    };

    button.addEventListener('click', () => {
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        passwordInput.focus();
    });
    passwordInput.addEventListener('input', validate);
    confirmationInput.addEventListener('input', validate);
    modal.querySelectorAll('[data-close-delete-modal]').forEach((node) => node.addEventListener('click', closeModal));
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !modal.hidden) closeModal();
    });

    confirmButton.addEventListener('click', async () => {
        const originalText = confirmButton.textContent;
        confirmButton.disabled = true;
        confirmButton.textContent = 'Menghapus akun...';
        if (errorEl) errorEl.classList.remove('active');

        try {
            const { data, error } = await window.db.functions.invoke('delete-account', {
                body: { password: passwordInput.value, confirmation: 'HAPUS AKUN' }
            });

            let payload = data;
            if (error) {
                try {
                    if (error.context) payload = await error.context.json();
                } catch (_) {}
                throw new Error(payload?.error || error.message || 'Gagal menghapus akun.');
            }
            if (!payload?.success) throw new Error(payload?.error || 'Gagal menghapus akun.');

            await window.db.auth.signOut();
            localStorage.removeItem('scyra_has_registered');
            localStorage.removeItem('scyra_saved_email');
            sessionStorage.clear();
            closeModal();
            await showScyraAlert('Akun dan data terkait telah dihapus secara permanen.', 'Akun Dihapus', '✅');
            window.location.href = 'index.html';
        } catch (err) {
            console.error('delete account:', err);
            if (errorEl) {
                errorEl.textContent = err.message || 'Gagal menghapus akun. Coba lagi nanti.';
                errorEl.classList.add('active');
            }
            confirmButton.textContent = originalText;
            validate();
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
/**
 * =============================================
 * REFERRAL UI CONTROLLER
 * =============================================
 * Menghandle semua interaksi UI di halaman referral.html
 * 
 * Menggunakan database kedua (window.dbPayment) untuk credit/referral tables
 */

// Credit icon HTML helper
const CREDIT_ICON = `<img src="images/credit_icon.webp" alt="Credit" style="width: 24px; height: 24px; vertical-align: middle;">`;

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for Supabase clients to be ready
    await waitForDb();
    
    // Check authentication
    const { data: { user } } = await window.db.auth.getUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    
    // Initialize UI
    await initializeReferralPage();
    
    // Setup event listeners
    setupReferralEventListeners();
});

// =========================================================
// 🔄 WAIT FOR DB (both db and dbPayment)
// =========================================================
function waitForDb() {
    return new Promise((resolve) => {
        const check = () => {
            if (window.db && window.dbPayment) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

// Helper untuk mendapatkan db yang tepat
// Auth & progress tables pakai window.db, credit/referral tables pakai window.dbPayment
function getDb() {
    return window.dbPayment || window.db;
}

function getAuthDb() {
    return window.db;
}

// =========================================================
// 🎯 INITIALIZE PAGE
// =========================================================
async function initializeReferralPage() {
    // 1. Check eligibility (Section 1)
    try {
        const eligibility = await window.ReferralSystem.checkReferralEligibility();
        const eligibilityNotice = document.getElementById('eligibilityNotice');
        const eligibilityMessage = document.getElementById('eligibilityMessage');
        const btnSubmitReferral = document.getElementById('btnSubmitReferral');
        
        if (eligibility && !eligibility.eligible) {
            if (eligibilityNotice) eligibilityNotice.style.display = 'flex';
            if (eligibilityMessage) eligibilityMessage.textContent = eligibility.message;
            if (btnSubmitReferral) btnSubmitReferral.disabled = true;
        } else if (btnSubmitReferral) {
            btnSubmitReferral.disabled = false;
        }
    } catch (err) {
        console.warn('⚠️ Eligibility check error (non-critical):', err.message);
    }
    
    // 2. Load referral code & stats via Gateway
    try {
        await loadReferralStats();
    } catch (err) {
        console.warn('⚠️ Referral stats load error (non-critical):', err.message);
        await loadMyReferralCode();
    }
    
    // 3. Check IG credit request status
    try {
        await checkIGRequestStatus();
    } catch (err) {
        console.warn('⚠️ IG status check error (non-critical):', err.message);
    }
}

// =========================================================
// 📋 LOAD MY REFERRAL CODE
// =========================================================
async function loadMyReferralCode() {
    const codeDisplay = document.getElementById('myReferralCode');
    if (!codeDisplay) return;
    
    try {
        const code = await window.ReferralSystem.getOrCreateReferralCode();
        if (code) {
            codeDisplay.textContent = code;
        } else {
            codeDisplay.textContent = 'Gagal memuat kode';
        }
    } catch (err) {
        console.error('Error in loadMyReferralCode:', err);
        codeDisplay.textContent = 'Gagal memuat kode';
    }
}

// =========================================================
// 📊 LOAD REFERRAL STATS
// =========================================================
async function loadReferralStats() {
    const stats = await window.ReferralSystem.getReferralStats();
    
    if (stats) {
        const codeDisplay = document.getElementById('myReferralCode');
        if (codeDisplay) {
            codeDisplay.textContent = stats.referralCode || 'Gagal memuat kode';
        }
        
        const countDisplay = document.getElementById('referralCount');
        if (countDisplay) {
            countDisplay.textContent = `${stats.totalReferrals || 0}/${stats.maxReferrals || 5}`;
        }
        
        if (stats.hasUsedReferral) {
            const alreadyUsedNotice = document.getElementById('alreadyUsedNotice');
            const referralForm = document.getElementById('referralForm');
            if (alreadyUsedNotice) alreadyUsedNotice.style.display = 'flex';
            if (referralForm) referralForm.style.display = 'none';
        }
    } else {
        await loadMyReferralCode();
    }
}

// =========================================================
// 🎧 EVENT LISTENERS
// =========================================================
function setupReferralEventListeners() {
    // Referral form submit
    const referralForm = document.getElementById('referralForm');
    if (referralForm) {
        referralForm.addEventListener('submit', handleReferralSubmit);
    }
    
    // OTP form submit
    const otpForm = document.getElementById('otpForm');
    if (otpForm) {
        otpForm.addEventListener('submit', handleOTPSubmit);
    }
    
    // Copy code button
    const btnCopyCode = document.getElementById('btnCopyCode');
    if (btnCopyCode) {
        btnCopyCode.addEventListener('click', copyReferralCode);
    }
    
    // Share code button
    const btnShareCode = document.getElementById('btnShareCode');
    if (btnShareCode) {
        btnShareCode.addEventListener('click', shareReferralCode);
    }
    
    // Resend OTP button
    const btnResendOTP = document.getElementById('btnResendOTP');
    if (btnResendOTP) {
        btnResendOTP.addEventListener('click', resendOTP);
    }
    
    // Cancel OTP button
    const btnCancelOTP = document.getElementById('btnCancelOTP');
    if (btnCancelOTP) {
        btnCancelOTP.addEventListener('click', cancelOTP);
    }
    
    // Input validation
    const referralCodeInput = document.getElementById('referralCodeInput');
    if (referralCodeInput) {
        referralCodeInput.addEventListener('input', validateReferralForm);
    }
    
    const phoneNumberInput = document.getElementById('phoneNumberInput');
    if (phoneNumberInput) {
        phoneNumberInput.addEventListener('input', validateReferralForm);
    }
    
    // 📱 IG Credit Form submit
    const igForm = document.getElementById('igForm');
    if (igForm) {
        igForm.addEventListener('submit', handleIGCreditSubmit);
    }
    
    // IG Username input validation
    const igUsernameInput = document.getElementById('igUsernameInput');
    if (igUsernameInput) {
        igUsernameInput.addEventListener('input', validateIGForm);
    }
}

// =========================================================
// ✅ VALIDATE REFERRAL FORM
// =========================================================
function validateReferralForm() {
    const codeInput = document.getElementById('referralCodeInput');
    const phoneInput = document.getElementById('phoneNumberInput');
    const btnSubmit = document.getElementById('btnSubmitReferral');
    
    const code = codeInput.value.trim().toUpperCase();
    const phone = phoneInput.value.trim();
    
    // Validate code format (SCYRA + 6 chars = 11 chars total)
    const codeValid = /^SCYRA[A-Z0-9]{6}$/.test(code);
    
    // Validate phone number (Indonesian format)
    const phoneValid = /^08[0-9]{8,13}$/.test(phone);
    
    btnSubmit.disabled = !(codeValid && phoneValid);
}

// =========================================================
// 📤 HANDLE REFERRAL SUBMIT
// =========================================================
async function handleReferralSubmit(e) {
    e.preventDefault();
    
    const code = document.getElementById('referralCodeInput').value.trim().toUpperCase();
    const phone = document.getElementById('phoneNumberInput').value.trim();
    
    // Validate referral code first
    const validation = await window.ReferralSystem.validateReferralCode(code);
    if (!validation.valid) {
        if (typeof showScyraAlert === 'function') {
            await showScyraAlert(validation.message, '❌ Kode Tidak Valid', '❌');
        }
        return;
    }
    
    // Store phone and code for later use
    window._referralData = {
        code: code,
        phone: phone
    };
    
    // Send OTP
    const otpResult = await window.ReferralSystem.sendOTP(phone, 'referral_verification');
    
    if (otpResult.success) {
        // Show OTP form
        document.getElementById('referralForm').style.display = 'none';
        document.getElementById('otpForm').style.display = 'block';
        document.getElementById('otpPhoneNumber').textContent = phone;
        
        // Show mock OTP for testing (remove in production)
        if (typeof showScyraAlert === 'function') {
            await showScyraAlert(
                `Kode OTP mock untuk testing: <strong style="font-size: 1.5rem; letter-spacing: 0.3rem;">${otpResult.otpCode}</strong><br><br>Kode ini juga tersedia di Console (F12)`,
                '📱 OTP Terkirim (Mode Testing)',
                '📱'
            );
        }
    } else {
        if (typeof showScyraAlert === 'function') {
            await showScyraAlert(otpResult.message, '❌ Gagal Mengirim OTP', '❌');
        }
    }
}

// =========================================================
// 🔐 HANDLE OTP SUBMIT
// =========================================================
async function handleOTPSubmit(e) {
    e.preventDefault();
    
    const otpCode = document.getElementById('otpInput').value.trim();
    const { phone, code } = window._referralData || {};
    
    if (!phone || !code) {
        if (typeof showScyraAlert === 'function') {
            await showScyraAlert('Data referral tidak valid. Silakan coba lagi.', '❌ Error', '❌');
        }
        return;
    }
    
    // Verify OTP
    const verifyResult = await window.ReferralSystem.verifyOTP(phone, otpCode);
    
    if (verifyResult.success) {
        // Process referral
        const processResult = await window.ReferralSystem.processReferral(code, phone);
        
        if (processResult.success) {
            // Show success
            document.getElementById('otpForm').style.display = 'none';
            document.getElementById('referralSuccess').style.display = 'block';
            document.getElementById('successMessage').textContent = processResult.message;
            
            // Update credit display in topbar
            if (window.CreditSystem) {
                await window.CreditSystem.updateTopbarCredit();
            }
            
            // Update referral stats
            await loadReferralStats();
        } else {
            if (typeof showScyraAlert === 'function') {
                await showScyraAlert(processResult.message, '❌ Gagal Memproses Referral', '❌');
            }
        }
    } else {
        if (typeof showScyraAlert === 'function') {
            await showScyraAlert(verifyResult.message, '❌ OTP Tidak Valid', '❌');
        }
    }
}

// =========================================================
// 📋 COPY REFERRAL CODE
// =========================================================
async function copyReferralCode() {
    const codeEl = document.getElementById('myReferralCode');
    const code = codeEl ? codeEl.textContent.trim() : '';
    
    if (!code || code === 'Loading...' || code === 'Gagal memuat kode') {
        if (typeof showScyraAlert === 'function') {
            await showScyraAlert('Kode referral belum tersedia untuk disalin. Silakan coba lagi sebentar.', '⚠️ Belum Tersedia', '⚠️');
        }
        return;
    }
    
    try {
        await navigator.clipboard.writeText(code);
        
        const btnCopy = document.getElementById('btnCopyCode');
        if (btnCopy) {
            const originalText = btnCopy.textContent;
            btnCopy.textContent = '✅';
            setTimeout(() => {
                btnCopy.textContent = originalText;
            }, 2000);
        }
        
        if (typeof showScyraAlert === 'function') {
            await showScyraAlert(`Kode referral <strong>${code}</strong> berhasil disalin!`, '📋 Disalin!', '📋');
        }
    } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (typeof showScyraAlert === 'function') {
            await showScyraAlert(`Kode referral <strong>${code}</strong> berhasil disalin!`, '📋 Disalin!', '📋');
        }
    }
}

// =========================================================
// 📤 SHARE REFERRAL CODE
// =========================================================
async function shareReferralCode() {
    const codeEl = document.getElementById('myReferralCode');
    const code = codeEl ? codeEl.textContent.trim() : '';
    
    if (!code || code === 'Loading...' || code === 'Gagal memuat kode') {
        if (typeof showScyraAlert === 'function') {
            await showScyraAlert('Kode referral belum tersedia untuk dibagikan. Silakan coba lagi sebentar.', '⚠️ Belum Tersedia', '⚠️');
        }
        return;
    }
    
    const baseUrl = window.location.origin.includes('scyra.my.id') ? 'https://scyra.my.id' : window.location.origin;
    const shareText = `🎁 Gabung Scyra dan dapatkan credit gratis! Gunakan kode referral ku: ${code}\n\nDaftar sekarang di ${baseUrl}`;
    
    // Check if Web Share API is available
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Scyra - Program Referral',
                text: shareText
            });
        } catch (err) {
            if (err.name !== 'AbortError') {
                // Fallback to copy
                await copyReferralCode();
            }
        }
    } else {
        // Fallback to copy
        await copyReferralCode();
    }
}

// =========================================================
// 🔄 RESEND OTP
// =========================================================
async function resendOTP() {
    const { phone } = window._referralData || {};
    
    if (!phone) return;
    
    const otpResult = await window.ReferralSystem.sendOTP(phone, 'referral_verification');
    
    if (otpResult.success) {
        if (typeof showScyraAlert === 'function') {
            await showScyraAlert(
                `Kode OTP baru telah dikirim!<br><br>Kode mock: <strong style="font-size: 1.5rem; letter-spacing: 0.3rem;">${otpResult.otpCode}</strong>`,
                '📱 OTP Terkirim Ulang',
                '📱'
            );
        }
    } else {
        if (typeof showScyraAlert === 'function') {
            await showScyraAlert(otpResult.message, '❌ Gagal Mengirim Ulang OTP', '❌');
        }
    }
}

// =========================================================
// ❌ CANCEL OTP
// =========================================================
function cancelOTP() {
    document.getElementById('otpForm').style.display = 'none';
    document.getElementById('referralForm').style.display = 'block';
    document.getElementById('otpInput').value = '';
    window._referralData = null;
}

// =========================================================
// 📱 IG CREDIT REQUEST - VALIDATE FORM
// =========================================================
function validateIGForm() {
    const usernameInput = document.getElementById('igUsernameInput');
    const btnSubmit = document.getElementById('btnSubmitIG');
    
    if (!usernameInput || !btnSubmit) return;
    
    const username = usernameInput.value.trim().replace(/^@+/, '');
    
    // Validasi username IG (3-30 karakter, alphanumeric + underscore + dot)
    const usernameValid = /^[a-zA-Z0-9._]{3,30}$/.test(username);
    
    btnSubmit.disabled = !usernameValid;
}

// =========================================================
// 📱 IG CREDIT REQUEST - HANDLE SUBMIT
// =========================================================
async function handleIGCreditSubmit(e) {
    e.preventDefault();
    
    const usernameInput = document.getElementById('igUsernameInput');
    if (!usernameInput) return;
    
    const username = usernameInput.value.trim().replace(/^@+/, '');
    
    if (!username || username.length < 3) {
        if (typeof showScyraAlert === 'function') {
            await showScyraAlert('Username Instagram tidak valid! (Minimal 3 karakter tanpa @)', '❌ Error', '❌');
        } else {
            alert('Username Instagram tidak valid! (Minimal 3 karakter tanpa @)');
        }
        return;
    }
    
    // Disable button
    const btnSubmit = document.getElementById('btnSubmitIG');
    const originalText = btnSubmit ? btnSubmit.textContent : 'Kirim Permintaan';
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Mengirim...';
    }
    
    try {
        const { data: { user } } = await getAuthDb().auth.getUser();
        if (!user || !window.ReferralCreditGateway) {
            throw new Error('Koneksi permintaan credit belum siap. Silakan refresh halaman.');
        }

        const request = await window.ReferralCreditGateway.call('instagram_credit.submit', { username });

        // Request aktif yang sudah ada tidak dibuat ulang; tampilkan statusnya.
        if (!request || request.status !== 'pending' || request.alreadyExists) {
            showIGStatus(request ? request.status : 'pending', request || { instagram_username: username, credits_amount: 5 });
            return;
        }
        
        // Tampilkan success message
        const igForm = document.getElementById('igForm');
        const igSuccess = document.getElementById('igSuccess');
        if (igForm) igForm.style.display = 'none';
        if (igSuccess) igSuccess.style.display = 'block';
        
    } catch (err) {
        console.error('Error submitting IG credit request:', err);
        const errMsg = err?.message || 'Gagal mengirim permintaan. Silakan coba lagi.';
        if (typeof showScyraAlert === 'function') {
            await showScyraAlert(
                errMsg,
                '❌ Gagal Mengirim',
                '❌'
            );
        } else {
            alert(errMsg);
        }
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.textContent = originalText;
        }
    }
}

// =========================================================
// 📱 IG CREDIT REQUEST - SHOW STATUS
// =========================================================
function showIGStatus(status, requestData) {
    const igForm = document.getElementById('igForm');
    const igStatus = document.getElementById('igStatus');
    const statusTitle = document.getElementById('statusTitle');
    const statusMessage = document.getElementById('statusMessage');
    
    if (!igStatus || !igForm || !statusTitle || !statusMessage) return;
    const statusIcon = igStatus.querySelector('.status-icon');
    
    igForm.style.display = 'none';
    igStatus.style.display = 'flex';
    
    const uname = requestData ? escapeHtml(requestData.instagram_username || '') : '';
    const credits = (requestData && requestData.credits_amount) ? requestData.credits_amount : 5;
    
    switch (status) {
        case 'pending':
            if (statusIcon) statusIcon.textContent = '⏳';
            statusTitle.textContent = 'Menunggu Approval';
            statusMessage.innerHTML = `Permintaan kamu dengan username <strong>@${uname}</strong> sedang direview oleh admin. Credit ${credits} ${CREDIT_ICON} akan ditambahkan setelah disetujui.`;
            break;
        case 'approved':
            if (statusIcon) statusIcon.textContent = '✅';
            statusTitle.textContent = 'Disetujui!';
            statusMessage.innerHTML = `Permintaan kamu sudah disetujui. ${credits} ${CREDIT_ICON} credit telah ditambahkan ke akunmu!`;
            break;
        case 'rejected':
            if (statusIcon) statusIcon.textContent = '❌';
            statusTitle.textContent = 'Ditolak';
            statusMessage.innerHTML = 'Permintaan kamu ditolak. Pastikan kamu sudah follow dan like 3 post terakhir kami. Silakan coba lagi!';
            // Tampilkan form lagi untuk retry
            setTimeout(() => {
                igForm.style.display = 'block';
                igStatus.style.display = 'none';
            }, 3000);
            break;
        default:
            if (statusIcon) statusIcon.textContent = '⏳';
            statusTitle.textContent = 'Permintaan Diproses';
            statusMessage.innerHTML = `Permintaan sedang dalam proses peninjauan.`;
            break;
    }
}

// =========================================================
// 📱 IG CREDIT REQUEST - CHECK STATUS ON LOAD
// =========================================================
async function checkIGRequestStatus() {
    try {
        if (!window.ReferralCreditGateway) return;

        const latestRequest = await window.ReferralCreditGateway.call('instagram_credit.status');
        
        if (latestRequest) {
            if (latestRequest.status === 'pending' || latestRequest.status === 'approved') {
                showIGStatus(latestRequest.status, latestRequest);
            }
        }
    } catch (err) {
        console.warn('⚠️ IG status check error (non-critical):', err.message);
    }
}

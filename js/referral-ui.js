/**
 * =============================================
 * REFERRAL UI CONTROLLER
 * =============================================
 * Menghandle semua interaksi UI di halaman referral.html
 * 
 * Menggunakan database kedua (window.dbPayment) untuk credit/referral tables
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Credit icon HTML helper
    const CREDIT_ICON = `<img src="images/credit_icon.webp" alt="Credit" style="width: 24px; height: 24px; vertical-align: middle;">`;
    
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
    // Check eligibility
    const eligibility = await window.ReferralSystem.checkReferralEligibility();
    const eligibilityNotice = document.getElementById('eligibilityNotice');
    const eligibilityMessage = document.getElementById('eligibilityMessage');
    const btnSubmitReferral = document.getElementById('btnSubmitReferral');
    
    if (!eligibility.eligible) {
        eligibilityNotice.style.display = 'flex';
        eligibilityMessage.textContent = eligibility.message;
        btnSubmitReferral.disabled = true;
    } else {
        btnSubmitReferral.disabled = false;
    }
    
    // Check if already used referral - pakai dbPayment
    const { data: { user } } = await getAuthDb().auth.getUser();
    const db = getDb();
    
    try {
        const { data: existingReferral, error: referralError } = await db
            .from('referral_relationships')
            .select('id')
            .eq('referred_id', user.id)
            .single();
        
        if (referralError) {
            console.warn('⚠️ Referral check failed (non-critical):', referralError.message);
        } else if (existingReferral) {
            document.getElementById('alreadyUsedNotice').style.display = 'flex';
            document.getElementById('referralForm').style.display = 'none';
        }
    } catch (err) {
        console.warn('⚠️ Referral relationship check error (non-critical):', err.message);
    }
    
    // Load my referral code
    await loadMyReferralCode();
    
    // Load referral stats
    await loadReferralStats();
    
    // 📱 Check IG credit request status
    await checkIGRequestStatus();
}

// =========================================================
// 📋 LOAD MY REFERRAL CODE
// =========================================================
async function loadMyReferralCode() {
    const codeDisplay = document.getElementById('myReferralCode');
    const code = await window.ReferralSystem.getOrCreateReferralCode();
    
    if (code) {
        codeDisplay.textContent = code;
    } else {
        codeDisplay.textContent = 'Gagal memuat kode';
    }
}

// =========================================================
// 📊 LOAD REFERRAL STATS
// =========================================================
async function loadReferralStats() {
    const stats = await window.ReferralSystem.getReferralStats();
    
    if (stats) {
        document.getElementById('referralCount').textContent = 
            `${stats.totalReferrals}/${stats.maxReferrals}`;
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
    const code = document.getElementById('myReferralCode').textContent;
    
    try {
        await navigator.clipboard.writeText(code);
        
        const btnCopy = document.getElementById('btnCopyCode');
        const originalText = btnCopy.textContent;
        btnCopy.textContent = '✅';
        
        setTimeout(() => {
            btnCopy.textContent = originalText;
        }, 2000);
        
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
    const code = document.getElementById('myReferralCode').textContent;
    const shareText = `🎁 Gabung Scyra dan dapatkan credit gratis! Gunakan kode referral ku: ${code}\n\nDaftar sekarang di scyra.com`;
    
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
    
    const username = usernameInput.value.trim().replace('@', '');
    
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
    
    const username = usernameInput.value.trim().replace('@', '');
    
    if (!username || username.length < 3) {
        if (typeof showScyraAlert === 'function') {
            await showScyraAlert('Username Instagram tidak valid!', '❌ Error', '❌');
        }
        return;
    }
    
    // Disable button
    const btnSubmit = document.getElementById('btnSubmitIG');
    const originalText = btnSubmit.textContent;
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Mengirim...';
    
    try {
        const { data: { user } } = await getAuthDb().auth.getUser();
        const db = getDb();
        
        // Cek apakah user sudah pernah submit request
        const { data: existingRequest } = await db
            .from('free_credit_requests')
            .select('id, status, credits_amount')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        
        // Jika masih pending, tampilkan status
        if (existingRequest && existingRequest.status === 'pending') {
            showIGStatus('pending', existingRequest);
            return;
        }
        
        // Jika sudah approved sebelumnya
        if (existingRequest && existingRequest.status === 'approved') {
            showIGStatus('approved', existingRequest);
            return;
        }
        
        // Submit request baru
        const { data, error } = await db
            .from('free_credit_requests')
            .insert({
                user_id: user.id,
                instagram_username: username,
                status: 'pending',
                credits_amount: 5
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Tampilkan success message
        document.getElementById('igForm').style.display = 'none';
        document.getElementById('igSuccess').style.display = 'block';
        
    } catch (err) {
        console.error('Error submitting IG credit request:', err);
        if (typeof showScyraAlert === 'function') {
            await showScyraAlert(
                'Gagal mengirim permintaan. Silakan coba lagi.',
                '❌ Error',
                '❌'
            );
        }
        btnSubmit.disabled = false;
        btnSubmit.textContent = originalText;
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
    const statusIcon = igStatus.querySelector('.status-icon');
    
    if (!igStatus) return;
    
    igForm.style.display = 'none';
    igStatus.style.display = 'flex';
    
    switch (status) {
        case 'pending':
            statusIcon.textContent = '⏳';
            statusTitle.textContent = 'Menunggu Approval';
            statusMessage.textContent = `Permintaan kamu dengan username @${requestData.instagram_username} sedang direview oleh admin. Credit ${requestData.credits_amount} ${CREDIT_ICON} akan ditambahkan setelah disetujui.`;
            break;
        case 'approved':
            statusIcon.textContent = '✅';
            statusTitle.textContent = 'Disetujui!';
            statusMessage.textContent = `Permintaan kamu sudah disetujui. ${requestData.credits_amount} ${CREDIT_ICON} credit telah ditambahkan ke akunmu!`;
            break;
        case 'rejected':
            statusIcon.textContent = '❌';
            statusTitle.textContent = 'Ditolak';
            statusMessage.textContent = 'Permintaan kamu ditolak. Pastikan kamu sudah follow dan like 3 post terakhir kami. Silakan coba lagi!';
            // Tampilkan form lagi untuk retry
            setTimeout(() => {
                igForm.style.display = 'block';
                igStatus.style.display = 'none';
            }, 3000);
            break;
    }
}

// =========================================================
// 📱 IG CREDIT REQUEST - CHECK STATUS ON LOAD
// =========================================================
async function checkIGRequestStatus() {
    try {
        const { data: { user } } = await getAuthDb().auth.getUser();
        if (!user) return;
        
        const db = getDb();
        
        const { data: latestRequest, error } = await db
            .from('free_credit_requests')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        
        if (error) {
            console.warn('⚠️ IG request check failed (non-critical):', error.message);
            return;
        }
        
        if (latestRequest) {
            if (latestRequest.status === 'pending' || latestRequest.status === 'approved') {
                showIGStatus(latestRequest.status, latestRequest);
            }
        }
    } catch (err) {
        console.warn('⚠️ IG status check error (non-critical):', err.message);
    }
}

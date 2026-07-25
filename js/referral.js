/**
 * =============================================
 * REFERRAL SYSTEM MODULE
 * =============================================
 * Module untuk mengelola sistem referral:
 * - Generate referral code
 * - Validate referral code
 * - Process referral (dengan mock OTP untuk sekarang)
 * - Track referral relationships
 * 
 * Menggunakan database kedua (window.dbPayment) untuk referral tables
 */

window.ReferralSystem = (function() {
    'use strict';
    
    const CREDITS_PER_REFERRAL = 2;
    const MAX_REFERRALS = 5;
    
    // Helper untuk mendapatkan db yang tepat
    // Auth & progress tables pakai window.db, referral tables pakai window.dbPayment
    function getDb() {
        return window.dbPayment || window.db;
    }
    
    function getAuthDb() {
        return window.db;
    }
    
    /**
     * Generate unique referral code untuk user
     * Format: SCYRA + 6 karakter random alphanumeric
     */
    function generateReferralCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = 'SCYRA';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    
    /**
     * Get atau create referral code untuk user
     * @returns {string} Referral code
     */
    async function getOrCreateReferralCode() {
        const { data: { user } } = await getAuthDb().auth.getUser();
        if (!user) return null;
        
        const db = getDb();
        
        // Check apakah sudah punya referral code
        const { data: existingCode, error } = await db
            .from('referral_codes')
            .select('code')
            .eq('user_id', user.id)
            .single();
        
        if (existingCode && !error) {
            return existingCode.code;
        }
        
        // Generate code baru
        let newCode = generateReferralCode();
        let isUnique = false;
        let attempts = 0;
        
        while (!isUnique && attempts < 10) {
            const { data: check } = await db
                .from('referral_codes')
                .select('id')
                .eq('code', newCode)
                .single();
            
            if (!check) {
                isUnique = true;
            } else {
                newCode = generateReferralCode();
                attempts++;
            }
        }
        
        // Insert referral code
        const { error: insertError } = await db
            .from('referral_codes')
            .insert({
                user_id: user.id,
                code: newCode,
                is_active: true
            });
        
        if (insertError) {
            console.error('Error creating referral code:', insertError);
            return null;
        }
        
        return newCode;
    }
    
    /**
     * Validate referral code
     * @param {string} code - Referral code yang diinput
     * @returns {Object} { valid, referrerId, message }
     */
    async function validateReferralCode(code) {
        const { data: { user } } = await getAuthDb().auth.getUser();
        if (!user) return { valid: false, message: 'User tidak terautentikasi' };
        
        const db = getDb();
        
        // Check code exists
        const { data: referralData, error } = await db
            .from('referral_codes')
            .select('user_id, is_active')
            .eq('code', code.toUpperCase())
            .single();
        
        if (error || !referralData) {
            return { valid: false, message: 'Kode referral tidak valid' };
        }
        
        if (!referralData.is_active) {
            return { valid: false, message: 'Kode referral sudah tidak aktif' };
        }
        
        // Check apakah user mencoba pakai code sendiri
        if (referralData.user_id === user.id) {
            return { valid: false, message: 'Tidak bisa menggunakan kode referral sendiri' };
        }
        
        // Check apakah user sudah pernah pakai referral
        const { data: existingReferral } = await db
            .from('referral_relationships')
            .select('id')
            .eq('referred_id', user.id)
            .single();
        
        if (existingReferral) {
            return { valid: false, message: 'Kamu sudah pernah menggunakan kode referral' };
        }
        
        // Check apakah referrer sudah mencapai max referrals
        const { count: referrerCount } = await db
            .from('referral_relationships')
            .select('*', { count: 'exact', head: true })
            .eq('referrer_id', referralData.user_id)
            .eq('status', 'completed');
        
        if (referrerCount >= MAX_REFERRALS) {
            return { valid: false, message: 'Pemilik kode sudah mencapai batas maksimal referral' };
        }
        
        return { 
            valid: true, 
            referrerId: referralData.user_id,
            message: 'Kode referral valid'
        };
    }
    
    /**
     * Check apakah user sudah memenuhi syarat untuk menggunakan referral
     * Syarat: sudah complete minimal 1 mini drill atau 1 materi + soal
     * @returns {Object} { eligible, message, progress }
     */
    async function checkReferralEligibility() {
        const { data: { user } } = await getAuthDb().auth.getUser();
        if (!user) return { eligible: false, message: 'User tidak terautentikasi' };
        
        // Check drill completion - tabel ini ada di database utama
        const { data: drillProgress, error: drillError } = await getAuthDb()
            .from('user_drill_progress')
            .select('id')
            .eq('user_id', user.id)
            .eq('status', 'completed')
            .limit(1);
        
        if (!drillError && drillProgress && drillProgress.length > 0) {
            return { 
                eligible: true, 
                message: 'Kamu sudah memenuhi syarat untuk menggunakan referral',
                progress: { drill: true }
            };
        }
        
        // Check materi completion (jika ada tabel materi_progress)
        // Untuk sekarang, kita asumsikan eligible jika sudah login
        // TODO: Implement proper materi completion check
        
        return { 
            eligible: false, 
            message: 'Kamu harus menyelesaikan minimal 1 mini drill atau 1 materi beserta soal untuk menggunakan referral',
            progress: { drill: false, materi: false }
        };
    }
    
    /**
     * Generate mock OTP untuk testing
     * @param {string} phoneNumber - Nomor HP
     * @returns {string} OTP code (6 digit)
     */
    function generateMockOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
    
    /**
     * Send OTP (mock untuk sekarang)
     * @param {string} phoneNumber - Nomor HP
     * @param {string} purpose - Tujuan OTP
     * @returns {Object} { success, message, otpCode (untuk testing) }
     */
    async function sendOTP(phoneNumber, purpose = 'referral_verification') {
        const { data: { user } } = await getAuthDb().auth.getUser();
        if (!user) return { success: false, message: 'User tidak terautentikasi' };
        
        const db = getDb();
        
        // Generate OTP
        const otpCode = generateMockOTP();
        
        // Simpan OTP ke database (expires in 10 minutes)
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        
        const { error } = await db
            .from('otp_verification')
            .insert({
                user_id: user.id,
                phone_number: phoneNumber,
                otp_code: otpCode,
                purpose: purpose,
                expires_at: expiresAt,
                is_used: false
            });
        
        if (error) {
            console.error('Error saving OTP:', error);
            return { success: false, message: 'Gagal mengirim OTP' };
        }
        
        // TODO: Integrate dengan WhatsApp bot untuk kirim OTP
        // Untuk sekarang, return OTP code untuk testing
        console.log('🔐 MOCK OTP (untuk testing):', otpCode);
        
        return { 
            success: true, 
            message: `OTP telah dikirim ke ${phoneNumber}`,
            otpCode: otpCode // Hapus ini di production!
        };
    }
    
    /**
     * Verify OTP
     * @param {string} phoneNumber - Nomor HP
     * @param {string} otpCode - Kode OTP yang diinput
     * @returns {Object} { success, message }
     */
    async function verifyOTP(phoneNumber, otpCode) {
        const { data: { user } } = await getAuthDb().auth.getUser();
        if (!user) return { success: false, message: 'User tidak terautentikasi' };
        
        const db = getDb();
        
        // Find valid OTP
        const { data: otpData, error } = await db
            .from('otp_verification')
            .select('id, expires_at, is_used')
            .eq('user_id', user.id)
            .eq('phone_number', phoneNumber)
            .eq('otp_code', otpCode)
            .eq('is_used', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        
        if (error || !otpData) {
            return { success: false, message: 'Kode OTP tidak valid' };
        }
        
        // Check expired
        if (new Date(otpData.expires_at) < new Date()) {
            return { success: false, message: 'Kode OTP sudah kadaluarsa' };
        }
        
        // Mark OTP as used
        await db
            .from('otp_verification')
            .update({ is_used: true })
            .eq('id', otpData.id);
        
        return { success: true, message: 'OTP berhasil diverifikasi' };
    }
    
    /**
     * Process referral setelah OTP verified
     * @param {string} referralCode - Kode referral
     * @param {string} phoneNumber - Nomor HP yang diverifikasi
     * @returns {Object} { success, message, creditsEarned }
     */
    async function processReferral(referralCode, phoneNumber) {
        const { data: { user } } = await getAuthDb().auth.getUser();
        if (!user) return { success: false, message: 'User tidak terautentikasi' };
        
        // Validate referral code
        const validation = await validateReferralCode(referralCode);
        if (!validation.valid) {
            return { success: false, message: validation.message };
        }
        
        const db = getDb();
        
        // Create referral relationship
        const { data: relationship, error: relError } = await db
            .from('referral_relationships')
            .insert({
                referrer_id: validation.referrerId,
                referred_id: user.id,
                referral_code: referralCode.toUpperCase(),
                credits_earned_referrer: CREDITS_PER_REFERRAL,
                credits_earned_referred: CREDITS_PER_REFERRAL,
                status: 'completed',
                verified_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (relError) {
            console.error('Error creating referral relationship:', relError);
            return { success: false, message: 'Gagal memproses referral' };
        }
        
        // Add credits to referrer
        if (window.CreditSystem) {
            await window.CreditSystem.addCredits(
                validation.referrerId,
                CREDITS_PER_REFERRAL,
                'referral_earned',
                `Referral bonus: ${user.email} menggunakan kode referral kamu`,
                relationship.id
            );
        }
        
        // Add credits to referred user (current user)
        if (window.CreditSystem) {
            await window.CreditSystem.addCredits(
                user.id,
                CREDITS_PER_REFERRAL,
                'referral_received',
                `Bonus referral: kamu menggunakan kode referral`,
                relationship.id
            );
        }
        
        return { 
            success: true, 
            message: `Referral berhasil! Kamu dan temanmu masing-masing mendapatkan ${CREDITS_PER_REFERRAL} credit`,
            creditsEarned: CREDITS_PER_REFERRAL
        };
    }
    
    /**
     * Get referral stats untuk user
     * @returns {Object} { totalReferrals, maxReferrals, referralCode, referrals }
     */
    async function getReferralStats() {
        const { data: { user } } = await getAuthDb().auth.getUser();
        if (!user) return null;
        
        // Get referral code
        const referralCode = await getOrCreateReferralCode();
        
        const db = getDb();
        
        // Get referral count
        const { count, data: referrals } = await db
            .from('referral_relationships')
            .select('referred_id, status, created_at', { count: 'exact' })
            .eq('referrer_id', user.id)
            .eq('status', 'completed');
        
        return {
            totalReferrals: count || 0,
            maxReferrals: MAX_REFERRALS,
            referralCode: referralCode,
            referrals: referrals || []
        };
    }
    
    // Public API
    return {
        getOrCreateReferralCode,
        validateReferralCode,
        checkReferralEligibility,
        sendOTP,
        verifyOTP,
        processReferral,
        getReferralStats,
        CREDITS_PER_REFERRAL,
        MAX_REFERRALS
    };
})();
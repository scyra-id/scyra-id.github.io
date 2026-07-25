/**
 * =============================================
 * CREDIT SYSTEM MODULE
 * =============================================
 * Module untuk mengelola credit user:
 * - Fetch & display credit
 * - Deduct credit untuk unlock fitur
 * - Add credit (purchase, referral, free)
 * - Check unlocked content
 * 
 * Menggunakan database kedua (window.dbPayment) untuk credit tables
 */

window.CreditSystem = (function() {
    'use strict';
    
    // Cache untuk credit data
    let creditCache = null;
    let cacheTimestamp = 0;
    const CACHE_DURATION = 30000; // 30 detik
    
    // Helper untuk mendapatkan db yang tepat
    // Auth tetap pakai window.db, credit tables pakai window.dbPayment
    function getDb() {
        return window.dbPayment || window.db;
    }
    
    function getAuthDb() {
        return window.db;
    }
    
    /**
     * Fetch credit data dari database
     * @param {boolean} forceRefresh - Force refresh dari database
     * @returns {Object} Credit data { total_credits, bonus_credits, used_credits, available_credits }
     */
    async function fetchCredits(forceRefresh = false) {
        const now = Date.now();
        
        // Return cache jika masih valid
        if (!forceRefresh && creditCache && (now - cacheTimestamp) < CACHE_DURATION) {
            return creditCache;
        }
        
        const { data: { user } } = await getAuthDb().auth.getUser();
        if (!user) return null;
        
        // Ensure auth is synced to payment DB before querying
        if (window.syncAuthToPaymentDB && !window._authSyncedToPaymentDB) {
            await window.syncAuthToPaymentDB();
        }
        
        const db = getDb();
        
        try {
            // Fetch dari database
            const { data, error } = await db
                .from('user_credits')
                .select('total_credits, bonus_credits, used_credits')
                .eq('user_id', user.id)
                .single();
            
            if (error || !data) {
                // Jika belum ada record, buat baru
                const { data: newData, error: insertError } = await db
                    .from('user_credits')
                    .insert({ user_id: user.id, total_credits: 0, bonus_credits: 0, used_credits: 0 })
                    .select('total_credits, bonus_credits, used_credits')
                    .single();
                
                if (insertError) {
                    console.warn('⚠️ Credit record creation failed:', insertError.message);
                    // Return default credit object instead of null
                    creditCache = {
                        total_credits: 0,
                        bonus_credits: 0,
                        used_credits: 0,
                        available_credits: 0
                    };
                    cacheTimestamp = now;
                    return creditCache;
                }
                
                creditCache = {
                    total_credits: newData.total_credits,
                    bonus_credits: newData.bonus_credits,
                    used_credits: newData.used_credits,
                    available_credits: newData.total_credits + newData.bonus_credits - newData.used_credits
                };
            } else {
                creditCache = {
                    total_credits: data.total_credits,
                    bonus_credits: data.bonus_credits,
                    used_credits: data.used_credits,
                    available_credits: data.total_credits + data.bonus_credits - data.used_credits
                };
            }
            
            cacheTimestamp = now;
            return creditCache;
        } catch (err) {
            console.warn('⚠️ Credit fetch error (non-critical):', err.message);
            // Return default credit object
            return {
                total_credits: 0,
                bonus_credits: 0,
                used_credits: 0,
                available_credits: 0
            };
        }
    }
    
    /**
     * Get available credits (total + bonus - used)
     * @returns {number} Available credits
     */
    async function getAvailableCredits() {
        const credits = await fetchCredits();
        return credits ? credits.available_credits : 0;
    }
    
    /**
     * Add credits ke user
     * @param {string} userId - ID user (required karena bisa dipanggil dari admin context)
     * @param {number} amount - Jumlah credit yang ditambahkan
     * @param {string} type - Tipe transaksi (purchase, bonus, referral_earned, dll)
     * @param {string} description - Deskripsi transaksi
     * @param {string} referenceId - ID referensi (opsional)
     */
    async function addCredits(userId, amount, type, description, referenceId = null) {
        // Jika userId tidak diberikan, gunakan current user
        if (!userId || typeof userId === 'number') {
            // Backward compatibility: jika parameter pertama adalah number
            referenceId = description;
            description = type;
            type = amount;
            amount = userId;
            const { data: { user } } = await getAuthDb().auth.getUser();
            if (!user) throw new Error('User not authenticated');
            userId = user.id;
        }
        
        const db = getDb();
        
        // Tentukan field yang diupdate berdasarkan type
        const isBonus = (type === 'bonus' || type === 'free_credit' || type === 'referral_earned');
        const updateField = isBonus ? 'bonus_credits' : 'total_credits';
        
        // Get current value
        const { data: currentCredit } = await db
            .from('user_credits')
            .select(updateField)
            .eq('user_id', userId)
            .single();
        
        const currentValue = currentCredit ? currentCredit[updateField] : 0;
        
        // Update credit
        const { error: updateError } = await db
            .from('user_credits')
            .update({ [updateField]: currentValue + amount })
            .eq('user_id', userId);
        
        if (updateError) throw updateError;
        
        // Log transaksi
        const { error: logError } = await db
            .from('credit_transactions')
            .insert({
                user_id: userId,
                type: type,
                amount: amount,
                description: description,
                reference_id: referenceId
            });
        
        if (logError) console.error('Error logging transaction:', logError);
        
        // Invalidate cache
        creditCache = null;
        cacheTimestamp = 0;
        
        return true;
    }
    
    /**
     * Deduct credits dari user
     * @param {number} amount - Jumlah credit yang dikurangi
     * @param {string} type - Tipe transaksi (usage)
     * @param {string} description - Deskripsi transaksi
     * @param {string} referenceId - ID referensi (opsional)
     */
    async function deductCredits(amount, type, description, referenceId = null) {
        const { data: { user } } = await getAuthDb().auth.getUser();
        if (!user) throw new Error('User not authenticated');
        
        // Check available credits
        const available = await getAvailableCredits();
        if (available < amount) {
            throw new Error(`Credit tidak cukup. Dibutuhkan ${amount} credit, tersedia ${available} credit.`);
        }
        
        const db = getDb();
        
        // Get current used_credits
        const { data: currentCredit } = await db
            .from('user_credits')
            .select('used_credits')
            .eq('user_id', user.id)
            .single();
        
        const currentUsed = currentCredit ? currentCredit.used_credits : 0;
        
        // Update used_credits
        const { error: updateError } = await db
            .from('user_credits')
            .update({ used_credits: currentUsed + amount })
            .eq('user_id', user.id);
        
        if (updateError) throw updateError;
        
        // Log transaksi
        const { error: logError } = await db
            .from('credit_transactions')
            .insert({
                user_id: user.id,
                type: type || 'usage',
                amount: -amount,
                description: description,
                reference_id: referenceId
            });
        
        if (logError) console.error('Error logging transaction:', logError);
        
        // Invalidate cache
        creditCache = null;
        cacheTimestamp = 0;
        
        return true;
    }
    
    /**
     * Unlock content (materi, tryout, tryout_analysis)
     * @param {string} contentType - Tipe konten (materi, tryout, tryout_analysis)
     * @param {string} contentId - ID konten
     * @param {number} creditsRequired - Jumlah credit yang dibutuhkan
     */
    async function unlockContent(contentType, contentId, creditsRequired) {
        const { data: { user } } = await getAuthDb().auth.getUser();
        if (!user) throw new Error('User not authenticated');
        
        // Check apakah sudah di-unlock
        const isUnlocked = await isContentUnlocked(contentType, contentId);
        if (isUnlocked) {
            return { success: true, alreadyUnlocked: true };
        }
        
        // Deduct credits
        await deductCredits(creditsRequired, 'usage', `Unlock ${contentType}: ${contentId}`);
        
        const db = getDb();
        
        // Record unlock
        const { error: unlockError } = await db
            .from('unlocked_content')
            .insert({
                user_id: user.id,
                content_type: contentType,
                content_id: contentId,
                credits_used: creditsRequired
            });
        
        if (unlockError) throw unlockError;
        
        return { success: true, alreadyUnlocked: false };
    }
    
    /**
     * Check apakah content sudah di-unlock
     * @param {string} contentType - Tipe konten
     * @param {string} contentId - ID konten
     * @returns {boolean}
     */
    async function isContentUnlocked(contentType, contentId) {
        const { data: { user } } = await getAuthDb().auth.getUser();
        if (!user) return false;
        
        const db = getDb();
        
        const { data, error } = await db
            .from('unlocked_content')
            .select('id')
            .eq('user_id', user.id)
            .eq('content_type', contentType)
            .eq('content_id', contentId)
            .single();
        
        return !error && data !== null;
    }
    
    /**
     * Get user role
     * @returns {string} Role user (user, silver, gold, admin)
     */
    async function getUserRole() {
        const { data: { user } } = await getAuthDb().auth.getUser();
        if (!user) return null;
        
        // Role ada di database utama (window.db)
        const { data, error } = await getAuthDb()
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();
        
        return error ? null : data?.role;
    }
    
    /**
     * Check apakah user perlu credit system
     * Gold users tidak perlu credit
     * @returns {boolean}
     */
    async function needsCreditSystem() {
        const role = await getUserRole();
        return role === 'user' || role === 'silver';
    }
    
    /**
     * Update credit display di topbar
     */
    async function updateTopbarCredit() {
        const creditDisplay = document.getElementById('topbarCreditDisplay');
        if (!creditDisplay) return;
        
        const needsCredit = await needsCreditSystem();
        if (!needsCredit) {
            creditDisplay.style.display = 'none';
            return;
        }
        
        const credits = await fetchCredits();
        if (credits) {
            creditDisplay.style.display = 'flex';
            const creditAmount = document.getElementById('topbarCreditAmount');
            if (creditAmount) {
                creditAmount.textContent = credits.available_credits;
            }
        }
        
        // 🚨 UPDATE DROPDOWN CREDIT JUGA (realtime sync)
        const dropdownCreditAmount = document.getElementById('dropdownCreditAmount');
        if (dropdownCreditAmount && credits) {
            dropdownCreditAmount.textContent = credits.available_credits;
        }
    }
    
    /**
     * Initialize credit system
     */
    async function init() {
        // Update topbar credit display
        await updateTopbarCredit();
        
        // 🚨 POLLING REALTIME: Check credit changes setiap 5 detik
        setInterval(async () => {
            const credits = await fetchCredits(true); // Force refresh
            const dropdownCreditAmount = document.getElementById('dropdownCreditAmount');
            const topbarCreditAmount = document.getElementById('topbarCreditAmount');
            
            if (credits) {
                if (dropdownCreditAmount) {
                    dropdownCreditAmount.textContent = credits.available_credits;
                }
                if (topbarCreditAmount) {
                    topbarCreditAmount.textContent = credits.available_credits;
                }
            }
        }, 5000); // 5 detik
    }
    
    // Public API
    return {
        fetchCredits,
        getAvailableCredits,
        addCredits,
        deductCredits,
        unlockContent,
        isContentUnlocked,
        getUserRole,
        needsCreditSystem,
        updateTopbarCredit,
        init
    };
})();

// Auto-initialize ketika DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // Tunggu Supabase siap (both db and dbPayment)
    const waitForDb = () => new Promise(resolve => {
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max
        const check = () => {
            attempts++;
            if (window.db && window.dbPayment) {
                resolve(true);
            } else if (attempts >= maxAttempts) {
                console.warn('⚠️ Timeout waiting for Supabase clients');
                resolve(false);
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
    
    waitForDb().then((dbReady) => {
        if (!dbReady) {
            console.warn('⚠️ CreditSystem not initialized - DB clients not ready');
            return;
        }
        
        window.db.auth.getUser()
            .then(({ data: { user } }) => {
                if (user) {
                    window.CreditSystem.init().catch(err => {
                        console.warn('⚠️ CreditSystem init failed (non-critical):', err.message);
                    });
                }
            })
            .catch(err => {
                console.warn('⚠️ Auth check failed (non-critical):', err.message);
            });
    });
});

/**
 * ============================================================================
 * 🎮 SCYRA GAMIFICATION CONFIG & FEATURE FLAG
 * ============================================================================
 * Mengontrol aktivasi sistem Gamifikasi Scyra secara dinamis.
 * - Mode Coming Soon (false): Streak harian tetap berjalan, XP dan leveling dibekukan.
 * - Mode Aktif (true): Seluruh fitur XP, 50 Level Journey, Kyra Studio, & Trophy aktif.
 */

window.ScyraGamificationConfig = (function() {
    'use strict';

    const CACHE_KEY = 'scyra_gamification_enabled';
    let isEnabledCached = null;
    let fetchPromise = null;

    // Baca nilai awal dari localStorage secara synchronous untuk menghindari layout shift
    try {
        const local = localStorage.getItem(CACHE_KEY);
        if (local !== null) {
            isEnabledCached = (local === 'true');
        }
    } catch (_) {}

    /**
     * Memeriksa apakah gamifikasi aktif secara asynchronous dari database.
     * @param {boolean} forceRefresh - Paksa query ulang ke server
     * @returns {Promise<boolean>}
     */
    async function isEnabled(forceRefresh = false) {
        if (!forceRefresh && isEnabledCached !== null) {
            return isEnabledCached;
        }

        if (fetchPromise && !forceRefresh) {
            return fetchPromise;
        }

        fetchPromise = (async () => {
            try {
                if (!window.db) {
                    return isEnabledCached ?? false;
                }

                // 1. Cek dari tabel system_settings terlebih dahulu
                try {
                    const { data: sysData, error: sysErr } = await window.db
                        .from('system_settings')
                        .select('setting_value')
                        .eq('setting_key', 'gamification_enabled')
                        .maybeSingle();

                    if (!sysErr && sysData && sysData.setting_value !== undefined && sysData.setting_value !== null) {
                        const val = (sysData.setting_value === true || sysData.setting_value === 'true');
                        updateCache(val);
                        return val;
                    }
                } catch (_) {}

                // 2. Fallback ke survey_settings
                try {
                    const { data: surveyData, error: surveyErr } = await window.db
                        .from('survey_settings')
                        .select('setting_value')
                        .eq('setting_key', 'gamification_enabled')
                        .maybeSingle();

                    if (!surveyErr && surveyData && surveyData.setting_value !== undefined && surveyData.setting_value !== null) {
                        const val = (surveyData.setting_value === true || surveyData.setting_value === 'true');
                        updateCache(val);
                        return val;
                    }
                } catch (_) {}

                // Default jika belum diset di database: FALSE (Coming Soon)
                const defaultVal = false;
                updateCache(defaultVal);
                return defaultVal;
            } catch (err) {
                console.warn('Gagal membaca status gamifikasi dari database:', err);
                return isEnabledCached ?? false;
            } finally {
                fetchPromise = null;
            }
        })();

        return fetchPromise;
    }

    /**
     * Memeriksa status secara synchronous berdasarkan cache / localStorage
     * @returns {boolean}
     */
    function isEnabledSync() {
        if (isEnabledCached !== null) return isEnabledCached;
        try {
            const local = localStorage.getItem(CACHE_KEY);
            if (local !== null) {
                isEnabledCached = (local === 'true');
                return isEnabledCached;
            }
        } catch (_) {}
        return false;
    }

    function updateCache(val) {
        isEnabledCached = Boolean(val);
        try {
            localStorage.setItem(CACHE_KEY, String(isEnabledCached));
        } catch (_) {}
    }

    /**
     * Mengubah status gamifikasi (Khusus Admin)
     * @param {boolean} value
     * @returns {Promise<boolean>}
     */
    async function setEnabled(value) {
        const boolVal = Boolean(value);
        if (!window.db) throw new Error('Koneksi database utama belum siap');

        let saved = false;
        let lastError = null;

        // 1. Coba simpan ke system_settings (tabel modern serbaguna)
        try {
            const { error: sysErr } = await window.db
                .from('system_settings')
                .upsert({
                    setting_key: 'gamification_enabled',
                    setting_value: boolVal,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'setting_key' });
            if (!sysErr) {
                saved = true;
            }
        } catch (e) {
            console.warn('Simpan ke system_settings tidak dapat diproses:', e);
        }

        // 2. Coba simpan ke survey_settings (fallback tabel yang sudah ada)
        try {
            // Pertama coba UPDATE langsung (karena policy UPDATE admin sudah aktif di database)
            const { data: updData, error: updErr } = await window.db
                .from('survey_settings')
                .update({ setting_value: boolVal, updated_at: new Date().toISOString() })
                .eq('setting_key', 'gamification_enabled')
                .select('setting_key');

            if (!updErr && updData && updData.length > 0) {
                saved = true;
            } else {
                // Jika baris belum ada di database, coba lakukan INSERT
                const { error: insErr } = await window.db
                    .from('survey_settings')
                    .insert({ setting_key: 'gamification_enabled', setting_value: boolVal, updated_at: new Date().toISOString() });
                
                if (!insErr) {
                    saved = true;
                } else if (!saved) {
                    lastError = insErr;
                }
            }
        } catch (e) {
            if (!saved) lastError = e;
            console.warn('Simpan ke survey_settings tidak dapat diproses:', e);
        }

        if (!saved && lastError) {
            if (lastError.message && lastError.message.includes('row-level security')) {
                throw new Error('Database Supabase belum memiliki baris/policy untuk fitur ini. Silakan jalankan SQL migrasi di Supabase SQL Editor.');
            }
            throw lastError;
        }

        updateCache(boolVal);

        window.dispatchEvent(new CustomEvent('scyra:gamification_toggle', { detail: { enabled: boolVal } }));
        return boolVal;
    }

    return {
        isEnabled,
        isEnabledSync,
        setEnabled
    };
})();

/**
 * Learning progress module (MAIN DB).
 * Source of truth for dashboard stats + continue learning.
 */
window.ProgressSystem = (function () {
    'use strict';

    function db() {
        return window.db;
    }

    function compactHistory(jawabanHistory) {
        if (!Array.isArray(jawabanHistory)) return [];
        return jawabanHistory.map((item) => {
            const soal = item.soal || {};
            return {
                soal_id: soal.id || item.soal_id || null,
                jawaban_user: item.jawaban_user,
                kunci_asli: item.kunci_asli || item.kunci_jawaban,
                pertanyaan_html: soal.pertanyaan_html || item.pertanyaan_html || '',
                pembahasan_html: soal.pembahasan_html || item.pembahasan_html || '',
            };
        });
    }

    function expandHistory(detail) {
        if (!Array.isArray(detail)) return [];
        return detail.map((item) => ({
            soal: {
                id: item.soal_id,
                pertanyaan_html: item.pertanyaan_html || '',
                pembahasan_html: item.pembahasan_html || '',
            },
            jawaban_user: item.jawaban_user,
            kunci_asli: item.kunci_asli,
        }));
    }

    async function getMateriProgress(userId, materiId) {
        const { data, error } = await db()
            .from('user_learning_progress')
            .select('*')
            .eq('user_id', userId)
            .eq('materi_id', materiId)
            .maybeSingle();
        if (error) {
            console.warn('getMateriProgress:', error.message);
            return null;
        }
        return data;
    }

    async function listUserProgress(userId) {
        const { data, error } = await db()
            .from('user_learning_progress')
            .select('*')
            .eq('user_id', userId)
            .order('last_activity_at', { ascending: false });
        if (error) {
            console.warn('listUserProgress:', error.message);
            return [];
        }
        return data || [];
    }

    async function logActivity(userId, activityType, referenceId, meta) {
        try {
            await db().from('user_activity_log').insert({
                user_id: userId,
                activity_type: activityType,
                reference_id: referenceId ? String(referenceId) : null,
                meta: meta || {},
            });
        } catch (e) {
            console.warn('logActivity:', e);
        }
    }

    async function markMateriRead(userId, materiId, kategoriId) {
        if (!userId || !materiId) return null;

        const existing = await getMateriProgress(userId, materiId);
        if (existing) {
            const { data, error } = await db()
                .from('user_learning_progress')
                .update({
                    last_activity_at: new Date().toISOString(),
                    kategori_id: kategoriId || existing.kategori_id,
                })
                .eq('id', existing.id)
                .select()
                .single();
            if (error) console.warn('markMateriRead update:', error.message);
            else await logActivity(userId, 'materi_read', materiId, { kategori_id: kategoriId });
            return data || existing;
        }

        const { data, error } = await db()
            .from('user_learning_progress')
            .insert({
                user_id: userId,
                materi_id: materiId,
                kategori_id: kategoriId || null,
                status: 'in_progress',
                soal_dijawab: 0,
                soal_benar: 0,
                detail_jawaban: [],
                read_progress: 0,
                last_activity_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) {
            console.warn('markMateriRead insert:', error.message);
            return null;
        }
        await logActivity(userId, 'materi_read', materiId, { kategori_id: kategoriId });
        return data;
    }

    async function saveReadingProgress(userId, materiId, kategoriId, percent, scrollPos) {
        if (!userId || !materiId) return null;
        const readProgress = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
        const scroll = Math.max(0, Math.round(Number(scrollPos) || 0));
        const existing = await getMateriProgress(userId, materiId);

        if (!existing) {
            // First time opening
            const { data, error } = await db()
                .from('user_learning_progress')
                .insert({
                    user_id: userId,
                    materi_id: materiId,
                    kategori_id: kategoriId || null,
                    status: 'in_progress',
                    read_progress: readProgress,
                    ui_state: { scroll: scroll },
                    last_activity_at: new Date().toISOString(),
                })
                .select()
                .single();
            if (!error) await logActivity(userId, 'materi_read', materiId, { kategori_id: kategoriId });
            return data;
        }

        const newState = { ...(existing.ui_state || {}) };
        newState.scroll = scroll;

        const { data, error } = await db()
            .from('user_learning_progress')
            .update({
                read_progress: Math.max(readProgress, existing.read_progress || 0),
                kategori_id: kategoriId || existing.kategori_id,
                ui_state: newState,
                last_activity_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
            .select()
            .single();

        if (error) {
            console.warn('saveReadingProgress:', error.message);
            return existing;
        }
        return data;
    }

    async function saveLatihanComplete(userId, materiId, kategoriId, jawabanHistory) {
        if (!userId || !materiId) return null;

        const compact = compactHistory(jawabanHistory);
        let benar = 0;
        compact.forEach((item) => {
            if (item.jawaban_user && item.kunci_asli && item.jawaban_user === item.kunci_asli) benar++;
            else if (item.jawaban_user && item.kunci_asli) {
                const u = String(item.jawaban_user).replace(/[^a-z0-9]/gi, '').toLowerCase();
                const k = String(item.kunci_asli).replace(/[^a-z0-9]/gi, '').toLowerCase();
                if (u && u === k) benar++;
            }
        });

        const payload = {
            user_id: userId,
            materi_id: materiId,
            kategori_id: kategoriId || null,
            status: 'completed',
            soal_dijawab: compact.length,
            soal_benar: benar,
            detail_jawaban: compact,
            last_activity_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await db()
            .from('user_learning_progress')
            .upsert(payload, { onConflict: 'user_id,materi_id' })
            .select()
            .single();

        if (error) {
            console.warn('saveLatihanComplete:', error.message);
            return null;
        }

        await logActivity(userId, 'latihan_complete', materiId, {
            soal_dijawab: compact.length,
            soal_benar: benar,
            kategori_id: kategoriId,
        });

        try {
            localStorage.setItem(
                `latihan_history_${userId}_${materiId}`,
                JSON.stringify(jawabanHistory)
            );
        } catch (_) {}

        return data;
    }

    async function getLatihanHistory(userId, materiId) {
        const row = await getMateriProgress(userId, materiId);
        if (row && row.status === 'completed' && Array.isArray(row.detail_jawaban) && row.detail_jawaban.length) {
            return expandHistory(row.detail_jawaban);
        }

        try {
            const raw = localStorage.getItem(`latihan_history_${userId}_${materiId}`);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length) {
                    if (row?.status !== 'completed') {
                        saveLatihanComplete(userId, materiId, row?.kategori_id || null, parsed).catch(() => {});
                    }
                    return parsed;
                }
            }
        } catch (_) {}

        return null;
    }

    async function migrateLocalStorage(userId) {
        if (!userId) return 0;
        let migrated = 0;
        const prefix = `latihan_history_${userId}_`;

        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key || !key.startsWith(prefix)) continue;
                const materiId = key.slice(prefix.length);
                if (!materiId) continue;

                const existing = await getMateriProgress(userId, materiId);
                if (existing && existing.status === 'completed') continue;

                const raw = localStorage.getItem(key);
                if (!raw) continue;
                let history;
                try {
                    history = JSON.parse(raw);
                } catch {
                    continue;
                }
                if (!Array.isArray(history) || !history.length) continue;

                let kategoriId = existing?.kategori_id || null;
                if (!kategoriId) {
                    const { data: m } = await db()
                        .from('materi')
                        .select('kategori_id')
                        .eq('id', materiId)
                        .maybeSingle();
                    kategoriId = m?.kategori_id || null;
                }

                const ok = await saveLatihanComplete(userId, materiId, kategoriId, history);
                if (ok) migrated++;
            }
        } catch (e) {
            console.warn('migrateLocalStorage:', e);
        }
        return migrated;
    }

    async function listActivityDates(userId) {
        const dates = new Set();
        try {
            const { data } = await db()
                .from('user_activity_log')
                .select('created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(500);
            (data || []).forEach((row) => {
                if (!row.created_at) return;
                const d = new Date(row.created_at);
                dates.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
            });
        } catch (_) {}

        try {
            const { data } = await db()
                .from('hasil_tryout')
                .select('created_at')
                .eq('user_id', userId);
            (data || []).forEach((row) => {
                if (!row.created_at) return;
                const d = new Date(row.created_at);
                dates.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
            });
        } catch (_) {}

        try {
            const { data } = await db()
                .from('user_learning_progress')
                .select('last_activity_at, completed_at')
                .eq('user_id', userId);
            (data || []).forEach((row) => {
                [row.last_activity_at, row.completed_at].forEach((ts) => {
                    if (!ts) return;
                    const d = new Date(ts);
                    dates.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
                });
            });
        } catch (_) {}

        return dates;
    }

    function calculateStreak(activityDates) {
        if (!activityDates || activityDates.size === 0) return 0;

        const today = new Date();
        const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;
        const dateKeys = Array.from(activityDates);

        if (!dateKeys.includes(todayKey) && !dateKeys.includes(yesterdayKey)) return 0;

        let streak = 0;
        const checkDate = new Date(today);
        if (!dateKeys.includes(todayKey)) {
            checkDate.setDate(checkDate.getDate() - 1);
        }

        while (true) {
            const key = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
            if (dateKeys.includes(key)) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }
        return streak;
    }

    return {
        getMateriProgress,
        listUserProgress,
        markMateriRead,
        saveReadingProgress,
        saveLatihanComplete,
        getLatihanHistory,
        migrateLocalStorage,
        listActivityDates,
        calculateStreak,
        logActivity,
        expandHistory,
        compactHistory,
    };
})();

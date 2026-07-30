// Badge System for Survey Responses
// Determines user badge based on specific survey answers

const BADGE_DEFINITIONS = {
    pembangun_fondasi: {
        code: 'pembangun_fondasi',
        name: 'Pembangun Fondasi',
        description: 'Memulai perjalanan belajar dari dasar yang kuat',
        icon: '🏗️',
    },
    pemburu_latihan: {
        code: 'pemburu_latihan',
        name: 'Pemburu Latihan',
        description: 'Fokus pada latihan dan identifikasi kelemahan',
        icon: '🎯',
    },
    pejuang_konsisten: {
        code: 'pejuang_konsisten',
        name: 'Pejuang Konsisten',
        description: 'Komitmen pada rutinitas dan perencanaan terarah',
        icon: '⚡',
    },
    pengejar_skor: {
        code: 'pengejar_skor',
        name: 'Pengejar Skor',
        description: 'Berfokus pada peningkatan performa dan hasil',
        icon: '🚀',
    },
};

// Priority order: tujuan_utama > tahap_persiapan
// This means we check tujuan_utama first, and only fall back to tahap_persiapan if tujuan doesn't match
function determineBadge(jawaban, questions) {
    // Find the two key questions by their content
    const pertanyaanPersiapan = findQuestionByKeyword(questions, 'tahap persiapan');
    const pertanyaanTujuan = findQuestionByKeyword(questions, 'tujuan utama');

    if (!pertanyaanPersiapan && !pertanyaanTujuan) {
        return null; // No badge if neither question exists
    }

    const jawabanPersiapan = pertanyaanPersiapan ? jawaban[pertanyaanPersiapan.id] : null;
    const jawabanTujuan = pertanyaanTujuan ? jawaban[pertanyaanTujuan.id] : null;

    // PRIORITY 1: Check tujuan_utama (higher priority)
    if (jawabanTujuan) {
        const tujuanLower = String(jawabanTujuan).toLowerCase();

        if (tujuanLower.includes('memahami materi dari dasar')) {
            return BADGE_DEFINITIONS.pembangun_fondasi;
        }
        if (tujuanLower.includes('memperbanyak latihan soal') || tujuanLower.includes('mengetahui kelemahan')) {
            return BADGE_DEFINITIONS.pemburu_latihan;
        }
        if (
            tujuanLower.includes('membuat jadwal belajar') ||
            tujuanLower.includes('mempersiapkan utbk secara lengkap')
        ) {
            return BADGE_DEFINITIONS.pejuang_konsisten;
        }
        if (tujuanLower.includes('meningkatkan nilai tryout')) {
            return BADGE_DEFINITIONS.pengejar_skor;
        }
    }

    // PRIORITY 2: Check tahap_persiapan (fallback)
    if (jawabanPersiapan) {
        const persiapanLower = String(jawabanPersiapan).toLowerCase();

        if (persiapanLower.includes('belum mulai belajar')) {
            return BADGE_DEFINITIONS.pembangun_fondasi;
        }
        if (persiapanLower.includes('sudah belajar secara rutin')) {
            return BADGE_DEFINITIONS.pejuang_konsisten;
        }
        if (persiapanLower.includes('sudah sering mengikuti tryout')) {
            return BADGE_DEFINITIONS.pengejar_skor;
        }
    }

    // Default fallback
    return BADGE_DEFINITIONS.pembangun_fondasi;
}

function findQuestionByKeyword(questions, keyword) {
    const keywordLower = keyword.toLowerCase();
    return questions.find((q) => {
        const pertanyaanText = (q.pertanyaan_html || '').toLowerCase();
        return pertanyaanText.includes(keywordLower);
    });
}

async function assignBadgeToUser(userId, badge, sessionId) {
    if (!badge || !window.db) return null;

    try {
        const { data, error } = await window.db
            .from('user_badges')
            .upsert(
                {
                    user_id: userId,
                    badge_code: badge.code,
                    badge_name: badge.name,
                    badge_description: badge.description,
                    survey_session_id: sessionId,
                },
                { onConflict: 'user_id,badge_code' }
            )
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Failed to assign badge:', err);
        return null;
    }
}

async function getUserBadge(userId) {
    if (!window.db) return null;

    try {
        const { data, error } = await window.db
            .from('user_badges')
            .select('*')
            .eq('user_id', userId)
            .order('assigned_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
        return data;
    } catch (err) {
        console.error('Failed to fetch badge:', err);
        return null;
    }
}

// Export for use in other modules
window.BadgeSystem = {
    determineBadge,
    assignBadgeToUser,
    getUserBadge,
    BADGE_DEFINITIONS,
};

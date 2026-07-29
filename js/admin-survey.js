let parsedSurveyQuestions = [];
let allQuestions = [];
let allResponses = [];
let lastClickedSessionId = null;
let surveyActive = false;

document.addEventListener('DOMContentLoaded', () => {
    const checkAdmin = async () => {
        if (!window.db) return setTimeout(checkAdmin, 100);
        const { data: { user } } = await window.db.auth.getUser();
        if (!user) return (window.location.href = 'login.html');
        const { data: profile } = await window.db.from('profiles').select('role').eq('id', user.id).single();
        if (!profile || profile.role !== 'admin') {
            if (window.showScyraAlert) await window.showScyraAlert('Akses Ditolak.', '⛔ Peringatan', '🚫');
            window.location.href = 'dashboard.html';
            return;
        }
        initPage();
    };
    checkAdmin();
});

async function initPage() {
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    setupUploadForm();
    setupRewardButtons();
    await loadSurveySetting();
    setupSurveyToggle();
    await loadSurveyData();
}

function setupUploadForm() {
    const form = document.getElementById('surveyUploadForm');
    const btnScan = document.getElementById('btnScanSurvey');
    form.onsubmit = async (e) => {
        e.preventDefault();
        btnScan.disabled = true;
        btnScan.textContent = '🤖 AI sedang membaca PDF...';
        parsedSurveyQuestions = [];
        const files = document.getElementById('pdfSurveyFile').files;
        try {
            for (let i = 0; i < files.length; i++) {
                const text = await extractTextFromPDF(files[i]);
                const questions = parseSurveyQuestions(text);
                parsedSurveyQuestions.push(...questions);
            }
            if (parsedSurveyQuestions.length === 0) throw new Error('Tidak ada pertanyaan yang terdeteksi.');
            showPreview();
        } catch (err) {
            await showScyraAlert('Gagal memproses PDF: ' + err.message, '⚠️ Error', '⚠️');
        } finally {
            btnScan.disabled = false;
            btnScan.textContent = '⚡ Scan PDF Survey';
        }
    };
    document.getElementById('btnConfirmSave').onclick = saveSurveyQuestions;
}

async function loadSurveySetting() {
    try {
        const { data } = await window.db
            .from('survey_settings')
            .select('setting_value')
            .eq('setting_key', 'survey_active')
            .single();
        surveyActive = data ? data.setting_value : false;
    } catch (err) {
        surveyActive = false;
    }
    updateSurveyToggleUI();
}

function setupSurveyToggle() {
    const toggle = document.getElementById('surveyToggle');
    if (!toggle) return;
    const label = document.getElementById('surveyToggleLabel');
    const track = document.getElementById('surveyToggleTrack');
    const thumb = document.getElementById('surveyToggleThumb');
    const statusText = document.getElementById('surveyStatusText');
    
    function updateStatus() {
        if (surveyActive) {
            label.textContent = 'Aktif';
            statusText.textContent = 'Survey aktif. Tombol "Mulai Belajar Gratis" akan mengarah ke halaman survey.';
            toggle.checked = true;
            track.style.background = 'var(--brand-primary)';
            thumb.style.transform = 'translateX(26px)';
        } else {
            label.textContent = 'Nonaktif';
            statusText.textContent = 'Survey tidak aktif. Tombol "Mulai Belajar Gratis" kembali ke fungsi normal.';
            toggle.checked = false;
            track.style.background = 'var(--border-color)';
            thumb.style.transform = 'translateX(3px)';
        }
    }
    
    toggle.onchange = async (e) => {
        surveyActive = e.target.checked;
        try {
            const { error } = await window.db
                .from('survey_settings')
                .update({ setting_value: surveyActive, updated_at: new Date().toISOString() })
                .eq('setting_key', 'survey_active');
            if (error) throw error;
            updateStatus();
            await showScyraAlert(surveyActive ? '✅ Survey diaktifkan!' : '✅ Survey dinonaktifkan!', '🚀 Success', '✅');
        } catch (err) {
            surveyActive = !surveyActive;
            updateStatus();
            await showScyraAlert('❌ Gagal: ' + err.message, '⚠️ Error', '⚠️');
        }
    };
    updateStatus();
}

function updateSurveyToggleUI() {
    if (!document.getElementById('surveyToggle')) return;
    const label = document.getElementById('surveyToggleLabel');
    const statusText = document.getElementById('surveyStatusText');
    if (surveyActive) {
        label.textContent = 'Aktif';
        statusText.textContent = 'Survey aktif. Tombol "Mulai Belajar Gratis" akan mengarah ke halaman survey.';
    } else {
        label.textContent = 'Nonaktif';
        statusText.textContent = 'Survey tidak aktif. Tombol "Mulai Belajar Gratis" kembali ke fungsi normal.';
    }
}

async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        let lastY = null;
        let line = '';
        for (const item of content.items) {
            if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                fullText += line.trim() + '\n';
                line = '';
            }
            line += item.str + ' ';
            lastY = item.transform[5];
        }
        if (line.trim()) fullText += line.trim() + '\n';
        fullText += '\n';
    }
    return fullText;
}

/**
 * Parser survey (tanpa kunci):
 * - PG: opsi A-Z, pilih satu
 * - Isian: [ISIAN] / ___
 * - PGK: penanda [PGK]/[MULTI] atau frasa "boleh pilih lebih dari satu"
 */
function parseSurveyQuestions(text) {
    const questions = [];
    const lines = text.split('\n');
    let q = null;
    let currentOpt = null;
    let inPembahasan = false;
    let currentTable = '';
    let currentHalaman = 1;

    const flushQ = () => {
        if (!q || !q.pertanyaan) return;
        if (currentTable) {
            q.pertanyaan = q.pertanyaan.replace(/<\/p>$/, '') + `<table class="tabel-soal">${currentTable}</table><p>`;
            currentTable = '';
        }
        // Deteksi isian (tanpa kunci)
        if (q.pertanyaan.includes('[ISIAN]') || q.pertanyaan.includes('___')) {
            q.pertanyaan = q.pertanyaan.replace(/\[ISIAN\]|_{3,}/g, '<span class="kotak-isian"></span>');
            q.tipe = 'isian';
        }

        // Deteksi PG kompleks via penanda eksplisit (BUKAN kunci jawaban)
        // Contoh: [PGK], [MULTI], [MULTI-SELECT], atau frasa "boleh pilih lebih dari satu"
        const plainQ = stripHtml(q.pertanyaan).toLowerCase();
        const isPgkMarker =
            /\[(?:pgk|multi|multi[\s-]?select|pilihan\s*ganda\s*kompleks)\]/i.test(q.pertanyaan) ||
            /boleh\s+pilih\s+lebih\s+dari\s+satu/.test(plainQ) ||
            /pilih\s+(lebih\s+dari\s+satu|beberapa|semua\s+yang\s+sesuai)/.test(plainQ) ||
            q.forcePgk === true;

        if (isPgkMarker && q.tipe !== 'isian') {
            q.tipe = 'pgk';
            // Bersihkan tag penanda dari teks pertanyaan
            q.pertanyaan = q.pertanyaan
                .replace(/\[(?:pgk|multi|multi[\s-]?select|pilihan\s*ganda\s*kompleks)\]/gi, '')
                .replace(/\s{2,}/g, ' ');
        }

        // Benar/Salah
        const bsMatch = q.pertanyaan.match(/<p>\s*\|\s*(.*?)\s*\|\s*Benar\s*\|\s*Salah\s*\|\s*<\/p>/i);
        if (bsMatch) {
            q.pertanyaan = `<p>${bsMatch[1]}</p>`;
            q.opsi = { A: 'Benar', B: 'Salah' };
            q.tipe = 'bs';
        }

        if (!q.tipe) {
            const hasOpsi = Object.values(q.opsi).some((v) => v && String(v).trim());
            q.tipe = hasOpsi ? 'pg' : 'isian';
        }

        // Survey tidak menyimpan kunci/pembahasan
        delete q.kunci;
        delete q.pembahasan;
        delete q.forcePgk;
        questions.push(q);
    };

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        // Pembatas halaman survey: satu baris berisi minimal 6 tanda "="
        if (/^={6,}$/.test(line)) {
            flushQ();
            q = null;
            currentOpt = null;
            inPembahasan = false;
            currentHalaman++;
            continue;
        }

        if (line.match(/^\|(.+)\|$/)) {
            const cols = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
            currentTable += `<tr>${cols.map((c) => `<td>${c}</td>`).join('')}</tr>`;
            continue;
        } else if (currentTable) {
            const tableHtml = `<table class="tabel-soal">${currentTable}</table>`;
            if (q) q.pertanyaan = q.pertanyaan.replace(/<\/p>$/, '') + tableHtml + '<p>';
            currentTable = '';
        }

        const soalMatch = line.match(/^(\d+)\.\s+(.*)/);
        if (soalMatch) {
            flushQ();
            inPembahasan = false;
            currentOpt = null;
            let pertanyaanText = soalMatch[2];
            // Penanda tipe di baris nomor: "1. [PGK] Pertanyaan..." atau "1. [MULTI] ..."
            let forcePgk = false;
            if (/\[(?:pgk|multi|multi[\s-]?select)\]/i.test(pertanyaanText)) {
                forcePgk = true;
                pertanyaanText = pertanyaanText.replace(/\[(?:pgk|multi|multi[\s-]?select)\]/gi, '').trim();
            }
            q = {
                pertanyaan: `<p>${pertanyaanText}</p>`,
                halaman: currentHalaman,
                opsi: {},
                tipe: null,
                forcePgk,
            };
            continue;
        }

        if (!q) continue;

        // Baris penanda tipe (tanpa kunci): Tipe: multi / PGK / multi-select
        const tipeMatch = line.match(/^(?:tipe|jenis)\s*[:\-]?\s*(pgk|multi|multi[\s-]?select|pilihan\s*ganda\s*kompleks|pg|isian)\s*$/i);
        if (tipeMatch) {
            const t = tipeMatch[1].toLowerCase();
            if (t === 'pg' || t === 'isian') q.tipe = t === 'pg' ? 'pg' : 'isian';
            else q.forcePgk = true;
            currentOpt = null;
            continue;
        }

        const optMatch = line.match(/^([A-Z])\.\s*(.*)/i);
        if (optMatch) {
            currentOpt = optMatch[1].toUpperCase();
            q.opsi[currentOpt] = optMatch[2];
            continue;
        }

        // Abaikan baris kunci/pembahasan jika ada di PDF (survey tidak dinilai)
        if (/^(?:kunci|jawaban|pembahasan)\s*[:\-]?/i.test(line)) {
            currentOpt = null;
            continue;
        }

        if (currentOpt) q.opsi[currentOpt] += ' ' + line;
        else q.pertanyaan = q.pertanyaan.replace(/<\/p>$/, ` <br>${line}</p>`);
    }
    flushQ();
    return questions;
}

function showPreview() {
    const container = document.getElementById('resultsList');
    const resultsDiv = document.getElementById('scanResults');
    const tipeLabel = { pg: '📝 PG', isian: '✏️ Isian', pgk: '☑️ PG Kompleks', bs: '⚖️ B/S' };
    container.innerHTML = `<p style="margin-bottom:1rem;color:var(--brand-primary);font-weight:bold;">🎉 Terdeteksi ${parsedSurveyQuestions.length} pertanyaan!</p>`;

    parsedSurveyQuestions.forEach((q, i) => {
        let opsiHTML = '';
        if (q.tipe === 'isian') {
            opsiHTML = '<p style="color:var(--brand-primary);font-weight:bold;">✏️ Tipe: Isian bebas</p>';
        } else if (q.tipe === 'bs') {
            opsiHTML = '<p style="color:var(--brand-primary);font-weight:bold;">⚖️ Tipe: Benar / Salah</p>';
        } else {
            opsiHTML = Object.entries(q.opsi)
                .map(([label, value]) => `<p><strong>${label}.</strong> ${value || '-'}</p>`)
                .join('');
            if (q.tipe === 'pgk') {
                opsiHTML += `<p style="color:var(--brand-accent);font-weight:bold;">☑️ Multi-select (boleh pilih lebih dari satu)</p>`;
            }
        }
        container.innerHTML += `
            <div class="soal-preview-item">
                <h4>Halaman ${q.halaman || 1} · Q${i + 1} <span class="tipe-badge ${q.tipe}">${tipeLabel[q.tipe] || q.tipe}</span></h4>
                <div style="font-size:0.9rem;margin-bottom:0.75rem;color:var(--text-secondary);">${q.pertanyaan}</div>
                ${opsiHTML}
            </div>`;
    });
    resultsDiv.style.display = 'block';
    resultsDiv.scrollIntoView({ behavior: 'smooth' });
}

async function saveSurveyQuestions() {
    const btn = document.getElementById('btnConfirmSave');
    btn.disabled = true;
    btn.textContent = '⏳ Menyimpan...';
    try {
        const { data: { user } } = await window.db.auth.getUser();
        const replace = document.getElementById('replaceExisting').checked;

        if (replace) {
            await window.db.from('survey_questions').update({ is_active: false }).eq('is_active', true);
        }

        // Urutan lanjutan dari max existing
        const { data: existing } = await window.db
            .from('survey_questions')
            .select('urutan')
            .eq('is_active', true)
            .order('urutan', { ascending: false })
            .limit(1);
        let startUrutan = replace ? 0 : (existing?.[0]?.urutan || 0) + 1;

        let success = 0;
        for (const q of parsedSurveyQuestions) {
            const { error } = await window.db.from('survey_questions').insert({
                urutan: startUrutan++,
                halaman: q.halaman || 1,
                pertanyaan_html: q.pertanyaan,
                opsi_a_html: q.opsi.A || null,
                opsi_b_html: q.opsi.B || null,
                opsi_c_html: q.opsi.C || null,
                opsi_d_html: q.opsi.D || null,
                opsi_e_html: q.opsi.E || null,
                opsi_json: q.opsi,
                tipe_soal: q.tipe || 'pg',
                is_active: true,
                created_by: user.id,
            });
            if (error) throw error;
            success++;
        }

        await showScyraAlert(`${success} pertanyaan survey berhasil disimpan!`, '🚀 Sukses', '🏆');
        document.getElementById('scanResults').style.display = 'none';
        document.getElementById('surveyUploadForm').reset();
        parsedSurveyQuestions = [];
        await loadSurveyData();
    } catch (err) {
        await showScyraAlert('Gagal menyimpan: ' + err.message, '⚠️ Error', '⚠️');
    } finally {
        btn.disabled = false;
        btn.textContent = '✅ Simpan ke Database Survey';
    }
}

async function loadSurveyData() {
    const loading = document.getElementById('loadingSurvey');
    const container = document.getElementById('listPertanyaanContainer');
    const sendAllContainer = document.getElementById('sendAllContainer');
    loading.style.display = 'block';
    container.style.display = 'none';

    try {
        const { data: soalData, error } = await window.db
            .from('survey_questions')
            .select('*')
            .eq('is_active', true)
            .order('urutan', { ascending: true });
        if (error) throw error;
        allQuestions = soalData || [];

        const { data: resData } = await window.db
            .from('survey_responses')
            .select('session_id, survey_question_id, soal_id, jawaban_user, reward_sent, created_at')
            .order('created_at', { ascending: true });
        allResponses = resData || [];

        document.getElementById('totalSurveyQ').textContent = allQuestions.length;
        loading.style.display = 'none';
        container.style.display = 'flex';
        container.innerHTML = '';

        if (allQuestions.length === 0) {
            container.innerHTML =
                '<div style="text-align:center;padding:2rem;color:var(--text-secondary);">Belum ada pertanyaan. Upload PDF di atas.</div>';
        } else {
            const tipeLabel = { pg: '📝 PG', isian: '✏️ Isian', pgk: '☑️ PGK', bs: '⚖️ B/S' };
            allQuestions.forEach((soal, index) => {
                const tanggapan = allResponses.filter(
                    (r) => r.survey_question_id === soal.id || r.soal_id === soal.id
                );
                const box = document.createElement('div');
                box.style.cssText =
                    'padding:1rem;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:12px;cursor:pointer;transition:border-color 0.2s;';
                box.onmouseover = () => (box.style.borderColor = 'var(--brand-primary)');
                box.onmouseout = () => (box.style.borderColor = 'var(--border-color)');
                box.innerHTML = `
                    <div style="font-weight:600;margin-bottom:0.5rem;">
                        Q${index + 1}
                        <span style="font-size:0.75rem;font-weight:600;margin-left:0.4rem;color:var(--brand-primary);">${tipeLabel[soal.tipe_soal] || soal.tipe_soal}</span>
                        : ${stripHtml(soal.pertanyaan_html).substring(0, 70)}...
                    </div>
                    <div style="font-size:0.85rem;color:var(--text-secondary);">
                        <span style="background:rgba(135,168,120,0.15);color:var(--brand-primary-dark);padding:0.2rem 0.6rem;border-radius:20px;font-weight:600;">
                            ${tanggapan.length} Tanggapan
                        </span>
                        <span style="margin-left:0.5rem;opacity:0.7;">(Klik untuk detail)</span>
                    </div>`;
                box.onclick = () => renderDetail(soal, tanggapan, index + 1);
                container.appendChild(box);
            });
        }

        const pendingSessions = getPendingSessions(allResponses);
        const totalUsers = new Set(allResponses.map((r) => r.session_id)).size;
        const sentCount = totalUsers - pendingSessions.length;
        document.getElementById('pendingCountText').textContent =
            `${pendingSessions.length} user belum dikirim reward (${sentCount} sudah dikirim dari total ${totalUsers} partisipan).`;
        sendAllContainer.style.display = totalUsers > 0 ? 'block' : 'none';
    } catch (err) {
        loading.innerHTML = `<div style="color:var(--error);">❌ ${err.message}</div>`;
    }
}

function getPendingSessions(responses) {
    const sessionMap = {};
    responses.forEach((r) => {
        if (!sessionMap[r.session_id]) sessionMap[r.session_id] = { sent: false };
        if (r.reward_sent) sessionMap[r.session_id].sent = true;
    });
    return Object.entries(sessionMap)
        .filter(([, v]) => !v.sent)
        .map(([k]) => k);
}

function renderDetail(soal, tanggapan, index) {
    document.getElementById('hasilDetailContainer').style.display = 'block';
    document.getElementById('hasilDetailTitle').textContent = `Detail Q${index}`;
    document.getElementById('hasilDetailStats').innerHTML = `
        <strong>Pertanyaan:</strong><br>
        <div style="margin:0.5rem 0 1rem;padding:1rem;background:var(--bg-primary);border-radius:8px;">${soal.pertanyaan_html}</div>
        Total <strong>${tanggapan.length}</strong> user menjawab.
    `;
    const listContainer = document.getElementById('hasilDetailList');
    listContainer.innerHTML = '';
    document.getElementById('btnSendRewardToSession').style.display = 'none';

    if (tanggapan.length === 0) {
        listContainer.innerHTML =
            '<div style="color:var(--text-muted);text-align:center;padding:2rem;">Belum ada tanggapan.</div>';
        return;
    }

    if (soal.tipe_soal === 'isian') {
        tanggapan.forEach((t) => {
            listContainer.innerHTML += `
                <div style="background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;padding:1rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
                    <span style="color:var(--text-primary);">"${escapeHtml(t.jawaban_user)}"</span>
                    <span style="font-size:0.8rem;color:${t.reward_sent ? 'var(--success)' : 'var(--text-muted)'};">
                        ${t.reward_sent ? '✅ Reward sent' : `<button class="btn-action" style="padding:0.3rem 0.6rem;font-size:0.85rem;" data-session-id="${t.session_id}">Kirim Reward</button>`}
                    </span>
                </div>`;
        });
        listContainer.querySelectorAll('[data-session-id]').forEach((btn) => {
            btn.onclick = (e) => {
                e.stopPropagation();
                lastClickedSessionId = btn.getAttribute('data-session-id');
                const sendBtn = document.getElementById('btnSendRewardToSession');
                sendBtn.style.display = 'block';
                sendBtn.textContent = `📨 Kirim Reward ke ${lastClickedSessionId.substring(0, 14)}…`;
            };
        });
    } else {
        // Agregat PG / PGK / BS
        const counts = {};
        tanggapan.forEach((t) => {
            // PGK bisa "A,C" — pecah
            const parts = String(t.jawaban_user || 'Kosong')
                .split(/[,;+\s]+/)
                .map((x) => x.trim())
                .filter(Boolean);
            if (parts.length === 0) parts.push('Kosong');
            parts.forEach((ans) => {
                counts[ans] = (counts[ans] || 0) + 1;
            });
        });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        sorted.forEach(([ans, count]) => {
            const pct = Math.round((count / tanggapan.length) * 100);
            const optionText = soal.opsi_json?.[ans] || soal[`opsi_${ans.toLowerCase()}_html`];
            const label = optionText
                ? `${ans}. ${stripHtml(optionText).substring(0, 40)}`
                : ans;
            listContainer.innerHTML += `
                <div style="background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;padding:1rem;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:0.5rem;">
                        <strong>${escapeHtml(label)}</strong>
                        <span style="color:var(--brand-primary);font-weight:bold;">${pct}% (${count})</span>
                    </div>
                    <div style="width:100%;height:8px;background:var(--bg-secondary);border-radius:4px;overflow:hidden;">
                        <div style="height:100%;width:${pct}%;background:var(--brand-primary);border-radius:4px;"></div>
                    </div>
                </div>`;
        });
    }
    document.getElementById('hasilDetailContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setupRewardButtons() {
    document.getElementById('btnSendRewardToSession').addEventListener('click', async () => {
        if (!lastClickedSessionId) return;
        await sendReward(lastClickedSessionId);
    });

    document.getElementById('btnSendAllRewards').addEventListener('click', async () => {
        const pending = getPendingSessions(allResponses);
        if (pending.length === 0) {
            await showScyraAlert('Semua user sudah dikirim reward.', '✅ Selesai', '✅');
            return;
        }
        const confirmed = await showScyraConfirm(
            `Akan mengirim reward ke ${pending.length} user. Lanjutkan?`,
            '📨 Kirim Semua?',
            '⚠️'
        );
        if (!confirmed) return;

        const progressDiv = document.getElementById('sendAllProgress');
        const btn = document.getElementById('btnSendAllRewards');
        progressDiv.style.display = 'block';
        btn.disabled = true;
        let success = 0;
        let failed = 0;
        const errors = [];

        for (let i = 0; i < pending.length; i++) {
            progressDiv.innerHTML = `<div style="display:flex;align-items:center;gap:0.5rem;"><div class="spinner-sage" style="width:18px;height:18px;"></div> Mengirim ${i + 1}/${pending.length}...</div>`;
            try {
                const res = await sendRewardSingle(pending[i]);
                if (res.success) success++;
                else {
                    failed++;
                    errors.push(res.error);
                }
            } catch (e) {
                failed++;
                errors.push(e.message);
            }
        }
        btn.disabled = false;
        progressDiv.innerHTML = `<strong>Selesai!</strong> ✅ ${success} berhasil, ❌ ${failed} gagal.${
            errors.length
                ? '<br><small style="color:var(--error);">' + errors.slice(0, 3).join('<br>') + '</small>'
                : ''
        }`;
        await loadSurveyData();
    });
}

async function sendReward(sessionId) {
    const btn = document.getElementById('btnSendRewardToSession');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Mengirim...';
    try {
        const res = await sendRewardSingle(sessionId);
        if (res.success) await showScyraAlert('Reward terkirim via email.', '🎉 Sukses', '✅');
        else await showScyraAlert('Gagal: ' + res.error, '⚠️ Error', '⚠️');
    } catch (e) {
        await showScyraAlert('Error: ' + e.message, '⚠️ Error', '⚠️');
    }
    btn.disabled = false;
    btn.textContent = orig;
    btn.style.display = 'none';
    await loadSurveyData();
}

async function sendRewardSingle(sessionId) {
    const { data, error } = await window.db.functions.invoke('send-survey-reward', {
        body: { sessionId },
    });
    if (error) {
        let msg = error.message || 'Gagal';
        try {
            const d = await error.context.json();
            msg = d.error || msg;
        } catch (_) {}
        return { success: false, error: msg };
    }
    if (!data?.success) return { success: false, error: data?.error || 'Gagal dari server' };
    return { success: true };
}

function stripHtml(html) {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html || '';
    return tmp.textContent || tmp.innerText || '';
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

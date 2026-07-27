document.addEventListener('DOMContentLoaded', async () => {
    const isSurveyDone = localStorage.getItem('scyra_survey_done');
    const surveyContainer = document.getElementById('surveyContent');
    const badge = document.getElementById('surveyBadge');

    if (isSurveyDone) {
        badge.textContent = '✅ Survey Selesai';
        surveyContainer.innerHTML = `
            <div style="text-align:center;padding:3rem 1rem;">
                <div style="font-size:4rem;margin-bottom:1rem;">🙌</div>
                <h2 style="color:var(--text-primary);margin-bottom:1rem;">Terima Kasih!</h2>
                <p style="color:var(--text-secondary);margin-bottom:2rem;">Kamu sudah pernah menyelesaikan survey ini sebelumnya.</p>
                <a href="index.html" class="btn-primary-lg">Kembali ke Beranda</a>
            </div>`;
        return;
    }

    const state = { pages: [], currentPage: 0, jawaban: {} };

    function getSessionId() {
        let sid = localStorage.getItem('scyra_survey_session');
        if (!sid) {
            sid = 'anon_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
            localStorage.setItem('scyra_survey_session', sid);
        }
        return sid;
    }

    const waitForDb = setInterval(async () => {
        if (!window.db) return;
        clearInterval(waitForDb);
        await fetchSurveyQuestions();
    }, 100);

    async function fetchSurveyQuestions() {
        try {
            const { data, error } = await window.db
                .from('survey_questions')
                .select('*')
                .eq('is_active', true)
                .order('halaman', { ascending: true })
                .order('urutan', { ascending: true });
            if (error) throw error;
            if (!data?.length) return showEmpty('Belum ada pertanyaan survey. Admin belum mengunggah PDF survey.');

            const pageMap = new Map();
            data.forEach((q) => {
                const page = q.halaman || 1;
                if (!pageMap.has(page)) pageMap.set(page, []);
                pageMap.get(page).push(q);
            });
            state.pages = [...pageMap.values()];
            renderPage(0);
        } catch (err) {
            console.error(err);
            showEmpty('Gagal memuat pertanyaan survey.');
        }
    }

    function showEmpty(message) {
        badge.textContent = '🚧 Kosong';
        surveyContainer.innerHTML = `<div style="text-align:center;padding:3rem 1rem;color:var(--text-secondary);">${message}</div>`;
    }

    function getOptions(question) {
        const jsonOptions = question.opsi_json || {};
        if (Object.keys(jsonOptions).length) return jsonOptions;
        const fallback = {};
        ['A', 'B', 'C', 'D', 'E'].forEach((label) => {
            const value = question[`opsi_${label.toLowerCase()}_html`];
            if (value) fallback[label] = value;
        });
        return fallback;
    }

    function renderPage(pageIndex) {
        state.currentPage = pageIndex;
        const questions = state.pages[pageIndex];
        const isLastPage = pageIndex === state.pages.length - 1;
        badge.textContent = `Halaman ${pageIndex + 1} dari ${state.pages.length}`;

        surveyContainer.innerHTML = `
            <div class="survey-page-intro">
                <h2 style="color:var(--text-primary);margin-bottom:0.3rem;">Survey Scyra</h2>
                <p style="color:var(--text-secondary);">Jawab seluruh pertanyaan pada halaman ini.</p>
            </div>
            <div id="surveyQuestionsList" style="display:flex;flex-direction:column;gap:1.5rem;"></div>
            <button id="btnNextSurveyPage" class="btn-lanjut-bab" style="margin-top:2rem;background:var(--brand-primary);color:white;width:100%;">
                ${isLastPage ? 'Dapatkan Akses Trial Gratis' : 'Lanjut ke Halaman Berikutnya →'}
            </button>`;

        const list = document.getElementById('surveyQuestionsList');
        questions.forEach((question, i) => list.appendChild(createQuestionCard(question, i + 1)));

        document.getElementById('btnNextSurveyPage').onclick = async () => {
            if (!collectAndValidatePage(questions)) return;
            if (isLastPage) await submitSurvey();
            else {
                renderPage(pageIndex + 1);
                document.querySelector('.dashboard-body')?.scrollTo({ top: 0, behavior: 'smooth' });
            }
        };
    }

    function createQuestionCard(question, number) {
        const card = document.createElement('section');
        card.className = 'soal-container';
        card.dataset.questionId = question.id;
        card.dataset.type = question.tipe_soal || 'pg';
        card.style.margin = '0';

        const type = question.tipe_soal || 'pg';
        const saved = state.jawaban[question.id] || '';
        const options = getOptions(question);
        let inputHtml = '';

        if (type === 'isian') {
            inputHtml = `<input type="text" class="survey-input-large survey-answer" value="${escapeAttribute(saved)}" placeholder="Ketik jawabanmu..." autocomplete="off">`;
        } else if (type === 'pgk') {
            const selected = String(saved).split(',');
            inputHtml = Object.entries(options).map(([label, text]) => `
                <label class="opsi-item-box" style="display:flex;align-items:center;gap:0.75rem;cursor:pointer;">
                    <input type="checkbox" class="survey-answer pgk-answer" value="${label}" ${selected.includes(label) ? 'checked' : ''} style="width:18px;height:18px;flex-shrink:0;">
                    <div class="huruf-opsi">${label}.</div><div style="flex:1;">${text}</div>
                </label>`).join('');
        } else if (type === 'bs') {
            inputHtml = [['A', 'Benar'], ['B', 'Salah']].map(([label, text]) => `
                <label class="opsi-item-box" style="display:flex;align-items:center;gap:0.75rem;cursor:pointer;">
                    <input type="radio" class="survey-answer" name="survey_${question.id}" value="${label}" ${saved === label ? 'checked' : ''} style="width:18px;height:18px;flex-shrink:0;">
                    <div class="huruf-opsi">${label}.</div><div style="flex:1;">${text}</div>
                </label>`).join('');
        } else {
            inputHtml = Object.entries(options).map(([label, text]) => `
                <label class="opsi-item-box" style="display:flex;align-items:center;gap:0.75rem;cursor:pointer;">
                    <input type="radio" class="survey-answer" name="survey_${question.id}" value="${label}" ${saved === label ? 'checked' : ''} style="width:18px;height:18px;flex-shrink:0;">
                    <div class="huruf-opsi">${label}.</div><div style="flex:1;">${text}</div>
                </label>`).join('');
        }

        card.innerHTML = `
            <div class="teks-soal" style="margin-bottom:1rem;"><strong style="color:var(--brand-primary);">${number}.</strong> ${question.pertanyaan_html}</div>
            <div class="opsi-container" style="display:flex;flex-direction:column;gap:0.75rem;">${inputHtml}</div>
            <p class="survey-validation" style="display:none;color:var(--error);margin-top:0.75rem;font-size:0.9rem;">Jawaban ini wajib diisi.</p>`;
        return card;
    }

    function collectAndValidatePage(questions) {
        let valid = true;
        questions.forEach((question) => {
            const card = document.querySelector(`[data-question-id="${question.id}"]`);
            const type = question.tipe_soal || 'pg';
            let answer = '';
            if (type === 'isian') answer = card.querySelector('.survey-answer')?.value.trim() || '';
            else if (type === 'pgk') answer = [...card.querySelectorAll('.pgk-answer:checked')].map((x) => x.value).sort().join(',');
            else answer = card.querySelector('.survey-answer:checked')?.value || '';

            const error = card.querySelector('.survey-validation');
            if (!answer) {
                valid = false;
                error.style.display = 'block';
                card.style.borderColor = 'var(--error)';
            } else {
                state.jawaban[question.id] = answer;
                error.style.display = 'none';
                card.style.borderColor = 'var(--border-color)';
            }
        });
        if (!valid) document.querySelector('.survey-validation[style*="block"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return valid;
    }

    async function submitSurvey() {
        badge.textContent = '🔄 Menyimpan...';
        surveyContainer.innerHTML = `<div style="text-align:center;padding:4rem 1rem;"><div class="spinner-sage" style="margin:0 auto 1.5rem;"></div><p>Menyimpan tanggapanmu...</p></div>`;
        try {
            const payloads = Object.entries(state.jawaban).map(([questionId, answer]) => ({
                session_id: getSessionId(),
                survey_question_id: questionId,
                jawaban_user: answer,
            }));
            const { error } = await window.db.from('survey_responses').insert(payloads);
            if (error) throw error;
            localStorage.setItem('scyra_survey_done', 'true');
            badge.textContent = '✅ Selesai';
            surveyContainer.innerHTML = `
                <div style="text-align:center;padding:3rem 1rem;">
                    <div style="font-size:4rem;margin-bottom:1rem;">🎉</div>
                    <h2 style="color:var(--text-primary);margin-bottom:1rem;">Terima Kasih!</h2>
                    <p style="color:var(--text-secondary);margin-bottom:2rem;">Tanggapanmu telah tersimpan. Akses trial gratis akan dikirim ke emailmu setelah kami meninjau survey.</p>
                    <a href="index.html" class="btn-primary-lg">Kembali ke Beranda</a>
                </div>`;
        } catch (err) {
            console.error(err);
            surveyContainer.innerHTML = `<div style="text-align:center;padding:3rem 1rem;"><h2 style="color:var(--error);">Gagal Menyimpan</h2><p style="color:var(--text-secondary);margin:1rem 0;">${err.message || 'Coba periksa koneksi internetmu.'}</p><button class="btn-primary-lg" onclick="location.reload()">Coba Lagi</button></div>`;
        }
    }

    function escapeAttribute(value) {
        return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
});

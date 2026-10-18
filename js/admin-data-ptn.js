document.addEventListener('DOMContentLoaded', () => {
    const pageSize = 20;
    let currentPage = 0;
    let totalCount = 0;
    let searchTimer;

    const elements = {
        search: document.getElementById('ptnSearch'), type: document.getElementById('ptnTypeFilter'), table: document.getElementById('ptnTableWrap'),
        previous: document.getElementById('btnPtnPrevious'), next: document.getElementById('btnPtnNext'), pageInfo: document.getElementById('ptnPageInfo'),
        modal: document.getElementById('ptnDetailModal'), detailTitle: document.getElementById('ptnDetailTitle'), detail: document.getElementById('ptnDetailContent')
    };

    init();
    elements.search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { currentPage = 0; loadPtn(); }, 250); });
    elements.type.addEventListener('change', () => { currentPage = 0; loadPtn(); });
    elements.previous.addEventListener('click', () => { if (currentPage) { currentPage--; loadPtn(); } });
    elements.next.addEventListener('click', () => { if ((currentPage + 1) * pageSize < totalCount) { currentPage++; loadPtn(); } });
    document.getElementById('btnClosePtnDetail').addEventListener('click', () => elements.modal.classList.remove('active'));
    elements.modal.addEventListener('click', event => {
        if (event.target === elements.modal) elements.modal.classList.remove('active');
    });
    elements.table.addEventListener('click', event => {
        const button = event.target.closest('[data-ptn-id]');
        if (button) showDetail(button.dataset.ptnId);
    });

    async function init() {
        if (!window.db) return setTimeout(init, 100);
        const { data: { user } } = await window.db.auth.getUser();
        if (!user) return window.location.href = 'login.html';
        const { data: profile } = await window.db.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role !== 'admin') return window.location.href = 'dashboard.html';
        await loadStats();
        await loadPtn();
    }

    async function loadStats() {
        const [ptn, prodi, capacity] = await Promise.all([
            window.db.from('ptn').select('*', { count: 'exact', head: true }),
            window.db.from('prodi').select('*', { count: 'exact', head: true }).eq('aktif', true),
            window.db.from('prodi_daya_tampung').select('*', { count: 'exact', head: true })
        ]);
        document.getElementById('statPtnCount').textContent = ptn.count ?? 0;
        document.getElementById('statProdiCount').textContent = prodi.count ?? 0;
        document.getElementById('statCapacityCount').textContent = capacity.count ?? 0;
    }

    async function loadPtn() {
        elements.table.innerHTML = '<p class="ptn-browser-empty">Memuat data PTN...</p>';
        let query = window.db.from('ptn').select('id,kode_ptn,nama_ptn,jenis_ptn,provinsi,prodi(count)', { count: 'exact' }).order('nama_ptn').range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);
        const keyword = elements.search.value.trim();
        if (keyword) query = query.or(`nama_ptn.ilike.%${keyword}%,kode_ptn.ilike.%${keyword}%`);
        if (elements.type.value) query = query.eq('jenis_ptn', elements.type.value);
        const { data, error, count } = await query;
        if (error) { elements.table.innerHTML = `<p class="ptn-browser-empty">Gagal memuat data: ${escapeHtml(error.message)}</p>`; return; }
        totalCount = count || 0;
        elements.table.innerHTML = data?.length ? `<table class="ptn-data-table"><thead><tr><th>Kode</th><th>PTN</th><th>Jenis</th><th>Provinsi</th><th>Prodi</th><th></th></tr></thead><tbody>${data.map(item => `<tr><td class="ptn-code">${escapeHtml(item.kode_ptn)}</td><td>${escapeHtml(item.nama_ptn)}</td><td>${escapeHtml(item.jenis_ptn || '-')}</td><td>${escapeHtml(item.provinsi || '-')}</td><td>${item.prodi?.[0]?.count || 0}</td><td><button class="ptn-view-button" data-ptn-id="${item.id}">Detail</button></td></tr>`).join('')}</tbody></table>` : '<p class="ptn-browser-empty">Tidak ada PTN yang cocok.</p>';
        elements.pageInfo.textContent = totalCount ? `Halaman ${currentPage + 1} dari ${Math.ceil(totalCount / pageSize)}` : 'Tidak ada data';
        elements.previous.disabled = currentPage === 0;
        elements.next.disabled = (currentPage + 1) * pageSize >= totalCount;
    }

    async function showDetail(ptnId) {
        elements.modal.classList.add('active');
        elements.detailTitle.textContent = 'Memuat detail PTN...';
        elements.detail.innerHTML = '<p class="ptn-browser-empty">Memuat prodi...</p>';
        const { data: ptn, error } = await window.db.from('ptn').select('id,kode_ptn,nama_ptn,jenis_ptn,provinsi,website,alamat,keterangan,prodi(id,kode_prodi,nama_prodi,jurusan,jenjang,rumpun,aktif,prodi_daya_tampung(tahun,jalur,daya_tampung,peminat,terima),prodi_estimasi_skor(tahun_target,estimasi_skor_min,estimasi_skor_aman,confidence_label),prodi_subtes_prioritas(nama_subtes,urutan_prioritas))').eq('id', ptnId).single();
        if (error || !ptn) { elements.detail.innerHTML = `<p class="ptn-browser-empty">Gagal memuat detail: ${escapeHtml(error?.message || 'Tidak ditemukan')}</p>`; return; }
        elements.detailTitle.textContent = `${ptn.kode_ptn} - ${ptn.nama_ptn}`;
        const prodiCards = (ptn.prodi || []).sort((a, b) => a.nama_prodi.localeCompare(b.nama_prodi, 'id')).map(prodi => {
            const capacity = [...(prodi.prodi_daya_tampung || [])].sort((a, b) => b.tahun - a.tahun)[0];
            const score = [...(prodi.prodi_estimasi_skor || [])].sort((a, b) => b.tahun_target - a.tahun_target)[0];
            const subtests = [...(prodi.prodi_subtes_prioritas || [])].sort((a, b) => a.urutan_prioritas - b.urutan_prioritas);
            return `<article class="ptn-prodi-card"><div class="ptn-prodi-head"><div><h4>${escapeHtml(prodi.nama_prodi)}</h4><p>${escapeHtml(prodi.kode_prodi || '-')} · ${escapeHtml(prodi.jenjang)} · ${escapeHtml(prodi.rumpun || '-')} ${prodi.jurusan ? `· ${escapeHtml(prodi.jurusan)}` : ''}</p></div><span class="ptn-score">${score ? `${formatNumber(score.estimasi_skor_min)} - ${formatNumber(score.estimasi_skor_aman)}` : 'Belum ada estimasi'}</span></div><div class="ptn-prodi-details"><span>Kuota <strong>${capacity ? formatNumber(capacity.daya_tampung) : '-'}</strong></span><span>Peminat <strong>${capacity ? formatNumber(capacity.peminat) : '-'}</strong></span><span>Tahun <strong>${capacity?.tahun || '-'}</strong></span></div>${subtests.length ? `<div class="ptn-subtest-tags">${subtests.map(item => `<span>${item.urutan_prioritas}. ${escapeHtml(item.nama_subtes)}</span>`).join('')}</div>` : ''}</article>`;
        }).join('') || '<p class="ptn-browser-empty">Belum ada prodi untuk PTN ini.</p>';
        elements.detail.innerHTML = `<div class="ptn-detail-meta"><span>${escapeHtml(ptn.jenis_ptn || '-')}</span>${ptn.provinsi ? `<span>${escapeHtml(ptn.provinsi)}</span>` : ''}${ptn.website ? `<span>${escapeHtml(ptn.website)}</span>` : ''}</div>${ptn.keterangan ? `<p>${escapeHtml(ptn.keterangan)}</p>` : ''}<h4>Program Studi (${ptn.prodi?.length || 0})</h4><div class="ptn-prodi-grid">${prodiCards}</div>`;
    }

    function formatNumber(value) { return value == null ? '-' : new Intl.NumberFormat('id-ID').format(value); }
    function escapeHtml(value) { const element = document.createElement('div'); element.textContent = value == null ? '' : String(value); return element.innerHTML; }
});

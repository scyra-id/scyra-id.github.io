(function () {
    'use strict';
    let currentUser = null;
    const $ = (id) => document.getElementById(id);
    const escapeText = (value) => String(value || '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;' }[char]));
    const formatDate = (value) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle:'medium', timeStyle:'short' }).format(new Date(value)) : 'Tidak dibatasi';

    async function waitForDb() { while (!window.db) await new Promise(resolve => setTimeout(resolve, 80)); }
    async function verifyAdmin() {
        await waitForDb();
        const { data: { user } } = await window.db.auth.getUser();
        if (!user) { window.location.href = 'login.html'; return false; }
        const { data: profile } = await window.db.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role !== 'admin') { window.location.href = 'dashboard.html'; return false; }
        currentUser = user;
        $('announcementAdminLoading').hidden = true;
        $('announcementAdminContent').hidden = false;
        return true;
    }
    function resetForm() {
        $('announcementForm').reset(); $('announcementId').value = '';
        $('announcementFormTitle').textContent = 'Buat Pengumuman';
    }
    function getPayload(status) {
        const expiresValue = $('announcementExpires').value;
        const linkUrl = $('announcementLink').value.trim();
        if (linkUrl && (/^(https?:)?\/\//i.test(linkUrl) || linkUrl.startsWith('/'))) throw new Error('Gunakan tautan internal relatif, misalnya tryout.html.');
        return { title: $('announcementTitle').value.trim(), content: $('announcementContent').value.trim(), link_url: linkUrl || null, expires_at: expiresValue ? new Date(expiresValue).toISOString() : null, status, created_by: currentUser.id };
    }
    async function saveAnnouncement(event) {
        event.preventDefault();
        const status = event.submitter?.value || 'draft';
        const button = event.submitter;
        try {
            const payload = getPayload(status);
            if (!payload.title || !payload.content) throw new Error('Judul dan isi pengumuman wajib diisi.');
            button.disabled = true;
            const id = $('announcementId').value;
            let error;
            if (id) ({ error } = await window.db.from('admin_announcements').update(payload).eq('id', id));
            else ({ error } = await window.db.from('admin_announcements').insert(payload));
            if (error) throw error;
            if (window.showScyraAlert) await window.showScyraAlert(status === 'published' ? 'Pengumuman diterbitkan ke seluruh pengguna.' : 'Draft pengumuman disimpan.', '✅ Berhasil', '📣');
            resetForm(); await loadAnnouncements();
        } catch (error) {
            if (window.showScyraAlert) await window.showScyraAlert(error.message, 'Gagal menyimpan', '⚠️');
            else alert(error.message);
        } finally { if (button) button.disabled = false; }
    }
    async function loadAnnouncements() {
        const list = $('announcementListAdmin');
        const { data, error } = await window.db.from('admin_announcements').select('*').order('created_at', { ascending:false });
        if (error) { list.innerHTML = '<p class="announcement-list-empty">Gagal memuat pengumuman.</p>'; return; }
        if (!data?.length) { list.innerHTML = '<p class="announcement-list-empty">Belum ada pengumuman.</p>'; return; }
        list.innerHTML = data.map(item => `<article class="announcement-list-item"><div><h3>${escapeText(item.title)}</h3><p>${escapeText(item.content)}</p><div class="announcement-list-meta">Dibuat ${formatDate(item.created_at)} · Berakhir: ${formatDate(item.expires_at)}${item.link_url ? ` · Tujuan: ${escapeText(item.link_url)}` : ''}</div></div><div class="announcement-list-actions"><span class="announcement-status ${item.status}">${item.status === 'published' ? 'Terbit' : item.status === 'archived' ? 'Arsip' : 'Draft'}</span><button type="button" class="announcement-btn secondary" data-edit="${item.id}">Edit</button>${item.status === 'published' ? `<button type="button" class="announcement-btn secondary" data-archive="${item.id}">Arsipkan</button>` : ''}</div></article>`).join('');
        list.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => editAnnouncement(data.find(item => item.id === button.dataset.edit))));
        list.querySelectorAll('[data-archive]').forEach(button => button.addEventListener('click', () => archiveAnnouncement(button.dataset.archive)));
    }
    function editAnnouncement(item) {
        if (!item) return;
        $('announcementId').value = item.id; $('announcementTitle').value = item.title; $('announcementContent').value = item.content; $('announcementLink').value = item.link_url || '';
        $('announcementExpires').value = item.expires_at ? new Date(item.expires_at).toISOString().slice(0, 16) : '';
        $('announcementFormTitle').textContent = 'Edit Pengumuman';
        document.querySelector('.dashboard-body')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    async function archiveAnnouncement(id) {
        const confirmed = window.showScyraConfirm ? await window.showScyraConfirm('Arsipkan pengumuman ini? Highlight dan notifikasi aktif akan dihentikan.', 'Arsipkan Pengumuman', '📦') : confirm('Arsipkan pengumuman ini?');
        if (!confirmed) return;
        const { error } = await window.db.from('admin_announcements').update({ status: 'archived' }).eq('id', id);
        if (error) { if (window.showScyraAlert) await window.showScyraAlert(error.message, 'Gagal mengarsipkan', '⚠️'); return; }
        await loadAnnouncements();
    }
    document.addEventListener('DOMContentLoaded', async () => {
        if (!await verifyAdmin()) return;
        $('announcementForm').addEventListener('submit', saveAnnouncement);
        $('announcementReset').addEventListener('click', resetForm);
        $('refreshAnnouncements').addEventListener('click', loadAnnouncements);
        await loadAnnouncements();
    });
})();

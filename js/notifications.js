/* Global notification center for authenticated Scyra users. */
(function () {
    'use strict';

    const MAIN_MENU_PAGES = new Set([
        'dashboard.html', 'materi.html', 'tryout.html', 'riwayat.html', 'paketbelajar.html', 'kontak.html'
    ]);
    const MAX_DROPDOWN_ITEMS = 20;
    let userId = null;
    let notifications = [];
    let realtimeChannel = null;

    const $ = (id) => document.getElementById(id);
    const getPageName = () => (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

    function escapeText(value) {
        return String(value || '').replace(/[&<>'"]/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
        }[char]));
    }

    function relativeTime(value) {
        const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
        if (seconds < 60) return 'Baru saja';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} menit lalu`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} jam lalu`;
        if (seconds < 172800) return 'Kemarin';
        return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
    }

    function isActive(notification) {
        return !notification.expires_at || new Date(notification.expires_at).getTime() > Date.now();
    }

    function setVisible(isVisible) {
        const center = $('notificationCenter');
        if (center) center.hidden = !isVisible;
    }

    async function fetchNotifications() {
        if (!userId || !window.db) return;
        const { data, error } = await window.db
            .from('user_notifications')
            .select('id, source, event_type, title, message, link_url, announcement_id, is_read, read_at, expires_at, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        notifications = (data || []).filter(isActive);
        render();
    }

    function renderBadge() {
        const badge = $('notifBadge');
        if (!badge) return;
        const unread = notifications.filter(item => !item.is_read).length;
        badge.style.display = unread ? 'flex' : 'none';
        badge.textContent = unread > 99 ? '99+' : String(unread);
    }

    function renderList() {
        const list = $('notificationList');
        if (!list) return;
        const visibleItems = notifications.slice(0, MAX_DROPDOWN_ITEMS);
        if (!visibleItems.length) {
            list.innerHTML = '<p class="notification-empty">Belum ada notifikasi.</p>';
            return;
        }

        list.innerHTML = visibleItems.map(item => {
            const icon = item.source === 'admin' ? '📣' : '⚙️';
            const source = item.source === 'admin' ? 'Admin' : 'Sistem';
            return `<button type="button" class="notification-item${item.is_read ? '' : ' is-unread'}" data-notification-id="${item.id}">
                <span class="notification-item__icon" aria-hidden="true">${icon}</span>
                <span class="notification-item__content">
                    <span class="notification-item__meta">${source}${item.is_read ? '' : ' · Baru'}</span>
                    <strong>${escapeText(item.title)}</strong>
                    <span class="notification-item__message">${escapeText(item.message)}</span>
                    <time>${relativeTime(item.created_at)}</time>
                </span>
            </button>`;
        }).join('');
    }

    function renderHighlight() {
        document.querySelectorAll('.announcement-highlight').forEach(node => node.remove());
        if (!MAIN_MENU_PAGES.has(getPageName())) return;

        const body = document.querySelector('.dashboard-body');
        const latest = notifications.find(item => item.source === 'admin' && item.event_type === 'announcement' && isActive(item));
        if (!body || !latest) return;

        const card = document.createElement('article');
        card.className = `announcement-highlight${latest.is_read ? '' : ' is-unread'}`;
        card.dataset.notificationId = latest.id;
        card.innerHTML = `
            <div class="announcement-highlight__icon" aria-hidden="true">📣</div>
            <div class="announcement-highlight__content">
                <div class="announcement-highlight__eyebrow">Pengumuman terbaru${latest.is_read ? '' : '<span>Baru</span>'}</div>
                <h2>${escapeText(latest.title)}</h2>
                <p>${escapeText(latest.message)}</p>
                <time>${new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(latest.created_at))}</time>
            </div>
            <button type="button" class="announcement-highlight__action" data-notification-id="${latest.id}">Baca selengkapnya <span aria-hidden="true">→</span></button>`;
        body.insertBefore(card, body.firstChild);
    }

    function render() {
        renderBadge();
        renderList();
        renderHighlight();
    }

    async function markRead(id, navigate = false) {
        const item = notifications.find(notification => notification.id === id);
        if (!item || !userId) return;
        if (!item.is_read) {
            const { error } = await window.db
                .from('user_notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('id', item.id)
                .eq('user_id', userId);
            if (error) {
                console.warn('Gagal menandai notifikasi dibaca:', error.message);
                return;
            }
            item.is_read = true;
            item.read_at = new Date().toISOString();
            render();
        }
        if (navigate && item.link_url) window.location.href = item.link_url;
    }

    async function markAllRead() {
        const unreadIds = notifications.filter(item => !item.is_read).map(item => item.id);
        if (!unreadIds.length) return;
        const { error } = await window.db
            .from('user_notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('user_id', userId)
            .in('id', unreadIds);
        if (error) return console.warn('Gagal menandai semua notifikasi:', error.message);
        notifications.forEach(item => {
            if (unreadIds.includes(item.id)) item.is_read = true;
        });
        render();
    }

    function closeDropdown() {
        $('notificationDropdown')?.classList.remove('is-open');
        $('notifBtn')?.setAttribute('aria-expanded', 'false');
    }

    function bindEvents() {
        $('notifBtn')?.addEventListener('click', event => {
            event.stopPropagation();
            const dropdown = $('notificationDropdown');
            if (!dropdown) return;
            const isOpen = dropdown.classList.toggle('is-open');
            $('notifBtn')?.setAttribute('aria-expanded', String(isOpen));
        });
        $('markAllNotificationsRead')?.addEventListener('click', markAllRead);
        $('notificationList')?.addEventListener('click', event => {
            const target = event.target.closest('[data-notification-id]');
            if (target) markRead(target.dataset.notificationId, true);
        });
        document.addEventListener('click', event => {
            if (!event.target.closest('#notificationCenter')) closeDropdown();
        });
        document.addEventListener('click', event => {
            const target = event.target.closest('.announcement-highlight [data-notification-id]');
            if (target) markRead(target.dataset.notificationId, true);
        });
    }

    function subscribeRealtime() {
        if (!window.db?.channel || !userId) return;
        realtimeChannel = window.db
            .channel(`notifications-${userId}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${userId}`
            }, () => fetchNotifications().catch(error => console.warn('Realtime notifikasi:', error.message)))
            .subscribe();
    }

    async function init() {
        if (!window.db) return setTimeout(init, 80);
        const { data: { user } } = await window.db.auth.getUser();
        if (!user) return setVisible(false);
        userId = user.id;
        setVisible(true);
        bindEvents();
        try {
            await fetchNotifications();
            subscribeRealtime();
        } catch (error) {
            console.warn('Gagal memuat notifikasi:', error.message);
            renderList();
        }
        window.db.auth.onAuthStateChange((_event, session) => {
            if (session?.user) return;
            if (realtimeChannel) window.db.removeChannel(realtimeChannel);
            realtimeChannel = null;
            notifications = [];
            userId = null;
            setVisible(false);
            renderHighlight();
        });
    }

    window.addEventListener('beforeunload', () => {
        if (realtimeChannel && window.db) window.db.removeChannel(realtimeChannel);
    });
    init();
})();

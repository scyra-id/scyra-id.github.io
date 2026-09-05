document.addEventListener('DOMContentLoaded', async () => {
    const SLOT_CONFIG = {
        BODY:       { label: 'Body',      column: 'body_item_id',       layer: 'layerBody',       defaultCode: 'kyra_body_creamy_cloud' },
        EXPRESSION: { label: 'Ekspresi',  column: 'expression_item_id', layer: 'layerExpression',  defaultCode: 'kyra_expression_friendly_smile' },
        ANTENNA:    { label: 'Antena',    column: 'antenna_item_id',    layer: 'layerAntenna',     defaultCode: 'kyra_antenna_classic' },
        HEAD:       { label: 'Headwear',  column: 'head_item_id',       layer: 'layerHead',        defaultCode: null },
        FACE:       { label: 'Face',      column: 'face_item_id',       layer: 'layerFace',        defaultCode: null },
        OUTFIT:     { label: 'Outfit',    column: 'outfit_item_id',     layer: 'layerOutfit',      defaultCode: null },
        BACK:       { label: 'Back',      column: 'back_item_id',       layer: 'layerBack',        defaultCode: null },
        EFFECT:     { label: 'Effect',    column: 'effect_item_id',     layer: 'layerEffect',      defaultCode: null }
    };

    const SLOT_KEYS = Object.keys(SLOT_CONFIG);

    const SLOT_NORMALIZE = {
        body: 'BODY', face: 'EXPRESSION', pet: 'ANTENNA', head: 'HEAD',
        handheld: 'FACE', aura: 'OUTFIT', badge_frame: 'BACK', background: 'EFFECT',
        BODY: 'BODY', EXPRESSION: 'EXPRESSION', ANTENNA: 'ANTENNA', HEAD: 'HEAD',
        FACE: 'FACE', OUTFIT: 'OUTFIT', BACK: 'BACK', EFFECT: 'EFFECT'
    };

    const COLUMN_FALLBACKS = {
        BODY:       ['body_item_id'],
        EXPRESSION: ['expression_item_id', 'face_item_id'],
        ANTENNA:    ['antenna_item_id', 'pet_item_id'],
        HEAD:       ['head_item_id'],
        FACE:       ['face_item_id', 'handheld_item_id'],
        OUTFIT:     ['outfit_item_id', 'aura_item_id'],
        BACK:       ['back_item_id', 'badge_frame_item_id'],
        EFFECT:     ['effect_item_id', 'background_item_id']
    };

    const state = { userId: null, items: [], inventory: [], equipped: {}, category: 'ALL', rarity: 'ALL', ownership: 'ALL', level: 1 };

    const el = {
        count: document.getElementById('equippedCountBadge'),
        slots: document.getElementById('equippedSlotsBar'),
        grid: document.getElementById('inventoryItemsGrid'),
        tabs: document.getElementById('slotCategoryTabs'),
        rarity: document.getElementById('filterRarity'),
        ownership: document.getElementById('filterOwnership'),
        save: document.getElementById('btnSaveLook'),
        reset: document.getElementById('btnResetLook')
    };

    function normalizeSlot(raw) {
        return SLOT_NORMALIZE[raw] || SLOT_NORMALIZE[String(raw).toLowerCase()] || null;
    }

    function findItem(id) {
        if (!id) return null;
        return state.items.find(i => i.id === id || i.item_code === id);
    }

    function inventoryFor(item) {
        return state.inventory.find(row => row.item_id === item.id);
    }

    function statusFor(item) {
        const record = inventoryFor(item);

        // 1. Jika sudah diklaim di inventory -> PASTI DIMILIKI (OWNED)
        if (record?.is_claimed) return 'OWNED';

        // 2. Starter items (level 0 dan bukan special reward) otomatis dimiliki user
        if (item.required_level === 0 && !item.is_special_reward) {
            return 'OWNED';
        }

        // 3. Special reward (Achievement Diamond items)
        if (item.is_special_reward) {
            // Hanya READY jika sudah di-grant ke inventory oleh achievement engine
            if (record && !record.is_claimed) return 'READY';
            return 'LOCKED';
        }

        // 4. Regular Journey Items (Level 1–50)
        // Jika level item lebih tinggi dari level user saat ini -> TERKUNCI
        if (item.required_level > state.level) {
            return 'LOCKED';
        }

        // Jika level item <= level user saat ini, tapi belum diklaim -> SIAP KLAIM
        return 'READY';
    }

    function setLayer(slot, item) {
        const layer = document.getElementById(SLOT_CONFIG[slot].layer);
        if (!layer) return;
        if (!item?.asset_url) {
            layer.replaceChildren();
            layer.hidden = true;
            return;
        }
        layer.hidden = false;
        const image = document.createElement('img');
        image.src = item.asset_url;
        image.alt = '';
        image.onerror = () => image.remove();
        layer.replaceChildren(image);
    }

    function renderAvatar() {
        SLOT_KEYS.forEach(slot => setLayer(slot, findItem(state.equipped[slot])));
        const count = SLOT_KEYS.filter(slot => state.equipped[slot]).length;
        if (el.count) el.count.textContent = `${count}/8 Terpasang`;
    }

    function renderSlots() {
        if (!el.slots) return;
        el.slots.innerHTML = SLOT_KEYS.map(slot => {
            const item = findItem(state.equipped[slot]);
            return `<button type="button" class="slot-indicator ${item ? 'active' : ''}" data-slot="${slot}">
                <span class="slot-indicator-name">${SLOT_CONFIG[slot].label}</span>
                <span>${item?.name || 'Kosong'}</span>
            </button>`;
        }).join('');
        el.slots.querySelectorAll('[data-slot]').forEach(node => node.addEventListener('click', () => {
            state.category = node.dataset.slot;
            syncTabs();
            renderGrid();
        }));
    }

    function syncTabs() {
        el.tabs?.querySelectorAll('[data-slot]').forEach(tab =>
            tab.classList.toggle('active', tab.dataset.slot === state.category)
        );
    }

    function renderGrid() {
        if (!el.grid) return;

        const filtered = state.items.filter(item => {
            const status = statusFor(item);
            const slotMatch = state.category === 'ALL' || item._slot === state.category;
            const rarityMatch = state.rarity === 'ALL' || String(item.rarity).toUpperCase() === state.rarity;
            const ownershipMatch = state.ownership === 'ALL' || status === state.ownership;
            return slotMatch && rarityMatch && ownershipMatch;
        });

        if (!filtered.length) {
            el.grid.innerHTML = '<div class="inventory-empty"><p style="font-size:2rem;margin-bottom:0.5rem;">🎒</p><p>Tidak ada item yang sesuai dengan filter.</p></div>';
            return;
        }

        el.grid.innerHTML = filtered.map(item => {
            const status = statusFor(item);
            const isEquipped = state.equipped[item._slot] === item.id;

            let badge = '';
            if (isEquipped) {
                badge = '<span class="item-badge-status item-badge-equipped">Terpasang</span>';
            } else if (status === 'READY') {
                badge = '<span class="item-badge-status item-badge-ready">Siap Klaim</span>';
            } else if (status === 'LOCKED') {
                badge = `<span class="item-badge-status ${item.is_special_reward ? 'item-badge-legacy' : 'item-badge-locked'}">${item.is_special_reward ? 'LEGACY' : `Lv. ${item.required_level}`}</span>`;
            }

            return `<article class="item-card ${isEquipped ? 'equipped' : ''} ${status === 'LOCKED' ? 'locked' : ''}" data-id="${item.id}" data-slot="${item._slot}" data-status="${status}">
                ${badge}
                <div class="item-thumb"><img src="${item.asset_url}" alt="${item.name}"></div>
                <div class="item-name">${item.name}</div>
                <div class="item-rarity-label rarity-${String(item.rarity).toLowerCase()}">${item.rarity}</div>
                ${status === 'READY' ? '<a class="item-claim-link" href="journey.html">Klaim di Journey</a>' : ''}
                ${status === 'LOCKED' ? `<div class="item-req-level">Buka di Lv. ${item.required_level}</div>` : ''}
            </article>`;
        }).join('');

        el.grid.querySelectorAll('.item-card').forEach(card => card.addEventListener('click', () => {
            const status = card.dataset.status;
            if (status === 'LOCKED') {
                if (window.showScyraAlert) window.showScyraAlert('Tingkatkan levelmu di Journey untuk membuka item ini!', '🔒 Terkunci', '✨');
                return;
            }
            if (status === 'READY') {
                window.location.href = 'journey.html';
                return;
            }
            const item = findItem(card.dataset.id);
            if (!item) return;
            state.equipped[item._slot] = state.equipped[item._slot] === item.id ? null : item.id;
            renderAvatar();
            renderSlots();
            renderGrid();
        }));
    }

    async function load() {
        if (!window.db) {
            setTimeout(load, 200);
            return;
        }

        try {
            const { data: { user } } = await window.db.auth.getUser();
            if (!user) {
                window.location.href = 'login.html';
                return;
            }
            state.userId = user.id;
        } catch (err) {
            console.error('Auth check failed:', err);
            if (el.grid) el.grid.innerHTML = '<div class="inventory-empty"><p>Gagal memuat sesi login.</p></div>';
            return;
        }

        const api = window.ScyraGamification;
        if (!api) {
            if (el.grid) el.grid.innerHTML = '<div class="inventory-empty"><p>Sistem gamifikasi belum tersedia. Pastikan Edge Function aktif.</p></div>';
            return;
        }

        try {
            const [journey, itemsRaw, inventoryRaw, equippedRaw] = await Promise.allSettled([
                api.getUserJourneyProgress(),
                api.getItemDefinitions(),
                api.getUserMascotInventory(),
                api.getUserEquippedMascot()
            ]);

            state.level = journey.status === 'fulfilled' ? (journey.value?.current_level || 1) : 1;

            const rawItems = itemsRaw.status === 'fulfilled' ? (itemsRaw.value || []) : [];
            state.items = rawItems.map(item => ({
                ...item,
                _slot: normalizeSlot(item.slot) || item.slot
            })).filter(item => SLOT_KEYS.includes(item._slot));

            state.inventory = inventoryRaw.status === 'fulfilled' ? (inventoryRaw.value || []) : [];

            const equipped = equippedRaw.status === 'fulfilled' ? (equippedRaw.value || {}) : {};
            SLOT_KEYS.forEach(slot => {
                const fallbacks = COLUMN_FALLBACKS[slot];
                let val = null;
                for (const col of fallbacks) {
                    if (equipped[col]) { val = equipped[col]; break; }
                }
                state.equipped[slot] = val;
            });

            if (state.items.length === 0) {
                if (el.grid) el.grid.innerHTML = '<div class="inventory-empty"><p style="font-size:2rem;margin-bottom:0.5rem;">📦</p><p>Katalog item kosong. Pastikan seed.sql sudah dijalankan di database.</p></div>';
                return;
            }

            renderAvatar();
            renderSlots();
            renderGrid();
        } catch (err) {
            console.error('Inventory load error:', err);
            if (el.grid) el.grid.innerHTML = `<div class="inventory-empty"><p>Gagal memuat inventory: ${err.message}</p></div>`;
        }
    }

    el.tabs?.querySelectorAll('[data-slot]').forEach(tab => tab.addEventListener('click', () => {
        state.category = tab.dataset.slot;
        syncTabs();
        renderGrid();
    }));
    el.rarity?.addEventListener('change', () => { state.rarity = el.rarity.value; renderGrid(); });
    el.ownership?.addEventListener('change', () => { state.ownership = el.ownership.value; renderGrid(); });
    el.reset?.addEventListener('click', () => {
        SLOT_KEYS.forEach(slot => { state.equipped[slot] = null; });
        renderAvatar();
        renderSlots();
        renderGrid();
    });
    el.save?.addEventListener('click', async () => {
        const api = window.ScyraGamification;
        if (!api) return;
        el.save.disabled = true;
        el.save.textContent = 'Menyimpan…';
        try {
            await Promise.all(SLOT_KEYS.map(slot => api.equipMascotSlot(slot, state.equipped[slot])));
            if (window.showScyraAlert) await window.showScyraAlert('Tampilan Kyra berhasil disimpan.', '✨ Tampilan Disimpan', '🎉');
        } catch (error) {
            console.error('Mascot save failed:', error);
            if (window.showScyraAlert) await window.showScyraAlert(error.message || 'Gagal menyimpan tampilan.', '⚠️ Gagal', '⚠️');
        } finally {
            el.save.disabled = false;
            el.save.textContent = '💾 Simpan Tampilan';
        }
    });

    load();
});

/**
 * ============================================================================
 * 🏆 SCYRA ACHIEVEMENTS PAGE CONTROLLER
 * Renders 5 Category Cards, Progress Bars, Overall Progress,
 * Showcase Picker Modal, and Featured Badges Display.
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', async () => {
    let currentUserId = null;
    let summary = null;
    let featuredBadges = [];
    let pickerSlot = null; // Which slot (1/2/3) is being picked

    const TIER_ORDER = ['bronze', 'silver', 'gold', 'diamond'];
    const CIRCUMFERENCE = 2 * Math.PI * 34; // SVG ring radius = 34

    const el = {
        overallCount: document.getElementById('achOverallCount'),
        overallRingFill: document.getElementById('achRingFill'),
        overallRingText: document.getElementById('achRingText'),
        categoriesGrid: document.getElementById('achCategoriesGrid'),
        showcaseSlots: document.querySelectorAll('.showcase-slot'),
        btnEditShowcase: document.getElementById('btnEditShowcase'),
        pickerBackdrop: document.getElementById('showcasePickerBackdrop'),
        pickerOptions: document.getElementById('pickerOptions'),
        pickerTitle: document.getElementById('pickerTitle'),
        pickerBtnConfirm: document.getElementById('pickerBtnConfirm'),
        pickerBtnClose: document.getElementById('pickerBtnClose'),
        pickerBtnRemove: document.getElementById('pickerBtnRemove')
    };

    let pickerSelectedCategory = null;

    async function init() {
        if (!window.db) return setTimeout(init, 100);

        const { data: { user } } = await window.db.auth.getUser();
        if (!user) {
            if (typeof showScyraAlert === 'function') {
                await showScyraAlert('Kamu harus login untuk melihat Achievements.', '⛔ Akses Ditolak', '🔒');
            }
            window.location.href = 'login.html';
            return;
        }

        currentUserId = user.id;

        if (window.syncAuthToPaymentDB) {
            await window.syncAuthToPaymentDB();
        }

        await loadData();
        setupEvents();
    }

    async function loadData() {
        const engine = window.ScyraAchievementEngine;
        if (!engine) return;

        // Sync streak & level achievements from live data
        const api = window.ScyraGamification;
        if (api) {
            try {
                const journey = await api.getUserJourneyProgress(currentUserId);
                if (journey) {
                    await engine.setAchievementAbsolute('streak', journey.daily_streak || 0, currentUserId);
                    await engine.setAchievementAbsolute('social', journey.current_level || 1, currentUserId);
                }
            } catch (e) {
                console.warn('Streak/level sync warning:', e);
            }
        }

        summary = await engine.getFullAchievementSummary(currentUserId);
        featuredBadges = await engine.getFeaturedBadges(currentUserId);

        renderOverallProgress();
        renderCategoryCards();
        renderShowcaseSlots();
    }

    // -------------------------------------------------------------------------
    // OVERALL PROGRESS RING
    // -------------------------------------------------------------------------

    function renderOverallProgress() {
        if (!summary) return;
        const { totalTiersUnlocked, totalTiersPossible } = summary;
        const pct = totalTiersPossible > 0 ? totalTiersUnlocked / totalTiersPossible : 0;
        const dashOffset = CIRCUMFERENCE * (1 - pct);

        if (el.overallRingFill) {
            el.overallRingFill.style.strokeDasharray = CIRCUMFERENCE;
            el.overallRingFill.style.strokeDashoffset = dashOffset;
        }
        if (el.overallRingText) el.overallRingText.textContent = `${totalTiersUnlocked}/${totalTiersPossible}`;
        if (el.overallCount) el.overallCount.textContent = `${totalTiersUnlocked} / ${totalTiersPossible} Tier Terbuka`;
    }

    // -------------------------------------------------------------------------
    // 5 CATEGORY CARDS
    // -------------------------------------------------------------------------

    function renderCategoryCards() {
        if (!el.categoriesGrid || !summary) return;

        el.categoriesGrid.innerHTML = summary.categories.map(cat => {
            const nextTarget = cat.nextTier ? cat.nextTier.target : cat.diamondTarget;
            const progressPct = Math.min(100, Math.round((cat.progress / nextTarget) * 100));

            let fillClass = 'fill-bronze';
            if (cat.currentTier === 'silver') fillClass = 'fill-silver';
            else if (cat.currentTier === 'gold') fillClass = 'fill-gold';
            else if (cat.currentTier === 'diamond') fillClass = 'fill-diamond';
            if (cat.isMaxed) fillClass = 'fill-complete';

            const tierBadgesHtml = TIER_ORDER.map(tierKey => {
                const tierDef = cat.tiers[tierKey];
                const isReached = cat.progress >= tierDef.target;
                return `<span class="tier-badge ${isReached ? 'tier-' + tierKey : 'tier-locked'}">${tierDef.icon} ${tierDef.label}</span>`;
            }).join('');

            const isDiamondUnlocked = cat.progress >= cat.diamondTarget;

            return `
                <div class="ach-category-card">
                    <div class="ach-card-header">
                        <div class="ach-card-icon">${cat.icon}</div>
                        <div>
                            <h3 class="ach-card-title">${cat.name}</h3>
                            <p class="ach-card-desc">${cat.description}</p>
                        </div>
                    </div>

                    <div class="ach-tier-strip">${tierBadgesHtml}</div>

                    <div class="ach-progress-row">
                        <div class="ach-progress-label">
                            <span>${cat.isMaxed ? 'Semua Tier Tercapai!' : `${cat.progress} / ${nextTarget}`}</span>
                            <span>${cat.currentTierIcon} ${cat.currentTierLabel}</span>
                        </div>
                        <div class="ach-progress-bar">
                            <div class="ach-progress-fill ${fillClass}" style="width: ${progressPct}%;"></div>
                        </div>
                    </div>

                    <div class="ach-diamond-preview ${isDiamondUnlocked ? 'unlocked' : ''}">
                        <div class="ach-diamond-icon">${isDiamondUnlocked ? '💎' : '🔒'}</div>
                        <div>
                            <div class="ach-diamond-name">${cat.diamondItem.name}</div>
                            <div class="ach-diamond-tag">${isDiamondUnlocked ? 'Terbuka! Cek Inventory' : `Diamond · Capai ${cat.diamondTarget} Target`}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // -------------------------------------------------------------------------
    // SHOWCASE FEATURED BADGES (Max 3 Slots)
    // -------------------------------------------------------------------------

    function renderShowcaseSlots() {
        if (!el.showcaseSlots.length) return;
        const engine = window.ScyraAchievementEngine;

        el.showcaseSlots.forEach((slotEl, index) => {
            const slotPos = index + 1;
            const featured = featuredBadges.find(f => f.slot_position === slotPos);

            if (featured && engine) {
                const catDef = engine.CATEGORIES[featured.achievement_category];
                if (catDef) {
                    // Find current tier for this category
                    const catSummary = summary?.categories?.find(c => c.key === featured.achievement_category);
                    slotEl.textContent = catDef.icon;
                    slotEl.classList.add('filled');
                    slotEl.classList.remove('empty');
                    slotEl.title = `${catDef.name} (${catSummary?.currentTierLabel || 'Bronze'})`;
                } else {
                    slotEl.textContent = '+';
                    slotEl.classList.add('empty');
                    slotEl.classList.remove('filled');
                }
            } else {
                slotEl.textContent = '+';
                slotEl.classList.add('empty');
                slotEl.classList.remove('filled');
                slotEl.title = 'Klik untuk pasang badge';
            }

            slotEl.onclick = () => openShowcasePicker(slotPos);
        });
    }

    // -------------------------------------------------------------------------
    // SHOWCASE PICKER MODAL
    // -------------------------------------------------------------------------

    function openShowcasePicker(slotPosition) {
        pickerSlot = slotPosition;
        pickerSelectedCategory = null;

        const engine = window.ScyraAchievementEngine;
        if (!engine || !summary || !el.pickerBackdrop) return;

        if (el.pickerTitle) el.pickerTitle.textContent = `Pilih Badge untuk Slot ${slotPosition}`;

        const currentFeatured = featuredBadges.find(f => f.slot_position === slotPosition);

        if (el.pickerOptions) {
            el.pickerOptions.innerHTML = summary.categories.map(cat => {
                const isSelected = currentFeatured?.achievement_category === cat.key;
                return `
                    <div class="picker-option ${isSelected ? 'selected' : ''}" data-category="${cat.key}">
                        <div class="picker-option-icon">${cat.icon}</div>
                        <div>
                            <div class="picker-option-name">${cat.name}</div>
                            <div class="picker-option-tier">${cat.currentTierIcon} ${cat.currentTierLabel} · ${cat.progress} progress</div>
                        </div>
                    </div>
                `;
            }).join('');

            el.pickerOptions.querySelectorAll('.picker-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    el.pickerOptions.querySelectorAll('.picker-option').forEach(o => o.classList.remove('selected'));
                    opt.classList.add('selected');
                    pickerSelectedCategory = opt.dataset.category;
                });
            });
        }

        // Show remove button only if slot has existing badge
        if (el.pickerBtnRemove) {
            el.pickerBtnRemove.style.display = currentFeatured ? 'inline-block' : 'none';
        }

        el.pickerBackdrop.classList.add('open');
    }

    function closeShowcasePicker() {
        if (el.pickerBackdrop) el.pickerBackdrop.classList.remove('open');
        pickerSlot = null;
        pickerSelectedCategory = null;
    }

    async function confirmShowcasePick() {
        const engine = window.ScyraAchievementEngine;
        if (!engine || !pickerSlot || !pickerSelectedCategory) return;

        try {
            await engine.setFeaturedBadge(pickerSlot, pickerSelectedCategory, currentUserId);
            featuredBadges = await engine.getFeaturedBadges(currentUserId);
            renderShowcaseSlots();
            closeShowcasePicker();
        } catch (err) {
            console.error('Error setting featured badge:', err);
        }
    }

    async function removeShowcaseBadge() {
        const engine = window.ScyraAchievementEngine;
        if (!engine || !pickerSlot) return;

        try {
            await engine.removeFeaturedBadge(pickerSlot, currentUserId);
            featuredBadges = await engine.getFeaturedBadges(currentUserId);
            renderShowcaseSlots();
            closeShowcasePicker();
        } catch (err) {
            console.error('Error removing featured badge:', err);
        }
    }

    // -------------------------------------------------------------------------
    // EVENTS
    // -------------------------------------------------------------------------

    function setupEvents() {
        if (el.pickerBtnClose) el.pickerBtnClose.onclick = closeShowcasePicker;
        if (el.pickerBtnConfirm) el.pickerBtnConfirm.onclick = confirmShowcasePick;
        if (el.pickerBtnRemove) el.pickerBtnRemove.onclick = removeShowcaseBadge;
        if (el.btnEditShowcase) el.btnEditShowcase.onclick = () => openShowcasePicker(1);
        if (el.pickerBackdrop) {
            el.pickerBackdrop.onclick = (e) => {
                if (e.target === el.pickerBackdrop) closeShowcasePicker();
            };
        }
    }

    init();
});

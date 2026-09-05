/**
 * ============================================================================
 * 🌟 SCYRA JOURNEY CONTROLLER
 * Controls Map Rendering, Auto-scroll, XP History Feed, and Level Up Modals.
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', async () => {
    let currentUserId = null;
    let journeyData = null;
    let inventoryItems = [];
    let itemDefs = [];
    let activityLogs = [];

    const MILESTONES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

    const el = {
        // Stats
        levelText: document.getElementById('journeyCurrentLevel'),
        xpProgressText: document.getElementById('journeyXpText'),
        streakText: document.getElementById('journeyStreakText'),
        totalXpText: document.getElementById('journeyTotalXpText'),
        
        // Map
        spineFill: document.getElementById('journeySpineFill'),
        nodesContainer: document.getElementById('journeyNodesContainer'),

        // History
        historyList: document.getElementById('journeyHistoryList'),
        historyLoading: document.getElementById('journeyHistoryLoading'),

        // Tabs
        tabButtons: document.querySelectorAll('.journey-tab-btn'),
        tabPanes: document.querySelectorAll('.tab-pane'),

        // Modal
        modalBackdrop: document.getElementById('journeyModalBackdrop'),
        modalCloseBtn: document.getElementById('journeyModalCloseBtn'),
        modalTitle: document.getElementById('journeyModalTitle'),
        modalSubtitle: document.getElementById('journeyModalSubtitle'),
        modalBadge: document.getElementById('journeyModalBadge'),
        modalItemsList: document.getElementById('journeyModalItemsList'),
        modalActionClaim: document.getElementById('journeyModalActionClaim'),
        modalActionEquip: document.getElementById('journeyModalActionEquip'),
        modalActionClose: document.getElementById('journeyModalActionClose')
    };

    // 1. Inisialisasi Tab Switcher
    el.tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            el.tabButtons.forEach(b => b.classList.remove('active'));
            el.tabPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const activePane = document.getElementById(`tab-${targetTab}`);
            if (activePane) activePane.classList.add('active');

            if (targetTab === 'history') {
                loadHistoryTab();
            }
        });
    });

    // 2. Inisialisasi Auth & Journey
    async function init() {
        if (!window.db) return setTimeout(init, 100);

        const { data: { user } } = await window.db.auth.getUser();
        if (!user) {
            if (typeof showScyraAlert === 'function') {
                await showScyraAlert('Kamu harus login terlebih dahulu untuk melihat Journey.', '⛔ Akses Ditolak', '🔒');
            }
            window.location.href = 'login.html';
            return;
        }

        currentUserId = user.id;

        // Ensure database 2 auth session is ready
        if (window.syncAuthToPaymentDB) {
            await window.syncAuthToPaymentDB();
        }

        await loadJourneyData();
        setupModalEvents();

        // Listen for global engine level up events
        window.addEventListener('scyra:levelup', (e) => {
            if (e.detail) {
                openCelebrationModal(e.detail);
            }
        });
    }

    async function loadJourneyData() {
        const api = window.ScyraGamification;
        if (!api) {
            renderJourneyLoadError('Sistem gamifikasi belum siap. Muat ulang halaman ini.');
            return;
        }

        try {
            journeyData = await api.getUserJourneyProgress(currentUserId);
        } catch (err) {
            console.error('Failed to load journey progress:', err);
            renderJourneyLoadError('Progress Journey tidak dapat dimuat. Pastikan tabel dan RLS dbPayment sudah dikonfigurasi.');
            return;
        }

        const [inventoryResult, definitionsResult] = await Promise.allSettled([
            api.getUserMascotInventory(currentUserId),
            api.getItemDefinitions()
        ]);

        if (inventoryResult.status === 'fulfilled') {
            inventoryItems = inventoryResult.value || [];
        } else {
            console.warn('Journey inventory unavailable:', inventoryResult.reason);
            inventoryItems = [];
        }

        if (definitionsResult.status === 'fulfilled') {
            itemDefs = definitionsResult.value || [];
        } else {
            console.warn('Journey item definitions unavailable:', definitionsResult.reason);
            itemDefs = [];
        }

        renderHeaderStats();
        renderJourneyMap();
    }

    function renderJourneyLoadError(message) {
        if (!el.nodesContainer) return;
        el.nodesContainer.innerHTML = `
            <div style="text-align:center; padding:2rem; color:var(--error);">
                <p style="font-size:1.5rem; margin:0 0 .5rem;">⚠️</p>
                <p style="margin:0;">${message}</p>
            </div>
        `;
    }

    function renderHeaderStats() {
        const level = journeyData?.current_level || 1;
        const levelXp = journeyData?.level_xp || 0;
        const xpReq = window.ScyraGamificationEngine
            ? window.ScyraGamificationEngine.calculateXpRequired(level)
            : (100 + ((level - 1) * 10));

        if (el.levelText) el.levelText.textContent = `Level ${level}`;
        if (el.xpProgressText) el.xpProgressText.textContent = level >= 50 ? 'Max Level' : `${levelXp} / ${xpReq} XP`;
        if (el.streakText) el.streakText.textContent = `${journeyData?.daily_streak || 1} Hari`;
        if (el.totalXpText) el.totalXpText.textContent = `${journeyData?.total_xp || 0} XP`;

        // Update vertical spine fill percentage
        if (el.spineFill) {
            const fillPct = Math.min(100, Math.max(0, ((level - 1) / 49) * 100));
            el.spineFill.style.height = `${fillPct}%`;
        }
    }

    function renderJourneyMap() {
        if (!el.nodesContainer) return;
        el.nodesContainer.innerHTML = '';

        const currentLevel = journeyData?.current_level || 1;

        // Render levels 1 to 50
        for (let lvl = 1; lvl <= 50; lvl++) {
            const isMilestone = MILESTONES.includes(lvl);
            // Hanya ambil item perjalanan biasa (bukan achievement special reward)
            const levelReward = itemDefs.find(item => item.required_level === lvl && !item.is_special_reward);
            const userItem = levelReward 
                ? inventoryItems.find(inv => inv.item_id === levelReward.id)
                : null;

            let status = 'locked';
            let statusTagHtml = '<span class="node-status-tag tag-locked">🔒 Terkunci</span>';
            let circleContent = `${lvl}`;

            if (lvl < currentLevel) {
                if (levelReward && (!userItem || !userItem.is_claimed)) {
                    status = 'ready';
                    statusTagHtml = '<span class="node-status-tag tag-ready">🎁 Siap Klaim</span>';
                    circleContent = '🎁';
                } else {
                    status = 'claimed';
                    statusTagHtml = '<span class="node-status-tag tag-claimed">✓ Selesai</span>';
                    circleContent = '✓';
                }
            } else if (lvl === currentLevel) {
                if (levelReward && (!userItem || !userItem.is_claimed)) {
                    status = 'ready';
                    statusTagHtml = '<span class="node-status-tag tag-ready">🎁 Siap Klaim</span>';
                    circleContent = '🎁';
                } else {
                    status = 'current';
                    statusTagHtml = '<span class="node-status-tag tag-current">● Level Kamu</span>';
                    circleContent = '●';
                }
            }
            // Jika lvl > currentLevel -> status tetap 'locked' (TERKUNCI)

            const row = document.createElement('div');
            row.className = `journey-node-row status-${status} ${isMilestone ? 'is-milestone' : ''}`;
            row.id = `journey-node-${lvl}`;

            const cardContent = `
                <div class="node-title">${isMilestone ? '🌟 Milestone ' : ''}Level ${lvl}</div>
                ${statusTagHtml}
                ${levelReward ? `
                    <div class="node-reward-preview">
                        <span>🎁 ${levelReward.name}</span>
                    </div>
                ` : '<div class="node-reward-preview" style="color: var(--text-muted);"><span>+ Naik Pangkat</span></div>'}
            `;

            row.innerHTML = `
                <div class="node-card node-card-left" data-level="${lvl}">
                    ${cardContent}
                </div>
                <div class="journey-node-circle" data-level="${lvl}" title="Level ${lvl}">
                    ${circleContent}
                </div>
                <div class="node-card node-card-right" data-level="${lvl}">
                    ${cardContent}
                </div>
            `;

            // Add click listener to card/circle
            const clickTargets = row.querySelectorAll('.node-card, .journey-node-circle');
            clickTargets.forEach(target => {
                target.addEventListener('click', () => {
                    handleNodeClick(lvl, levelReward, userItem, status);
                });
            });

            el.nodesContainer.appendChild(row);
        }

        // Auto-scroll ke current level node
        setTimeout(() => {
            const currentNode = document.getElementById(`journey-node-${currentLevel}`);
            if (currentNode) {
                currentNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 300);
    }

    function handleNodeClick(level, rewardItem, userInventoryItem, status) {
        if (!rewardItem) {
            openGenericLevelModal(level, status);
            return;
        }

        if (status === 'ready') {
            // Modal siap klaim (baik sudah ada di user_mascot_inventory atau baru akan di-grant)
            openClaimRewardModal(level, rewardItem, userInventoryItem);
        } else {
            // Modal preview
            openRewardPreviewModal(level, rewardItem, status);
        }
    }

    function openClaimRewardModal(level, rewardItem, userInventoryItem) {
        el.modalBadge.textContent = '🎁';
        el.modalTitle.textContent = `Hadiah Level ${level}!`;
        el.modalSubtitle.textContent = 'Selamat pejuang! Kamu telah membuka hadiah kosmetik baru untuk maskotmu.';

        el.modalItemsList.innerHTML = `
            <div class="reward-preview-card">
                <div class="reward-img-frame">
                    ${rewardItem.asset_url ? `<img src="${rewardItem.asset_url}" alt="${rewardItem.name}">` : '✨'}
                </div>
                <div class="reward-details">
                    <div class="reward-name">${rewardItem.name}</div>
                    <div class="reward-rarity">${rewardItem.rarity} · Slot ${rewardItem.slot}</div>
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.2rem;">${rewardItem.description || 'Kosmetik eksklusif Pejuang PTN.'}</div>
                </div>
            </div>
        `;

        el.modalActionClaim.style.display = 'inline-block';
        el.modalActionEquip.style.display = 'inline-block';
        el.modalActionClose.style.display = 'inline-block';

        el.modalActionClaim.onclick = async () => {
            el.modalActionClaim.disabled = true;
            el.modalActionClaim.textContent = 'Mengklaim...';
            try {
                await window.ScyraGamification.claimMascotItem(userInventoryItem?.id, rewardItem.id);
                closeModal();
                await loadJourneyData();
            } catch (err) {
                console.error('Claim error:', err);
                if (window.showScyraAlert) window.showScyraAlert(err.message || 'Gagal klaim hadiah.', '⚠️ Gagal', '⚠️');
            } finally {
                el.modalActionClaim.disabled = false;
                el.modalActionClaim.textContent = '🎁 Klaim Hadiah';
            }
        };

        el.modalActionEquip.onclick = async () => {
            el.modalActionEquip.disabled = true;
            el.modalActionEquip.textContent = 'Memasang...';
            try {
                await window.ScyraGamification.claimMascotItem(userInventoryItem?.id, rewardItem.id);
                await window.ScyraGamification.equipMascotSlot(rewardItem.slot, rewardItem.id);
                closeModal();
                await loadJourneyData();
                if (typeof showScyraAlert === 'function') {
                    showScyraAlert(`Item ${rewardItem.name} berhasil dipasang ke maskotmu!`, '🎉 Berhasil Dipasang', '✨');
                }
            } catch (err) {
                console.error('Equip error:', err);
                if (window.showScyraAlert) window.showScyraAlert(err.message || 'Gagal memasang item.', '⚠️ Gagal', '⚠️');
            } finally {
                el.modalActionEquip.disabled = false;
                el.modalActionEquip.textContent = '✨ Pakai Sekarang';
            }
        };

        openModal();
    }

    function openRewardPreviewModal(level, rewardItem, status) {
        el.modalBadge.textContent = status === 'claimed' ? '👑' : '🔒';
        el.modalTitle.textContent = `Reward Level ${level}`;
        el.modalSubtitle.textContent = status === 'claimed' 
            ? 'Hadiah ini sudah kamu klaim.'
            : `Capai Level ${level} untuk membuka item ini.`;

        el.modalItemsList.innerHTML = `
            <div class="reward-preview-card">
                <div class="reward-img-frame">
                    ${rewardItem.asset_url ? `<img src="${rewardItem.asset_url}" alt="${rewardItem.name}">` : '✨'}
                </div>
                <div class="reward-details">
                    <div class="reward-name">${rewardItem.name}</div>
                    <div class="reward-rarity">${rewardItem.rarity} · Slot ${rewardItem.slot}</div>
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.2rem;">${rewardItem.description || 'Kosmetik eksklusif Pejuang PTN.'}</div>
                </div>
            </div>
        `;

        el.modalActionClaim.style.display = 'none';
        el.modalActionEquip.style.display = 'none';
        el.modalActionClose.style.display = 'inline-block';
        openModal();
    }

    function openGenericLevelModal(level, status) {
        el.modalBadge.textContent = '🌟';
        el.modalTitle.textContent = `Level ${level}`;
        el.modalSubtitle.textContent = status === 'claimed'
            ? `Kamu sudah berhasil melewati Level ${level}.`
            : `Terus belajar untuk menaikkan level ke Level ${level}!`;
        el.modalItemsList.innerHTML = '<p style="color:var(--text-secondary); font-size:0.9rem;">Dapatkan XP dari Latihan Drill, Materi, dan Tryout.</p>';
        el.modalActionClaim.style.display = 'none';
        el.modalActionEquip.style.display = 'none';
        el.modalActionClose.style.display = 'inline-block';
        openModal();
    }

    function openCelebrationModal(eventData) {
        const newLvl = eventData.newLevel || 1;
        el.modalBadge.textContent = '🎉';
        el.modalTitle.textContent = `LEVEL UP! Level ${newLvl}`;
        el.modalSubtitle.textContent = `Hebat! Perjalanan belajarmu semakin jauh dan kamu kini berada di Level ${newLvl}.`;

        const items = eventData.unlockedItems || [];
        if (items.length > 0) {
            el.modalItemsList.innerHTML = items.map(item => `
                <div class="reward-preview-card">
                    <div class="reward-img-frame">🎁</div>
                    <div class="reward-details">
                        <div class="reward-name">${item.name}</div>
                        <div class="reward-rarity">${item.rarity} · Slot ${item.slot}</div>
                    </div>
                </div>
            `).join('');
            el.modalActionClaim.style.display = 'inline-block';
            el.modalActionEquip.style.display = 'none';
            el.modalActionClaim.onclick = async () => {
                closeModal();
                await loadJourneyData();
            };
        } else {
            el.modalItemsList.innerHTML = '<p style="color:var(--text-secondary);">Semangat terus dalam menaklukkan soal-soal UTBK!</p>';
            el.modalActionClaim.style.display = 'none';
            el.modalActionEquip.style.display = 'none';
        }

        el.modalActionClose.style.display = 'inline-block';
        openModal();
    }

    // 3. Tab 2: XP History Feed
    async function loadHistoryTab() {
        if (!el.historyList) return;
        if (el.historyLoading) el.historyLoading.style.display = 'block';

        try {
            activityLogs = await window.ScyraGamification.getXpActivityLogs(30, 0, currentUserId);
            if (el.historyLoading) el.historyLoading.style.display = 'none';

            if (activityLogs.length === 0) {
                el.historyList.innerHTML = `
                    <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                        <p style="font-size: 2rem; margin-bottom: 0.5rem;">📜</p>
                        <p>Belum ada riwayat perolehan XP. Mulai latihan sekarang!</p>
                    </div>
                `;
                return;
            }

            el.historyList.innerHTML = activityLogs.map(log => {
                const date = new Date(log.created_at);
                const timeFormatted = date.toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });

                let icon = '⚡';
                if (log.activity_type.includes('daily_login')) icon = '🔥';
                else if (log.activity_type.includes('drill')) icon = '📝';
                else if (log.activity_type.includes('subchapter')) icon = '📚';
                else if (log.activity_type.includes('tryout')) icon = '🏆';

                return `
                    <div class="history-item">
                        <div class="history-left">
                            <div class="history-icon">${icon}</div>
                            <div>
                                <h4 class="history-title">${log.activity_name || log.activity_type}</h4>
                                <p class="history-time">${timeFormatted}</p>
                            </div>
                        </div>
                        <div class="history-xp">+${log.xp_amount} XP</div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.error('Failed to load XP history:', err);
            if (el.historyLoading) el.historyLoading.style.display = 'none';
        }
    }

    function openModal() {
        if (el.modalBackdrop) el.modalBackdrop.classList.add('open');
    }

    function closeModal() {
        if (el.modalBackdrop) el.modalBackdrop.classList.remove('open');
    }

    function setupModalEvents() {
        if (el.modalCloseBtn) el.modalCloseBtn.onclick = closeModal;
        if (el.modalActionClose) el.modalActionClose.onclick = closeModal;
        if (el.modalBackdrop) {
            el.modalBackdrop.onclick = (e) => {
                if (e.target === el.modalBackdrop) closeModal();
            };
        }
    }

    init();
});

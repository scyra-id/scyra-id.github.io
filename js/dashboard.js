document.addEventListener('DOMContentLoaded', () => {
    let currentUserId = null;
    let realtimeChannels = [];
    let refreshTimer = null;
    let isRefreshing = false;

    const el = {
        name: () => document.getElementById('dashUserName'),
        materi: () => document.getElementById('statMateri'),
        soal: () => document.getElementById('statSoal'),
        skor: () => document.getElementById('statSkor'),
        streakLabel: () => document.getElementById('statStreak'),
        userLevel: () => document.getElementById('statUserLevel'),
        xpBarFill: () => document.getElementById('statXpBarFill'),
        xpText: () => document.getElementById('statXpText'),
        unclaimedBadge: () => document.getElementById('statUnclaimedBadge'),
        streakStatus: () => document.getElementById('dashStreakStatusPill'),
        streakDot: () => document.getElementById('dashStreakDot'),
        btnDailyLogin: () => document.getElementById('btnClaimDailyLogin'),
        live: () => document.getElementById('dashLiveStatus'),
        grid: () => document.getElementById('continueGrid'),
        loading: () => document.getElementById('continueLoading'),
        updated: () => document.getElementById('dashLastUpdated'),
    };

    function setLiveStatus(state, text) {
        const node = el.live();
        if (!node) return;
        node.dataset.state = state;
        node.innerHTML = `<span class="live-dot"></span>${text}`;
    }

    function setLastUpdated() {
        const node = el.updated();
        if (!node) return;
        const now = new Date();
        node.textContent = `Diperbarui ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    }

    function scheduleRefresh(reason) {
        if (!currentUserId) return;
        if (refreshTimer) clearTimeout(refreshTimer);
        setLiveStatus('syncing', 'Menyinkronkan…');
        refreshTimer = setTimeout(() => {
            refreshDashboard(reason || 'realtime').catch((e) => console.error(e));
        }, 350);
    }

    async function initDashboard() {
        if (!window.db) return setTimeout(initDashboard, 100);

        const { data: { user } } = await window.db.auth.getUser();
        if (!user) {
            if (typeof showScyraAlert === 'function') {
                await showScyraAlert('Kamu harus login terlebih dahulu untuk mengakses Dashboard.', '⛔ Akses Ditolak', '🔒');
            }
            window.location.href = 'login.html';
            return;
        }

        currentUserId = user.id;

        const { data: profile } = await window.db
            .from('profiles')
            .select('full_name, role')
            .eq('id', user.id)
            .single();

        const userName = profile?.full_name || user.email.split('@')[0];
        const nameEl = el.name();
        if (nameEl) nameEl.textContent = userName;

        if (window.ProgressSystem) {
            try {
                await window.ProgressSystem.migrateLocalStorage(user.id);
            } catch (e) {
                console.warn('migrate progress:', e);
            }
        }

        await refreshDashboard('init');
        subscribeRealtime(user.id);

        window.addEventListener('focus', () => scheduleRefresh('focus'));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') scheduleRefresh('visible');
        });
    }

    async function refreshDashboard(reason) {
        if (!currentUserId || isRefreshing) {
            if (isRefreshing) scheduleRefresh(reason);
            return;
        }
        isRefreshing = true;
        try {
            await Promise.all([
                renderStats(currentUserId),
                renderContinueLearning(currentUserId),
            ]);
            setLastUpdated();
            setLiveStatus('live', 'Live');
        } catch (e) {
            console.error('refreshDashboard:', e);
            setLiveStatus('error', 'Gagal sync');
        } finally {
            isRefreshing = false;
        }
    }

    async function renderStats(userId) {
        let materiDibaca = 0;
        let soalDijawab = 0;
        let rataRataSkor = 0;
        let streak = 0;
        let totalBenar = 0;

        const progressRows = window.ProgressSystem
            ? await window.ProgressSystem.listUserProgress(userId)
            : [];

        materiDibaca = progressRows.filter((r) => r.status === 'completed' || (r.soal_dijawab || 0) > 0 || r.status === 'in_progress').length;

        progressRows.forEach((r) => {
            soalDijawab += r.soal_dijawab || 0;
            totalBenar += r.soal_benar || 0;
        });

        let skorList = [];
        try {
            const { data: tryouts } = await window.db
                .from('hasil_tryout')
                .select('total_soal, jumlah_benar, skor, created_at')
                .eq('user_id', userId);

            (tryouts || []).forEach((row) => {
                soalDijawab += row.total_soal || 0;
                totalBenar += row.jumlah_benar || 0;
                if (typeof row.skor === 'number') skorList.push(row.skor);
            });
        } catch (e) {
            console.warn('hasil_tryout stats:', e);
        }

        if (skorList.length > 0) {
            rataRataSkor = Math.round(skorList.reduce((a, b) => a + b, 0) / skorList.length);
        } else if (soalDijawab > 0) {
            rataRataSkor = Math.round((totalBenar / soalDijawab) * 100);
        }

        if (window.ProgressSystem) {
            const dates = await window.ProgressSystem.listActivityDates(userId);
            streak = window.ProgressSystem.calculateStreak(dates);
        }

        const m = el.materi();
        const s = el.soal();
        const sk = el.skor();
        const stLabel = el.streakLabel();
        if (m) animateNumber(m, materiDibaca);
        if (s) animateNumber(s, soalDijawab);
        if (sk) animateNumber(sk, rataRataSkor);
        if (stLabel) stLabel.textContent = `${streak} HARI Streak`;

        // 🎮 Render Gamification XP Widget & Sync Streak
        if (window.ScyraGamificationEngine) {
            try {
                await window.ScyraGamificationEngine.initialize(userId);
                const gState = window.ScyraGamificationEngine.getState();
                updateGamificationWidgetUI(gState);
                if (stLabel && gState.dailyStreak) {
                    stLabel.textContent = `${gState.dailyStreak} HARI Streak`;
                }
                await setupDailyLoginAction(userId);
                await renderHeroMascot(userId);
            } catch (err) {
                console.warn('Gamification widget render error:', err);
            }
        }
    }

    async function renderHeroMascot(userId) {
        if (!window.ScyraGamification) return;
        
        const canvas = document.getElementById('kyraAvatarCanvas');
        if (!canvas) return;

        try {
            // 1. Fetch Equipped Setup
            const equipped = await window.ScyraGamification.getUserEquippedMascot();
            
            // 2. Fetch Item Definitions to resolve URLs
            const definitions = await window.ScyraGamification.getItemDefinitions();
            const itemMap = new Map((definitions || []).map(i => [i.id, i]));

            // 3. Define Slot to Column Mapping (Standardized)
            const slotMap = {
                'effect': equipped.effect_item_id,
                'body': equipped.body_item_id,
                'outfit': equipped.outfit_item_id,
                'back': equipped.back_item_id,
                'expression': equipped.expression_item_id,
                'face': equipped.face_item_id,
                'antenna': equipped.antenna_item_id,
                'head': equipped.head_item_id
            };

            // 4. Render Layers
            const layers = ['effect', 'outfit', 'back', 'expression', 'face', 'antenna', 'head'];
            
            layers.forEach(slot => {
                const layerEl = document.getElementById(`layer-${slot}`);
                if (!layerEl) return;
                
                const itemId = slotMap[slot];
                const item = itemId ? itemMap.get(itemId) : null;

                if (item && item.asset_url) {
                    layerEl.innerHTML = `<img src="${item.asset_url}" alt="${slot}">`;
                } else {
                    layerEl.innerHTML = '';
                }
            });

        } catch (err) {
            console.warn('Could not render Hero Mascot:', err);
        }
    }

    function updateGamificationWidgetUI(gState) {
        if (!gState) return;
        const levelNode = el.userLevel();
        const fillNode = el.xpBarFill();
        const textNode = el.xpText();
        const badgeNode = el.unclaimedBadge();

        const currentLevel = gState.currentLevel || 1;
        const levelXp = gState.levelXp || 0;
        const xpReq = gState.xpRequired || 100;
        const pct = xpReq > 0 ? Math.min(100, Math.round((levelXp / xpReq) * 100)) : 100;

        if (levelNode) levelNode.textContent = `LEVEL ${currentLevel}`;
        if (fillNode) fillNode.style.width = `${pct}%`;
        if (textNode) {
            if (currentLevel >= 50) {
                textNode.textContent = `MAX LEVEL (Level 50)`;
            } else {
                textNode.textContent = `${levelXp} / ${xpReq} XP (${pct}%)`;
            }
        }
        if (badgeNode) {
            if (gState.unclaimedRewardsCount > 0) {
                badgeNode.style.display = 'inline-block';
                badgeNode.textContent = `🎁 ${gState.unclaimedRewardsCount} Hadiah!`;
            } else {
                badgeNode.style.display = 'none';
            }
        }
    }

    async function setupDailyLoginAction(userId) {
        const btn = el.btnDailyLogin();
        const statusNode = el.streakStatus();
        const dotNode = el.streakDot();
        if (!btn || !window.ScyraGamification) return;

        const todayKey = `daily_login_${new Date().toISOString().slice(0, 10)}`;
        let claimedToday = false;
        try {
            claimedToday = await window.ScyraGamification.isActivityCompleted('daily_login', todayKey);
        } catch (_) {
            claimedToday = false;
        }

        if (claimedToday) {
            btn.disabled = true;
            if (statusNode) {
                statusNode.textContent = '✓ Login Diklaim';
                statusNode.classList.add('claimed');
            }
            if (dotNode) dotNode.classList.add('claimed');
        } else {
            btn.disabled = false;
            if (statusNode) {
                statusNode.textContent = 'Klaim XP';
                statusNode.classList.remove('claimed');
            }
            if (dotNode) dotNode.classList.remove('claimed');
        }

        btn.onclick = async () => {
            btn.disabled = true;
            const stLabel = el.streakLabel();
            const result = await window.ScyraGamificationEngine.triggerDailyLogin(userId);
            if (result.success) {
                if (statusNode) {
                    statusNode.textContent = '✓ Login Diklaim';
                    statusNode.classList.add('claimed');
                }
                if (dotNode) dotNode.classList.add('claimed');
                const updatedState = window.ScyraGamificationEngine.getState();
                updateGamificationWidgetUI(updatedState);
                if (stLabel && updatedState.dailyStreak) {
                    stLabel.textContent = `${updatedState.dailyStreak} HARI Streak`;
                }
            } else {
                btn.disabled = false;
                if (statusNode) {
                    statusNode.textContent = 'Klaim XP';
                    statusNode.classList.remove('claimed');
                }
                if (dotNode) dotNode.classList.remove('claimed');
            }
        };
    }

    async function renderMiniKyraAvatar() {
        if (!window.ScyraGamification) return;
        const miniLayers = {
            EFFECT: document.getElementById('miniLayerEffect'),
            BODY: document.getElementById('miniLayerBody'),
            OUTFIT: document.getElementById('miniLayerOutfit'),
            BACK: document.getElementById('miniLayerBack'),
            EXPRESSION: document.getElementById('miniLayerExpression'),
            FACE: document.getElementById('miniLayerFace'),
            ANTENNA: document.getElementById('miniLayerAntenna'),
            HEAD: document.getElementById('miniLayerHead')
        };

        const slotToColumn = {
            BODY: 'body_item_id',
            EXPRESSION: 'expression_item_id',
            ANTENNA: 'antenna_item_id',
            HEAD: 'head_item_id',
            FACE: 'face_item_id',
            OUTFIT: 'outfit_item_id',
            BACK: 'back_item_id',
            EFFECT: 'effect_item_id'
        };

        try {
            const [equipped, items] = await Promise.all([
                window.ScyraGamification.getUserEquippedMascot(),
                window.ScyraGamification.getItemDefinitions()
            ]);

            const itemMap = new Map((items || []).map(i => [i.id, i]));
            let equippedCount = 0;

            Object.entries(miniLayers).forEach(([slot, layerNode]) => {
                if (!layerNode) return;
                const itemId = equipped?.[slotToColumn[slot]];
                const item = itemId ? itemMap.get(itemId) : null;
                if (item?.asset_url) {
                    equippedCount++;
                    layerNode.innerHTML = `<img src="${item.asset_url}" alt="">`;
                    layerNode.style.display = 'block';
                } else {
                    layerNode.innerHTML = '';
                    layerNode.style.display = 'none';
                }
            });

            const textNode = el.miniKyraText();
            if (textNode) {
                textNode.textContent = equippedCount > 0 ? `${equippedCount} Item Terpasang` : 'Setelan Default';
            }
        } catch (e) {
            console.warn('Mini Kyra render error:', e);
        }
    }

    function animateNumber(node, target) {
        const prev = parseInt(String(node.textContent).replace(/\D/g, ''), 10);
        if (!Number.isFinite(prev) || prev === target) {
            node.textContent = String(target);
            return;
        }
        node.textContent = String(target);
        node.classList.remove('stat-flash');
        void node.offsetWidth;
        node.classList.add('stat-flash');
    }

    async function renderContinueLearning(userId) {
        const grid = el.grid();
        const loading = el.loading();
        if (!grid) return;

        try {
            const progressRows = window.ProgressSystem
                ? await window.ProgressSystem.listUserProgress(userId)
                : [];

            const completedIds = progressRows
                .filter((r) => r.status === 'completed')
                .map((r) => r.materi_id);

            const recentIds = progressRows.slice(0, 6).map((r) => r.materi_id);

            const { data: allMateri, error: materiError } = await window.db
                .from('materi')
                .select('id, judul, kategori_id, nomor_bab')
                .eq('status', 'publik');

            const kategoriProgress = {};
            if (!materiError && allMateri) {
                const grouped = {};
                allMateri.forEach((m) => {
                    if (!grouped[m.kategori_id]) grouped[m.kategori_id] = [];
                    grouped[m.kategori_id].push(m.id);
                });
                for (const [katId, ids] of Object.entries(grouped)) {
                    const completed = ids.filter((id) => completedIds.includes(id)).length;
                    kategoriProgress[katId] = { total: ids.length, completed };
                }
            }

            let materiList = [];
            if (recentIds.length > 0) {
                const { data } = await window.db
                    .from('materi')
                    .select('id, judul, kategori_id, nomor_bab, kategori(nama_mapel)')
                    .eq('status', 'publik')
                    .in('id', recentIds);

                if (data) {
                    const order = new Map(recentIds.map((id, i) => [id, i]));
                    materiList = data.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99)).slice(0, 2);
                }
            }

            if (materiList.length > 0) {
                renderCourseCards(materiList, kategoriProgress, progressRows);
            } else {
                grid.innerHTML = `
                    <div id="continueLoading" class="dashboard-empty-state">
                        <div class="dashboard-empty-state__icon">📚</div>
                        <h3>Belum ada materi yang dipelajari</h3>
                        <p>Mulai pilih materi untuk membangun progres belajarmu.</p>
                        <a href="materi.html" class="btn-continue">Jelajahi Materi →</a>
                    </div>
                `;
            }
        } catch (error) {
            console.error('continue learning:', error);
            if (loading) loading.innerHTML = '<p>Gagal memuat data. Coba lagi nanti.</p>';
        }
    }

    function getProgressForMateri(materi, kategoriProgress, progressRows) {
        const row = (progressRows || []).find((r) => r.materi_id === materi.id);
        if (row) {
            if (row.status === 'completed') {
                return { percent: 100, text: 'Selesai' };
            }
            if (row.soal_dijawab > 0) {
                const p = Math.min(99, Math.round((row.soal_benar / Math.max(row.soal_dijawab, 1)) * 100));
                return { percent: Math.max(row.read_progress || 0, p), text: `${row.soal_benar}/${row.soal_dijawab} benar` };
            }
            const readProgress = Math.max(0, Math.min(100, row.read_progress || 0));
            return {
                percent: readProgress,
                text: readProgress >= 100 ? 'Selesai dibaca' : `${readProgress}% dibaca`
            };
        }

        const progress = kategoriProgress[materi.kategori_id];
        if (!progress || progress.total === 0) return { percent: 0, text: 'Belum dimulai' };
        const percent = Math.round((progress.completed / progress.total) * 100);
        const text = progress.completed === progress.total
            ? `${progress.completed}/${progress.total} Selesai`
            : `${progress.completed}/${progress.total} (${percent}%)`;
        return { percent, text };
    }

    function renderCourseCards(materiList, kategoriProgress, progressRows) {
        const grid = el.grid();
        if (!grid) return;
        grid.innerHTML = '';

        materiList.forEach((materi) => {
            const card = document.createElement('div');
            card.className = 'dash-card course-card';
            const kategoriNama = materi.kategori?.nama_mapel || 'Mata Pelajaran';
            const judul = materi.judul || 'Materi Tanpa Judul';
            const { percent, text } = getProgressForMateri(materi, kategoriProgress, progressRows);
            const isComplete = percent >= 100;

            card.innerHTML = `
                <span class="course-badge">${kategoriNama}</span>
                <h3>${judul}</h3>
                <p>Pelajari materi ini untuk meningkatkan pemahamanmu.</p>
                <div class="progress-bar"><div class="progress-fill" style="width: ${percent}%;"></div></div>
                <div class="progress-text">${text}</div>
                <a href="detail-materi.html?id=${materi.id}" class="btn-continue">${isComplete ? '📖 Baca Ulang' : 'Lanjut Baca'} →</a>
            `;
            grid.appendChild(card);
        });
    }

    function subscribeRealtime(userId) {
        teardownRealtime();
        if (!window.db || !window.db.channel) {
            setLiveStatus('error', 'Realtime n/a');
            return;
        }

        const ch1 = window.db
            .channel(`dash-ulp-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'user_learning_progress',
                    filter: `user_id=eq.${userId}`,
                },
                () => scheduleRefresh('ulp')
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'user_activity_log',
                    filter: `user_id=eq.${userId}`,
                },
                () => scheduleRefresh('activity')
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'hasil_tryout',
                    filter: `user_id=eq.${userId}`,
                },
                () => scheduleRefresh('tryout')
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') setLiveStatus('live', 'Live');
                else if (status === 'CHANNEL_ERROR') setLiveStatus('error', 'Realtime error');
                else if (status === 'TIMED_OUT') setLiveStatus('error', 'Timeout');
            });

        realtimeChannels.push(ch1);
    }

    function teardownRealtime() {
        realtimeChannels.forEach((ch) => {
            try {
                window.db.removeChannel(ch);
            } catch (_) {}
        });
        realtimeChannels = [];
    }

    window.addEventListener('beforeunload', teardownRealtime);
    initDashboard();
});

/**
 * ============================================================================
 * 🎮 SCYRA GAMIFICATION ENGINE (Vanilla JS & Browser Global Integration)
 * ============================================================================
 * Menyediakan event listener, reactive state management, XP trigger handlers,
 * dan modal Level Up untuk seluruh halaman web Scyra.
 */

window.ScyraGamificationEngine = (function() {
    'use strict';

    const MAX_LEVEL = 50;

    const XP_PAYOUTS = {
        DAILY_LOGIN: 5,
        DRILL_PACKAGE: 15,
        SUBBAB_MATERI: 20,
        TRYOUT_SUBMISSION: 100
    };

    const STREAK_MILESTONE_XP = {
        3: 10,
        7: 20,
        10: 25,
        14: 35,
        21: 50,
        30: 75,
        60: 120,
        90: 150,
        180: 200,
        365: 300
    };

    // State Internal
    let state = {
        currentLevel: 1,
        levelXp: 0,
        totalXp: 0,
        xpRequired: 100,
        dailyStreak: 1,
        equippedMascot: {
            head: null,
            face: null,
            body: null,
            handheld: null,
            pet: null,
            aura: null,
            badge_frame: null,
            background: null
        },
        unclaimedRewardsCount: 0,
        isLevelUpModalOpen: false,
        levelUpModalData: null,
        listeners: []
    };

    function calculateXpRequired(level) {
        if (level >= MAX_LEVEL) return 0;
        return 100 + ((Math.max(1, level) - 1) * 10);
    }

    function calculateXpProgression(currentLevel, currentLevelXp, addedXp) {
        let level = Math.min(MAX_LEVEL, Math.max(1, currentLevel));
        let xp = Math.max(0, currentLevelXp);
        let remainingXp = Math.max(0, addedXp);
        const oldLevel = level;

        while (remainingXp > 0) {
            if (level >= MAX_LEVEL) {
                level = MAX_LEVEL;
                xp = 0;
                remainingXp = 0;
                break;
            }

            const req = calculateXpRequired(level);
            if (xp + remainingXp >= req) {
                remainingXp -= (req - xp);
                level += 1;
                xp = 0;
            } else {
                xp += remainingXp;
                remainingXp = 0;
            }
        }

        return {
            newLevel: level,
            newLevelXp: xp,
            leveledUp: level > oldLevel,
            levelsGained: level - oldLevel,
            xpRequiredNext: calculateXpRequired(level)
        };
    }

    function subscribe(listener) {
        state.listeners.push(listener);
        return () => {
            state.listeners = state.listeners.filter(l => l !== listener);
        };
    }

    function notifyListeners() {
        state.listeners.forEach(fn => {
            try {
                fn({ ...state });
            } catch (e) {
                console.error('Gamification listener error:', e);
            }
        });
    }

    function getApi() {
        return window.ScyraGamification || null;
    }

    async function syncAchievement(category, value, userId, isAbsolute = false) {
        if (!window.ScyraAchievementEngine) return;
        try {
            if (isAbsolute) {
                await window.ScyraAchievementEngine.setAchievementAbsolute(category, value, userId);
            } else {
                await window.ScyraAchievementEngine.incrementAchievement(category, value, userId);
            }
        } catch (err) {
            console.warn(`Achievement sync failed for ${category}:`, err);
        }
    }

    /**
     * Inisialisasi State dari DB
     */
    async function initialize(userId = null) {
        const api = getApi();
        if (!api) return;

        try {
            const [journey, equipped, inventory] = await Promise.all([
                api.getUserJourneyProgress(userId),
                api.getUserEquippedMascot(userId),
                api.getUserMascotInventory(userId)
            ]);

            const level = journey?.current_level || 1;
            const levelXp = journey?.level_xp || 0;
            const totalXp = journey?.total_xp || 0;
            const streak = journey?.daily_streak || 1;

            state.currentLevel = level;
            state.levelXp = levelXp;
            state.totalXp = totalXp;
            state.xpRequired = calculateXpRequired(level);
            state.dailyStreak = streak;

            state.equippedMascot = {
                head: equipped?.head_item_id || null,
                face: equipped?.face_item_id || null,
                body: equipped?.body_item_id || null,
                handheld: equipped?.handheld_item_id || null,
                pet: equipped?.pet_item_id || null,
                aura: equipped?.aura_item_id || null,
                badge_frame: equipped?.badge_frame_item_id || null,
                background: equipped?.background_item_id || null
            };

            state.unclaimedRewardsCount = Array.isArray(inventory)
                ? inventory.filter(item => !item.is_claimed).length
                : 0;

            notifyListeners();
        } catch (err) {
            console.error('Failed to initialize ScyraGamificationEngine:', err);
        }
    }

    function openLevelUpModal(data) {
        state.isLevelUpModalOpen = true;
        state.levelUpModalData = data;
        notifyListeners();

        // Dispatch custom browser event untuk trigger animasi / popup
        window.dispatchEvent(new CustomEvent('scyra:levelup', { detail: data }));
    }

    function closeLevelUpModal() {
        state.isLevelUpModalOpen = false;
        state.levelUpModalData = null;
        notifyListeners();
    }

    async function setEquippedSlot(slot, itemId) {
        const api = getApi();
        if (!api) return;

        const prev = state.equippedMascot[slot];
        state.equippedMascot[slot] = itemId;
        notifyListeners();

        try {
            await api.equipMascotSlot(slot, itemId);
        } catch (err) {
            console.error(`Failed to equip ${slot}:`, err);
            state.equippedMascot[slot] = prev;
            notifyListeners();
        }
    }

    async function claimReward(inventoryId) {
        const api = getApi();
        if (!api) return;

        try {
            await api.claimMascotItem(inventoryId);
            state.unclaimedRewardsCount = Math.max(0, state.unclaimedRewardsCount - 1);
            notifyListeners();
        } catch (err) {
            console.error('Failed to claim reward:', err);
        }
    }

    async function refreshRewardsCount() {
        const api = getApi();
        if (!api) return;

        try {
            const inventory = await api.getUserMascotInventory();
            state.unclaimedRewardsCount = Array.isArray(inventory)
                ? inventory.filter(item => !item.is_claimed).length
                : 0;
            notifyListeners();
        } catch (err) {
            console.error('Failed to refresh rewards count:', err);
        }
    }

    /**
     * Trigger 1: Daily Login (+5 XP & Streak Milestone Bonus)
     */
    async function triggerDailyLogin(userId = null) {
        const api = getApi();
        if (!api) return { success: false, xpAwarded: 0 };

        const todayStr = new Date().toISOString().slice(0, 10);
        const activityKey = `daily_login_${todayStr}`;

        try {
            const updatedStreakRow = await api.updateDailyStreak(userId);
            const newStreak = updatedStreakRow?.daily_streak || state.dailyStreak;

            let totalLoginXp = XP_PAYOUTS.DAILY_LOGIN;
            const milestoneBonus = STREAK_MILESTONE_XP[newStreak] || 0;
            totalLoginXp += milestoneBonus;

            const res = await api.completeActivityWithXP(
                'daily_login',
                activityKey,
                totalLoginXp,
                `Daily Login Day ${newStreak} (+${totalLoginXp} XP)`,
                userId
            );

            if (res?.awarded && res.xpResult) {
                const xpRes = res.xpResult;
                state.currentLevel = xpRes.new_level;
                state.levelXp = xpRes.level_xp;
                state.totalXp = xpRes.total_xp;
                state.xpRequired = xpRes.xp_required_next;
                state.dailyStreak = newStreak;
                if (window.ScyraAchievementEngine) {
                    await syncAchievement('streak', newStreak, userId, true);
                    if (xpRes.leveled_up) {
                        await syncAchievement('social', xpRes.new_level, userId, true);
                    }
                }
                notifyListeners();

                if (xpRes.leveled_up) {
                    openLevelUpModal({
                        oldLevel: xpRes.old_level,
                        newLevel: xpRes.new_level,
                        levelsGained: xpRes.new_level - xpRes.old_level,
                        unlockedItems: xpRes.unlocked_items || []
                    });
                    refreshRewardsCount();
                }

                window.dispatchEvent(new CustomEvent('scyra:xpgained', { detail: { amount: totalLoginXp, type: 'daily_login' } }));
                return { success: true, xpAwarded: totalLoginXp };
            }

            return { success: false, xpAwarded: 0 };
        } catch (err) {
            console.error('Error in triggerDailyLogin:', err);
            return { success: false, xpAwarded: 0 };
        }
    }

    /**
     * Trigger 2: Drill Package (+15 XP)
     */
    async function triggerDrillCompletion(drillId, drillTitle = '', userId = null) {
        const api = getApi();
        if (!api) return { success: false, xpAwarded: 0 };

        const stringId = String(drillId);
        try {
            const res = await api.completeActivityWithXP(
                'drill',
                stringId,
                XP_PAYOUTS.DRILL_PACKAGE,
                drillTitle ? `Latihan Drill: ${drillTitle}` : `Latihan Drill #${stringId}`,
                userId
            );

            if (res?.awarded && res.xpResult) {
                const xpRes = res.xpResult;
                state.currentLevel = xpRes.new_level;
                state.levelXp = xpRes.level_xp;
                state.totalXp = xpRes.total_xp;
                state.xpRequired = xpRes.xp_required_next;
                if (window.ScyraAchievementEngine) {
                    await syncAchievement('drill', 1, userId);
                    if (xpRes.leveled_up) {
                        await syncAchievement('social', xpRes.new_level, userId, true);
                    }
                }
                notifyListeners();

                if (xpRes.leveled_up) {
                    openLevelUpModal({
                        oldLevel: xpRes.old_level,
                        newLevel: xpRes.new_level,
                        levelsGained: xpRes.new_level - xpRes.old_level,
                        unlockedItems: xpRes.unlocked_items || []
                    });
                    refreshRewardsCount();
                }

                window.dispatchEvent(new CustomEvent('scyra:xpgained', { detail: { amount: XP_PAYOUTS.DRILL_PACKAGE, type: 'drill' } }));
                return { success: true, xpAwarded: XP_PAYOUTS.DRILL_PACKAGE };
            }

            return { success: false, xpAwarded: 0 };
        } catch (err) {
            console.error('Error in triggerDrillCompletion:', err);
            return { success: false, xpAwarded: 0 };
        }
    }

    /**
     * Trigger 3: Subbab Materi & Quiz (+20 XP)
     */
    async function triggerSubbabCompletion(subbabId, subbabTitle = '', userId = null) {
        const api = getApi();
        if (!api) return { success: false, xpAwarded: 0 };

        const stringId = String(subbabId);
        try {
            const res = await api.completeActivityWithXP(
                'subchapter',
                stringId,
                XP_PAYOUTS.SUBBAB_MATERI,
                subbabTitle ? `Materi: ${subbabTitle}` : `Subbab Materi #${stringId}`,
                userId
            );

            if (res?.awarded && res.xpResult) {
                const xpRes = res.xpResult;
                state.currentLevel = xpRes.new_level;
                state.levelXp = xpRes.level_xp;
                state.totalXp = xpRes.total_xp;
                state.xpRequired = xpRes.xp_required_next;
                if (window.ScyraAchievementEngine) {
                    await syncAchievement('mastery', 1, userId);
                    if (xpRes.leveled_up) {
                        await syncAchievement('social', xpRes.new_level, userId, true);
                    }
                }
                notifyListeners();

                if (xpRes.leveled_up) {
                    openLevelUpModal({
                        oldLevel: xpRes.old_level,
                        newLevel: xpRes.new_level,
                        levelsGained: xpRes.new_level - xpRes.old_level,
                        unlockedItems: xpRes.unlocked_items || []
                    });
                    refreshRewardsCount();
                }

                window.dispatchEvent(new CustomEvent('scyra:xpgained', { detail: { amount: XP_PAYOUTS.SUBBAB_MATERI, type: 'subchapter' } }));
                return { success: true, xpAwarded: XP_PAYOUTS.SUBBAB_MATERI };
            }

            return { success: false, xpAwarded: 0 };
        } catch (err) {
            console.error('Error in triggerSubbabCompletion:', err);
            return { success: false, xpAwarded: 0 };
        }
    }

    /**
     * Trigger 4: Tryout Submission (+100 XP)
     */
    async function triggerTryoutSubmission(tryoutId, tryoutTitle = '', isPremium = false, userId = null) {
        const api = getApi();
        if (!api) return { success: false, xpAwarded: 0 };

        const stringId = String(tryoutId);
        const activityType = isPremium ? 'tryout_premium' : 'tryout_regular';
        const label = tryoutTitle ? `Tryout: ${tryoutTitle}` : `Simulasi Tryout #${stringId}`;

        try {
            const res = await api.completeActivityWithXP(
                activityType,
                stringId,
                XP_PAYOUTS.TRYOUT_SUBMISSION,
                label,
                userId
            );

            if (res?.awarded && res.xpResult) {
                const xpRes = res.xpResult;
                state.currentLevel = xpRes.new_level;
                state.levelXp = xpRes.level_xp;
                state.totalXp = xpRes.total_xp;
                state.xpRequired = xpRes.xp_required_next;
                if (window.ScyraAchievementEngine) {
                    await syncAchievement('tryout', 1, userId);
                    if (xpRes.leveled_up) {
                        await syncAchievement('social', xpRes.new_level, userId, true);
                    }
                }
                notifyListeners();

                if (xpRes.leveled_up) {
                    openLevelUpModal({
                        oldLevel: xpRes.old_level,
                        newLevel: xpRes.new_level,
                        levelsGained: xpRes.new_level - xpRes.old_level,
                        unlockedItems: xpRes.unlocked_items || []
                    });
                    refreshRewardsCount();
                }

                window.dispatchEvent(new CustomEvent('scyra:xpgained', { detail: { amount: XP_PAYOUTS.TRYOUT_SUBMISSION, type: 'tryout' } }));
                return { success: true, xpAwarded: XP_PAYOUTS.TRYOUT_SUBMISSION };
            }

            return { success: false, xpAwarded: 0 };
        } catch (err) {
            console.error('Error in triggerTryoutSubmission:', err);
            return { success: false, xpAwarded: 0 };
        }
    }

    return {
        MAX_LEVEL,
        XP_PAYOUTS,
        STREAK_MILESTONE_XP,
        calculateXpRequired,
        calculateXpProgression,
        getState: () => ({ ...state }),
        subscribe,
        initialize,
        openLevelUpModal,
        closeLevelUpModal,
        setEquippedSlot,
        claimReward,
        refreshRewardsCount,
        triggerDailyLogin,
        triggerDrillCompletion,
        triggerSubbabCompletion,
        triggerTryoutSubmission
    };
})();

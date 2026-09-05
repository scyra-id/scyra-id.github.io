/**
 * ============================================================================
 * 🏆 SCYRA ACHIEVEMENT ENGINE
 * 5-Category Achievement System with Cumulative Tier Milestones & Diamond Rewards
 * ============================================================================
 */

window.ScyraAchievementEngine = (function() {
    'use strict';

    // -------------------------------------------------------------------------
    // CATEGORY DEFINITIONS & MILESTONE TARGETS
    // -------------------------------------------------------------------------

    const CATEGORIES = {
        drill: {
            id: 'drill',
            name: 'Drill Hunter',
            icon: '📝',
            description: 'Taklukkan latihan soal sebanyak mungkin.',
            diamondItem: {
                name: 'Drill Master Headset',
                item_code: 'ach_drill_master_headset',
                slot: 'head',
                rarity: 'legendary'
            },
            tiers: {
                bronze:  { target: 10,  label: 'Bronze',  icon: '🥉' },
                silver:  { target: 25,  label: 'Silver',  icon: '🥈' },
                gold:    { target: 45,  label: 'Gold',    icon: '🥇' },
                diamond: { target: 70,  label: 'Diamond', icon: '💎' }
            }
        },
        mastery: {
            id: 'mastery',
            name: 'Knowledge Seeker',
            icon: '📚',
            description: 'Kuasai subbab materi dan selesaikan kuis akhir.',
            diamondItem: {
                name: 'Knowledge Halo',
                item_code: 'ach_knowledge_halo',
                slot: 'head',
                rarity: 'legendary'
            },
            tiers: {
                bronze:  { target: 10,  label: 'Bronze',  icon: '🥉' },
                silver:  { target: 25,  label: 'Silver',  icon: '🥈' },
                gold:    { target: 45,  label: 'Gold',    icon: '🥇' },
                diamond: { target: 70,  label: 'Diamond', icon: '💎' }
            }
        },
        tryout: {
            id: 'tryout',
            name: 'Tryout Voyager',
            icon: '🚀',
            description: 'Selesaikan simulasi tryout UTBK.',
            diamondItem: {
                name: 'Voyager Visor',
                item_code: 'ach_voyager_visor',
                slot: 'face',
                rarity: 'legendary'
            },
            tiers: {
                bronze:  { target: 1,   label: 'Bronze',  icon: '🥉' },
                silver:  { target: 5,   label: 'Silver',  icon: '🥈' },
                gold:    { target: 10,  label: 'Gold',    icon: '🥇' },
                diamond: { target: 20,  label: 'Diamond', icon: '💎' }
            }
        },
        streak: {
            id: 'streak',
            name: 'Consistency Flame',
            icon: '🔥',
            description: 'Jaga streak login harian tanpa putus.',
            diamondItem: {
                name: 'Eternal Flame Aura',
                item_code: 'ach_eternal_flame_aura',
                slot: 'aura',
                rarity: 'legendary'
            },
            tiers: {
                bronze:  { target: 10,  label: 'Bronze',  icon: '🥉', milestones: [3, 7, 10] },
                silver:  { target: 30,  label: 'Silver',  icon: '🥈', milestones: [14, 21, 30] },
                gold:    { target: 120, label: 'Gold',    icon: '🥇', milestones: [60, 90, 120] },
                diamond: { target: 365, label: 'Diamond', icon: '💎', milestones: [180, 270, 365] }
            }
        },
        social: {
            id: 'social',
            name: 'Journey Climber',
            icon: '⭐',
            description: 'Naikkan level perjalanan belajarmu.',
            diamondItem: {
                name: 'Journey Star Crest',
                item_code: 'ach_journey_star_crest',
                slot: 'badge_frame',
                rarity: 'legendary'
            },
            tiers: {
                bronze:  { target: 10,  label: 'Bronze',  icon: '🥉', milestones: [5, 10] },
                silver:  { target: 20,  label: 'Silver',  icon: '🥈', milestones: [15, 20] },
                gold:    { target: 35,  label: 'Gold',    icon: '🥇', milestones: [25, 30, 35] },
                diamond: { target: 50,  label: 'Diamond', icon: '💎', milestones: [40, 45, 50] }
            }
        }
    };

    const TIER_ORDER = ['bronze', 'silver', 'gold', 'diamond'];

    // -------------------------------------------------------------------------
    // TIER CALCULATION (Cumulative, never resets)
    // -------------------------------------------------------------------------

    function calculateTier(category, currentProgress) {
        const cat = CATEGORIES[category];
        if (!cat) return { tier: 'bronze', tierIndex: 0 };

        let resolvedTier = 'bronze';
        let resolvedIndex = 0;

        for (let i = TIER_ORDER.length - 1; i >= 0; i--) {
            const tierKey = TIER_ORDER[i];
            const tierDef = cat.tiers[tierKey];
            if (currentProgress >= tierDef.target) {
                resolvedTier = tierKey;
                resolvedIndex = i;
                break;
            }
        }

        return { tier: resolvedTier, tierIndex: resolvedIndex };
    }

    function getNextTier(category, currentProgress) {
        const cat = CATEGORIES[category];
        if (!cat) return null;

        for (let i = 0; i < TIER_ORDER.length; i++) {
            const tierKey = TIER_ORDER[i];
            const tierDef = cat.tiers[tierKey];
            if (currentProgress < tierDef.target) {
                return {
                    tier: tierKey,
                    tierIndex: i,
                    target: tierDef.target,
                    remaining: tierDef.target - currentProgress,
                    label: tierDef.label,
                    icon: tierDef.icon
                };
            }
        }

        return null; // All tiers achieved
    }

    function getTierInfo(category, tierKey) {
        const cat = CATEGORIES[category];
        if (!cat || !cat.tiers[tierKey]) return null;
        return { ...cat.tiers[tierKey], key: tierKey };
    }

    // -------------------------------------------------------------------------
    // PROGRESS TRACKING & TIER-UP DETECTION
    // -------------------------------------------------------------------------

    /**
     * Process achievement progress update. Returns tier-up events if any.
     */
    async function processAchievementProgress(category, newProgress, userId = null) {
        const api = window.ScyraGamification;
        if (!api) return { success: false };

        const cat = CATEGORIES[category];
        if (!cat) return { success: false };

        try {
            // Get existing progress
            const allAch = await api.getUserAchievements(userId);
            const existing = allAch.find(a => a.category === category);
            const oldProgress = existing ? existing.current_progress : 0;
            const oldTier = calculateTier(category, oldProgress);

            // Determine new tier
            const newTier = calculateTier(category, newProgress);
            const tierChanged = newTier.tierIndex > oldTier.tierIndex;

            const data = await api.setAchievementProgress(
                category,
                newProgress,
                newTier.tierIndex + 1
            );

            let unlockedDiamondItem = null;

            if (newTier.tier === 'diamond' && oldTier.tier !== 'diamond') {
                unlockedDiamondItem = cat.diamondItem;
            }

            return {
                success: true,
                category,
                oldProgress,
                newProgress,
                oldTier: oldTier.tier,
                newTier: newTier.tier,
                tierChanged,
                unlockedDiamondItem,
                data
            };
        } catch (err) {
            console.error(`Error processing achievement ${category}:`, err);
            return { success: false };
        }
    }

    /**
     * Increment achievement by delta (convenience wrapper)
     */
    async function incrementAchievement(category, delta = 1, userId = null) {
        const api = window.ScyraGamification;
        if (!api) return { success: false };

        try {
            const allAch = await api.getUserAchievements(userId);
            const existing = allAch.find(a => a.category === category);
            const oldProgress = existing ? existing.current_progress : 0;
            const newProgress = oldProgress + delta;

            return await processAchievementProgress(category, newProgress, userId);
        } catch (err) {
            console.error(`Error incrementing achievement ${category}:`, err);
            return { success: false };
        }
    }

    /**
     * Set achievement to absolute value (for streak/level that are read from state)
     */
    async function setAchievementAbsolute(category, absoluteValue, userId = null) {
        return await processAchievementProgress(category, absoluteValue, userId);
    }

    // -------------------------------------------------------------------------
    // FEATURED BADGES (Profile Showcase - Max 3)
    // -------------------------------------------------------------------------

    async function getFeaturedBadges(userId = null) {
        const api = window.ScyraGamification;
        if (!api) return [];
        return await api.getFeaturedAchievements(userId);
    }

    async function setFeaturedBadge(slotPosition, achievementCategory, userId = null) {
        const api = window.ScyraGamification;
        if (!api) throw new Error('Gamification API not loaded');
        return await api.setFeaturedAchievement(slotPosition, achievementCategory, userId);
    }

    async function removeFeaturedBadge(slotPosition) {
        const api = window.ScyraGamification;
        if (!api) throw new Error('Gamification API not loaded');
        return api.removeFeaturedAchievement(slotPosition);
    }

    // -------------------------------------------------------------------------
    // OVERALL PROGRESS SUMMARY
    // -------------------------------------------------------------------------

    /**
     * Get full summary for all 5 categories (used by /achievements page)
     */
    async function getFullAchievementSummary(userId = null) {
        const api = window.ScyraGamification;
        if (!api) return { categories: [], totalTiersUnlocked: 0, totalTiersPossible: 20 };

        try {
            const allAch = await api.getUserAchievements(userId);
            const journey = await api.getUserJourneyProgress(userId);

            let totalTiersUnlocked = 0;
            const categories = Object.keys(CATEGORIES).map(catKey => {
                const cat = CATEGORIES[catKey];
                const dbRow = allAch.find(a => a.category === catKey);

                let progress = dbRow ? dbRow.current_progress : 0;

                // For streak: use live daily_streak from journey
                if (catKey === 'streak' && journey) {
                    progress = Math.max(progress, journey.daily_streak || 0);
                }
                // For social (Journey Climber): use current_level
                if (catKey === 'social' && journey) {
                    progress = Math.max(progress, journey.current_level || 0);
                }

                const currentTierResult = calculateTier(catKey, progress);
                const nextTierResult = getNextTier(catKey, progress);
                const diamondTarget = cat.tiers.diamond.target;

                totalTiersUnlocked += TIER_ORDER.filter((tierKey) => progress >= cat.tiers[tierKey].target).length;

                return {
                    key: catKey,
                    ...cat,
                    progress,
                    currentTier: currentTierResult.tier,
                    currentTierIndex: currentTierResult.tierIndex,
                    currentTierIcon: cat.tiers[currentTierResult.tier].icon,
                    currentTierLabel: cat.tiers[currentTierResult.tier].label,
                    nextTier: nextTierResult,
                    isMaxed: !nextTierResult,
                    diamondTarget
                };
            });

            return {
                categories,
                totalTiersUnlocked,
                totalTiersPossible: 20
            };
        } catch (err) {
            console.error('Error fetching achievement summary:', err);
            return { categories: [], totalTiersUnlocked: 0, totalTiersPossible: 20 };
        }
    }

    // -------------------------------------------------------------------------
    // HELPERS
    // -------------------------------------------------------------------------

    async function getActiveUserId() {
        try {
            if (window.db) {
                const { data: { user } } = await window.db.auth.getUser();
                if (user) return user.id;
            }
        } catch (e) { /* silent */ }
        return null;
    }

    return {
        CATEGORIES,
        TIER_ORDER,
        calculateTier,
        getNextTier,
        getTierInfo,
        processAchievementProgress,
        incrementAchievement,
        setAchievementAbsolute,
        getFeaturedBadges,
        setFeaturedBadge,
        removeFeaturedBadge,
        getFullAchievementSummary
    };
})();

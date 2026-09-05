// ==========================================
// 🏦 SUPABASE CLIENT 2 (PAYMENT & GAMIFICATION)
// ==========================================

const SUPABASE_URL_PAYMENT = 'https://zevbiyiphwukvqugkrkt.supabase.co/';
const SUPABASE_ANON_KEY_PAYMENT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpldmJpeWlwaHd1a3ZxdWdrcmt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMDAzNTQsImV4cCI6MjA5OTc3NjM1NH0.Msp6H2pCxu3t5cxdOgat3ApmRV9gm3LIw0-LZDHJ_7Y';

window.dbPayment = window.supabase.createClient(SUPABASE_URL_PAYMENT, SUPABASE_ANON_KEY_PAYMENT);
window._authSyncedToPaymentDB = false;

async function syncAuthToPaymentDB() {
    try {
        if (!window.db) return false;
        const { data: { session } } = await window.db.auth.getSession();
        if (!session?.access_token) return false;
        await window.dbPayment.auth.setSession(session);
        window._authSyncedToPaymentDB = true;
        return true;
    } catch (_) {
        return false;
    }
}

window.syncAuthToPaymentDB = syncAuthToPaymentDB;
setTimeout(() => {
    if (window.db) window.db.auth.onAuthStateChange(() => syncAuthToPaymentDB());
}, 1000);

window.safePaymentQuery = async (table, method = 'select', ...args) => window.dbPayment.from(table)[method](...args);

// ============================================================================
// 🎮 SCYRA GAMIFICATION GATEWAY CLIENT
// All journey data is accessed through the dbPayment Edge Function. The primary
// database JWT is sent to the gateway, where it is validated server-side.
// ============================================================================

window.ScyraGamification = (function() {
    'use strict';

    const MAX_LEVEL = 50;
    const GATEWAY_URL = `${SUPABASE_URL_PAYMENT.replace(/\/$/, '')}/functions/v1/gamification-gateway`;

    function calculateXpRequiredForLevel(level) {
        if (level >= MAX_LEVEL) return 0;
        return 100 + ((Math.max(1, level) - 1) * 10);
    }

    async function callGateway(action, payload = {}) {
        if (!window.db) throw new Error('Primary Supabase client is not available');
        const { data: { session } } = await window.db.auth.getSession();
        if (!session?.access_token) throw new Error('User not authenticated');

        const response = await fetch(GATEWAY_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'apikey': SUPABASE_ANON_KEY_PAYMENT,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action, ...payload })
        });

        let result;
        try {
            result = await response.json();
        } catch (_) {
            throw new Error('Gamification gateway returned an invalid response');
        }

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Gamification gateway request failed');
        }
        return result.data;
    }

    async function getUserJourneyProgress() {
        return callGateway('journey.get');
    }

    async function updateDailyStreak() {
        return callGateway('journey.daily_login');
    }

    async function addUserXP(xpAmount, activityType, activityName = '', referenceId = null) {
        return callGateway('xp.add', { xpAmount, activityType, activityName, referenceId });
    }

    async function getXpActivityLogs(limit = 20, offset = 0) {
        return callGateway('xp.history', { limit, offset });
    }

    async function isActivityCompleted(activityType, activityId) {
        const result = await callGateway('activity.check', { activityType, activityId });
        return result.completed;
    }

    async function completeActivityWithXP(activityType, activityId, xpReward, activityName = '') {
        return callGateway('activity.complete', { activityType, activityId, xpAmount: xpReward, activityName });
    }

    async function getItemDefinitions(slot = null) {
        return callGateway('items.definitions', { slot });
    }

    async function getUserMascotInventory() {
        return callGateway('inventory.get');
    }

    async function claimMascotItem(userInventoryId, itemId = null) {
        const payload = {};
        if (typeof userInventoryId === 'object' && userInventoryId !== null) {
            Object.assign(payload, userInventoryId);
        } else {
            if (typeof userInventoryId === 'string' && userInventoryId.trim()) {
                payload.inventoryId = userInventoryId.trim();
            }
            if (typeof itemId === 'string' && itemId.trim()) {
                payload.itemId = itemId.trim();
            }
        }
        return callGateway('inventory.claim', payload);
    }

    async function getUserEquippedMascot() {
        return callGateway('mascot.get');
    }

    const MASCOT_SLOT_ALIASES = {
        body: 'BODY',
        face: 'EXPRESSION',
        expression: 'EXPRESSION',
        pet: 'ANTENNA',
        antenna: 'ANTENNA',
        head: 'HEAD',
        handheld: 'FACE',
        outfit: 'OUTFIT',
        aura: 'OUTFIT',
        back: 'BACK',
        badge_frame: 'BACK',
        effect: 'EFFECT',
        background: 'EFFECT'
    };

    function normalizeMascotSlot(slotName) {
        const raw = String(slotName || '').trim();
        const valid = ['BODY', 'EXPRESSION', 'ANTENNA', 'HEAD', 'FACE', 'OUTFIT', 'BACK', 'EFFECT'];
        if (valid.includes(raw)) return raw;
        const slot = MASCOT_SLOT_ALIASES[raw.toLowerCase()];
        if (!slot) throw new Error(`Invalid mascot slot: ${slotName}`);
        return slot;
    }

    async function equipMascotSlot(slotName, itemId = null) {
        return callGateway('mascot.equip', { slot: normalizeMascotSlot(slotName), itemId });
    }

    async function getUserAchievements() {
        return callGateway('achievements.get');
    }

    async function setAchievementProgress(category, progress, tier) {
        return callGateway('achievements.set', { category, progress, tier });
    }

    async function getFeaturedAchievements() {
        return callGateway('featured.get');
    }

    async function setFeaturedAchievement(slotPosition, achievementCategory) {
        return callGateway('featured.set', { slotPosition, category: achievementCategory });
    }

    async function removeFeaturedAchievement(slotPosition) {
        return callGateway('featured.remove', { slotPosition });
    }

    return {
        MAX_LEVEL,
        calculateXpRequiredForLevel,
        callGateway,
        getUserJourneyProgress,
        updateDailyStreak,
        addUserXP,
        getXpActivityLogs,
        isActivityCompleted,
        completeActivityWithXP,
        getItemDefinitions,
        getUserMascotInventory,
        claimMascotItem,
        getUserEquippedMascot,
        normalizeMascotSlot,
        equipMascotSlot,
        getUserAchievements,
        setAchievementProgress,
        getFeaturedAchievements,
        setFeaturedAchievement,
        removeFeaturedAchievement
    };
})();

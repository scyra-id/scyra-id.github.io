import { create } from 'zustand';

/**
 * ----------------------------------------------------------------------------
 * CONSTANTS & CALCULATION ENGINE
 * ----------------------------------------------------------------------------
 */
export const MAX_LEVEL = 50;

/**
 * XP Formula: 100 + ((Level - 1) * 10)
 * Level 1 -> Level 2: 100 XP
 * Level 2 -> Level 3: 110 XP
 * ...
 * Level 50: Max Level (0 XP needed)
 */
export function calculateXpRequired(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return 100 + (Math.max(1, level) - 1) * 10;
}

/**
 * Pure XP Level-Up Calculation Engine with Overflow Handling
 */
export function calculateXpProgression(
  currentLevel: number,
  currentLevelXp: number,
  addedXp: number
): {
  newLevel: number;
  newLevelXp: number;
  leveledUp: boolean;
  levelsGained: number;
  xpRequiredNext: number;
} {
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
      remainingXp -= req - xp;
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
    xpRequiredNext: calculateXpRequired(level),
  };
}

/**
 * Fixed XP Payout Rules (Non-Grade Dependent)
 */
export const XP_PAYOUTS = {
  DAILY_LOGIN: 5,
  DRILL_PACKAGE: 15,
  SUBBAB_MATERI: 20,
  TRYOUT_SUBMISSION: 100,
} as const;

/**
 * Daily Streak Bonus Milestones
 */
export const STREAK_MILESTONE_XP: Record<number, number> = {
  3: 10,
  7: 20,
  10: 25,
  14: 35,
  21: 50,
  30: 75,
  60: 120,
  90: 150,
  180: 200,
  365: 300,
};

/**
 * ----------------------------------------------------------------------------
 * TYPE DEFINITIONS
 * ----------------------------------------------------------------------------
 */
export type MascotSlot =
  | 'head'
  | 'face'
  | 'body'
  | 'handheld'
  | 'pet'
  | 'aura'
  | 'badge_frame'
  | 'background';

export type MascotItemRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'mythic';

export interface EquippedMascotState {
  head: string | null;
  face: string | null;
  body: string | null;
  handheld: string | null;
  pet: string | null;
  aura: string | null;
  badge_frame: string | null;
  background: string | null;
}

export interface UnlockedItemMilestone {
  item_id: string;
  item_code: string;
  name: string;
  slot: MascotSlot;
  rarity: MascotItemRarity;
  unlocked_at_level: number;
}

export interface LevelUpEventData {
  oldLevel: number;
  newLevel: number;
  levelsGained: number;
  unlockedItems: UnlockedItemMilestone[];
}

export interface GamificationState {
  // State variables
  currentLevel: number;
  levelXp: number;
  totalXp: number;
  xpRequired: number;
  dailyStreak: number;
  equippedMascot: EquippedMascotState;
  unclaimedRewardsCount: number;
  isLevelUpModalOpen: boolean;
  levelUpModalData: LevelUpEventData | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: (userId?: string) => Promise<void>;
  openLevelUpModal: (data: LevelUpEventData) => void;
  closeLevelUpModal: () => void;
  setEquippedSlot: (slot: MascotSlot, itemId: string | null) => Promise<void>;
  claimReward: (inventoryId: string) => Promise<void>;
  refreshRewardsCount: () => Promise<void>;

  // Activity Triggers (Anti-Duplicate & Fixed Payout)
  triggerDailyLogin: (userId?: string) => Promise<{ success: boolean; xpAwarded: number }>;
  triggerDrillCompletion: (drillId: string | number, drillTitle?: string, userId?: string) => Promise<{ success: boolean; xpAwarded: number }>;
  triggerSubbabCompletion: (subbabId: string | number, subbabTitle?: string, userId?: string) => Promise<{ success: boolean; xpAwarded: number }>;
  triggerTryoutSubmission: (tryoutId: string | number, tryoutTitle?: string, isPremium?: boolean, userId?: string) => Promise<{ success: boolean; xpAwarded: number }>;
  triggerCustomActivity: (activityType: string, activityId: string, xpAmount: number, activityName?: string, userId?: string) => Promise<{ success: boolean; xpAwarded: number }>;
}

/**
 * ----------------------------------------------------------------------------
 * HELPER: Access Global ScyraGamification Client or Fallback
 * ----------------------------------------------------------------------------
 */
function getGamificationApi() {
  if (typeof window !== 'undefined' && (window as any).ScyraGamification) {
    return (window as any).ScyraGamification;
  }
  return null;
}

const DEFAULT_EQUIPPED: EquippedMascotState = {
  head: null,
  face: null,
  body: null,
  handheld: null,
  pet: null,
  aura: null,
  badge_frame: null,
  background: null,
};

/**
 * ----------------------------------------------------------------------------
 * ZUSTAND STORE HOOK: useGamificationStore
 * ----------------------------------------------------------------------------
 */
export const useGamificationStore = create<GamificationState>((set, get) => ({
  currentLevel: 1,
  levelXp: 0,
  totalXp: 0,
  xpRequired: calculateXpRequired(1),
  dailyStreak: 1,
  equippedMascot: DEFAULT_EQUIPPED,
  unclaimedRewardsCount: 0,
  isLevelUpModalOpen: false,
  levelUpModalData: null,
  isLoading: false,
  error: null,

  /**
   * Initialize and synchronize full gamification state from dbPayment
   */
  initialize: async (userId?: string) => {
    const api = getGamificationApi();
    if (!api) return;

    set({ isLoading: true, error: null });
    try {
      const [journey, equipped, inventory] = await Promise.all([
        api.getUserJourneyProgress(userId),
        api.getUserEquippedMascot(userId),
        api.getUserMascotInventory(userId),
      ]);

      const level = journey?.current_level || 1;
      const levelXp = journey?.level_xp || 0;
      const totalXp = journey?.total_xp || 0;
      const streak = journey?.daily_streak || 1;

      const equippedState: EquippedMascotState = {
        head: equipped?.head_item_id || null,
        face: equipped?.face_item_id || null,
        body: equipped?.body_item_id || null,
        handheld: equipped?.handheld_item_id || null,
        pet: equipped?.pet_item_id || null,
        aura: equipped?.aura_item_id || null,
        badge_frame: equipped?.badge_frame_item_id || null,
        background: equipped?.background_item_id || null,
      };

      const unclaimedCount = Array.isArray(inventory)
        ? inventory.filter((item: any) => !item.is_claimed).length
        : 0;

      set({
        currentLevel: level,
        levelXp: levelXp,
        totalXp: totalXp,
        xpRequired: calculateXpRequired(level),
        dailyStreak: streak,
        equippedMascot: equippedState,
        unclaimedRewardsCount: unclaimedCount,
        isLoading: false,
      });
    } catch (err: any) {
      console.error('Failed to initialize Gamification Store:', err);
      set({ error: err?.message || 'Failed to initialize gamification', isLoading: false });
    }
  },

  openLevelUpModal: (data: LevelUpEventData) => {
    set({
      isLevelUpModalOpen: true,
      levelUpModalData: data,
    });
  },

  closeLevelUpModal: () => {
    set({
      isLevelUpModalOpen: false,
      levelUpModalData: null,
    });
  },

  setEquippedSlot: async (slot: MascotSlot, itemId: string | null) => {
    const api = getGamificationApi();
    if (!api) return;

    const prev = get().equippedMascot;
    set({
      equippedMascot: {
        ...prev,
        [slot]: itemId,
      },
    });

    try {
      await api.equipMascotSlot(slot, itemId);
    } catch (err: any) {
      console.error(`Failed to equip slot ${slot}:`, err);
      set({ equippedMascot: prev, error: err?.message });
    }
  },

  claimReward: async (inventoryId: string) => {
    const api = getGamificationApi();
    if (!api) return;

    try {
      await api.claimMascotItem(inventoryId);
      set((state) => ({
        unclaimedRewardsCount: Math.max(0, state.unclaimedRewardsCount - 1),
      }));
    } catch (err: any) {
      console.error('Failed to claim reward item:', err);
      set({ error: err?.message });
    }
  },

  refreshRewardsCount: async () => {
    const api = getGamificationApi();
    if (!api) return;

    try {
      const inventory = await api.getUserMascotInventory();
      const unclaimedCount = Array.isArray(inventory)
        ? inventory.filter((item: any) => !item.is_claimed).length
        : 0;
      set({ unclaimedRewardsCount: unclaimedCount });
    } catch (err: any) {
      console.error('Failed to refresh rewards count:', err);
    }
  },

  /**
   * Trigger 1: Daily Login (+5 XP, max 1x/day + Streak Bonus XP)
   */
  triggerDailyLogin: async (userId?: string) => {
    const api = getGamificationApi();
    if (!api) return { success: false, xpAwarded: 0 };

    const todayStr = new Date().toISOString().slice(0, 10);
    const activityKey = `daily_login_${todayStr}`;

    const alreadyDone = await api.isActivityCompleted('daily_login', activityKey, userId);
    if (alreadyDone) {
      return { success: false, xpAwarded: 0 };
    }

    try {
      // 1. Update streak
      const updatedStreakRow = await api.updateDailyStreak(userId);
      const newStreak = updatedStreakRow?.daily_streak || get().dailyStreak;

      // 2. Base login XP (5 XP) + Milestone streak bonus if applicable
      let totalLoginXp = XP_PAYOUTS.DAILY_LOGIN;
      const milestoneBonus = STREAK_MILESTONE_XP[newStreak] || 0;
      totalLoginXp += milestoneBonus;

      // 3. Mark completed & award XP atomically
      const res = await api.completeActivityWithXP(
        'daily_login',
        activityKey,
        totalLoginXp,
        `Daily Login Day ${newStreak} (+${totalLoginXp} XP)`,
        userId
      );

      if (res?.awarded && res.xpResult) {
        const xpRes = res.xpResult;
        set({
          currentLevel: xpRes.new_level,
          levelXp: xpRes.level_xp,
          totalXp: xpRes.total_xp,
          xpRequired: xpRes.xp_required_next,
          dailyStreak: newStreak,
        });

        if (xpRes.leveled_up) {
          get().openLevelUpModal({
            oldLevel: xpRes.old_level,
            newLevel: xpRes.new_level,
            levelsGained: xpRes.new_level - xpRes.old_level,
            unlockedItems: xpRes.unlocked_items || [],
          });
          get().refreshRewardsCount();
        }

        return { success: true, xpAwarded: totalLoginXp };
      }

      return { success: false, xpAwarded: 0 };
    } catch (err: any) {
      console.error('Error triggering daily login XP:', err);
      return { success: false, xpAwarded: 0 };
    }
  },

  /**
   * Trigger 2: Drill Package Completion (+15 XP, First Completion Only)
   */
  triggerDrillCompletion: async (drillId: string | number, drillTitle = '', userId?: string) => {
    const api = getGamificationApi();
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
        set({
          currentLevel: xpRes.new_level,
          levelXp: xpRes.level_xp,
          totalXp: xpRes.total_xp,
          xpRequired: xpRes.xp_required_next,
        });

        if (xpRes.leveled_up) {
          get().openLevelUpModal({
            oldLevel: xpRes.old_level,
            newLevel: xpRes.new_level,
            levelsGained: xpRes.new_level - xpRes.old_level,
            unlockedItems: xpRes.unlocked_items || [],
          });
          get().refreshRewardsCount();
        }

        return { success: true, xpAwarded: XP_PAYOUTS.DRILL_PACKAGE };
      }

      return { success: false, xpAwarded: 0 };
    } catch (err: any) {
      console.error('Error triggering drill completion XP:', err);
      return { success: false, xpAwarded: 0 };
    }
  },

  /**
   * Trigger 3: Subbab Materi + Quiz Completion (+20 XP, First Completion Only)
   */
  triggerSubbabCompletion: async (subbabId: string | number, subbabTitle = '', userId?: string) => {
    const api = getGamificationApi();
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
        set({
          currentLevel: xpRes.new_level,
          levelXp: xpRes.level_xp,
          totalXp: xpRes.total_xp,
          xpRequired: xpRes.xp_required_next,
        });

        if (xpRes.leveled_up) {
          get().openLevelUpModal({
            oldLevel: xpRes.old_level,
            newLevel: xpRes.new_level,
            levelsGained: xpRes.new_level - xpRes.old_level,
            unlockedItems: xpRes.unlocked_items || [],
          });
          get().refreshRewardsCount();
        }

        return { success: true, xpAwarded: XP_PAYOUTS.SUBBAB_MATERI };
      }

      return { success: false, xpAwarded: 0 };
    } catch (err: any) {
      console.error('Error triggering subbab completion XP:', err);
      return { success: false, xpAwarded: 0 };
    }
  },

  /**
   * Trigger 4: Tryout Regular & Premium Submission (+100 XP, First Completion Only)
   */
  triggerTryoutSubmission: async (
    tryoutId: string | number,
    tryoutTitle = '',
    isPremium = false,
    userId?: string
  ) => {
    const api = getGamificationApi();
    if (!api) return { success: false, xpAwarded: 0 };

    const stringId = String(tryoutId);
    const activityType = isPremium ? 'tryout_premium' : 'tryout_regular';
    const label = tryoutTitle
      ? `Tryout: ${tryoutTitle}`
      : `Simulasi Tryout #${stringId}`;

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
        set({
          currentLevel: xpRes.new_level,
          levelXp: xpRes.level_xp,
          totalXp: xpRes.total_xp,
          xpRequired: xpRes.xp_required_next,
        });

        if (xpRes.leveled_up) {
          get().openLevelUpModal({
            oldLevel: xpRes.old_level,
            newLevel: xpRes.new_level,
            levelsGained: xpRes.new_level - xpRes.old_level,
            unlockedItems: xpRes.unlocked_items || [],
          });
          get().refreshRewardsCount();
        }

        return { success: true, xpAwarded: XP_PAYOUTS.TRYOUT_SUBMISSION };
      }

      return { success: false, xpAwarded: 0 };
    } catch (err: any) {
      console.error('Error triggering tryout submission XP:', err);
      return { success: false, xpAwarded: 0 };
    }
  },

  /**
   * Generic Custom Activity Trigger
   */
  triggerCustomActivity: async (
    activityType: string,
    activityId: string,
    xpAmount: number,
    activityName = '',
    userId?: string
  ) => {
    const api = getGamificationApi();
    if (!api) return { success: false, xpAwarded: 0 };

    try {
      const res = await api.completeActivityWithXP(
        activityType,
        activityId,
        xpAmount,
        activityName,
        userId
      );

      if (res?.awarded && res.xpResult) {
        const xpRes = res.xpResult;
        set({
          currentLevel: xpRes.new_level,
          levelXp: xpRes.level_xp,
          totalXp: xpRes.total_xp,
          xpRequired: xpRes.xp_required_next,
        });

        if (xpRes.leveled_up) {
          get().openLevelUpModal({
            oldLevel: xpRes.old_level,
            newLevel: xpRes.new_level,
            levelsGained: xpRes.new_level - xpRes.old_level,
            unlockedItems: xpRes.unlocked_items || [],
          });
          get().refreshRewardsCount();
        }

        return { success: true, xpAwarded: xpAmount };
      }

      return { success: false, xpAwarded: 0 };
    } catch (err: any) {
      console.error('Error triggering custom activity XP:', err);
      return { success: false, xpAwarded: 0 };
    }
  },
}));

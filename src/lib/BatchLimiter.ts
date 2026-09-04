const STORAGE_KEY = 'cofreutil_usage_count';
const MAX_FREE_BATCH = 5;

export class BatchLimiter {
  static getUsageCount(): number {
    if (typeof window === 'undefined') return 0;
    const count = localStorage.getItem(STORAGE_KEY);
    return count ? parseInt(count, 10) : 0;
  }

  static incrementUsage(amount: number = 1): number {
    const current = this.getUsageCount();
    const updated = current + amount;
    localStorage.setItem(STORAGE_KEY, updated.toString());
    return updated;
  }

  static isLimitReached(): boolean {
    return this.getUsageCount() >= MAX_FREE_BATCH;
  }

  static getRemaining(): number {
    return Math.max(0, MAX_FREE_BATCH - this.getUsageCount());
  }

  static reset(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  }
}

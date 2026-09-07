const STORAGE_KEY = 'cofreutil_usage_count';
const SUPPORT_REMINDER_EVERY = 3;

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

  /** Lembrete suave de apoio via Pix — NUNCA bloqueia o processamento. */
  static shouldPromptSupport(): boolean {
    const count = this.getUsageCount();
    return count > 0 && count % SUPPORT_REMINDER_EVERY === 0;
  }

  /** Mantido por compatibilidade: agora é um lembrete (soft), não um bloqueio rígido. */
  static isLimitReached(): boolean {
    return this.shouldPromptSupport();
  }

  /** Uso é ilimitado e gratuito — não há mais contagem regressiva de bloqueio. */
  static getRemaining(): number {
    return 0;
  }

  static reset(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  }
}
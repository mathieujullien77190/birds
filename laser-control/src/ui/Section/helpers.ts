export const OPEN_KEY = (title: string) => `ui-section-v2:${title}`;
export const readOpen = (title: string, fallback: boolean): boolean => { try { const v = localStorage.getItem(OPEN_KEY(title)); return v === null ? fallback : v === '1'; } catch { return fallback; } };

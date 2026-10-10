export type BtnVariant = 'primary' | 'secondary' | 'danger' | 'warn' | 'ghost';

export const VARIANTS: Record<BtnVariant, string> = {
  primary: 'bg-emerald-700 text-white hover:bg-emerald-800 border-emerald-700',
  secondary: 'bg-white text-stone-800 hover:bg-stone-100 border-stone-300',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 border-rose-600',
  warn: 'bg-amber-600 text-white hover:bg-amber-700 border-amber-600',
  ghost: 'bg-transparent text-stone-600 hover:bg-stone-100 border-transparent',
};

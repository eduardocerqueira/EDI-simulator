import { Apple, Beef, Bean, Carrot, Cherry, Coffee, Droplet, Egg, Flame, Leaf, Milk, Package, Wheat, Drumstick, type LucideIcon } from 'lucide-react';
import { cn } from '@edi/ui/lib/utils';

const ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  Vegetables: { icon: Carrot, tone: 'bg-orange-500/12 text-orange-600 dark:text-orange-400' },
  Fruit: { icon: Apple, tone: 'bg-red-500/12 text-red-600 dark:text-red-400' },
  Berries: { icon: Cherry, tone: 'bg-pink-500/12 text-pink-600 dark:text-pink-400' },
  Dairy: { icon: Milk, tone: 'bg-sky-500/12 text-sky-600 dark:text-sky-400' },
  Eggs: { icon: Egg, tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  Poultry: { icon: Drumstick, tone: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' },
  Meat: { icon: Beef, tone: 'bg-rose-500/12 text-rose-700 dark:text-rose-400' },
  Grains: { icon: Wheat, tone: 'bg-yellow-600/12 text-yellow-700 dark:text-yellow-500' },
  Legumes: { icon: Bean, tone: 'bg-lime-600/12 text-lime-700 dark:text-lime-400' },
  Herbs: { icon: Leaf, tone: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' },
  'Honey & Syrup': { icon: Droplet, tone: 'bg-amber-400/20 text-amber-700 dark:text-amber-300' },
  Beverages: { icon: Coffee, tone: 'bg-stone-500/12 text-stone-700 dark:text-stone-300' },
  Home: { icon: Flame, tone: 'bg-orange-400/15 text-orange-700 dark:text-orange-300' },
  Pantry: { icon: Package, tone: 'bg-violet-500/12 text-violet-700 dark:text-violet-400' },
};

export function categoryMeta(category: string) {
  return ICONS[category] ?? { icon: Package, tone: 'bg-muted text-muted-foreground' };
}

export function CategoryIcon({ category, className, size = 'md' }: { category: string; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const { icon: Icon, tone } = categoryMeta(category);
  const box = size === 'sm' ? 'size-8 rounded-md' : size === 'lg' ? 'size-14 rounded-xl' : 'size-10 rounded-lg';
  const ic = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-7' : 'size-5';
  return (
    <div className={cn('flex shrink-0 items-center justify-center', box, tone, className)}>
      <Icon className={ic} />
    </div>
  );
}

import {
  Apple, Bean, Beef, Carrot, ChefHat, Cherry, Coffee, Croissant, Droplets, Egg, Flame, LeafyGreen, Milk, Pizza, ShoppingBasket, Sprout, Store, UtensilsCrossed, Wheat,
  type LucideIcon,
} from '@edi/ui/icons';
import { cn } from '@edi/ui/lib/utils';

/**
 * Generated brand marks for the fictional producers and customers.
 * Deterministic: the same name always gets the same colours and icon, so the
 * "logo" is recognisable across pages without shipping image files.
 */

const PALETTES: Array<[string, string]> = [
  ['#16a34a', '#065f46'],
  ['#f59e0b', '#b45309'],
  ['#0ea5e9', '#1d4ed8'],
  ['#e11d48', '#9f1239'],
  ['#8b5cf6', '#5b21b6'],
  ['#14b8a6', '#0f766e'],
  ['#f97316', '#c2410c'],
  ['#84cc16', '#3f6212'],
  ['#ec4899', '#9d174d'],
  ['#64748b', '#1e293b'],
];

const PRODUCER_ICONS: Array<[RegExp, LucideIcon]> = [
  [/vegetable|salad|green/i, LeafyGreen],
  [/fruit|orchard|apple/i, Apple],
  [/dairy|cream|milk|cheese/i, Milk],
  [/egg|poultry/i, Egg],
  [/grain|flour|mill/i, Wheat],
  [/honey|maple|apiary/i, Droplets],
  [/meat|ranch|beef/i, Beef],
  [/herb/i, Sprout],
  [/legume|root|bean/i, Carrot],
  [/berr/i, Cherry],
];

const CUSTOMER_ICONS: Array<[RegExp, LucideIcon]> = [
  [/bakery|crumb|bread/i, Croissant],
  [/cafe|coffee/i, Coffee],
  [/grocer|market|store/i, ShoppingBasket],
  [/trattoria|pizza/i, Pizza],
  [/school|meals/i, Apple],
  [/ember|grill|thyme/i, Flame],
  [/inn|hotel/i, UtensilsCrossed],
  [/kitchen|bistro|restaurant/i, ChefHat],
];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

export function brandColors(name: string): [string, string] {
  return PALETTES[hash(name) % PALETTES.length]!;
}

function brandIcon(kind: 'producer' | 'customer', name: string, hint?: string | null): LucideIcon {
  const text = `${hint ?? ''} ${name}`;
  const table = kind === 'producer' ? PRODUCER_ICONS : CUSTOMER_ICONS;
  return table.find(([re]) => re.test(text))?.[1] ?? (kind === 'producer' ? Bean : Store);
}

const SIZES = {
  xs: { box: 'size-6 rounded-none', icon: 'size-3.5' },
  sm: { box: 'size-8 rounded-none', icon: 'size-4' },
  md: { box: 'size-10 rounded-none', icon: 'size-5' },
  lg: { box: 'size-14 rounded-none', icon: 'size-7' },
  xl: { box: 'size-20 rounded-none', icon: 'size-10' },
} as const;

export function BrandLogo({
  name,
  kind,
  hint,
  size = 'md',
  className,
}: {
  name: string;
  kind: 'producer' | 'customer';
  /** producer specialty or customer business type, used to pick the icon */
  hint?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [from, to] = brandColors(name);
  const Icon = brandIcon(kind, name, hint);
  const initials = name
    .replace(/&/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  const s = SIZES[size];
  return (
    <span
      role="img"
      aria-label={`${name} logo`}
      title={name}
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden text-white shadow-sm ring-1 ring-black/5', s.box, className)}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {/* diagonal facet so the mark reads as a logo, not a flat tile */}
      <span className="absolute inset-0 bg-[linear-gradient(135deg,rgb(255_255_255/0.18)_0_45%,transparent_45%)]" />
      <Icon className={cn('relative', s.icon)} weight="bold" />
      {(size === 'lg' || size === 'xl') && (
        <span className="absolute right-1 bottom-0.5 text-[9px] font-bold tracking-wider text-white/80">{initials}</span>
      )}
    </span>
  );
}

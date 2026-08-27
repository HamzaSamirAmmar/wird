import { cn } from './cn';

/** First letter of each of the first two words — enough to tell people apart in a list. */
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0] ?? '')
    .join('');
}

// Deterministic tint per person, so the same name always gets the same colour.
const tints = [
  'bg-primary-100 text-primary-800',
  'bg-mint-100 text-mint-800',
  'bg-accent-100 text-accent-800',
  'bg-neutral-200 text-neutral-700',
];

const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-12 w-12 text-base' };

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  let hash = 0;
  for (const ch of name) hash = (hash + ch.codePointAt(0)!) % 997;
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold',
        sizes[size],
        tints[hash % tints.length],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

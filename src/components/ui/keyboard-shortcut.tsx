import { cn } from '@/lib/utils';

const KEY_LABELS: Record<string, string> = {
  '⌘': 'Command or Control',
  '⇧': 'Shift',
  '↵': 'Enter',
};

interface KeyboardShortcutProps {
  keys: string[];
  className?: string;
}

export function KeyboardShortcut({ keys, className }: KeyboardShortcutProps) {
  const label = keys.map((key) => KEY_LABELS[key] ?? key).join(' + ');

  return (
    <span
      aria-label={label}
      className={cn('inline-flex items-center gap-0.5 align-middle', className)}
    >
      {keys.map((key, index) => (
        <kbd
          key={`${key}-${index}`}
          aria-hidden="true"
          data-slot="kbd"
          className={cn(
            'inline-grid h-[17px] min-w-[17px] place-items-center rounded-[4px] border border-white/10 bg-black/20 px-1 font-sans text-[10px] font-medium leading-none text-current shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]',
            key === '⌘' && 'text-[11px]',
            key === '⇧' && 'pb-px text-[12px]',
          )}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

/** A row of mutually exclusive options; the highlight slides to the chosen one. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            className={`segment ${on ? 'segment--on' : ''}`}
            onClick={() => onChange(option.value)}
            disabled={disabled}
          >
            {on && (
              <motion.span
                layoutId={`segment-${id}`}
                className="segment-pill"
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              />
            )}
            <span className="segment-text">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** An on/off switch with a visible label. */
export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`switch ${checked ? 'switch--on' : ''}`}
      onClick={() => onChange(!checked)}
      title={hint}
    >
      <span className="switch-track">
        <motion.span
          className="switch-thumb"
          layout
          transition={{ type: 'spring', stiffness: 600, damping: 34 }}
        />
      </span>
      <span className="switch-label">{label}</span>
    </button>
  );
}

/** A modal dialog: focus moves in, Escape and the backdrop close it. */
export function Dialog({
  open,
  onClose,
  labelledBy,
  className = '',
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && panel.current) trapTab(event, panel.current);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            ref={panel}
            className={`dialog ${className}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            onClick={(event) => event.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab inside a modal dialog: the page behind it is out of reach. */
function trapTab(event: KeyboardEvent, panel: HTMLElement): void {
  const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (!first || !last) {
    event.preventDefault();
    panel.focus();
  } else if (!panel.contains(active)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && (active === first || active === panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Three dots that pulse one after the other: something is on its way. */
export function Dots() {
  return <span className="dots" aria-hidden="true" />;
}

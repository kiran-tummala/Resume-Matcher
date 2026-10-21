'use client';

/**
 * BenchPilot workspace primitives. Separate from the Swiss `components/ui` kit:
 * calm surfaces, 6px controls, 10px panels, borders before shadows.
 */
import React, { useEffect, useId, useRef } from 'react';
import Link from 'next/link';
import { X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

// -- buttons ---------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-bp-pine text-white hover:bg-bp-pine-hover border border-bp-pine',
  secondary: 'bg-bp-surface text-bp-ink border border-bp-line-strong hover:bg-bp-canvas',
  ghost: 'text-bp-ink hover:bg-bp-canvas border border-transparent',
  danger: 'bg-bp-surface text-bp-red border border-bp-line-strong hover:bg-bp-red-tint',
};
const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap',
    'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bp-pine',
    'disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4',
    VARIANT[variant],
    SIZE[size],
    extra
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = 'secondary',
  size = 'md',
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

// -- form fields -----------------------------------------------------------

const CONTROL =
  'w-full rounded-md border border-bp-line-strong bg-bp-surface px-3 text-sm text-bp-ink ' +
  'placeholder:text-bp-muted focus:border-bp-pine focus:outline-none focus:ring-2 focus:ring-bp-pine/25 ' +
  'disabled:opacity-60 aria-invalid:border-bp-red';

export function Field({
  label,
  hint,
  children,
  htmlFor,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-bp-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-bp-muted">{hint}</p>}
    </div>
  );
}

export const TextInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(CONTROL, 'h-10', className)} {...props} />
));
TextInput.displayName = 'TextInput';

export function TextArea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(CONTROL, 'py-2 leading-relaxed', className)}
      onKeyDown={(e) => {
        // Enter adds a line; never submits the surrounding form.
        if (e.key === 'Enter') e.stopPropagation();
        props.onKeyDown?.(e);
      }}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, 'h-10 pr-8', className)} {...props}>
      {children}
    </select>
  );
}

// -- dialog (native <dialog>: focus trap, Escape and inert page for free) ---

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-xl border border-bp-line bg-bp-surface p-0 text-bp-ink shadow-2xl',
        'backdrop:bg-bp-pine-deep/40 font-plex',
        wide ? 'max-w-2xl' : 'max-w-lg'
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-bp-line px-6 py-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description && <div className="mt-1 text-sm text-bp-muted">{description}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-bp-muted hover:bg-bp-canvas hover:text-bp-ink focus-visible:outline-2 focus-visible:outline-bp-pine"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <div className="flex justify-end gap-2 border-t border-bp-line bg-bp-canvas px-6 py-3">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

// -- page furniture --------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="mb-2 inline-block text-sm text-bp-muted hover:text-bp-pine focus-visible:outline-2 focus-visible:outline-bp-pine"
          >
            ← {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-bp-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-bp-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-bp-line bg-bp-surface', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-bp-line px-5 py-3">
          {title && <h2 className="text-sm font-semibold text-bp-ink">{title}</h2>}
          {action}
        </div>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 py-6">
      <p className="font-medium text-bp-ink">{title}</p>
      {children && <p className="max-w-prose text-sm text-bp-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'error';
  children: React.ReactNode;
}) {
  const styles = {
    info: 'border-bp-slate/30 bg-bp-slate-tint text-bp-slate',
    warn: 'border-bp-amber/30 bg-bp-amber-tint text-bp-amber',
    error: 'border-bp-red/30 bg-bp-red-tint text-bp-red',
  }[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-md border px-4 py-3 text-sm', styles)}
    >
      {children}
    </div>
  );
}

export function Chip({
  children,
  active = false,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs',
        active ? 'bg-bp-pine-tint text-bp-pine font-medium' : 'bg-bp-canvas text-bp-muted'
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-bp-muted">
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-bp-line-strong border-t-bp-pine motion-reduce:animate-none"
      />
      {label}
    </span>
  );
}

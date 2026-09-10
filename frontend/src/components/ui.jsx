export function Card({ children, className = '', ...rest }) {
  return (
    <div className={`rounded-lg border border-line bg-surface ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Button({ variant = 'primary', size = 'md', className = '', ...rest }) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none';
  const sizes = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm';
  const variants = {
    primary: 'bg-accent text-white hover:opacity-90',
    secondary: 'border border-line hover:bg-raised',
    danger: 'bg-critical text-white hover:opacity-90',
    ghost: 'text-muted hover:text-ink hover:bg-raised',
  };
  return <button className={`${base} ${sizes} ${variants[variant]} ${className}`} {...rest} />;
}

export function Label({ children, hint }) {
  return (
    <label className="mb-1.5 block text-sm font-medium text-ink">
      {children}
      {hint && <span className="ml-1.5 font-normal text-muted">{hint}</span>}
    </label>
  );
}

export function Input({ className = '', ...rest }) {
  return (
    <input
      className={`w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none ${className}`}
      {...rest}
    />
  );
}

export function Select({ className = '', children, ...rest }) {
  return (
    <select
      className={`w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      <span
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-line'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
    </label>
  );
}

export function PageHeader({ title, description, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-raised ${className}`} />;
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-lg border border-critical/30 bg-critical/5 px-4 py-3 text-sm text-critical">
      {message || 'Something went wrong.'}
      {onRetry && (
        <button onClick={onRetry} className="ml-3 underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}

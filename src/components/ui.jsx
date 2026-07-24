import React from 'react';
import { CircleHelp, Loader2 } from 'lucide-react';
const HelpIcon = ({ help, className = '' }) => {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();

  React.useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  if (!help?.text) return null;

  return (
    <span className={`relative inline-flex align-middle ${className}`} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={`Nápověda: ${help.title || 'informace'}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute left-0 top-full z-[100] mt-1 w-[min(280px,calc(100vw-32px))] sm:left-1/2 sm:-translate-x-1/2 rounded-lg border border-slate-300 bg-slate-950 px-3 py-2 text-left normal-case tracking-normal text-white shadow-xl">
          {help.title && <span className="block text-xs font-bold">{help.title}</span>}
          <span className="mt-0.5 block text-xs font-normal leading-relaxed text-slate-100">{help.text}</span>
        </span>
      )}
    </span>
  );
};

const FieldLabel = ({ label, help }) => (
  <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
    <span>{label}</span>
    <HelpIcon help={help} />
  </label>
);


const Panel = ({ title, description, icon: Icon, action, children, className = '', help, titleClassName = '' }) => (
  <section className={`rounded-2xl border border-slate-500 bg-slate-300 p-4 shadow-sm ${className}`}>
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-1"><h2 className={`text-base font-bold text-slate-900 ${titleClassName}`}>{title}</h2><HelpIcon help={help} /></div>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
      </div>
      {action}
    </div>
    {children}
  </section>
);

const TopMetric = ({ label, value, icon: Icon, tone }) => {
  const toneClasses = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100'
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClasses[tone] || toneClasses.indigo}`}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-1 text-base font-bold">{value}</div>
    </div>
  );
};

const InfoCard = ({ icon: Icon, label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3">
    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
    <div className="mt-1 text-sm font-medium leading-snug text-slate-800">{value}</div>
  </div>
);

const DetailRow = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
    <span className="text-slate-500">{label}</span>
    <span className="text-right font-medium text-slate-800">{value}</span>
  </div>
);

const MiniBadge = ({ icon: Icon, label, tone }) => {
  const toneClasses = {
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
    indigo: 'border-indigo-100 bg-indigo-50 text-indigo-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700'
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${toneClasses[tone] || toneClasses.slate}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
};

const CompactMetric = ({ label, value, target, tone }) => {
  const toneClasses = {
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    purple: 'border-purple-200 bg-purple-50 text-purple-700'
  };
  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone] || toneClasses.indigo}`}>
      <div className="text-xs font-semibold uppercase tracking-wide">{label}</div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-sm opacity-80">/ {target}</span>
      </div>
    </div>
  );
};

const StatCard = ({ title, current, target, ka }) => {
  const hasTarget = Number(target) > 0;
  const percent = hasTarget ? Math.min(100, Math.round((current / target) * 100)) : null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-slate-900">{title}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">{ka}</div>
        </div>
        {hasTarget && (
          <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            {percent} %
          </div>
        )}
      </div>
      <div className="mt-4 flex items-end gap-2">
        <span className="text-3xl font-bold text-slate-900">{current}</span>
        {hasTarget && <span className="pb-1 text-sm text-slate-400">/ {target}</span>}
      </div>
      {hasTarget && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
};

const LoadingCard = ({ text }) => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
    <Loader2 className="h-4 w-4 animate-spin" />
    {text}
  </div>
);

const SaveInlineNotice = ({ notice }) => {
  if (!notice?.text) return null;
  const toneClasses = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    error: 'border-red-200 bg-red-50 text-red-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    progress: 'border-slate-200 bg-white text-slate-600'
  };
  return (
    <span
      role={notice.tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={`inline-flex min-h-9 items-center rounded-lg border px-3 py-2 text-xs font-semibold ${toneClasses[notice.tone] || toneClasses.progress}`}
    >
      {notice.text}
    </span>
  );
};

const EmptyState = ({ icon: Icon, title }) => (
  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
    <Icon className="mx-auto h-8 w-8 text-slate-300" />
    <div className="mt-2 text-sm font-medium text-slate-500">{title}</div>
  </div>
);

const normalizeDateInputValue = (value) => {
  if (!value) return '';
  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
  }
  const czechMatch = text.match(/^(\d{1,2})[.\/]\s*(\d{1,2})[.\/]\s*(\d{4})$/);
  if (czechMatch) {
    const [, day, month, year] = czechMatch;
    return `${year}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
  }
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return '';
};

const InputField = ({ label, value, onChange, type = 'text', placeholder = '', required = false, help, min, max, step }) => (
  <div>
    <FieldLabel label={label} help={help} />
    <input
      type={type}
      value={type === 'date' ? normalizeDateInputValue(value) : value}
      placeholder={placeholder}
      required={required}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)] outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
    />
  </div>
);

const SelectField = ({ label, value, onChange, options, help, disabled = false }) => (
  <div>
    <FieldLabel label={label} help={help} />
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)] outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white'}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);

const TextAreaField = ({ label, value, onChange, rows = 4, placeholder = '', help, disabled = false }) => (
  <div>
    <FieldLabel label={label} help={help} />
    <textarea
      rows={rows}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)] outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white'}`}
    />
  </div>
);

const CheckboxField = ({ label, checked, onChange, compact = false, help }) => (
  <label className={`flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
    <span>{label}</span>
    <HelpIcon help={help} />
  </label>
);

export {
  Panel,
  HelpIcon,
  FieldLabel,
  TopMetric,
  InfoCard,
  DetailRow,
  MiniBadge,
  CompactMetric,
  StatCard,
  LoadingCard,
  SaveInlineNotice,
  EmptyState,
  InputField,
  SelectField,
  TextAreaField,
  CheckboxField
};

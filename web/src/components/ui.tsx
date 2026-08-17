import { useEffect, useRef, useState, type ReactNode } from "react";

export function Button({
  children,
  variant = "default",
  size = "md",
  className = "",
  ...props
}: {
  children: ReactNode;
  variant?: "default" | "primary" | "ghost" | "danger";
  size?: "sm" | "md";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";
  const sizes = { sm: "h-7 px-2.5 text-xs", md: "h-9 px-3.5 text-sm" };
  const variants = {
    default: "border border-line bg-white text-ink hover:bg-line-soft",
    primary: "bg-brand text-white hover:brightness-110 shadow-sm",
    ghost: "text-ink-soft hover:bg-line-soft",
    danger: "border border-red-200 text-fail hover:bg-red-50",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function IconButton({
  children,
  className = "",
  ...props
}: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-line-soft hover:text-ink ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-ink-faint">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 placeholder:text-ink-faint";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className || ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} cursor-pointer ${props.className || ""}`} />;
}

/** JSON textarea with debounce + validation feedback. */
export function JsonField({
  label,
  hint,
  value,
  onCommit,
  rows = 5,
}: {
  label: string;
  hint?: string;
  value: unknown;
  onCommit: (parsed: unknown) => void;
  rows?: number;
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);
  const lastExternal = useRef(text);

  useEffect(() => {
    const next = JSON.stringify(value ?? {}, null, 2);
    if (next !== lastExternal.current) {
      lastExternal.current = next;
      setText(next);
      setError(null);
    }
  }, [value]);

  const commit = (raw: string) => {
    try {
      const parsed = raw.trim() === "" ? {} : JSON.parse(raw);
      setError(null);
      lastExternal.current = JSON.stringify(parsed, null, 2);
      onCommit(parsed);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <label className="block">
      {label ? (
        <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-ink-soft">
          {label}
          {error && <span className="text-[11px] font-normal text-fail">JSON 无效</span>}
        </span>
      ) : (
        error && <span className="mb-1.5 block text-[11px] font-normal text-fail">JSON 无效</span>
      )}
      <textarea
        value={text}
        rows={rows}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        className={`${inputCls} resize-y font-mono text-xs leading-relaxed ${
          error ? "border-red-300 focus:border-red-400 focus:ring-red-100" : ""
        }`}
      />
      {hint && !error && (
        <span className="mt-1 block text-[11px] leading-snug text-ink-faint">{hint}</span>
      )}
      {error && <span className="mt-1 block text-[11px] leading-snug text-fail">{error}</span>}
    </label>
  );
}

function isEmptyOptionalValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/**
 * 可选 JSON：未配置时不展示空 {}，用按钮展开编辑。
 * onCommit(undefined) 表示清除。
 */
export function OptionalJsonField({
  label,
  hint,
  emptyHint = "未配置 · 点击添加",
  value,
  onCommit,
  rows = 4,
  emptyAs,
}: {
  label: string;
  hint?: string;
  emptyHint?: string;
  value: unknown;
  onCommit: (parsed: unknown | undefined) => void;
  rows?: number;
  emptyAs?: unknown;
}) {
  const empty = isEmptyOptionalValue(value);
  const [editing, setEditing] = useState(!empty);

  useEffect(() => {
    if (!empty) setEditing(true);
    else setEditing(false);
  }, [empty]);

  if (empty && !editing) {
    return (
      <div className="block">
        <span className="mb-1.5 block text-xs font-medium text-ink-soft">{label}</span>
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            onCommit(emptyAs !== undefined ? structuredClone(emptyAs) : {});
          }}
          className="flex w-full items-center justify-between rounded-lg border border-dashed border-line bg-line-soft/40 px-3 py-2.5 text-left text-xs text-ink-faint transition hover:border-brand hover:bg-brand-soft hover:text-brand"
        >
          <span>{emptyHint}</span>
          <span className="font-medium">添加</span>
        </button>
        {hint && <span className="mt-1 block text-[11px] leading-snug text-ink-faint">{hint}</span>}
      </div>
    );
  }

  return (
    <div className="block">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-soft">{label}</span>
        <button
          type="button"
          className="text-[11px] text-ink-faint hover:text-fail"
          onClick={() => {
            setEditing(false);
            onCommit(undefined);
          }}
        >
          清除
        </button>
      </div>
      <JsonField label="" value={value ?? emptyAs ?? {}} onCommit={onCommit} rows={rows} hint={hint} />
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-line-soft p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
            value === o.value ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
      <span
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
          checked ? "bg-brand" : "bg-line"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
      {label}
    </label>
  );
}

/** Lightweight prompt modal (replaces window.prompt for a nicer UX). */
export function usePrompt() {
  const [state, setState] = useState<{
    title: string;
    value: string;
    resolve: (v: string | null) => void;
  } | null>(null);

  const prompt = (title: string, initial = "") =>
    new Promise<string | null>((resolve) => setState({ title, value: initial, resolve }));

  const node = state ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={() => {
        state.resolve(null);
        setState(null);
      }}
    >
      <div
        className="w-80 rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-sm font-semibold text-ink">{state.title}</h3>
        <TextInput
          autoFocus
          value={state.value}
          onChange={(e) => setState({ ...state, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              state.resolve(state.value.trim() || null);
              setState(null);
            }
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button
            size="sm"
            onClick={() => {
              state.resolve(null);
              setState(null);
            }}
          >
            取消
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              state.resolve(state.value.trim() || null);
              setState(null);
            }}
          >
            确定
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return { prompt, node };
}

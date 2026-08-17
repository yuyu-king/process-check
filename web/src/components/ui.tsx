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

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${inputCls} resize-y min-h-[4.5rem] ${props.className || ""}`}
    />
  );
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

/** 三点更多菜单：点击展开，点击外部关闭（仅扁平项，无飞出子菜单） */
export function MoreMenu({
  items,
  align = "right",
}: {
  items: {
    label: string;
    danger?: boolean;
    disabled?: boolean;
    onClick?: () => void;
  }[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <IconButton
        title="更多"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </IconButton>
      {open && (
        <div
          className={`absolute top-full z-40 mt-1 min-w-[148px] rounded-lg border border-line bg-white py-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-line-soft disabled:opacity-40 ${
                item.danger ? "text-fail" : "text-ink"
              }`}
              onClick={() => {
                item.onClick?.();
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function GroupHeaderActions({
  onAdd,
  onRename,
  onDelete,
}: {
  onAdd?: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <span className="hidden items-center group-hover:flex">
      {onAdd && (
        <IconButton title="新增到该分组" onClick={onAdd}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </IconButton>
      )}
      <IconButton title="重命名分组" onClick={onRename}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      </IconButton>
      <IconButton title="删除分组" onClick={onDelete}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        </svg>
      </IconButton>
    </span>
  );
}

/** 单选弹层：返回选中 value，取消为 null */
export function usePickOption() {
  const [state, setState] = useState<{
    title: string;
    options: { value: string; label: string }[];
    selected: string;
    resolve: (v: string | null) => void;
  } | null>(null);

  const pick = (title: string, options: { value: string; label: string }[], initial?: string) =>
    new Promise<string | null>((resolve) =>
      setState({
        title,
        options,
        selected: initial ?? options[0]?.value ?? "",
        resolve,
      }),
    );

  const close = (value: string | null) => {
    if (!state) return;
    state.resolve(value);
    setState(null);
  };

  const node = state ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => close(null)}>
      <div
        className="w-80 max-h-[70vh] overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="border-b border-line px-5 py-3.5 text-sm font-semibold text-ink">{state.title}</h3>
        <div className="max-h-[40vh] overflow-y-auto px-2 py-2">
          {state.options.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                state.selected === opt.value ? "bg-brand-soft text-brand" : "text-ink hover:bg-line-soft"
              }`}
            >
              <input
                type="radio"
                name="pick-option"
                className="accent-brand"
                checked={state.selected === opt.value}
                onChange={() => setState({ ...state, selected: opt.value })}
              />
              <span className="min-w-0 flex-1 truncate">{opt.label}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button size="sm" onClick={() => close(null)}>
            取消
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!state.options.length}
            onClick={() => close(state.selected || null)}
          >
            确定
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return { pick, node };
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

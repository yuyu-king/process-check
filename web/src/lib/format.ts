export function summarizeJson(value: unknown, max = 64): string {
  const text = JSON.stringify(value ?? {});
  if (text === "{}" || text === "null") return "";
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export const NODE_META: Record<
  string,
  { label: string; color: string; glyph: string; hint: string }
> = {
  actor: { label: "角色 / 账号", color: "var(--color-actor)", glyph: "@", hint: "登录并建立独立会话" },
  action: { label: "API 接口", color: "var(--color-action)", glyph: "{ }", hint: "发送 HTTP 请求" },
  assert: { label: "断言", color: "var(--color-assert)", glyph: "✓", hint: "校验响应值" },
  scenario: { label: "子场景", color: "var(--color-scenario)", glyph: "❏", hint: "嵌套复用其它场景" },
};

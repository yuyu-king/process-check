import { selectCurrentActor, useStore } from "../store";
import type { HttpMethod, Json } from "../types";
import { Button, Field, IconButton, JsonField, Select, TextInput, Toggle, usePrompt } from "./ui";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];

export default function ActorsLibrary() {
  const workspace = useStore((s) => s.workspace);
  const selectedActorId = useStore((s) => s.selectedActorId);
  const actor = useStore(selectCurrentActor);
  const selectActor = useStore((s) => s.selectActor);
  const addActor = useStore((s) => s.addActor);
  const updateActor = useStore((s) => s.updateActor);
  const deleteActor = useStore((s) => s.deleteActor);
  const duplicateActor = useStore((s) => s.duplicateActor);
  const addActorGroup = useStore((s) => s.addActorGroup);
  const { prompt, node: promptNode } = usePrompt();

  const onAdd = async () => {
    const name = await prompt("新建角色", `角色 ${workspace.actors.length + 1}`);
    if (name) addActor(name);
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="flex-1 text-sm font-semibold text-ink">角色库</h2>
          <IconButton title="新建分组" onClick={async () => {
            const name = await prompt("新建角色分组", `分组 ${workspace.actorGroups.length + 1}`);
            if (name) addActorGroup(name);
          }}>
            <FolderIcon />
          </IconButton>
          <IconButton title="新建角色" onClick={onAdd}>
            <PlusIcon />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {workspace.actorGroups.map((g) => (
            <div key={g.id} className="mb-2">
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {g.name}
              </div>
              {workspace.actors
                .filter((a) => a.groupId === g.id)
                .map((a) => (
                  <ActorRow
                    key={a.id}
                    name={a.name}
                    selected={a.id === selectedActorId}
                    onClick={() => selectActor(a.id)}
                  />
                ))}
            </div>
          ))}
          <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            未分组
          </div>
          {workspace.actors
            .filter((a) => !a.groupId || !workspace.actorGroups.some((g) => g.id === a.groupId))
            .map((a) => (
              <ActorRow
                key={a.id}
                name={a.name}
                selected={a.id === selectedActorId}
                onClick={() => selectActor(a.id)}
              />
            ))}
          {!workspace.actors.length && (
            <p className="px-2 py-4 text-xs text-ink-faint">创建角色（登录账号），在流程中引用。</p>
          )}
        </div>
        <div className="border-t border-line p-3">
          <Button className="w-full" onClick={onAdd}>
            <PlusIcon /> 新建角色
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        {actor ? (
          <>
            <div className="flex items-center gap-3 border-b border-line px-5 py-3">
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-ink">{actor.name}</h2>
                <p className="text-xs text-ink-faint">登录拿 Cookie，可选 Token 注入后续请求</p>
              </div>
              <Button size="sm" onClick={() => duplicateActor(actor.id)}>
                复制
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  if (confirm(`删除角色「${actor.name}」？`)) deleteActor(actor.id);
                }}
              >
                删除
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="mx-auto max-w-2xl space-y-4">
                <Field label="角色名称">
                  <TextInput
                    value={actor.name}
                    onChange={(e) => updateActor(actor.id, { name: e.target.value })}
                  />
                </Field>
                <Field label="分组">
                  <Select
                    value={actor.groupId || ""}
                    onChange={(e) =>
                      updateActor(actor.id, { groupId: e.target.value || undefined })
                    }
                  >
                    <option value="">未分组</option>
                    {workspace.actorGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <Field label="登录方法">
                    <Select
                      value={actor.login.method}
                      onChange={(e) =>
                        updateActor(actor.id, {
                          login: { ...actor.login, method: e.target.value as HttpMethod },
                        })
                      }
                    >
                      {METHODS.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="登录地址">
                    <TextInput
                      value={actor.login.url}
                      onChange={(e) =>
                        updateActor(actor.id, { login: { ...actor.login, url: e.target.value } })
                      }
                    />
                  </Field>
                </div>
                <JsonField
                  label="账号变量"
                  value={actor.variables}
                  rows={3}
                  hint="登录体里用 {{actor.username}} 引用"
                  onCommit={(v) => updateActor(actor.id, { variables: v as Json })}
                />
                <JsonField
                  label="登录请求头"
                  value={actor.login.headers}
                  rows={2}
                  onCommit={(v) =>
                    updateActor(actor.id, { login: { ...actor.login, headers: v as Json } })
                  }
                />
                <JsonField
                  label="登录请求体"
                  value={actor.login.body ?? {}}
                  rows={3}
                  onCommit={(v) => updateActor(actor.id, { login: { ...actor.login, body: v } })}
                />
                <div className="rounded-lg border border-line bg-line-soft/50 p-4">
                  <Toggle
                    checked={actor.auth.enabled}
                    onChange={(v) =>
                      updateActor(actor.id, { auth: { ...actor.auth, enabled: v } })
                    }
                    label="自动获取 Token 并注入后续 API"
                  />
                  {actor.auth.enabled && (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-[120px_1fr] gap-2">
                        <Field label="Token 方法">
                          <Select
                            value={actor.auth.request.method}
                            onChange={(e) =>
                              updateActor(actor.id, {
                                auth: {
                                  ...actor.auth,
                                  request: {
                                    ...actor.auth.request,
                                    method: e.target.value as HttpMethod,
                                  },
                                },
                              })
                            }
                          >
                            {METHODS.map((m) => (
                              <option key={m}>{m}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Token 地址（留空则从登录响应取）">
                          <TextInput
                            value={actor.auth.request.url}
                            placeholder="{{env.baseUrl}}/token"
                            onChange={(e) =>
                              updateActor(actor.id, {
                                auth: {
                                  ...actor.auth,
                                  request: { ...actor.auth.request, url: e.target.value },
                                },
                              })
                            }
                          />
                        </Field>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Field label="Token 路径">
                          <TextInput
                            value={actor.auth.tokenPath}
                            onChange={(e) =>
                              updateActor(actor.id, {
                                auth: { ...actor.auth, tokenPath: e.target.value },
                              })
                            }
                          />
                        </Field>
                        <Field label="Header 名">
                          <TextInput
                            value={actor.auth.headerName}
                            onChange={(e) =>
                              updateActor(actor.id, {
                                auth: { ...actor.auth, headerName: e.target.value },
                              })
                            }
                          />
                        </Field>
                        <Field label="前缀">
                          <TextInput
                            value={actor.auth.prefix}
                            onChange={(e) =>
                              updateActor(actor.id, {
                                auth: { ...actor.auth, prefix: e.target.value },
                              })
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <p className="text-sm text-ink-faint">选择或创建一个角色</p>
            <Button variant="primary" onClick={onAdd}>
              ＋ 新建角色
            </Button>
          </div>
        )}
      </div>
      {promptNode}
    </div>
  );
}

function ActorRow({
  name,
  selected,
  onClick,
}: {
  name: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
        selected ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-line-soft"
      }`}
    >
      <span
        className="flex h-6 w-6 items-center justify-center rounded-md font-mono text-[11px] font-bold text-white"
        style={{ background: "var(--color-actor)" }}
      >
        @
      </span>
      <span className="truncate">{name}</span>
    </button>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2z" />
    </svg>
  );
}

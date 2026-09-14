# DSH Host-Side Subagent API Investigation

Read-only audit of a local `deepseek-harness` checkout (paths below are relative to
its repository root). No files were modified.

## 1. `ctx.subagents` service

Package: `@deepseek-ai/dsh-subagent`, implementation `packages/subagent/subagent/src/index.ts`.
Cordis augmentation, `index.ts:129-132`:

```ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    subagents: SubagentRuntime
  }
}
```

Service declaration, `index.ts:170-185`:

```ts
/** Named provider registry with one-shot runs, durable discovery, and continuable-child operations. */
export class SubagentRuntime extends Service {
  private providers = new Map<string, SubagentProvider>()
  private continuations: SubagentContinuationManager | undefined
  ...
  constructor(ctx: Context) {
    super(ctx, 'subagents')
```

Every public method (private helpers `prepareContinuable`, `expectProvider`, `requireContinuations`, `observeActivation`, `assertCapabilities` omitted):

| method | file:line |
| --- | --- |
| `constructor(ctx: Context)` | `index.ts:183` |
| `async startContinuable(spec: ContinuableStartSpec): Promise<ContinuableStart>` | `index.ts:212` |
| `async followup(parent: Agent, childId: SessionId, content: ContentBlock[], options: SubagentFollowupOptions): Promise<MessageId>` | `index.ts:231-238` |
| `interrupt(targetSessionId: SessionId, authority: SubagentInterruptAuthority): void` | `index.ts:255-257` |
| `async reportFrom(child: Agent, content: ContentBlock[], options: SubagentReportOptions): Promise<MessageId>` | `index.ts:270-276` |
| `registerContinuableSetup(contribution: ContinuableSetupContribution): () => void` | `index.ts:286-292` |
| `async drainContinuableDescendants(parents: readonly Agent[]): Promise<void>` | `index.ts:304-309` |
| `listChildren(parentSessionId: SessionId, signal?: AbortSignal): Promise<SubagentListEntry[]>` | `index.ts:339-341` |
| `listDescendants(rootSessionId: SessionId, signal?: AbortSignal): Promise<SubagentDescendantListEntry[]>` | `index.ts:358-360` |
| `registerProvider(provider: SubagentProvider): () => void` | `index.ts:369-385` |
| `getProvider(name: string): SubagentProvider \| undefined` | `index.ts:392-394` |
| `list(): string[]` | `index.ts:400-402` |
| `async start(name: string, request: SubagentStartRequest): Promise<SubagentRun>` | `index.ts:414-426` |

**Interrupt/cancel: yes, but only for live continuable children.** `index.ts:255-257`:

```ts
interrupt(targetSessionId: SessionId, authority: SubagentInterruptAuthority): void {
  this.continuations?.interrupt(targetSessionId, authority)
}
```

Its doc comment (`index.ts:240-254`) states: fire-and-return, the target may keep running until it observes the signal, and "An absent target — including a one-shot or unknown id — is an accepted no-op, as is a manager-less composition". Authority type, `packages/subagent/subagent/src/continuation.ts:139-141`:

```ts
export type SubagentInterruptAuthority =
  | { readonly kind: 'user'; readonly parentSessionId: SessionId }
  | { readonly kind: 'ancestor'; readonly agent: Agent }
```

A host plugin holding only a sessionId can therefore interrupt with `{ kind: 'user', parentSessionId }` — this is exactly what the API proxy does (`packages/host/apiproxy/src/api-proxy.ts:2783`).

**Transcript / messages / last assistant message: not found on this service.** Grep patterns: `transcript`, `messages`, `lastAssistantMessage`, `history`, `readTranscript`, `getChild`, `getDescendant` under `packages/subagent/subagent/src`. The only run-level output access is the one-shot handle, `packages/subagent/subagent/src/types.ts:249-275`:

```ts
export interface SubagentRun {
  readonly id: SessionId
  readonly localAgent: Agent | undefined
  readonly result: Promise<SubagentResult>
  dispose(): Promise<void>
}
```

which is returned only to the caller of `start()`, not retrievable later by id. A host plugin that wants a transcript must read the session itself — that is what the API proxy does, `api-proxy.ts:2682-2696`: `ctx.sessions.get(childSessionId)` for a live child, else `persistence.inspect(...)`.

**Single descendant detail: not found.** No `get(id)` / `describe(id)` exists; `listChildren`/`listDescendants` are the only discovery methods, and both return whole lists.

## 2. Run info/end types and every `subagent/*` event

`SubagentRunInfo`, `packages/subagent/subagent/src/types.ts:36-50` (full, with doc comments condensed):

```ts
export interface SubagentRunInfo {
  /** Unique identity shared with the paired terminal event. */
  readonly runId: SubagentRunId
  /** Provider name recorded when the child was first created. */
  readonly provider: string
  /** The child agent's id. */
  readonly id: SessionId
  /** Snapshot of whether `SubagentRun.localAgent` was present when start fulfilled. */
  readonly local: boolean
}
```

`SubagentRunEndInfo`, `types.ts:56-73`:

```ts
export interface SubagentRunEndInfo {
  readonly runId: SubagentRunId
  readonly provider: string
  readonly id: SessionId
  readonly local: boolean
  /** The terminal stop reason. */
  readonly stopReason: SubagentResult['stopReason']
  /**
   * The child's final assistant output ...; absent on infrastructure rejection
   * or when the child produced none.
   */
  readonly lastAssistantMessage?: ContentBlock[]
}
```

`SubagentRunId` is `Branded<'SubagentRunId'>` (`types.ts:20`). Note neither payload carries a timestamp or the parent session id — the parent is only the scoped-dispatch carrier.

Complete `subagent/*` Cordis event namespace, declared `index.ts:134-167`:

| event | payload | emitted at |
| --- | --- | --- |
| `subagent/provider-added` | `(provider: SubagentProvider)` | `index.ts:383` — `this.ctx.emit('subagent/provider-added', provider)` inside `registerProvider` |
| `subagent/provider-removed` | `(name: string)` | `index.ts:379` — in the registration disposer, via the lifecycle emitter |
| `subagent/start` | `(this: Scoped<SubagentRuntime>, info: SubagentRunInfo)` | `lifecycle.ts:160` (one-shot, `observeRun`) and `lifecycle.ts:197` (continuable Activation `start`) |
| `subagent/end` | `(this: Scoped<SubagentRuntime>, info: SubagentRunEndInfo)` | `lifecycle.ts:149-158` (one-shot fulfil + reject arms) and `lifecycle.ts:210-214` (continuable `settle`) |

Emitter overloads, `packages/subagent/subagent/src/lifecycle.ts:85-89`:

```ts
export type LifecycleEmitter = {
  (name: 'subagent/start', info: SubagentRunInfo, parent: Agent): void
  (name: 'subagent/end', info: SubagentRunEndInfo, parent: Agent): void
  (name: 'subagent/provider-removed', info: string): void
}
```

One-shot end emission, `lifecycle.ts:147-159`:

```ts
void run.result.then(
  (result) => {
    emit('subagent/end', {
      ...identity,
      stopReason: result.stopReason,
      // Omit the field when no output exists, matching continuable epochs.
      ...result.output.length === 0 ? {} : { lastAssistantMessage: result.output },
    }, parent)
  },
  () => {
    emit('subagent/end', { ...identity, stopReason: 'error' }, parent)
  },
)
emit('subagent/start', identity, parent)
```

Both run events are scope-filtered: they are listed in `packages/core/scope/src/scoped-events.generated.ts:29-30` with `null` resolvers (presence-only). That is why the monitor plugin subscribes with `{ global: true }` (`packages/client/ui-subagent-monitor/src/index.ts:107-108`).

`subagent/descriptor` is a **session event**, not a Cordis event — `packages/subagent/subagent/src/descriptor.ts:28-39`:

```ts
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'subagent/descriptor': SubagentDescriptorData
  }
}
```

It is appended by `descriptor-seed.ts:29` and `packages/subagent/subagent-in-process-driver/src/index.ts:85`, and is in the persisted vocabulary (`packages/core/session/src/known-event-types.ts:50`).

Grep patterns used: `'subagent/[a-z-]+'` (regex) across `packages/**/*.ts`, plus `ctx.emit`, `ctx.on`, `ctx.parallel`, `emitLifecycle`, `createLifecycleEmitter`, `createActivationObserver`, `observeRun`.

## 3. `listDescendants` return type, discriminants, timestamps, disk outcome

Signature, `index.ts:358-360`:

```ts
listDescendants(rootSessionId: SessionId, signal?: AbortSignal): Promise<SubagentDescendantListEntry[]> {
  return listSubagentDescendants(this.ctx, rootSessionId, signal)
}
```

Element type, `packages/subagent/subagent/src/list-children.ts:44-99` (verbatim):

```ts
export type SubagentListEntry =
  | {
    readonly kind: 'child'
    /** The durable child session id, stable across Activations. */
    readonly id: SessionId
    /**
     * Store snapshot activity: `running` means the logical record is live in
     * `ctx.sessions`; `inactive` means it exists only in persistence. Neither
     * encodes a durable outcome, and a continuable child may still reject
     * delivery as an ownership conflict.
     */
    readonly activity: 'running' | 'inactive'
    /** Whether a direct descendant has durable `origin: 'subagent'`. */
    readonly hasChildren: boolean
  } & (
    | {
      readonly mode: 'one-shot'
      readonly label?: string
    }
    | {
      readonly mode: 'continuable'
      readonly label: string
    }
  )
  | {
    readonly kind: 'diagnostic'
    readonly id: SessionId
    readonly reason: 'corrupt' | 'unsupported' | 'unavailable'
  }

export type SubagentDescendantListEntry = SubagentListEntry & {
  /** Durable direct parent of this candidate in the enumerated tree. */
  readonly parentId: SessionId
  /** Edge distance from the requested root; direct children are `1`. */
  readonly depth: number
}
```

- `kind`: exactly `'child' | 'diagnostic'`.
- `activity` (child only): exactly `'running' | 'inactive'`, and the doc comment says explicitly "Neither encodes a durable outcome". `running` is assigned when the candidate is in the live store (`list-children.ts:274`); `inactive` when resolved from persistence/cache (`:376`, `:408`).
- `reason` (diagnostic only): `'corrupt' | 'unsupported' | 'unavailable'`; `list-children.ts:84-85` notes "`unsupported` is never produced; it remains in the union for consumers that route on it".
- `mode`: `'one-shot' | 'continuable'`.
- **No terminal outcome.** No `stopReason`, success/failure, exit status, or `lastAssistantMessage` field exists on any entry.
- **No timestamps.** No `createdAt`, `updatedAt`, `startedAt`, or `endedAt`. Header `createdAt` is used only for ordering: `list-children.ts:333-335` `return a.header.createdAt - b.header.createdAt || a.header.id.localeCompare(b.header.id)`.

**Persisted `stopReason` for a finished run: not found.** Searches: `stopReason` under `packages/session/**/*.ts` (0 hits), `packages/core/session/src/**/*.ts` (0 hits), `packages/jobs/**/*.ts` (0 hits). `SessionHeader` (`packages/core/session/src/types.ts:61-99`) has only `version, id, createdAt, cwd, parentSession, seedLength, origin, delegationDepth, agentPreset`. The SQLite/JSONL schemas mention only `origin: 'subagent'` (`packages/session/session-persistence-sqlite/src/schema.ts:39`, `session-persistence-jsonl/src/format.ts:41`). The descriptor event that *is* persisted carries identity/composition only, never an outcome (`descriptor.ts:49-88`).

What *is* on disk is the child's `turn/end` reason. `packages/core/session/src/types.ts:155-177`:

```ts
export interface TurnEndReasonMap {
  completed: { kind: 'completed' }
  aborted: { kind: 'aborted'; reason: TurnEndCancelCause }
  blocked: { kind: 'blocked' }
  error: { kind: 'error'; error: LlmFailure }
  'max-tokens': { kind: 'max-tokens' }
  interrupted: { kind: 'interrupted' }
}
```

and the runtime *derives* the subagent stop reason from it at `packages/subagent/subagent/src/lifecycle.ts:235-259`:

```ts
function epochStopReason(events: readonly SessionEvent[]): SubagentResult['stopReason'] {
  const { end, droppedUnrun } = foldConsumedWork(events)
  switch (end?.data.reason.kind) {
    case 'max-tokens': return 'max-tokens'
    case 'aborted':
    case 'interrupted': return 'aborted'
    case 'error': return 'error'
    case 'blocked': return 'refusal'
    case undefined:
    case 'completed': return droppedUnrun ? 'aborted' : 'completed'
    default: return 'error'
  }
}
```

`foldConsumedWork` is exported from `@deepseek-ai/dsh-agent` (`packages/core/agent/src/consumed-work.ts:68`, returning `ConsumedWork` at `:18-31`), so a host plugin can reconstruct a terminal outcome for a *cold* child by folding its persisted log the same way. There is no stored field to read directly.

## 4. Stop-reason union

`packages/subagent/subagent/src/types.ts:194-214` (verbatim):

```ts
/**
 * Why a subagent run ended. Merge-extensible (a backend may add variants);
 * consumers branch on the known cases and fall through `default`. ...
 */
export interface SubagentStopReasonMap {
  /** The child finished its turn normally. */
  completed: 'completed'
  /** Cancelled through the request signal or disposal. */
  aborted: 'aborted'
  /** Model or transport failure. */
  error: 'error'
  /** The child hit its token ceiling before finishing. */
  'max-tokens': 'max-tokens'
  /** The child declined the task. */
  refusal: 'refusal'
}

/** The union over {@link SubagentStopReasonMap} — widens automatically as backends merge in variants. */
export type SubagentStopReason = SubagentStopReasonMap[keyof SubagentStopReasonMap]
```

Known values: `completed | aborted | error | max-tokens | refusal`. The type is merge-extensible, so keep a `default` branch.

## 5. Host-to-browser push channel — exists (three mechanisms)

### 5a. Physical carriers (WebSocket + SSE), already in the shipped Web app

The API contract states the model outright, `packages/host/apiproxy/src/api/rpc.ts:1-5`: "HTTP, WebSocket, and in-process SSE are physical carriers, while logical messages are channel-independent". The push message quadrant is `ServerRequest`, `api/rpc.ts:171-176`:

```ts
export interface ServerRequest {
  type: 'server-request'
  rpcId: RpcId
  method: string
  payload: unknown
}
```

SSE production, `packages/host/apiproxy/src/fetch/handler.ts:203-235`:

```ts
function sseResponse(frames: AsyncIterable<RpcRequest<MuxFrame | HostFrame>>): Response {
  ...
        for await (const narrow of frames) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(fullFrame(narrow))}\n\n`))
        }
  ...
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
  })
}
```

Browser consumption is streaming fetch (not `EventSource`), `packages/host/apiproxy/src/fetch/client.ts:352-360, 369-408`:

```ts
protected openMux(..., signal: AbortSignal, onOpen?: () => void): AsyncIterable<RpcRequest<MuxFrame>> {
  return this.readSse('/api/events.mux', signal, muxFrameSchema, onOpen)
}
protected openHost(...): AsyncIterable<RpcRequest<HostFrame>> {
  return this.readSse('/api/events.host', signal, hostFrameSchema, onOpen)
}
```

In the shipped composition those two paths are actually WebSocket upgrades, `packages/client/connection/src/index.ts:181-194`:

```ts
apiCtx.effect(() => apiCtx.webServer.registerUpgrade({
  path,
  handler: (req, socket, head) => {
    if (!isTrustedApiRequest(req, trustedHosts)) { rejectWebSocketUpgrade(socket); return }
    return handle(req, socket, head)
  },
}), `client-connection: ${path} WebSocket`)
...
registerDownlink(MUX_EVENTS_PATH, (req, socket, head) => { downlinks.handleMux(req, socket, head) })
registerDownlink(HOST_EVENTS_PATH, (req, socket, head) => { downlinks.handleHost(req, socket, head) })
```

(That is also the answer to "how do assistant deltas reach the browser": `MuxFrame` `{ type: 'session/event'; sessionId; event; view? }`, `packages/host/apiproxy/src/api/events.ts:70`, pushed from `api-proxy.ts:3493`.)

**The frame unions are closed.** `MuxFrame` is `api/events.ts:69-108` and `HostFrame` is `api/events.ts:127-155`, both validated by zod (`api/events.schema.ts`). A host plugin cannot add a frame variant without editing those in-repo unions.

### 5b. The intended shared bridge: Typert Remote (`ctx.remote`)

Client-side capability, `packages/typert/protocol/src/types.ts:221-249`:

```ts
export interface TypertClientRemote extends TypertRemoteNamespaceMap {
  $mount(contribution: TypertRemoteContribution): Promise<TypertDisposer>
  $on<Event extends TypertRemoteEvent>(event: Event, listener: Events[Event]): () => void
  $dispatch(event: string, args: readonly unknown[]): void
}
```

Host services expose callable methods by extending `TypertRemoteService` (`packages/typert/protocol/src/index.ts:147`); the real example is `export class GoalService extends TypertRemoteService` (`packages/goal/goal/src/index.ts:183`, `super(ctx, 'goals')` at `:194`), consumed live from a client plugin as `await ctx.remote.goals.edit(sessionId, ref, { objective })` (`packages/client/ui-goal/src/client/index.ts:81`).

Host **events** ride one allowlist. `packages/api/remotes/src/remote-events.ts:9-29`:

```ts
/**
 * Host events this application forwards to consumers verbatim: no projection,
 * no redaction, no renaming. ... this array is simultaneously the whole
 * control point over what a consumer can receive and the legal key set of
 * `ctx.remote.$on`. Forwarding one more event is an entry here and nothing else.
 */
export const API_REMOTE_FORWARDED_EVENTS = [
  'agent-preset/selected',
  'commands/change',
  'credentials/updated',
  'cordis/request-run',
  'cordis/request-run-resolved',
  'cordis/dynamic-package',
  'cordis/dynamic-retract',
  'cordis/inspect-query',
  'cordis/inspect-query-resolved',
  'llm/adapters-updated',
  'settings/document-updated',
] as const
```

Host forwarding loop, `packages/host/apiproxy/src/api-proxy.ts:3617-3633`:

```ts
...API_REMOTE_FORWARDED_EVENTS.map(name => ctx.on(
  name,
  ((...args: unknown[]) => {
    queue.push(frame({
      type: 'host/remote-event',
      event: name,
      args: assertJsonArgs(name, args),
    }))
  }),
)),
```

Client dispatch, `packages/client/runtime/src/client/index.ts:216`:

```ts
if (frame.type === 'host/remote-event') ctx.remote.$dispatch(frame.event, frame.args)
```

Live consumer example, `packages/extensions/ui-cordis/src/client/index.ts:73-78`:

```ts
ctx.remote.$on('cordis/dynamic-package', () => { inventory.refresh() })
ctx.remote.$on('cordis/dynamic-retract', () => { inventory.refresh() })
ctx.remote.$on('cordis/request-run', (request) => { ... })
```

**Critical constraint for `subagent/*`:** forwardable events must be unscoped and void-returning (`packages/typert/protocol/src/types.ts:73-77`, gated at compile time by `API_REMOTE_FORWARDED_EVENTS satisfies readonly TypertForwardableEvent[]`, `packages/api/remotes/src/index.ts:41`). `subagent/start` and `subagent/end` are scope-filtered (`packages/core/scope/src/scoped-events.generated.ts:29-30`) and declare `this: Scoped<SubagentRuntime>`, so **they cannot be added to the allowlist as-is.** A plugin would have to emit its own unscoped event and get it allowlisted — an in-repo application change, not something an out-of-repo plugin can do alone.

### 5c. What an out-of-repo host plugin can do unilaterally: own SSE route

This is the concrete minimal example, and it is real shipped code. Host half, `packages/client/hmr/src/index.ts:148-190`:

```ts
const connections = new Set<ServerResponse>()

const connect = (res: ServerResponse): void => {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
  })
  res.write(': connected\n\n')
  res.write(sseData({ type: 'graph', graph: ctx.clientModules.graph() }))
  connections.add(res)
  res.on('close', () => { connections.delete(res) })
}

ctx.effect(() => {
  const disposeRoute = ctx.webServer.register({
    kind: 'exact',
    path: EVENTS_ENDPOINT,
    handler: (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return }
      connect(res)
    },
  })
  const unsubscribe = ctx.clientModules.onRebuilt((id, rev) => {
    const line = sseData({ type: 'rebuilt', id, rev })
    for (const res of connections) res.write(line)
  })
  return () => {
    unsubscribe(); disposeRoute()
    for (const res of connections) res.destroy()
    connections.clear()
  }
}, 'client-hmr: /plugins/events channel')
```

Browser half, `packages/client/hmr/src/client/index.ts:166-180`:

```ts
ctx.effect(() => {
  const source = new EventSource(EVENTS_ENDPOINT)
  source.addEventListener('message', (event: MessageEvent<string>) => {
    let frame: PluginsEventFrame
    try { frame = JSON.parse(event.data) as PluginsEventFrame }
    catch { ctx.logger.warn(`client-hmr: unparseable event frame: ${event.data}`); return }
    handle(frame)
  })
  return () => { source.close() }
}, 'client-hmr: event source')
```

Shared wire type, `packages/client/hmr/src/events.ts:11-16`:

```ts
export type PluginsEventFrame =
  | { type: 'graph'; graph: WebBootGraph }
  | { type: 'rebuilt'; id: string; rev: string }

export const EVENTS_ENDPOINT = '/plugins/events'
```

Mapped onto the monitor: register `kind: 'exact', path: '/api/subagent-monitor/events'`, hold the `ServerResponse` set, and write a frame from inside the existing `onStart`/`onEnd` handlers (`packages/client/ui-subagent-monitor/src/index.ts:84-108`) instead of waiting for the next poll of `/api/subagent-monitor/snapshot` (`:165-177`). No allowlist change, no in-repo edit. Note there is **no authentication on such a route** (see Q6) — the exact route also wins over the `/api` prefix route that carries the trust fence, so the plugin owns its own guard.

### 5d. Existing browser-facing subagent RPC (worth knowing)

`packages/host/apiproxy/src/api/subagents.ts:66-119` already defines, for the built-in UI: `list`, `history` (transcript pages, live snapshot or persisted log, no Agent activation), `prompt`, `interrupt`. These are unary request/response methods registered in `packages/host/apiproxy/src/api/rpc-map.ts:37-40` (`subagent.list`, `subagent.history`, `subagent.prompt`, `subagent.interrupt`) — the map is a closed in-repo interface, so a plugin cannot add a method to it. Its host implementation (`api-proxy.ts:2636-2799`) is the reference recipe for reading a child transcript and for calling `ctx.subagents.interrupt(childSessionId, { kind: 'user', parentSessionId })`.

## 6. `webServer.register()` API

Package `@deepseek-ai/dsh-host-webserver`, `packages/host/webserver/src/index.ts:59` — `export class WebServer extends Service`, key `'webServer'` (`super(ctx, 'webServer')`, `:75`), Context augmentation `:18-22`. Plain `node:http`; no hono/express/fastify.

Route descriptor types, verbatim `index.ts:24-42`:

```ts
/** Route match kind: 'exact' matches the pathname verbatim; 'prefix' p matches p and p/<anything>. */
export type WebRouteKind = 'exact' | 'prefix'

/** One named route registration. */
export interface WebRoute {
  kind: WebRouteKind
  /** Absolute pathname, no trailing slash. */
  path: string
  /** Owns the full response lifecycle (may hold the response open, e.g. SSE). */
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** One exact-path HTTP upgrade registration. */
export interface WebUpgradeRoute {
  /** Absolute pathname, no trailing slash. */
  path: string
  /** Owns protocol negotiation and the upgraded socket after dispatch. */
  handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void>
}
```

`register` in full, `index.ts:88-101`:

```ts
/**
 * Register a named route. Duplicate (kind, path) throws — route patterns are
 * a composition-level contract, so a collision is a misconfiguration.
 * @param route - kind, path, and the owning handler.
 * @returns the disposer removing the route.
 */
register(route: WebRoute): () => void {
  const table = route.kind === 'exact' ? this.exact : this.prefixes
  if (table.has(route.path)) {
    throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`)
  }
  table.set(route.path, route)
  return () => { table.delete(route.path) }
}
```

Complete public surface — 5 methods + 2 getters:

```ts
get port(): number                                              // index.ts:79
get host(): Config['host']                                      // index.ts:84
register(route: WebRoute): () => void                           // index.ts:94
registerUpgrade(route: WebUpgradeRoute): () => void             // index.ts:109
registerFallback(handler: WebRoute['handler']): () => void      // index.ts:125
tapIndex(transform: (html: string) => string): () => void       // index.ts:139
applyIndexTaps(html: string): string                            // index.ts:259
async [Service.init](): Promise<void>                           // index.ts:148
```

- `kind` discriminant: exactly `'exact' | 'prefix'`. Nothing else. Upgrade routes have no `kind` (always exact).
- Descriptor fields: exactly `kind`, `path`, `handler`. No `method`, no path params, no priority, no name.
- **Middleware: not found. Auth/token: not found.** Grep patterns run inside `packages/host/webserver`: `middleware`, `next`, `use(`, `token`, `bearer`, `Bearer`, `Authorization`, `cors`, `csrf`, `cookie`, `guard`, `auth`, `origin` — no implementation hits; `README.md:21` states the omission deliberately ("No TLS, auth, or origin policy"). Route owners implement their own checks; e.g. the `/api` prefix route calls `isTrustedApiRequest(req, trustedHosts)` as its first statement (`packages/client/connection/src/index.ts:164-171`), which its own README calls a reachability policy, not authentication.
- Matching: exact table, then longest matching prefix, then the single fallback seat, else 404 (`index.ts:152-164`, `241-251`). Registration order is irrelevant.
- Failure containment: a rejecting handler logs `warn` and answers 400, or destroys the socket if headers were sent (`index.ts:170-180`).
- Disposer symmetry is invariant-checked (`packages/host/webserver/src/invariant.ts:26-49`), so always wrap registrations in `ctx.effect`.

Real usage, `packages/client/ui-subagent-monitor/src/index.ts:165-177`:

```ts
ctx.effect(() => ctx.webServer.register({
  kind: 'exact',
  path: '/api/subagent-monitor/snapshot',
  handler: async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const sessionId = url.searchParams.get('sessionId')
    const payload = sessionId === null
      ? { now: Date.now(), rows: [] }
      : { sessionId, now: Date.now(), rows: await enrich(sessionId) }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(payload))
  },
}), 'ui-subagent-monitor: snapshot route')
```

Static assets and namespacing: this package serves no files (`index.ts:5-6`); `@deepseek-ai/dsh-host-frontend-static` claims `registerFallback` (`packages/host/frontend-static/src/index.ts:98-109`) and client-plugin bundles are served by `dsh-client-modules` on prefix `/plugins` (`packages/client/modules/src/index.ts:242`). There is **no namespacing or auto-prefixing**: every route supplies an absolute path in one flat space, and a collision throws at registration.

## Bottom line for extending the monitor plugin

1. `listDescendants` gives durable structure (id, parentId, depth, mode, label, `activity`, `hasChildren`) and **no outcome and no timestamps**. Terminal facts (`stopReason`, `lastAssistantMessage`) exist only on the `subagent/end` event at the moment it fires — which is why the current plugin keeps its own `runs` map.
2. For a cold/finished child there is **no stored `stopReason`**; reconstructing one means folding the child's persisted `turn/end` events the way `lifecycle.ts:235-259` does (`foldConsumedWork` from `@deepseek-ai/dsh-agent` is exported for exactly this).
3. Interrupting a subagent from the host is available: `ctx.subagents.interrupt(childSessionId, { kind: 'user', parentSessionId })`. Continuable children only; one-shot ids are accepted no-ops.
4. Reading a subagent transcript is **not** on `ctx.subagents`; do it via the session store / persistence like `api-proxy.ts:2682-2696`.
5. To kill polling, the only mechanism available to an out-of-repo plugin is its own SSE (or upgrade) route via `ctx.webServer` with a client-side `EventSource`, exactly as `packages/client/hmr` does. The typed `ctx.remote.$on` bridge is nicer but requires adding an unscoped event to `API_REMOTE_FORWARDED_EVENTS` in-repo, and `subagent/start`/`subagent/end` are ineligible as-is because they are scope-filtered.
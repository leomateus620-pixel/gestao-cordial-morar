import {
  acknowledgeDraft,
  draftKey,
  mergeDraft,
  type DraftEntry,
  type DraftScope,
} from "./draft-model";
export type DraftStatus = "persisting" | "local" | "sending" | "error" | "conflict";
export type DraftView = {
  entry: DraftEntry;
  status: DraftStatus;
  durable?: boolean;
  error?: string;
};
export type DraftPersistence = {
  put: (e: DraftEntry) => Promise<unknown>;
  remove: (key: string, generation?: string) => Promise<unknown>;
};
/** Lives above room/tab editors. All local writes and network writes are serialized. */
export class DraftController {
  private views: Record<string, DraftView> = {};
  private listeners = new Set<() => void>();
  private writes: Promise<unknown> = Promise.resolve();
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private writerId = crypto.randomUUID();
  private pausedRooms = new Set<string>();
  constructor(
    private persistence: DraftPersistence,
    private save: (e: DraftEntry) => Promise<number>,
    private online = () => navigator.onLine,
  ) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.views;
  private emit() {
    this.views = { ...this.views };
    this.listeners.forEach((fn) => fn());
  }
  hydrate(entries: DraftEntry[]) {
    for (const entry of entries)
      if (!this.views[entry.key])
        this.views[entry.key] = entry.recovered
          ? {
              entry,
              status: "conflict",
              durable: true,
              error: "Rascunho recuperado de outra aba. Compare as versões na revisão.",
            }
          : { entry, status: "local", durable: true };
    this.emit();
    this.schedule();
  }
  edit(scope: DraftScope, remote: Record<string, unknown>, patch: Record<string, unknown>) {
    const key = draftKey(scope),
      entry = mergeDraft(this.views[key]?.entry, scope, remote, patch);
    entry.writerId = this.writerId;
    this.views[key] = { entry, status: "persisting", durable: false };
    this.emit();
    this.writes = this.writes
      .catch(() => undefined)
      .then(() => this.persistence.put(entry))
      .then(() => {
        if (this.views[key]?.entry.generation === entry.generation) {
          this.views[key] = { entry, status: "local", durable: true };
          this.emit();
          this.schedule();
        }
      })
      .catch((e) => {
        if (this.views[key]?.entry.generation === entry.generation) {
          this.views[key] = {
            entry,
            status: "error",
            durable: false,
            error: `Falha ao salvar no aparelho: ${e instanceof Error ? e.message : "armazenamento indisponível"}`,
          };
          this.emit();
        }
      });
  }
  private schedule() {
    clearTimeout(this.timer);
    if (!this.stopped) this.timer = setTimeout(() => void this.flush(), 700);
  }
  async ensureLocal() {
    await this.writes;
    const failed = Object.values(this.views).find(
      (v) => v.durable === false || v.status === "persisting",
    );
    if (failed)
      throw new Error(failed.error || "Aguarde a confirmação do salvamento neste aparelho.");
  }
  async flush() {
    await this.writes;
    if (this.stopped || !this.online()) return;
    if (this.running) return this.running;
    this.running = this.send();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }
  private async send() {
    for (const key of Object.keys(this.views)) {
      if (this.stopped) break;
      const view = this.views[key];
      if (!view) continue;
      const entry = view.entry;
      if (
        this.pausedRooms.has(entry.roomId ?? "") ||
        view.status !== "local" ||
        entry.entity === "narrative" ||
        entry.entity === "new-item" ||
        entry.entity === "creation"
      )
        continue;
      this.views[entry.key] = { entry, status: "sending", durable: true };
      this.emit();
      try {
        const revision = await this.save(entry);
        // Rebase newer typing only after the older save is acknowledged.
        const current = this.views[entry.key];
        if (!current) continue;
        const next = acknowledgeDraft(current.entry, entry, revision);
        if (next) this.views[entry.key] = { entry: next, status: "persisting", durable: false };
        else delete this.views[entry.key];
        this.emit();
        this.writes = this.writes
          .catch(() => undefined)
          .then(() =>
            next
              ? this.persistence.put(next)
              : this.persistence.remove(entry.key, entry.generation),
          );
        await this.writes;
        if (next && this.views[entry.key]?.entry.generation === next.generation) {
          this.views[entry.key] = { entry: next, status: "local", durable: true };
          this.emit();
          this.schedule();
        }
      } catch (e) {
        const cur = this.views[entry.key];
        if (!cur) continue;
        const error = e instanceof Error ? e.message : "Falha ao salvar";
        this.views[entry.key] = {
          ...cur,
          status: error.startsWith("CONFLITO") ? "conflict" : "error",
          error,
        };
        this.emit();
      }
    }
  }
  async discard(key: string) {
    await this.writes;
    await this.persistence.remove(key, this.views[key]?.entry.generation);
    delete this.views[key];
    this.emit();
  }
  async restoreEditor(key: string) {
    await this.writes;
    const source = this.views[key]?.entry;
    if (!source || !["narrative", "new-item"].includes(source.entity)) return;
    const target = draftKey(source),
      previous = this.views[target]?.entry;
    if (previous && target !== key) {
      const recovery = { ...previous, key: `${target}~${previous.generation}`, recovered: true };
      await this.persistence.put(recovery);
      this.views[recovery.key] = {
        entry: recovery,
        status: "conflict",
        durable: true,
        error: "Outro relato preservado para comparação.",
      };
    }
    const next = {
      ...source,
      key: target,
      recovered: false,
      writerId: this.writerId,
      generation: crypto.randomUUID(),
    };
    await this.persistence.put(next);
    if (key !== target) await this.persistence.remove(key, source.generation);
    delete this.views[key];
    this.views[target] = { entry: next, status: "local", durable: true };
    this.emit();
  }
  async pauseRoom(roomId: string) {
    this.pausedRooms.add(roomId);
    if (this.running) await this.running;
  }
  resumeRoom(roomId: string) {
    this.pausedRooms.delete(roomId);
    this.schedule();
  }
  async discardRoom(roomId: string) {
    if (this.running) await this.running;
    for (const v of Object.values(this.views))
      if (v.entry.roomId === roomId) await this.discard(v.entry.key);
  }
  retry() {
    for (const v of Object.values(this.views))
      if (v.status === "error") {
        // Retry local persistence first: a quota failure must never skip the device.
        this.edit(v.entry, v.entry.base, v.entry.patch);
      }
    void this.flush();
  }
  async resolve(key: string, remote: Record<string, unknown>) {
    const v = this.views[key];
    if (!v) return;
    const e = {
      ...v.entry,
      recovered: false,
      base: Object.fromEntries(Object.keys(v.entry.patch).map((k) => [k, remote[k] ?? null])),
      expectedRevision: Number(remote.revision),
    };
    await this.persistence.put(e);
    this.views[key] = { entry: e, status: "local", durable: true };
    this.emit();
    void this.flush();
  }
  isActive() {
    return !this.stopped;
  }
  resume() {
    this.stopped = false;
    this.schedule();
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }
}

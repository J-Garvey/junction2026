/** Debounce drafts and keep at most one speculative request in flight. */
export class MessagePreparation {
  private text = "";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active: AbortController | undefined;
  private queued: string | undefined;
  private disposed = false;

  constructor(private prepare: (text: string, signal: AbortSignal) => Promise<unknown>) {}

  update(draft: string) {
    const text = draft.trim();
    if (this.disposed || text === this.text) return;
    this.text = text;
    clearTimeout(this.timer);
    this.queued = undefined;
    if (text.length < 3 || text.length > 2000) return;
    this.timer = setTimeout(() => {
      if (this.active) this.queued = text;
      else this.start(text);
    }, 600);
  }

  private start(text: string) {
    const controller = new AbortController();
    this.active = controller;
    // Preparation is optional: submit always uses the regular API and its errors.
    void this.prepare(text, controller.signal).catch(() => {}).finally(() => {
      this.active = undefined;
      const next = this.queued;
      this.queued = undefined;
      if (!this.disposed && next && next === this.text) this.start(next);
    });
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.queued = undefined;
    this.active?.abort();
  }
}

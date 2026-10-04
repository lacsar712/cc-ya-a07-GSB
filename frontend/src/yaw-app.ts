import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

type LogRow = {
  id: number;
  turbine_code: string;
  yaw_err_deg: number;
  status: string;
  verdict: string | null;
  reason: string | null;
  created_by: string;
  created_at: string;
  processed_at: string | null;
};

type OverheatWindow = {
  id: number;
  turbine_code: string;
  started_at: string;
  ended_at: string;
  created_by: string;
  created_at: string;
  active: boolean;
};

type BlockRow = {
  id: number;
  window_id: number;
  turbine_code: string;
  yaw_err_deg: number;
  blocked_by: string;
  blocked_at: string;
  detail: string;
};

type Session = {
  token: string;
  username: string;
  role: string;
};

type Tab = "logs" | "overheat";

@customElement("yaw-align-app")
export class YawAlignApp extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      box-sizing: border-box;
      padding: 1.5rem;
      max-width: 1000px;
      margin: 0 auto;
    }
    h1 {
      margin: 0;
      font-size: 1.4rem;
      color: #38bdf8;
    }
    .sub {
      color: #94a3b8;
      margin: 0.25rem 0 1.5rem;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .topbar nav {
      display: flex;
      gap: 0.5rem;
    }
    .tab {
      background: #1e293b;
      color: #cbd5e1;
      border: 1px solid #334155;
      padding: 0.45rem 0.9rem;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
    }
    .tab[aria-pressed="true"] {
      background: #0284c7;
      color: #fff;
      border-color: #0284c7;
    }
    .who {
      color: #94a3b8;
      font-size: 0.85rem;
    }
    section {
      background: #1e293b;
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
      border: 1px solid #334155;
    }
    label {
      display: block;
      font-size: 0.85rem;
      color: #cbd5e1;
      margin-bottom: 0.25rem;
    }
    input,
    select {
      width: 100%;
      box-sizing: border-box;
      padding: 0.5rem 0.65rem;
      border-radius: 6px;
      border: 1px solid #475569;
      background: #0f172a;
      color: #f1f5f9;
      margin-bottom: 0.75rem;
    }
    input:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .grid2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    @media (max-width: 560px) {
      .grid2 {
        grid-template-columns: 1fr;
      }
    }
    button {
      cursor: pointer;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      border: none;
      background: #0284c7;
      color: #fff;
      font-weight: 600;
    }
    button.secondary {
      background: #475569;
    }
    button.danger {
      background: #b91c1c;
      padding: 0.3rem 0.7rem;
      font-size: 0.8rem;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    th,
    td {
      text-align: left;
      padding: 0.5rem 0.4rem;
      border-bottom: 1px solid #334155;
      vertical-align: top;
    }
    th {
      color: #94a3b8;
      font-weight: 600;
    }
    .tag {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-size: 0.8rem;
      white-space: nowrap;
    }
    .ok {
      background: #14532d;
      color: #86efac;
    }
    .bad {
      background: #7f1d1d;
      color: #fca5a5;
    }
    .pending {
      background: #713f12;
      color: #fde68a;
    }
    .lockon {
      background: #7f1d1d;
      color: #fecaca;
    }
    .idle {
      background: #334155;
      color: #cbd5e1;
    }
    .future {
      background: #1e3a5f;
      color: #93c5fd;
    }
    .err {
      color: #f87171;
      margin-top: 0.5rem;
    }
    .ok-msg {
      color: #86efac;
      margin-top: 0.5rem;
    }
    .banner {
      background: #450a0a;
      border: 1px solid #b91c1c;
      color: #fecaca;
      border-radius: 6px;
      padding: 0.6rem 0.85rem;
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }
    .row-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      align-items: center;
    }
    .window-card {
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 0.75rem 0.9rem;
      margin-bottom: 0.75rem;
      background: #0f172a;
    }
    .window-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .window-title {
      font-weight: 700;
      font-size: 1rem;
    }
    .window-meta {
      color: #94a3b8;
      font-size: 0.82rem;
      margin-top: 0.25rem;
    }
    .blocks {
      margin-top: 0.6rem;
      border-top: 1px dashed #334155;
      padding-top: 0.5rem;
    }
    .blocks h3 {
      margin: 0 0 0.35rem;
      font-size: 0.85rem;
      color: #cbd5e1;
    }
    .blocks table {
      font-size: 0.82rem;
    }
    .empty {
      color: #64748b;
      font-size: 0.85rem;
    }
    .locked-form {
      opacity: 0.9;
    }
  `;

  @state() private session: Session | null = null;
  @state() private tab: Tab = "logs";
  @state() private logs: LogRow[] = [];
  @state() private windows: OverheatWindow[] = [];
  @state() private blocks: BlockRow[] = [];
  @state() private serverNow: Date | null = null;
  @state() private loginUser = "technician";
  @state() private loginPass = "tech123456";
  @state() private turbineCode = "";
  @state() private yawErr = "";
  @state() private error = "";
  @state() private loading = false;

  // 封锁窗配置表单
  @state() private winTurbine = "";
  @state() private winStart = "";
  @state() private winEnd = "";
  @state() private winError = "";
  @state() private winOk = "";
  @state() private winLoading = false;

  private _pollTimer?: number;

  connectedCallback() {
    super.connectedCallback();
    const raw = localStorage.getItem("yaw_session");
    if (raw) {
      try {
        this.session = JSON.parse(raw) as Session;
        void this.refreshAll();
        this.startPolling();
      } catch {
        localStorage.removeItem("yaw_session");
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopPolling();
  }

  private startPolling() {
    this.stopPolling();
    this._pollTimer = window.setInterval(() => void this.refreshAll(), 2000);
  }

  private stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = undefined;
    }
  }

  private authHeaders(): HeadersInit {
    return this.session
      ? { Authorization: `Bearer ${this.session.token}` }
      : {};
  }

  private async refreshAll() {
    await Promise.all([this.refreshLogs(), this.refreshWindows()]);
  }

  private async refreshLogs() {
    if (!this.session) return;
    try {
      const res = await fetch("/api/logs", { headers: this.authHeaders() });
      if (res.status === 401) {
        this.logout();
        return;
      }
      if (!res.ok) return;
      this.logs = (await res.json()) as LogRow[];
    } catch {
      /* ignore transient network errors */
    }
  }

  private async refreshWindows() {
    if (!this.session) return;
    try {
      const [res, tres] = await Promise.all([
        fetch("/api/overheat/windows", { headers: this.authHeaders() }),
        fetch("/api/time"),
      ]);
      if (res.status === 401) {
        this.logout();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        this.windows = data.windows as OverheatWindow[];
        this.blocks = data.blocks as BlockRow[];
      }
      if (tres.ok) {
        const t = await tres.json();
        this.serverNow = new Date(t.now);
      }
    } catch {
      /* ignore transient network errors */
    }
  }

  private async login() {
    this.error = "";
    this.loading = true;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.loginUser,
          password: this.loginPass,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.error = data.detail || "登录失败";
        return;
      }
      this.session = {
        token: data.access_token,
        username: data.username,
        role: data.role,
      };
      localStorage.setItem("yaw_session", JSON.stringify(this.session));
      await this.refreshAll();
      this.startPolling();
    } catch {
      this.error = "无法连接接口";
    } finally {
      this.loading = false;
    }
  }

  private logout() {
    this.stopPolling();
    this.session = null;
    this.logs = [];
    this.windows = [];
    this.blocks = [];
    localStorage.removeItem("yaw_session");
  }

  private get isWriter() {
    return this.session?.role === "writer";
  }

  private get activeWindows(): OverheatWindow[] {
    return this.windows.filter((w) => w.active);
  }

  /** 该机当前是否处于过热封锁窗（active 标志由服务端用数据库时钟给出）。 */
  private isTurbineLocked(code: string): boolean {
    const c = code.trim();
    return !!c && this.activeWindows.some((w) => w.turbine_code === c);
  }

  private get knownTurbines(): string[] {
    const set = new Set<string>();
    for (const w of this.windows) set.add(w.turbine_code);
    for (const l of this.logs) set.add(l.turbine_code);
    return Array.from(set).sort();
  }

  private fmtTime(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("zh-CN", { hour12: false });
  }

  /** 用服务端时钟填充封锁窗表单的默认起止时刻（转本地时区填写）。 */
  private async fillDefaultWindowTimes() {
    let base = this.serverNow;
    if (!base) {
      try {
        const res = await fetch("/api/time");
        if (res.ok) base = new Date((await res.json()).now);
      } catch {
        /* fall back below */
      }
    }
    const start = base ?? new Date();
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    this.winStart = this.toLocalInputValue(start);
    this.winEnd = this.toLocalInputValue(end);
  }

  private toLocalInputValue(d: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
      d.getHours()
    )}:${p(d.getMinutes())}`;
  }

  private switchTab(tab: Tab) {
    this.tab = tab;
    this.error = "";
    this.winError = "";
    this.winOk = "";
    if (tab === "overheat" && !this.winStart && this.isWriter) {
      void this.fillDefaultWindowTimes();
    }
  }

  private async createWindow() {
    this.winError = "";
    this.winOk = "";
    const code = this.winTurbine.trim();
    if (!code) {
      this.winError = "机组编号不能为空";
      return;
    }
    if (!this.winStart || !this.winEnd) {
      this.winError = "请填写起止时刻";
      return;
    }
    const startInst = new Date(this.winStart);
    const endInst = new Date(this.winEnd);
    if (Number.isNaN(startInst.getTime()) || Number.isNaN(endInst.getTime())) {
      this.winError = "起止时刻格式无效";
      return;
    }
    if (!(startInst < endInst)) {
      this.winError = "起始时刻必须早于结束时刻";
      return;
    }
    this.winLoading = true;
    try {
      const res = await fetch("/api/overheat/windows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(),
        },
        body: JSON.stringify({
          turbine_code: code,
          started_at: startInst.toISOString(),
          ended_at: endInst.toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.winError = data.detail || "配置封锁窗失败";
        return;
      }
      this.winOk = `已为机组 ${code} 配置封锁窗`;
      this.winTurbine = "";
      await this.refreshWindows();
      void this.fillDefaultWindowTimes();
    } catch {
      this.winError = "配置封锁窗时网络异常";
    } finally {
      this.winLoading = false;
    }
  }

  private async deleteWindow(id: number) {
    try {
      const res = await fetch(`/api/overheat/windows/${id}`, {
        method: "DELETE",
        headers: this.authHeaders(),
      });
      if (res.status === 401) {
        this.logout();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        this.winError = data.detail || "删除失败";
        return;
      }
      await this.refreshWindows();
    } catch {
      this.winError = "删除封锁窗时网络异常";
    }
  }

  private async submitLog() {
    this.error = "";
    // 前端先按服务端给出的 active 状态上锁；最终以服务端拒收为准。
    if (this.isTurbineLocked(this.turbineCode)) {
      this.error =
        "该机组偏航电机过热封锁中，报送已整体上锁，请移出封锁时段后再报送";
      return;
    }
    this.loading = true;
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(),
        },
        body: JSON.stringify({
          turbine_code: this.turbineCode,
          yaw_err_deg: Number(this.yawErr),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 409：落在封锁窗被服务端真实拒收
        this.error = data.detail || "提交失败";
        await this.refreshWindows();
        return;
      }
      this.turbineCode = "";
      this.yawErr = "";
      await this.refreshLogs();
    } catch {
      this.error = "提交时网络异常";
    } finally {
      this.loading = false;
    }
  }

  private verdictClass(row: LogRow) {
    if (row.status === "pending") return "pending";
    if (row.verdict === "合格") return "ok";
    if (row.verdict === "偏航超差") return "bad";
    return "";
  }

  private windowState(w: OverheatWindow) {
    if (w.active) return { cls: "lockon", text: "封锁生效中" };
    // 仅用于展示标签；真实封锁判定始终以服务端 active 标志（数据库时钟）为准。
    const ref = this.serverNow?.getTime() ?? null;
    if (ref !== null && new Date(w.started_at).getTime() > ref) {
      return { cls: "future", text: "未开始" };
    }
    return { cls: "idle", text: "已结束" };
  }

  private blocksFor(windowId: number): BlockRow[] {
    return this.blocks.filter((b) => b.window_id === windowId);
  }

  render() {
    if (!this.session) {
      return html`
        <h1>风机偏航对中台</h1>
        <p class="sub">现场技师提交偏航误差，后台 worker 认领后给出合格或偏航超差结论。</p>
        <section>
          <label>用户名</label>
          <input
            .value=${this.loginUser}
            @input=${(e: Event) =>
              (this.loginUser = (e.target as HTMLInputElement).value)}
          />
          <label>密码</label>
          <input
            type="password"
            .value=${this.loginPass}
            @input=${(e: Event) =>
              (this.loginPass = (e.target as HTMLInputElement).value)}
          />
          <button ?disabled=${this.loading} @click=${this.login}>登录</button>
          ${this.error ? html`<p class="err">${this.error}</p>` : null}
        </section>
      `;
    }

    return html`
      <div class="topbar">
        <h1>风机偏航对中台</h1>
        <nav>
          <button
            class="tab"
            aria-pressed=${this.tab === "logs"}
            @click=${() => this.switchTab("logs")}
          >
            对中报送
          </button>
          <button
            class="tab"
            aria-pressed=${this.tab === "overheat"}
            @click=${() => this.switchTab("overheat")}
          >
            偏航电机过热封锁窗
          </button>
        </nav>
        <div class="row-actions">
          <span class="who">
            ${this.session.username}（${this.isWriter ? "技师·可报送" : "观察·只读"}）
          </span>
          <button class="secondary" @click=${this.logout}>退出</button>
        </div>
      </div>

      ${this.tab === "logs" ? this.renderLogsTab() : this.renderOverheatTab()}
    `;
  }

  private renderActiveBanner() {
    if (this.activeWindows.length === 0) return null;
    const list = this.activeWindows
      .map((w) => {
        const range = `${this.fmtTime(w.started_at)} ～ ${this.fmtTime(w.ended_at)}`;
        return `${w.turbine_code}（${range}）`;
      })
      .join("；");
    return html`
      <div class="banner">
        🔒 以下机组偏航电机过热封锁中，窗内报送一律拒收：${list}
      </div>
    `;
  }

  private renderLogsTab() {
    const locked = this.isTurbineLocked(this.turbineCode);
    return html`
      ${this.renderActiveBanner()}

      ${this.isWriter
        ? html`
            <section class=${locked ? "locked-form" : ""}>
              <h2 style="margin-top:0;font-size:1.1rem;">提交偏航记录</h2>
              ${locked
                ? html`
                    <div class="banner">
                      🔒 机组 ${this.turbineCode.trim()} 正处于偏航电机过热封锁窗，
                      该机报送已整体上锁，请移出封锁时段后再报送。
                    </div>
                  `
                : null}
              <label>机组编号</label>
              <input
                list="turbine-list"
                placeholder="例如 W12"
                .value=${this.turbineCode}
                @input=${(e: Event) =>
                  (this.turbineCode = (e.target as HTMLInputElement).value)}
              />
              <datalist id="turbine-list">
                ${this.knownTurbines.map((t) => html`<option value=${t}></option>`)}
              </datalist>
              <label>偏航误差（度，可正可负）</label>
              <input
                type="number"
                step="0.1"
                ?disabled=${locked}
                .value=${this.yawErr}
                @input=${(e: Event) =>
                  (this.yawErr = (e.target as HTMLInputElement).value)}
              />
              <button
                ?disabled=${this.loading || locked}
                @click=${this.submitLog}
              >
                ${locked ? "🔒 封锁中·禁止报送" : "提交（进入待认领队列）"}
              </button>
              ${this.error ? html`<p class="err">${this.error}</p>` : null}
            </section>
          `
        : null}

      <section>
        <div class="row-actions" style="justify-content:space-between;">
          <h2 style="margin:0;font-size:1.1rem;">对中记录</h2>
          <button class="secondary" ?disabled=${this.loading} @click=${this.refreshLogs}>
            刷新列表
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>编号</th>
              <th>机组</th>
              <th>误差°</th>
              <th>状态</th>
              <th>结论</th>
              <th>说明</th>
              <th>报送人</th>
              <th>时刻</th>
            </tr>
          </thead>
          <tbody>
            ${this.logs.map(
              (row) => html`
                <tr>
                  <td>${row.id}</td>
                  <td>${row.turbine_code}</td>
                  <td>${row.yaw_err_deg}</td>
                  <td>
                    <span class="tag ${row.status === "pending" ? "pending" : "ok"}">
                      ${row.status === "pending" ? "待处理" : "已完成"}
                    </span>
                  </td>
                  <td>
                    ${row.verdict
                      ? html`<span class="tag ${this.verdictClass(row)}">${row.verdict}</span>`
                      : "—"}
                  </td>
                  <td>${row.reason ?? "—"}</td>
                  <td>${row.created_by}</td>
                  <td>${this.fmtTime(row.created_at)}</td>
                </tr>
              `
            )}
          </tbody>
        </table>
      </section>
    `;
  }

  private renderOverheatTab() {
    return html`
      ${this.isWriter
        ? html`
            <section>
              <h2 style="margin-top:0;font-size:1.1rem;">配置过热封锁窗</h2>
              <p class="sub" style="margin-bottom:0.75rem;">
                选定机组并填写封锁起止时刻；窗内该机的偏航报送将被整体拒收并记入下挂封锁日志。
                判定一律采用服务端时钟。
              </p>
              <label>机组编号</label>
              <input
                list="turbine-list"
                placeholder="例如 W12"
                .value=${this.winTurbine}
                @input=${(e: Event) =>
                  (this.winTurbine = (e.target as HTMLInputElement).value)}
              />
              <div class="grid2">
                <div>
                  <label>起始时刻（本机时区）</label>
                  <input
                    type="datetime-local"
                    .value=${this.winStart}
                    @input=${(e: Event) =>
                      (this.winStart = (e.target as HTMLInputElement).value)}
                  />
                </div>
                <div>
                  <label>结束时刻（本机时区）</label>
                  <input
                    type="datetime-local"
                    .value=${this.winEnd}
                    @input=${(e: Event) =>
                      (this.winEnd = (e.target as HTMLInputElement).value)}
                  />
                </div>
              </div>
              <div class="row-actions">
                <button ?disabled=${this.winLoading} @click=${this.createWindow}>
                  配置封锁窗
                </button>
                <button
                  class="secondary"
                  ?disabled=${this.winLoading}
                  @click=${() => void this.fillDefaultWindowTimes()}
                >
                  用服务端当前时刻重填
                </button>
              </div>
              ${this.winError ? html`<p class="err">${this.winError}</p>` : null}
              ${this.winOk ? html`<p class="ok-msg">${this.winOk}</p>` : null}
            </section>
          `
        : html`
            <section>
              <p class="sub" style="margin:0;">
                当前为只读观察账号，可查看封锁窗与拒收日志，不能配置或删除。
              </p>
            </section>
          `}

      <section>
        <h2 style="margin-top:0;font-size:1.1rem;">封锁窗（下挂拒收日志）</h2>
        ${this.windows.length === 0
          ? html`<p class="empty">暂无封锁窗。</p>`
          : this.windows.map((w) => {
              const st = this.windowState(w);
              const bs = this.blocksFor(w.id);
              return html`
                <div class="window-card">
                  <div class="window-head">
                    <div>
                      <span class="window-title">机组 ${w.turbine_code}</span>
                      <span class="tag ${st.cls}" style="margin-left:0.5rem;">${st.text}</span>
                    </div>
                    ${this.isWriter
                      ? html`
                          <button
                            class="danger"
                            @click=${() => this.deleteWindow(w.id)}
                          >
                            删除封锁窗
                          </button>
                        `
                      : null}
                  </div>
                  <div class="window-meta">
                    封锁时段：${this.fmtTime(w.started_at)} ～ ${this.fmtTime(w.ended_at)}
                    ｜配置人：${w.created_by}
                  </div>
                  <div class="blocks">
                    <h3>封锁日志（窗内被拒收的报送，共 ${bs.length} 条）</h3>
                    ${bs.length === 0
                      ? html`<p class="empty" style="margin:0;">该窗暂无拒收记录。</p>`
                      : html`
                          <table>
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>误差°</th>
                                <th>报送人</th>
                                <th>拒收时刻（服务端）</th>
                                <th>说明</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${bs.map(
                                (b) => html`
                                  <tr>
                                    <td>${b.id}</td>
                                    <td>${b.yaw_err_deg}</td>
                                    <td>${b.blocked_by}</td>
                                    <td>${this.fmtTime(b.blocked_at)}</td>
                                    <td>${b.detail}</td>
                                  </tr>
                                `
                              )}
                            </tbody>
                          </table>
                        `}
                  </div>
                </div>
              `;
            })}
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yaw-align-app": YawAlignApp;
  }
}

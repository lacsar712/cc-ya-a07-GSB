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

type LockoutWindow = {
  id: number;
  turbine_code: string;
  start_at: string;
  end_at: string;
  reason: string | null;
  created_by: string;
  created_at: string;
};

type RejectLog = {
  id: number;
  window_id: number;
  turbine_code: string;
  yaw_err_deg: number;
  attempted_by: string;
  attempted_at: string;
  window_start_at: string | null;
  window_end_at: string | null;
};

type Session = {
  token: string;
  username: string;
  role: string;
};

type Page = "logs" | "lockout";

@customElement("yaw-align-app")
export class YawAlignApp extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      box-sizing: border-box;
      padding: 1.5rem;
      max-width: 960px;
      margin: 0 auto;
    }
    h1 {
      margin: 0 0 0.25rem;
      font-size: 1.75rem;
      color: #38bdf8;
    }
    .sub {
      color: #94a3b8;
      margin-bottom: 1.5rem;
    }
    .topbar {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1.5rem;
    }
    .topbar h1 {
      margin: 0;
      font-size: 1.5rem;
    }
    .topbar nav {
      display: flex;
      gap: 0.5rem;
      flex: 1 1 auto;
    }
    button.nav {
      background: #1e293b;
      border: 1px solid #334155;
      color: #cbd5e1;
    }
    button.nav.active {
      background: #0284c7;
      border-color: #0284c7;
      color: #fff;
    }
    .who {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #94a3b8;
      font-size: 0.9rem;
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
    .locked {
      background: #7f1d1d;
      color: #fca5a5;
    }
    .err {
      color: #f87171;
      margin-top: 0.5rem;
    }
    .muted {
      color: #94a3b8;
    }
    .row-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      align-items: center;
    }
  `;

  @state() private session: Session | null = null;
  @state() private page: Page = "logs";
  @state() private logs: LogRow[] = [];
  @state() private windows: LockoutWindow[] = [];
  @state() private rejectLogs: RejectLog[] = [];
  @state() private loginUser = "technician";
  @state() private loginPass = "tech123456";
  @state() private turbineCode = "";
  @state() private yawErr = "";
  @state() private error = "";
  @state() private lockTurbine = "";
  @state() private lockStart = "";
  @state() private lockEnd = "";
  @state() private lockReason = "";
  @state() private lockError = "";
  @state() private loading = false;

  connectedCallback() {
    super.connectedCallback();
    const raw = localStorage.getItem("yaw_session");
    if (raw) {
      try {
        this.session = JSON.parse(raw) as Session;
        void this.refreshAll();
        this._pollTimer = window.setInterval(() => void this.refreshAll(), 2000);
      } catch {
        localStorage.removeItem("yaw_session");
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
    }
  }

  private _pollTimer?: number;

  private authHeaders(): HeadersInit {
    return this.session
      ? { Authorization: `Bearer ${this.session.token}` }
      : {};
  }

  private async refreshAll() {
    if (!this.session) return;
    await Promise.all([
      this.refreshLogs(),
      this.refreshWindows(),
      this.refreshRejectLogs(),
    ]);
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
      const res = await fetch("/api/lockout-windows", {
        headers: this.authHeaders(),
      });
      if (!res.ok) return;
      this.windows = (await res.json()) as LockoutWindow[];
    } catch {
      /* ignore transient network errors */
    }
  }

  private async refreshRejectLogs() {
    if (!this.session) return;
    try {
      const res = await fetch("/api/lockout-logs", {
        headers: this.authHeaders(),
      });
      if (!res.ok) return;
      this.rejectLogs = (await res.json()) as RejectLog[];
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
      this._pollTimer = window.setInterval(() => void this.refreshAll(), 2000);
    } catch {
      this.error = "无法连接接口";
    } finally {
      this.loading = false;
    }
  }

  private logout() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this.session = null;
    this.logs = [];
    this.windows = [];
    this.rejectLogs = [];
    localStorage.removeItem("yaw_session");
  }

  private get isWriter() {
    return this.session?.role === "writer";
  }

  private get turbineOptions(): string[] {
    const codes = new Set<string>();
    for (const row of this.logs) codes.add(row.turbine_code);
    for (const win of this.windows) codes.add(win.turbine_code);
    return [...codes].sort();
  }

  private fmt(value: string | null): string {
    if (!value) return "—";
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d.toLocaleString();
  }

  private async submitLog() {
    this.error = "";
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
        this.error = data.detail || "提交失败";
        await this.refreshAll();
        return;
      }
      this.turbineCode = "";
      this.yawErr = "";
      await this.refreshAll();
    } catch {
      this.error = "提交时网络异常";
    } finally {
      this.loading = false;
    }
  }

  private async createLockoutWindow() {
    this.lockError = "";
    if (!this.lockTurbine) {
      this.lockError = "请选择机组";
      return;
    }
    if (!this.lockStart || !this.lockEnd) {
      this.lockError = "请填写起止时刻";
      return;
    }
    const start = new Date(this.lockStart);
    const end = new Date(this.lockEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      this.lockError = "起止时刻格式不正确";
      return;
    }
    if (start >= end) {
      this.lockError = "开始时刻必须早于结束时刻";
      return;
    }
    this.loading = true;
    try {
      const res = await fetch("/api/lockout-windows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(),
        },
        body: JSON.stringify({
          turbine_code: this.lockTurbine,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          reason: this.lockReason.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.lockError = data.detail || "配置失败";
        return;
      }
      this.lockStart = "";
      this.lockEnd = "";
      this.lockReason = "";
      await this.refreshAll();
    } catch {
      this.lockError = "配置时网络异常";
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

  private renderLogin() {
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

  private renderLogsPage() {
    return html`
      <section>
        <div class="row-actions">
          <button class="secondary" ?disabled=${this.loading} @click=${this.refreshAll}>
            刷新列表
          </button>
        </div>
      </section>

      ${this.isWriter
        ? html`
            <section>
              <h2 style="margin-top:0;font-size:1.1rem;">提交偏航记录</h2>
              <label>机组编号</label>
              <input
                placeholder="例如 W12"
                .value=${this.turbineCode}
                @input=${(e: Event) =>
                  (this.turbineCode = (e.target as HTMLInputElement).value)}
              />
              <label>偏航误差（度，可正可负）</label>
              <input
                type="number"
                step="0.1"
                .value=${this.yawErr}
                @input=${(e: Event) =>
                  (this.yawErr = (e.target as HTMLInputElement).value)}
              />
              <button ?disabled=${this.loading} @click=${this.submitLog}>
                提交（进入待认领队列）
              </button>
              ${this.error ? html`<p class="err">${this.error}</p>` : null}
            </section>
          `
        : null}

      <section>
        <h2 style="margin-top:0;font-size:1.1rem;">对中记录</h2>
        <table>
          <thead>
            <tr>
              <th>编号</th>
              <th>机组</th>
              <th>误差°</th>
              <th>状态</th>
              <th>结论</th>
              <th>说明</th>
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
                </tr>
              `
            )}
          </tbody>
        </table>
      </section>
    `;
  }

  private renderLockoutPage() {
    return html`
      ${this.isWriter
        ? html`
            <section>
              <h2 style="margin-top:0;font-size:1.1rem;">配置封锁窗</h2>
              <p class="muted" style="margin-top:0;font-size:0.85rem;">
                电机过热时段内该机偏航报送整体上锁：落在窗内的报送一律拒收并记入封锁日志。
              </p>
              <label>机组</label>
              <select
                .value=${this.lockTurbine}
                @change=${(e: Event) =>
                  (this.lockTurbine = (e.target as HTMLSelectElement).value)}
              >
                <option value="" disabled ?selected=${!this.lockTurbine}>
                  请选择机组
                </option>
                ${this.turbineOptions.map(
                  (code) => html`
                    <option value=${code} ?selected=${this.lockTurbine === code}>
                      ${code}
                    </option>
                  `
                )}
              </select>
              <label>开始时刻</label>
              <input
                type="datetime-local"
                .value=${this.lockStart}
                @input=${(e: Event) =>
                  (this.lockStart = (e.target as HTMLInputElement).value)}
              />
              <label>结束时刻</label>
              <input
                type="datetime-local"
                .value=${this.lockEnd}
                @input=${(e: Event) =>
                  (this.lockEnd = (e.target as HTMLInputElement).value)}
              />
              <label>备注（可选）</label>
              <input
                placeholder="例如：偏航电机过热检修"
                .value=${this.lockReason}
                @input=${(e: Event) =>
                  (this.lockReason = (e.target as HTMLInputElement).value)}
              />
              <button ?disabled=${this.loading} @click=${this.createLockoutWindow}>
                配置封锁窗
              </button>
              ${this.lockError ? html`<p class="err">${this.lockError}</p>` : null}
            </section>
          `
        : html`
            <section>
              <p class="muted" style="margin:0;">
                只读账号可查看封锁窗与封锁日志，不可配置。
              </p>
            </section>
          `}

      <section>
        <h2 style="margin-top:0;font-size:1.1rem;">封锁窗列表</h2>
        <table>
          <thead>
            <tr>
              <th>编号</th>
              <th>机组</th>
              <th>开始时刻</th>
              <th>结束时刻</th>
              <th>备注</th>
              <th>配置人</th>
              <th>配置时间</th>
            </tr>
          </thead>
          <tbody>
            ${this.windows.length === 0
              ? html`<tr>
                  <td colspan="7" class="muted">暂无封锁窗</td>
                </tr>`
              : this.windows.map(
                  (win) => html`
                    <tr>
                      <td>${win.id}</td>
                      <td>${win.turbine_code}</td>
                      <td>${this.fmt(win.start_at)}</td>
                      <td>${this.fmt(win.end_at)}</td>
                      <td>${win.reason ?? "—"}</td>
                      <td>${win.created_by}</td>
                      <td>${this.fmt(win.created_at)}</td>
                    </tr>
                  `
                )}
          </tbody>
        </table>
      </section>

      <section>
        <h2 style="margin-top:0;font-size:1.1rem;">封锁日志</h2>
        <table>
          <thead>
            <tr>
              <th>编号</th>
              <th>机组</th>
              <th>误差°</th>
              <th>报送人</th>
              <th>拦截时刻</th>
              <th>命中封锁窗</th>
            </tr>
          </thead>
          <tbody>
            ${this.rejectLogs.length === 0
              ? html`<tr>
                  <td colspan="6" class="muted">暂无拒收记录</td>
                </tr>`
              : this.rejectLogs.map(
                  (log) => html`
                    <tr>
                      <td>${log.id}</td>
                      <td>${log.turbine_code}</td>
                      <td>${log.yaw_err_deg}</td>
                      <td>${log.attempted_by}</td>
                      <td>${this.fmt(log.attempted_at)}</td>
                      <td>
                        <span class="tag locked">#${log.window_id}</span>
                        ${this.fmt(log.window_start_at)} 至
                        ${this.fmt(log.window_end_at)}
                      </td>
                    </tr>
                  `
                )}
          </tbody>
        </table>
      </section>
    `;
  }

  render() {
    if (!this.session) {
      return this.renderLogin();
    }

    return html`
      <header class="topbar">
        <h1>风机偏航对中台</h1>
        <nav>
          <button
            class="nav ${this.page === "logs" ? "active" : ""}"
            @click=${() => (this.page = "logs")}
          >
            对中记录
          </button>
          <button
            class="nav ${this.page === "lockout" ? "active" : ""}"
            @click=${() => (this.page = "lockout")}
          >
            偏航电机过热封锁窗
          </button>
        </nav>
        <div class="who">
          <span>
            ${this.session.username}（${this.isWriter ? "可提交" : "只读"}）
          </span>
          <button class="secondary" @click=${this.logout}>退出</button>
        </div>
      </header>
      ${this.page === "logs" ? this.renderLogsPage() : this.renderLockoutPage()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yaw-align-app": YawAlignApp;
  }
}

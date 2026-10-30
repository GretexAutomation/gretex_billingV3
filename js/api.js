// ============================================================
// api.js — Gretex Invoice Web App (COMPLETE)
// Updated: CORS fix + Biller Queue + Approval APIs + CFO APIs
// ============================================================

const API = {

  // 🔁 Replace with your Web App URL
  BASE_URL: "/api/app",
  

  // ─────────────────────────────────────────────
  // 🔧 CORE: Base request function
  // ─────────────────────────────────────────────
  async request(action, params = {}) {
    try {
      const token = Auth.getToken();

      // Guard: do not send unauthenticated requests that guarantee a 401
      if (!token && action !== "login" && action !== "ping") {
        console.warn(`[API] No token available for action: ${action}.`);
        const isLoginPage = window.location.pathname.endsWith("index.html") || window.location.pathname === "/";
        if (!isLoginPage) {
          Auth.clearSession();
          window.location.href = "index.html";
        }
        return null;
      }

      const body  = { action, token: token || "", ...params };

      // ✅ CORS Fix: text/plain avoids preflight
      const response = await fetch(API.BASE_URL, {
        method : "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body   : JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        if (data.code === 401) {
          // Do not kick user out on background sync or analytics actions
          const backgroundActions = [
            "getDashboardStats", "getBillerStats", "getQueueStats",
            "getSummaryReport", "getSystemVersion", "getInvoices", "ping"
          ];
          if (backgroundActions.includes(action)) {
            console.warn(`[API] 401 on background action '${action}'. Skipping auto-logout.`);
            return null;
          }

          // Require multiple consecutive 401s on active user actions before logging out
          API._consecutive401 = (API._consecutive401 || 0) + 1;
          if (API._consecutive401 >= 3) {
            console.warn(`[API] Multiple consecutive 401 errors received. Logging out.`);
            API._consecutive401 = 0;
            Auth.clearSession();
            window.location.href = "index.html";
          } else {
            console.warn(`[API] Transient 401 on '${action}' (${API._consecutive401}/3). Retaining session.`);
          }
          return null;
        }
        API._consecutive401 = 0;
        throw new Error(data.message || "Request failed");
      }
      API._consecutive401 = 0;

      // Order is already preserved newest-first from Supabase SQL order

      // ⚡ Write action notification: immediately trigger auto-sync check
      const writeActions = [
        "approveBill", "rejectBill", "bypassBill", "sendBillForApproval",
        "updateBillReview", "updateInvoiceFields", "deleteNewBill",
        "toggleCloseBill", "bulkCloseBills"
      ];
      if (writeActions.includes(action) && typeof SyncEngine !== "undefined") {
        SyncEngine.notifyLocalWrite();
      }

      return data;

    } catch (err) {
      console.error(`API Error [${action}]:`, err.message);
      Toast.error(err.message || "Something went wrong");
      return null;
    }
  },

  // ⚡ Silent request without disruptive toasts (used by SyncEngine)
  async silentRequest(action, params = {}) {
    try {
      const token = Auth.getToken();
      if (!token && action !== "login" && action !== "ping" && action !== "getSystemVersion") {
        return null;
      }
      const body = { action, token: token || "", ...params };
      const response = await fetch(API.BASE_URL, {
        method : "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body   : JSON.stringify(body)
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data;
    } catch (err) {
      return null;
    }
  },

  // ─────────────────────────────────────────────
  // 🔐 AUTH
  // ─────────────────────────────────────────────
  auth: {

    async login(email, password) {
      try {
        const response = await fetch(API.BASE_URL, {
          method : "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body   : JSON.stringify({ action: "login", email, password })
        });
        if (!response.ok) {
          return { success: false, message: `Server error: ${response.status}` };
        }
        return await response.json();
      } catch (err) {
        console.error("Login error:", err);
        return { success: false, message: "Connection failed. Check API URL." };
      }
    },

    async logout() {
      return await API.request("logout");
    },

    async getProfile() {
      return await API.request("getProfile");
    },

    async changePassword(oldPassword, newPassword) {
      return await API.request("changePassword", { oldPassword, newPassword });
    }
  },

  // ─────────────────────────────────────────────
  // 📊 DASHBOARD
  // ─────────────────────────────────────────────
  dashboard: {

    async getStats() {
      return await API.request("getDashboardStats");
    }
  },

  // ─────────────────────────────────────────────
  // 📋 INVOICES
  // ─────────────────────────────────────────────
  invoices: {

    async getAll(filters = {}) {
      return await API.request("getInvoices", filters);
    },

    async getDetail(rowIndex) {
      return await API.request("getInvoiceDetail", { rowIndex });
    },

    async updateFields(rowIndex, fields) {
      return await API.request("updateInvoiceFields", { rowIndex, fields });
    },

    async getRedFlags() {
      return await API.request("getRedFlagInvoices");
    }
  },

  // ─────────────────────────────────────────────
  // 📥 BILLER QUEUE
  // ─────────────────────────────────────────────
  biller: {

    async getQueue(filters = {}) {
      return await API.request("getBillerQueue", filters);
    },

    async getStats() {
      return await API.request("getBillerStats");
    },

    async updateReview(queueRowIndex, reviewData) {
      return await API.request("updateBillReview", {
        queueRowIndex, ...reviewData
      });
    },

    async sendForApproval(queueRowIndex, deptOrRole, targetEmail, targetName, notes, updatedFields, targetRole) {
      return await API.request("sendBillForApproval", {
        queueRowIndex,
        id: queueRowIndex,
        department: deptOrRole || "General",
        hodEmail: targetEmail || "",
        hodName: targetName || (targetEmail ? targetEmail.split("@")[0] : ""),
        targetRole: targetRole || (targetEmail ? "HOD" : "Account"),
        notes: notes || "",
        updatedFields: updatedFields || {}
      });
    },

    async getStatusHistory(invoiceNumber) {
      return await API.request("getBillStatusHistory", { invoiceNumber });
    },

    async deleteNewBill(queueRowIndex) {
      return await API.request("deleteNewBill", { queueRowIndex });
    },

    async sync() {
      return await API.request("syncBillerQueue");
    },

    async toggleClose(queueRowIndex) {
      return await API.request("toggleCloseBill", { queueRowIndex });
    },

    async bulkClose(rows, isClosing = true) {
      return await API.request("bulkCloseBills", { rows, isClosing });
    }
  },

  // ─────────────────────────────────────────────
  // ✅ ACCOUNT APPROVALS
  // ─────────────────────────────────────────────
  account: {

    async getQueue(filters = {}) {
      return await API.request("getApprovalQueue", filters);
    },

    async approveBill(queueRowIndex, note) {
      return await API.request("approveBill", { queueRowIndex, note });
    },

    async rejectBill(queueRowIndex, reason) {
      return await API.request("rejectBill", { queueRowIndex, reason });
    }
  },

  // ═════════════════════════════════════════════
  // ✅ CFO APPROVALS — WITH BYPASS AUTHORITY
  // ═════════════════════════════════════════════
  cfo: {

    async getQueue(filters = {}) {
      return await API.request("getApprovalQueue", filters);
    },

    async approveBill(queueRowIndex, note = "", bypassAccount = false, adminEmail = "") {
      return await API.request("approveBill", {
        queueRowIndex: queueRowIndex,
        note: note,
        bypassAccount: bypassAccount.toString(),
        adminEmail: adminEmail  // ✅ NEW: Target admin
      });
    },

    async rejectBill(queueRowIndex, reason = "") {
      return await API.request("rejectBill", {
        queueRowIndex: queueRowIndex,
        reason: reason
      });
    },

    async getQueueStats() {
      return await API.request("getQueueStats");
    }
  },

  // ═════════════════════════════════════════════
  // ✅ ADMIN APPROVALS — Final approval stage
  // ═════════════════════════════════════════════
  admin: {

    async getQueue(filters = {}) {
      return await API.request("getApprovalQueue", filters);
    },

    async approveBill(queueRowIndex, note = "") {
      return await API.request("approveBill", {
        queueRowIndex: queueRowIndex,
        note: note
      });
    },

    async rejectBill(queueRowIndex, reason = "") {
      return await API.request("rejectBill", {
        queueRowIndex: queueRowIndex,
        reason: reason
      });
    }
  },

  // ─────────────────────────────────────────────
  // 👥 USERS
  // ─────────────────────────────────────────────
  users: {

    async getAll() {
      return await API.request("getUsers");
    },

    async create(userData) {
      return await API.request("createUser", userData);
    },

    async update(userId, updates) {
      return await API.request("updateUser", { userId, ...updates });
    },

    async delete(userId) {
      return await API.request("deleteUser", { userId });
    },

    async toggleStatus(userId) {
      return await API.request("toggleUserStatus", { userId });
    },

    // ✅ NEW — Get users by role for dropdown
    async getByRole(role) {
      return await API.request("getUsersByRole", { role });
    },

    // ✅ NEW — Get all users grouped by role
    async getAllGrouped() {
      return await API.request("getAllRoleUsers");
    }
  },

  // ─────────────────────────────────────────────
  // 📊 REPORTS
  // ─────────────────────────────────────────────
  reports: {

    async getSummary() {
      return await API.request("getSummaryReport");
    }
  },

  // ─────────────────────────────────────────────
  // 📜 AUDIT
  // ─────────────────────────────────────────────
  audit: {

    async getLogs(limit = 100) {
      return await API.request("getAuditLog", { limit });
    }
  },

  // ─────────────────────────────────────────────
  // ⚙️ SETTINGS
  // ─────────────────────────────────────────────
  settings: {

    async get() {
      return await API.request("getSettings");
    },

    async update(settings) {
      return await API.request("updateSettings", { settings });
    }
  },

  // ─────────────────────────────────────────────
  // ⚡ SYSTEM & AUTO-SYNC
  // ─────────────────────────────────────────────
  system: {

    async getVersion() {
      return await API.silentRequest("getSystemVersion");
    }
  }
};


// ============================================================
// Auth — Session Management
// ============================================================
const Auth = {

  saveSession(data) {
    localStorage.setItem("gretex_token", data.token);
    localStorage.setItem("gretex_user", JSON.stringify({
      name     : data.name,
      email    : data.email,
      role     : data.role,
      dashboard: data.dashboard
    }));
  },

  getToken() {
    return localStorage.getItem("gretex_token") || null;
  },

  getUser() {
    try {
      const u = localStorage.getItem("gretex_user");
      return u ? JSON.parse(u) : null;
    } catch { return null; }
  },

  getRole() {
    const user = Auth.getUser();
    return user ? user.role : null;
  },

  isLoggedIn() {
    return !!Auth.getToken() && !!Auth.getUser();
  },

  clearSession() {
    localStorage.removeItem("gretex_token");
    localStorage.removeItem("gretex_user");
  },

  requireAuth() {
    if (!Auth.isLoggedIn()) {
      const isLoginPage = window.location.pathname.endsWith("index.html") || window.location.pathname === "/";
      if (!isLoginPage) {
        window.location.href = "index.html";
      }
      return false;
    }
    return true;
  },

  requireRole(...allowedRoles) {
    if (!Auth.requireAuth()) return false;
    const rawRole = Auth.getRole() || "";
    const cleanRole = rawRole.toLowerCase().replace(/[\s_-]/g, "");
    const cleanAllowed = allowedRoles.map(r => r.toLowerCase().replace(/[\s_-]/g, ""));

    // SuperAdmin has master permissions across all dashboards
    if (cleanRole === "superadmin") {
      return true;
    }

    if (!cleanAllowed.includes(cleanRole)) {
      console.warn(`[Auth] Role '${rawRole}' is not allowed for this page. Required:`, allowedRoles);
      const user = Auth.getUser();
      const userDashboard = (user && user.dashboard) ? user.dashboard : (cleanRole + ".html");
      // Gracefully redirect to their own dashboard instead of logging out
      if (!window.location.pathname.endsWith(userDashboard)) {
        window.location.href = userDashboard;
      }
      return false;
    }
    return true;
  },

  async logout() {
    try { await API.auth.logout(); } catch (e) {}
    Auth.clearSession();
    window.location.href = "index.html";
  },

  can: {
    viewInvoices()   {
      return ["Account","CFO","Admin","SuperAdmin","Billing"]
        .includes(Auth.getRole());
    },
    editInvoices()   {
      return ["Biller","Account","CFO","Admin","SuperAdmin"]
        .includes(Auth.getRole());
    },
    approveInvoices(){
      return ["Account","CFO","Admin","SuperAdmin"]
        .includes(Auth.getRole());
    },
    manageUsers()    {
      return ["Admin","SuperAdmin"].includes(Auth.getRole());
    },
    viewReports()    {
      return ["CFO","Admin","SuperAdmin"].includes(Auth.getRole());
    },
    viewAuditLog()   {
      return ["Admin","SuperAdmin"].includes(Auth.getRole());
    },
    manageSettings() {
      return ["Admin","SuperAdmin"].includes(Auth.getRole());
    }
  }
};


// ============================================================
// Toast Notifications
// ============================================================
const Toast = {

  container: null,

  init() {
    if (!Toast.container) {
      Toast.container = document.createElement("div");
      Toast.container.className = "toast-container";
      document.body.appendChild(Toast.container);
    }
  },

  show(message, type = "info", duration = 3500) {
    Toast.init();
    const icons = {
      success: "✅", error: "❌",
      warning: "⚠️", info : "ℹ️"
    };
    const toast     = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span style="font-size:1rem;flex-shrink:0">${icons[type]||"ℹ️"}</span>
      <span style="flex:1;font-size:0.83rem;line-height:1.4">${message}</span>
      <button onclick="this.parentElement.remove()"
        style="background:none;border:none;cursor:pointer;
               color:#9aa0a6;font-size:1rem;padding:0 0 0 8px">✕</button>`;
    Toast.container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity   = "0";
      toast.style.transform = "translateX(100%)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  success(msg) { Toast.show(msg, "success"); },
  error(msg)   { Toast.show(msg, "error", 5000); },
  warning(msg) { Toast.show(msg, "warning"); },
  info(msg)    { Toast.show(msg, "info"); }
};


// ============================================================
// Loader
// ============================================================
const Loader = {

  overlay: null,

  show(text = "Loading...") {
    if (!Loader.overlay) {
      Loader.overlay = document.createElement("div");
      Loader.overlay.className = "loading-overlay";
      Loader.overlay.innerHTML = `
        <div class="spinner"></div>
        <div class="loading-text" id="loaderText">${text}</div>`;
      document.body.appendChild(Loader.overlay);
    } else {
      const el = document.getElementById("loaderText");
      if (el) el.textContent = text;
      Loader.overlay.style.display = "flex";
    }
  },

  hide() {
    if (Loader.overlay) Loader.overlay.style.display = "none";
  }
};

// ============================================================
// 🚀 AppLoader — Smart App Initializer & Splash Loader
// Displays on initial login/dashboard load with animated progress
// ============================================================
const AppLoader = {
  container: null,
  progressBar: null,
  statusText: null,
  percentText: null,
  stepTimer: null,
  currentPercent: 15,

  show(options = {}) {
    const user = Auth.getUser() || { name: "User", role: "Gretex System" };
    const userName = options.userName || user.name || "User";
    const userRole = options.userRole || user.role || "Member";
    const initials = Utils.getInitials(userName);
    const roleColor = Utils.getRoleColor(userRole);

    if (this.container) {
      this.container.remove();
    }

    const overlay = document.createElement("div");
    overlay.id = "smartAppSplashLoader";
    overlay.className = "smart-app-loader";
    overlay.innerHTML = `
      <div class="smart-loader-card">
        <div class="smart-loader-brand">
          <div class="smart-loader-glow"></div>
          <div class="smart-loader-icon">💼</div>
        </div>
        <h3 class="smart-loader-title">Gretex Invoice System</h3>
        
        <div class="smart-loader-user">
          <div class="smart-loader-avatar" style="background:${roleColor}">${initials}</div>
          <div class="smart-loader-user-info">
            <div class="smart-loader-greeting">Welcome back, <strong>${userName}</strong></div>
            <div class="smart-loader-badge" style="color:${roleColor};background:${roleColor}18">${userRole} Workspace</div>
          </div>
        </div>

        <div class="smart-loader-progress-box">
          <div class="smart-loader-track">
            <div class="smart-loader-fill" id="smartLoaderFill" style="width: 15%;"></div>
          </div>
          <div class="smart-loader-status-row">
            <span class="smart-loader-status" id="smartLoaderStatus"><i class="fa fa-circle-notch fa-spin"></i> Initializing workspace...</span>
            <span class="smart-loader-percent" id="smartLoaderPercent">15%</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.container = overlay;
    this.progressBar = overlay.querySelector("#smartLoaderFill");
    this.statusText = overlay.querySelector("#smartLoaderStatus");
    this.percentText = overlay.querySelector("#smartLoaderPercent");
    this.currentPercent = 15;

    const steps = [
      { pct: 35, text: "Authenticating secure session..." },
      { pct: 60, text: "Synchronizing invoice records..." },
      { pct: 85, text: "Calculating executive metrics & KPIs..." }
    ];
    let stepIndex = 0;
    this.stepTimer = setInterval(() => {
      if (stepIndex < steps.length) {
        this.update(steps[stepIndex].pct, steps[stepIndex].text);
        stepIndex++;
      }
    }, 600);

    // Failsafe timeout after 8s so user is never stuck
    setTimeout(() => {
      this.finish();
    }, 8000);
  },

  update(pct, text) {
    if (!this.container) return;
    this.currentPercent = Math.min(95, Math.max(this.currentPercent, pct));
    if (this.progressBar) this.progressBar.style.width = this.currentPercent + "%";
    if (this.percentText) this.percentText.textContent = this.currentPercent + "%";
    if (this.statusText && text) {
      this.statusText.innerHTML = `<i class="fa fa-circle-notch fa-spin"></i> ${text}`;
    }
  },

  finish(callback) {
    if (!this.container) return;
    if (this.stepTimer) clearInterval(this.stepTimer);

    if (this.progressBar) this.progressBar.style.width = "100%";
    if (this.percentText) this.percentText.textContent = "100%";
    if (this.statusText) {
      this.statusText.innerHTML = `<i class="fa fa-circle-check" style="color:#10b981;"></i> Workspace Ready!`;
    }

    setTimeout(() => {
      if (this.container) {
        this.container.classList.add("fade-out");
        setTimeout(() => {
          if (this.container) {
            this.container.remove();
            this.container = null;
          }
          if (typeof callback === "function") callback();
        }, 450);
      }
    }, 350);
  }
};


// ============================================================
// Utils
// ============================================================
const Utils = {

  formatCurrency(amount) {
    const n = Number(amount) || 0;
    return "₹" + n.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  },

  formatDate(val) {
    if (!val) return "—";
    const d = new Date(val);
    return isNaN(d) ? val : d.toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric"
    });
  },

  formatDateTime(val) {
    if (!val) return "—";
    const d = new Date(val);
    return isNaN(d) ? val : d.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  },

  statusBadge(status) {
    const map = { "PASS": "badge-pass", "REVIEW": "badge-review", "FAIL": "badge-fail" };
    const cls  = map[status] || "badge-info";
    const icon = status === "PASS" ? "✅" : status === "REVIEW" ? "⚠️" :
                 status === "FAIL" ? "❌" : "•";
    return `<span class="badge ${cls}">${icon} ${status || "N/A"}</span>`;
  },

  // ✅ NEW: Approval status badge
  approvalBadge(status) {
    const map = {
      "New"     : { cls: "badge-info",    icon: "🆕" },
      "Reviewed": { cls: "badge-warning", icon: "👁️" },
      "Approved": { cls: "badge-pass",    icon: "✅" },
      "Rejected": { cls: "badge-fail",    icon: "❌" },
      "Pending" : { cls: "badge-review",  icon: "⏳" }
    };

    // Handle "Sent to X" status
    if (status && status.startsWith("Sent")) {
      return `<span class="badge" style="background:#e8f0fe;
        color:#1a73e8;font-weight:700">📤 ${status}</span>`;
    }

    // Handle bypass status
    if (status && status.includes("Bypass")) {
      return `<span class="badge" style="background:#fff3e0;
        color:#e65100;font-weight:700">⚡ ${status}</span>`;
    }

    const config = map[status] || { cls: "badge-info", icon: "•" };
    return `<span class="badge ${config.cls}">
      ${config.icon} ${status || "N/A"}</span>`;
  },

  isBillBypassed(inv) {
    if (!inv) return false;
    if (inv.isBypassed === true) return true;
    const checkFields = [
      inv["Account_Status"], inv["CFO_Status"], inv["Admin_Status"], inv["SA_Status"],
      inv["Approval Status"], inv["Current_Stage"],
      inv["Account_Remark"], inv["CFO_Remark"], inv["Admin_Remark"], inv["SA_Remark"],
      inv["Notes"], inv["Review Notes"]
    ];
    return checkFields.some(f => String(f || "").toLowerCase().includes("bypass"));
  },

  roleBadge(role) {
    return `<span class="role-badge role-${role}">${role}</span>`;
  },

  userStatusBadge(status) {
    const cls = status === "Active"   ? "status-active"   :
                status === "Inactive" ? "status-inactive" :
                "status-deleted";
    return `<span class="badge ${cls}">${status}</span>`;
  },

  getInitials(name) {
    if (!name) return "?";
    return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  },

  getRoleColor(role) {
    const colors = {
      "Biller"    : "#7c4dff",
      "Account"   : "#1a73e8",
      "CFO"       : "#00897b",
      "Admin"     : "#f57c00",
      "SuperAdmin": "#c62828",
      "Billing"   : "#2e7d32"
    };
    return colors[role] || "#9aa0a6";
  },

  truncate(str, len = 30) {
    if (!str) return "—";
    return str.length > len ? str.substring(0, len) + "..." : str;
  },

  buildRedFlags(flagStr) {
    if (!flagStr || flagStr.trim() === "") return "—";
    return flagStr.split("|").map(f => `
      <div class="red-flag-item">🚩 ${f.trim()}</div>
    `).join("");
  },

  debounce(fn, delay = 400) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  async confirm(message, title = "Are you sure?") {
    return new Promise(resolve => {
      const overlay     = document.createElement("div");
      overlay.className = "modal-overlay active";
      overlay.innerHTML = `
        <div class="modal-box" style="max-width:400px">
          <div class="modal-header">
            <h5 class="modal-title">⚠️ ${title}</h5>
          </div>
          <div class="modal-body">
            <p style="font-size:0.875rem;color:var(--gray-700);
              line-height:1.6">${message}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" id="confirmNo">Cancel</button>
            <button class="btn btn-danger" id="confirmYes">Confirm</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector("#confirmYes").onclick = () => {
        overlay.remove(); resolve(true);
      };
      overlay.querySelector("#confirmNo").onclick = () => {
        overlay.remove(); resolve(false);
      };
    });
  },

  // ✅ BILL LOCK CHECK - Only lock when sent for approval or final decision
  isBillLocked(status) {
    // Lock only if: "Sent to X" OR "Approved" OR "Rejected"
    // "Reviewed" is NOT locked - biller can still edit and save
    if (!status) return false;
    return status.indexOf("Sent") !== -1 || 
           status === "Approved" || 
           status === "Rejected";
  },

  // ✅ PREVIEW URL CONVERTER (Embed Google Drive & direct links)
  getPreviewEmbedUrl(url) {
    if (!url || typeof url !== "string") return "";
    const u = url.trim();
    if (!u.startsWith("http")) return "";
    const m1 = u.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m1 && m1[1]) return `https://drive.google.com/file/d/${m1[1]}/preview`;
    const m2 = u.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m2 && m2[1]) return `https://drive.google.com/file/d/${m2[1]}/preview`;
    return u;
  }
};

// ─────────────────────────────────────────────
// SMART TRACKING GENERATOR
// ─────────────────────────────────────────────
function generateTrackingTimeline(inv) {
  if (!inv) return "";
  
  // Normalize current stage
  let currentStage = (inv.current_stage || inv["Current_Stage"] || "").trim();
  if (!currentStage || inv.isNew || inv.biller_status === "New" || inv["Approval Status"] === "New") {
    currentStage = "Biller";
  }

  const stagesOrder = ["Received", "Biller", "HOD", "Account", "Finance", "CFO", "SuperAdmin", "Completed"];
  
  // Check if bill has any rejections
  let rejectedAt = null;
  let rejectionRemark = "";
  
  if (inv["overall_status"] === "Rejected" || inv["overall_status"] === "FAIL" || inv["Approval Status"] === "Rejected") {
    rejectedAt = inv["Rejection By"] || inv["rejection_by"] || currentStage;
    rejectionRemark = inv["Rejection Reason"] || inv["rejection_reason"] || inv["Account_Remark"] || inv["CFO_Remark"] || inv["d11_narration"] || "No specific reason provided.";
  } else if ((inv["HOD_Status"] || "").includes("Rejected")) {
    rejectedAt = "HOD"; rejectionRemark = inv["HOD_Remark"] || "Rejected by Department Head";
  } else if ((inv["Account_Status"] || "").includes("Rejected")) {
    rejectedAt = "Account"; rejectionRemark = inv["Account_Remark"] || "Rejected by Accounts";
  } else if ((inv["Finance_Status"] || "").includes("Rejected")) {
    rejectedAt = "Finance"; rejectionRemark = inv["Finance_Remark"] || "Rejected by Finance";
  } else if ((inv["CFO_Status"] || "").includes("Rejected")) {
    rejectedAt = "CFO"; rejectionRemark = inv["CFO_Remark"] || "Rejected by CFO";
  } else if ((inv["SA_Status"] || "").includes("Rejected")) {
    rejectedAt = "SuperAdmin"; rejectionRemark = inv["SA_Remark"] || "Rejected by Super Admin";
  }

  const stageIdx = stagesOrder.indexOf(currentStage);
  const currIdx = stageIdx !== -1 ? stageIdx : 1;

  const formatDt = (d) => {
    if (!d) return "";
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d);
      return dt.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });
    } catch (e) {
      return String(d);
    }
  };

  const formatDurationHms = (ms) => {
    if (ms == null || isNaN(ms) || ms < 0) return "";
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  const history = inv.approval_history || [];
  const getHistoryTime = (stageName) => {
    const item = history.find(a => (a.stage || "").toLowerCase() === stageName.toLowerCase());
    return item ? item.action_taken_at : null;
  };

  const receivedDate = inv["Timestamp"] || inv["created_at"] || inv["timestamp"] || null;
  const billerDate = inv["Biller_Send_At"] || inv["biller_sent_at"] || inv["biller_send_at"] || getHistoryTime("Biller") || (currIdx > 1 ? (inv["created_at"] || inv["timestamp"]) : null);
  const hodDate = inv["HOD_Send_At"] || inv["hod_send_at"] || getHistoryTime("HOD") || null;
  const accountDate = inv["Account_Send_At"] || inv["account_send_at"] || getHistoryTime("Account") || null;
  const financeDate = inv["Finance_Send_At"] || inv["finance_send_at"] || getHistoryTime("Finance") || null;
  const cfoDate = inv["CFO_Send_At"] || inv["cfo_send_at"] || getHistoryTime("CFO") || null;
  const saDate = inv["SA_Approved_At"] || inv["close_at"] || inv["send_for_billing_at"] || getHistoryTime("SuperAdmin") || getHistoryTime("Super Admin") || null;

  const steps = [
    {
      key: "Received",
      label: "Received",
      icon: "fa-envelope",
      rawDate: receivedDate,
      stageIdx: 0
    },
    {
      key: "Biller",
      label: "Biller",
      icon: "fa-user-check",
      rawDate: billerDate,
      stageIdx: 1
    },
    {
      key: "HOD",
      label: inv.department && inv.department !== "General" ? `HOD (${inv.department})` : "HOD",
      icon: "fa-user-tie",
      rawDate: hodDate,
      stageIdx: 2
    },
    {
      key: "Account",
      label: "Account",
      icon: "fa-calculator",
      rawDate: accountDate,
      stageIdx: 3
    },
    {
      key: "Finance",
      label: "Finance",
      icon: "fa-coins",
      rawDate: financeDate,
      stageIdx: 4
    },
    {
      key: "CFO",
      label: "CFO",
      icon: "fa-briefcase",
      rawDate: cfoDate,
      stageIdx: 5
    },
    {
      key: "SuperAdmin",
      label: "Super Admin",
      icon: "fa-crown",
      rawDate: saDate,
      stageIdx: 6
    }
  ];

  let html = `<div class="tracking-wrapper"><div class="tracking-container">`;

  steps.forEach((step, idx) => {
    let statusClass = "";
    let iconHtml = `<i class="fa ${step.icon}"></i>`;
    let dateText = "";

    const isCurrentRejected = rejectedAt && (step.key === rejectedAt || (rejectedAt === "Super Admin" && step.key === "SuperAdmin"));
    const isPastRejection = rejectedAt && step.stageIdx > stagesOrder.indexOf(rejectedAt);

    if (isCurrentRejected) {
      statusClass = "rejected";
      iconHtml = `<i class="fa fa-times"></i>`;
      dateText = step.rawDate ? formatDt(step.rawDate) : "Rejected";
    } else if (isPastRejection) {
      statusClass = "";
      dateText = "Cancelled";
    } else if (currentStage === "Completed" || step.stageIdx < currIdx) {
      statusClass = "completed";
      iconHtml = `<i class="fa fa-check"></i>`;
      dateText = step.rawDate ? formatDt(step.rawDate) : (step.stageIdx === 0 ? "Done" : "Approved");
    } else if (step.stageIdx === currIdx) {
      statusClass = "active";
      dateText = "In Review";
    } else {
      dateText = "Pending...";
    }

    // Compute turnaround duration between previous step and this step
    let durationHtml = "";
    if (idx > 0) {
      const prevStep = steps[idx - 1];
      let durationHms = "";

      if (prevStep.rawDate) {
        const tPrev = new Date(prevStep.rawDate).getTime();
        if (!isNaN(tPrev)) {
          if (step.rawDate) {
            const tCurr = new Date(step.rawDate).getTime();
            if (!isNaN(tCurr) && tCurr >= tPrev) {
              durationHms = formatDurationHms(tCurr - tPrev);
            }
          } else if (step.stageIdx === currIdx) {
            // Current active stage - elapsed time up to now
            const tNow = Date.now();
            if (tNow >= tPrev) {
              durationHms = formatDurationHms(tNow - tPrev);
            }
          }
        }
      }

      if (durationHms) {
        durationHtml = `
          <div class="track-duration-pill" style="position: absolute; top: 4px; left: -50%; width: 100%; display: flex; justify-content: center; align-items: center; z-index: 2; pointer-events: none;">
            <span style="background: #ffffff; border: 1px solid #cbd5e1; font-size: 0.62rem; font-weight: 700; padding: 1px 7px; border-radius: 12px; font-family: monospace; color: #334155; box-shadow: 0 1px 3px rgba(0,0,0,0.08); white-space: nowrap; line-height: 1.4;">
              <i class="fa fa-clock" style="font-size: 0.55rem; margin-right: 3px; color: #64748b;"></i>${durationHms}
            </span>
          </div>
        `;
      }
    }

    html += `
      <div class="track-step ${statusClass}">
        ${durationHtml}
        <div class="track-icon">${iconHtml}</div>
        <div class="track-text">
          <h6>${step.label}</h6>
          <p>${dateText}</p>
        </div>
      </div>
    `;
  });

  html += `</div></div>`;

  if (rejectedAt) {
    html += `
      <div style="margin-top: 16px; background: #fff0f0; border-left: 4px solid #ea4335; border-radius: 8px; padding: 12px 16px;">
        <div style="color: #d32f2f; font-weight: 700; margin-bottom: 4px; font-size: 0.9rem;">
          ❌ Rejected at ${rejectedAt} Stage
        </div>
        <div style="color: #5f6368; font-size: 0.85rem;">
          <strong>Reason:</strong> ${rejectionRemark}
        </div>
      </div>
    `;
  }

  return html;
}

// ============================================================
// ⚡ SyncEngine — Silent Background Real-Time Auto-Sync Engine
// Detects backend data version changes & refreshes UI seamlessly
// ============================================================
const SyncEngine = {
  currentVersion: null,
  pollIntervalMs: 60000, // 60 seconds interval
  timer: null,
  listeners: [],
  isChecking: false,
  isRefreshing: false,
  _lastCheck: 0,
  _dirty: false,

  init() {
    if (!Auth.isLoggedIn()) return;
    if (this.timer) clearInterval(this.timer);

    // Initial silent version check after 6 seconds of load
    setTimeout(() => this.check(), 6000);

    // Periodic heartbeat check (60s)
    this.timer = setInterval(() => this.check(), this.pollIntervalMs);

    // When user switches back to this tab, check only if >45s elapsed
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && Auth.isLoggedIn()) {
        const now = Date.now();
        if (now - this._lastCheck > 45000) {
          this.check();
        }
      }
    });
  },

  onUpdate(callback) {
    if (typeof callback === "function") {
      this.listeners.push(callback);
    }
  },

  notifyLocalWrite() {
    // When current user performs an action (approve, reject, upload, edit),
    // mark dirty so next sync runs cleanly
    this._dirty = true;
    setTimeout(() => this.check(), 2000);
  },

  async check() {
    if (!Auth.isLoggedIn() || this.isChecking || this.isRefreshing) return;
    if (document.hidden) return; // Save resources when tab is hidden

    const now = Date.now();
    if (now - this._lastCheck < 45000 && !this._dirty) return;
    this._lastCheck = now;

    this.isChecking = true;
    try {
      // Use silent ping instead of crashing on non-existent getSystemVersion
      const res = await API.silentRequest("ping");
      if (res && res.success && this._dirty) {
        this._dirty = false;
        await this.triggerSync("write-update");
      }
    } catch (err) {
      console.warn("[SyncEngine] Check skipped:", err.message);
    } finally {
      this.isChecking = false;
    }
  },

  async triggerSync(newVersion) {
    if (this.isRefreshing) return;

    // Do NOT interrupt if a modal is open (e.g., user is approving/rejecting)
    const openModal = document.querySelector(".modal-overlay.active");
    if (openModal) {
      console.log("[SyncEngine] Modal is active. Deferring UI refresh.");
      return;
    }

    // Do NOT interrupt if user is actively typing in a form or input
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT")) {
      console.log("[SyncEngine] User is typing. Deferring UI refresh.");
      return;
    }

    this.isRefreshing = true;
    try {
      // 1. Run default page refresh for any active Dashboard
      await this.defaultPageRefresh();

      // 2. Run custom registered page listeners
      for (const fn of this.listeners) {
        try { await fn(newVersion); } catch(e) { console.error("[SyncEngine] Listener error:", e); }
      }

      // 3. Show non-intrusive subtle sync pill
      this.showSyncPill();
    } catch (e) {
      console.error("[SyncEngine] Sync error:", e);
    } finally {
      this.isRefreshing = false;
    }
  },

  async defaultPageRefresh() {
    if (typeof Dashboard === "undefined") return;

    // Refresh ONLY the currently active section to avoid concurrent lockups
    const approveSec = document.getElementById("sec-approve") || document.getElementById("sec-approval");
    if (approveSec && approveSec.style.display !== "none" && typeof Dashboard.loadApprovalQueue === "function") {
      await Dashboard.loadApprovalQueue(true);
      return;
    }

    const queueSec = document.getElementById("sec-queue");
    if (queueSec && queueSec.style.display !== "none" && typeof Dashboard.loadQueue === "function") {
      await Dashboard.loadQueue(true);
      return;
    }

    // Refresh KPI / Stats
    if (typeof Dashboard.loadDashboardData === "function") {
      await Dashboard.loadDashboardData();
    } else if (typeof Dashboard.loadStats === "function") {
      await Dashboard.loadStats();
    }
  },

  showSyncPill() {
    let pill = document.getElementById("syncNotificationPill");
    if (!pill) {
      pill = document.createElement("div");
      pill.id = "syncNotificationPill";
      pill.style.cssText = `
        position: fixed;
        bottom: 22px;
        right: 24px;
        background: #0f172a;
        color: #f8fafc;
        padding: 7px 15px;
        border-radius: 20px;
        font-size: 0.76rem;
        font-weight: 600;
        box-shadow: 0 4px 14px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 99999;
        opacity: 0;
        transform: translateY(12px);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: none;
        border: 1px solid rgba(255,255,255,0.12);
      `;
      pill.innerHTML = `<span style="color:#10b981;font-size:0.9rem;animation:pulse 1.5s infinite">●</span> Data synced in real-time`;
      document.body.appendChild(pill);
    }

    setTimeout(() => {
      pill.style.opacity = "1";
      pill.style.transform = "translateY(0)";
    }, 50);

    setTimeout(() => {
      pill.style.opacity = "0";
      pill.style.transform = "translateY(12px)";
    }, 2800);
  }
};

// Auto-start SyncEngine when DOM is loaded and user is authenticated
document.addEventListener("DOMContentLoaded", () => {
  if (Auth.isLoggedIn()) {
    SyncEngine.init();
  }
});


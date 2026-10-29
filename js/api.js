// ============================================================================
// SupaApp — js/api.js
// Client API SDK & Session Manager for Supabase Serverless Backend (/api/app)
// ============================================================================

const API = {
  // Relative path works seamlessly on Vercel and local development
  BASE_URL: "/api/app",

  // ─────────────────────────────────────────────
  // Core Dispatcher
  // ─────────────────────────────────────────────
  async request(action, params = {}) {
    try {
      const token = Auth.getToken();

      // Guard: unauthenticated requests (except login/ping)
      if (!token && action !== "login" && action !== "ping") {
        console.warn(`[API] No token available for action: ${action}`);
        const isLoginPage = window.location.pathname.endsWith("index.html") || window.location.pathname === "/";
        if (!isLoginPage) {
          Auth.clearSession();
          window.location.href = "index.html";
        }
        return null;
      }

      const payload = { action, token: token || "", ...params };

      const response = await fetch(API.BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        if (response.status === 401) {
          Auth.clearSession();
          window.location.href = "index.html";
          return null;
        }
        const errText = await response.text();
        let errMsg = `Server Error (${response.status})`;
        try {
          const parsed = JSON.parse(errText);
          if (parsed.message) errMsg = parsed.message;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || "Request failed");
      }

      return data;
    } catch (err) {
      console.error(`[API Error: ${action}]`, err.message);
      if (typeof Toast !== "undefined") {
        Toast.error(err.message || "Something went wrong");
      }
      return null;
    }
  },

  // ─────────────────────────────────────────────
  // Authentication Services
  // ─────────────────────────────────────────────
  auth: {
    login: (email, password) => API.request("login", { email, password }),
    logout: () => API.request("logout"),
    verifyToken: () => API.request("getProfile"),
    changePassword: (oldPassword, newPassword) => API.request("changePassword", { oldPassword, newPassword }),
    getProfile: () => API.request("getProfile")
  },

  // ─────────────────────────────────────────────
  // Dashboard & Queues
  // ─────────────────────────────────────────────
  dashboard: {
    getStats: () => API.request("getDashboardStats")
  },

  biller: {
    getStats: () => API.request("getBillerStats"),
    getQueue: (params = {}) => API.request("getBillerQueue", params),
    sendForApproval: (queueRowIndex, department, hodEmail, hodName, remark, updatedFields = {}) =>
      API.request("sendBillForApproval", { queueRowIndex, department, hodEmail, hodName, remark, updatedFields }),
    deleteNewBill: (queueRowIndex) => API.request("deleteNewBill", { queueRowIndex }),
    updateDraft: (queueRowIndex, fields) => API.request("updateBillReview", { queueRowIndex, fields })
  },

  approval: {
    getQueue: (stage = "") => API.request("getApprovalQueue", { stage }),
    approve: (queueRowIndex, note = "", bypass = false, targetStage = "", targetAssignee = "") =>
      API.request("approveBill", { queueRowIndex, note, bypass, targetStage, targetAssignee }),
    reject: (queueRowIndex, note = "") => API.request("rejectBill", { queueRowIndex, note })
  },

  invoices: {
    getTimeline: (invoiceUniqueId) => API.request("getBillStatusHistory", { invoice_unique_id: invoiceUniqueId }),
    getHODs: () => API.request("getHODs"),
    getRedFlags: () => API.request("getRedFlagInvoices")
  },

  users: {
    getAll: () => API.request("getUsers"),
    create: (userData) => API.request("createUser", userData),
    delete: (email) => API.request("deleteUser", { email }),
    toggleStatus: (email, currentStatus) => API.request("toggleUserStatus", { email, status: currentStatus })
  },

  audit: {
    getLogs: (limit = 100) => API.request("getAuditLog", { limit })
  }
};

// ─────────────────────────────────────────────
// Session & Auth Management
// ─────────────────────────────────────────────
const Auth = {
  TOKEN_KEY: "gretex_supa_token",
  USER_KEY: "gretex_supa_user",

  saveSession(data) {
    if (data.token) localStorage.setItem(this.TOKEN_KEY, data.token);
    const user = {
      name: data.name,
      email: data.email,
      role: data.role,
      department: data.department || "General",
      dashboard: data.dashboard
    };
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY) || "";
  },

  getUser() {
    try {
      const u = localStorage.getItem(this.USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch (_) {
      return null;
    }
  },

  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  requireAuth(allowedRoles = []) {
    const token = this.getToken();
    const user = this.getUser();

    if (!token || !user) {
      this.clearSession();
      window.location.href = "index.html";
      return false;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role) && user.role !== "SuperAdmin") {
      alert(`Unauthorized access for role: ${user.role}`);
      window.location.href = user.dashboard || "index.html";
      return false;
    }

    return true;
  }
};

// ─────────────────────────────────────────────
// Toast Alerts
// ─────────────────────────────────────────────
const Toast = {
  show(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    const bgMap = {
      success: "linear-gradient(135deg, #10b981, #059669)",
      error: "linear-gradient(135deg, #ef4444, #dc2626)",
      warning: "linear-gradient(135deg, #f59e0b, #d97706)",
      info: "linear-gradient(135deg, #3b82f6, #2563eb)"
    };

    toast.style.cssText = `background:${bgMap[type] || bgMap.info};color:#fff;padding:12px 20px;border-radius:10px;font-size:0.9rem;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,0.25);opacity:0;transform:translateY(10px);transition:all 0.3s ease;`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },
  success(msg) { this.show(msg, "success"); },
  error(msg) { this.show(msg, "error"); },
  warning(msg) { this.show(msg, "warning"); },
  info(msg) { this.show(msg, "info"); }
};

// ─────────────────────────────────────────────
// Formatting & Currency Helpers
// ─────────────────────────────────────────────
const Utils = {
  formatCurrency(num) {
    if (!num && num !== 0) return "₹0.00";
    const n = Number(num);
    if (isNaN(n)) return String(num);
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    }).format(n);
  },

  formatDate(dateVal) {
    if (!dateVal) return "N/A";
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  },

  statusBadge(status) {
    const s = (status || "").toLowerCase();
    if (s.includes("approved")) return `<span class="badge badge-success">${status}</span>`;
    if (s.includes("rejected") || s.includes("fail")) return `<span class="badge badge-danger">${status}</span>`;
    if (s.includes("new")) return `<span class="badge badge-primary">New</span>`;
    return `<span class="badge badge-warning">${status || "Pending"}</span>`;
  }
};

// ============================================================================
// SupaApp — js/sidebar.js
// Dynamic Navigation Sidebar for 6 Roles (Biller, HOD, Account, Finance, CFO, SuperAdmin)
// ============================================================================

const Sidebar = {
  render(activeSection = "dashboard") {
    const user = Auth.getUser() || { name: "Guest", role: "Biller", department: "General" };
    const container = document.getElementById("sidebar");
    if (!container) return;

    const navItems = this.getNavItems(user.role);

    container.innerHTML = `
      <div class="sidebar-header" style="padding:24px 20px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:12px;">
        <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg, #4f46e5, #06b6d4);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:1.2rem;box-shadow:0 4px 12px rgba(79,70,229,0.3);">
          G
        </div>
        <div>
          <div style="font-weight:700;color:#fff;font-size:1.05rem;letter-spacing:-0.3px;">Gretex Invoicing</div>
          <div style="font-size:0.75rem;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.5px;">${user.role} ${user.department && user.department !== 'All' ? `(${user.department})` : ''}</div>
        </div>
      </div>

      <nav class="sidebar-nav" style="padding:16px 12px;flex:1;overflow-y:auto;">
        ${navItems.map(item => `
          <a href="${item.link || '#'}" 
             class="nav-item ${activeSection === item.id ? 'active' : ''}"
             onclick="${item.onclick ? item.onclick + ';return false;' : ''}"
             style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;color:rgba(255,255,255,0.7);text-decoration:none;font-size:0.9rem;font-weight:500;margin-bottom:4px;transition:all 0.2s ease;">
            <i class="fa ${item.icon}" style="width:20px;text-align:center;color:${activeSection === item.id ? '#6366f1' : 'inherit'};"></i>
            <span>${item.label}</span>
            ${item.badge ? `<span class="badge" style="margin-left:auto;background:rgba(255,255,255,0.1);">${item.badge}</span>` : ''}
          </a>
        `).join("")}
      </nav>

      <div class="sidebar-footer" style="padding:16px 20px;border-top:1px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.15);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div style="width:36px;height:36px;border-radius:50%;background:#4f46e5;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:0.9rem;">
            ${(user.name || "U")[0]}
          </div>
          <div style="overflow:hidden;">
            <div style="font-size:0.85rem;font-weight:600;color:#fff;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;">${user.name}</div>
            <div style="font-size:0.75rem;color:rgba(255,255,255,0.4);white-space:nowrap;text-overflow:ellipsis;overflow:hidden;">${user.email}</div>
          </div>
        </div>
        <button onclick="Sidebar.logout()" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);border-radius:8px;color:#ef4444;font-size:0.85rem;font-weight:600;cursor:pointer;transition:all 0.2s ease;">
          <i class="fa fa-sign-out"></i> Logout
        </button>
      </div>
    `;
  },

  getNavItems(role) {
    const common = [
      { id: "dashboard", label: "Dashboard", icon: "fa-dashboard", onclick: "Dashboard.showSection('dashboard')" }
    ];

    switch (role) {
      case "Biller":
        return [
          ...common,
          { id: "invoices", label: "Invoice Queue", icon: "fa-file-invoice", onclick: "Dashboard.showSection('invoices')" },
          { id: "upload", label: "Upload Invoice", icon: "fa-cloud-upload", onclick: "Dashboard.showSection('upload')" },
          { id: "redflags", label: "Red Flags", icon: "fa-flag", onclick: "Dashboard.showSection('redflags')" }
        ];

      case "HOD":
        return [
          ...common,
          { id: "approval", label: "Dept Approval Queue", icon: "fa-check-to-slot", onclick: "Dashboard.showSection('approval')" },
          { id: "invoices", label: "All Dept Bills", icon: "fa-building-user", onclick: "Dashboard.showSection('invoices')" },
          { id: "redflags", label: "Red Flags", icon: "fa-flag", onclick: "Dashboard.showSection('redflags')" }
        ];

      case "Account":
        return [
          ...common,
          { id: "approval", label: "Account Approvals", icon: "fa-stamp", onclick: "Dashboard.showSection('approval')" },
          { id: "invoices", label: "All Invoices", icon: "fa-file-invoice-dollar", onclick: "Dashboard.showSection('invoices')" },
          { id: "redflags", label: "Red Flags", icon: "fa-flag", onclick: "Dashboard.showSection('redflags')" }
        ];

      case "Finance":
        return [
          ...common,
          { id: "approval", label: "Finance Approvals", icon: "fa-money-bill-transfer", onclick: "Dashboard.showSection('approval')" },
          { id: "invoices", label: "All Invoices", icon: "fa-file-invoice-dollar", onclick: "Dashboard.showSection('invoices')" },
          { id: "reports", label: "Budget Reports", icon: "fa-chart-pie", onclick: "Dashboard.showSection('reports')" }
        ];

      case "CFO":
        return [
          ...common,
          { id: "approval", label: "CFO Signoff Queue", icon: "fa-award", onclick: "Dashboard.showSection('approval')" },
          { id: "invoices", label: "Master Invoices", icon: "fa-file-invoice-dollar", onclick: "Dashboard.showSection('invoices')" },
          { id: "reports", label: "Financial Reports", icon: "fa-chart-line", onclick: "Dashboard.showSection('reports')" }
        ];

      case "SuperAdmin":
        return [
          ...common,
          { id: "approval", label: "Universal Approvals", icon: "fa-shield-halved", onclick: "Dashboard.showSection('approval')" },
          { id: "invoices", label: "Master Invoices", icon: "fa-database", onclick: "Dashboard.showSection('invoices')" },
          { id: "users", label: "User Management", icon: "fa-users-gear", onclick: "Dashboard.showSection('users')" },
          { id: "audit", label: "System Audit Logs", icon: "fa-clipboard-list", onclick: "Dashboard.showSection('audit')" }
        ];

      default:
        return common;
    }
  },

  async logout() {
    if (!confirm("Are you sure you want to log out?")) return;
    try {
      await API.auth.logout();
    } catch (_) {}
    Auth.clearSession();
    window.location.href = "index.html";
  }
};

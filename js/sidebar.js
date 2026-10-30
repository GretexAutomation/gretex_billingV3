// ============================================================
// sidebar.js — Gretex Invoice Web App (UPDATED)
// Handles: Sidebar rendering, navigation, toggle, active states
// ============================================================

const Sidebar = {

  // ─────────────────────────────────────────────
  // NAV MENU CONFIG — per role
  // ─────────────────────────────────────────────
  menuConfig: {

    Biller: [
      {
        section: "Main",
        items: [
          { id: "dashboard", icon: "fa-gauge",        label: "Dashboard",       page: "biller.html"  },
          { id: "submit",    icon: "fa-plus-circle",  label: "Submit Invoice",  page: "biller.html#submit" },
          {
            id: "myinvoices",
            icon: "fa-file-invoice",
            label: "My Invoices",
            page: "biller.html#invoices",
            badge: "invoices",
            children: [
              { id: "invoices",  label: "All Bills",   page: "biller.html#invoices",  icon: "fa-list" },
              { id: "new",       label: "New Bills",   page: "biller.html#new",       icon: "fa-sparkles" },
              { id: "process",   label: "In Process",  page: "biller.html#process",   icon: "fa-clock" },
              { id: "completed", label: "Completed",   page: "biller.html#completed", icon: "fa-circle-check" }
            ]
          },
          { id: "flowup",    icon: "fa-timeline",     label: "Flowup",        page: "biller.html#flowup" },
          { id: "approved",  icon: "fa-check-double", label: "Approved",      page: "biller.html#approved" }
        ]
      },
      {
        section: "Account",
        items: [
          { id: "profile",   icon: "fa-user",         label: "My Profile",      page: "biller.html#profile" },
          { id: "password",  icon: "fa-lock",         label: "Change Password", page: "biller.html#password" }
        ]
      }
    ],

    Account: [
      {
        section: "Main",
        items: [
          { id: "dashboard", icon: "fa-gauge",         label: "Dashboard",      page: "account.html"  },
          { id: "invoices",  icon: "fa-file-invoice",  label: "All Invoices",   page: "account.html#invoices" },
          { id: "approval",  icon: "fa-list-check",    label: "Approval Queue", page: "account.html#approval", badge: "approval" },
          { id: "redflags",  icon: "fa-flag",          label: "Red Flags",      page: "account.html#redflags", badge: "redflags" }
        ]
      },
      {
        section: "Reports",
        items: [
          { id: "summary",   icon: "fa-chart-pie",     label: "Summary",        page: "account.html#summary" }
        ]
      },
      {
        section: "Account",
        items: [
          { id: "profile",   icon: "fa-user",          label: "My Profile",     page: "account.html#profile" },
          { id: "password",  icon: "fa-lock",          label: "Change Password",page: "account.html#password" }
        ]
      }
    ],

    CFO: [
      {
        section: "Main",
        items: [
          { id: "dashboard", icon: "fa-gauge",         label: "Dashboard",      page: "cfo.html"  },
          { id: "invoices",  icon: "fa-file-invoice",  label: "All Invoices",   page: "cfo.html#invoices" },
          { id: "redflags",  icon: "fa-flag",          label: "Red Flags",      page: "cfo.html#redflags", badge: "redflags" },
          { id: "approve",   icon: "fa-circle-check",  label: "Approvals",      page: "cfo.html#approve" }
        ]
      },
      {
        section: "Reports",
        items: [
          { id: "reports",   icon: "fa-chart-bar",     label: "Reports",        page: "cfo.html#reports" },
          { id: "tds",       icon: "fa-percent",       label: "TDS Summary",    page: "cfo.html#tds" },
          { id: "gst",       icon: "fa-receipt",       label: "GST Summary",    page: "cfo.html#gst" }
        ]
      },
      {
        section: "Account",
        items: [
          { id: "profile",   icon: "fa-user",          label: "My Profile",     page: "cfo.html#profile" },
          { id: "password",  icon: "fa-lock",          label: "Change Password",page: "cfo.html#password" }
        ]
      }
    ],

    Admin: [
      {
        section: "Main",
        items: [
          { id: "dashboard", icon: "fa-gauge",         label: "Dashboard",      page: "admin.html"  },
          { id: "invoices",  icon: "fa-file-invoice",  label: "All Invoices",   page: "admin.html#invoices" },
          { id: "approve",  icon: "fa-list-check",    label: "Approval Pending By Me", page: "admin.html#approve", badge: "approval" },
          { id: "redflags",  icon: "fa-flag",          label: "Red Flags",      page: "admin.html#redflags", badge: "redflags" }
        ]
      },
      
      {
        section: "Reports",
        items: [
          { id: "reports",   icon: "fa-chart-bar",     label: "Reports",        page: "admin.html#reports" },
          { id: "settings",  icon: "fa-gear",          label: "Settings",       page: "admin.html#settings" }
        ]
      },
      {
        section: "Account",
        items: [
          { id: "profile",   icon: "fa-user",          label: "My Profile",     page: "admin.html#profile" },
          { id: "password",  icon: "fa-lock",          label: "Change Password",page: "admin.html#password" }
        ]
      }
    ],

    SuperAdmin: [
      {
        section: "Main",
        items: [
          { id: "dashboard", icon: "fa-gauge",         label: "Dashboard",       page: "superadmin.html"  },
          { id: "master",    icon: "fa-database",      label: "Master",          page: "superadmin.html#master" },
          { id: "invoices",  icon: "fa-file-invoice",  label: "All Invoices",    page: "superadmin.html#invoices" },
          { id: "approve",   icon: "fa-list-check",    label: "Approval Pending By Me",  page: "superadmin.html#approve", badge: "approval" },
          { id: "redflags",  icon: "fa-flag",          label: "Red Flags",       page: "superadmin.html#redflags", badge: "redflags" }
        ]
      },
      {
        section: "Management",
        items: [
          { id: "users",     icon: "fa-users",         label: "User Management", page: "superadmin.html#users" },
          { id: "audit",     icon: "fa-shield",        label: "Audit Log",       page: "superadmin.html#audit" },
          { id: "settings",  icon: "fa-gear",          label: "Settings",        page: "superadmin.html#settings" }
        ]
      },
      {
        section: "Reports",
        items: [
          { id: "reports",   icon: "fa-chart-bar",     label: "Reports",         page: "superadmin.html#reports" },
          { id: "tds",       icon: "fa-percent",       label: "TDS Summary",     page: "superadmin.html#tds" },
          { id: "gst",       icon: "fa-receipt",       label: "GST Summary",     page: "superadmin.html#gst" }
        ]
      },
      {
        section: "Account",
        items: [
          { id: "profile",   icon: "fa-user",          label: "My Profile",      page: "superadmin.html#profile" },
          { id: "password",  icon: "fa-lock",          label: "Change Password", page: "superadmin.html#password" }
        ]
      }
    ],

    HOD: [
      {
        section: "Main",
        items: [
          { id: "dashboard", icon: "fa-gauge",        label: "Dashboard",        page: "hod.html" },
          {
            id: "mybills",
            icon: "fa-file-invoice",
            label: "Department Bills",
            page: "hod.html#invoices",
            badge: "approval",
            children: [
              { id: "invoices",  label: "All Bills",                page: "hod.html#invoices",  icon: "fa-list" },
              { id: "approval",  label: "Approval Pending For Me",  page: "hod.html#approval",  icon: "fa-sparkles" },
              { id: "pending",   label: "Pending (In Process)",     page: "hod.html#pending",   icon: "fa-clock" },
              { id: "completed", label: "Completed",                page: "hod.html#completed", icon: "fa-circle-check" }
            ]
          }
        ]
      },
      {
        section: "Account",
        items: [
          { id: "profile",   icon: "fa-user",         label: "My Profile",       page: "hod.html#profile" },
          { id: "password",  icon: "fa-lock",         label: "Change Password",  page: "hod.html#password" }
        ]
      }
    ],

    Finance: [
      {
        section: "Main",
        items: [
          { id: "dashboard", icon: "fa-gauge",        label: "Dashboard",        page: "finance.html" },
          { id: "approval",  icon: "fa-money-bill-transfer", label: "Clearance Queue", page: "finance.html#approval", badge: "approval" },
          { id: "invoices",  icon: "fa-file-invoice", label: "All Invoices",     page: "finance.html#invoices" }
        ]
      },
      {
        section: "Reports",
        items: [
          { id: "reports",   icon: "fa-chart-bar",    label: "Reports",          page: "finance.html#reports" }
        ]
      },
      {
        section: "Account",
        items: [
          { id: "profile",   icon: "fa-user",         label: "My Profile",       page: "finance.html#profile" },
          { id: "password",  icon: "fa-lock",         label: "Change Password",  page: "finance.html#password" }
        ]
      }
    ],

    Billing: [
      {
        section: "Main",
        items: [
          { id: "dashboard", icon: "fa-gauge",         label: "Dashboard",       page: "billing.html"  },
          { id: "invoices",  icon: "fa-file-invoice",  label: "All Invoices",    page: "billing.html#invoices" },
          { id: "payments",  icon: "fa-money-bill",    label: "Payments",        page: "billing.html#payments" },
          { id: "pending",   icon: "fa-clock",         label: "Pending",         page: "billing.html#pending", badge: "pending" }
        ]
      },
      {
        section: "Reports",
        items: [
          { id: "summary",   icon: "fa-chart-pie",     label: "Summary",         page: "billing.html#summary" }
        ]
      },
      {
        section: "Account",
        items: [
          { id: "profile",   icon: "fa-user",          label: "My Profile",      page: "billing.html#profile" },
          { id: "password",  icon: "fa-lock",          label: "Change Password", page: "billing.html#password" }
        ]
      }
    ]
  },

  // ─────────────────────────────────────────────
  // INIT: Build sidebar for current user role
  // ─────────────────────────────────────────────
  init(activeId = "dashboard") {
    const user = Auth.getUser();
    if (!user) return;

    Sidebar.render(user, activeId);
    Sidebar.setupToggle();
    Sidebar.setupMobile();
    Sidebar.loadBadges();
  },

  // ─────────────────────────────────────────────
  // RENDER: Build full sidebar HTML
  // ─────────────────────────────────────────────
  render(user, activeId) {
    const sidebar  = document.getElementById("sidebar");
    if (!sidebar) return;

    const menu     = Sidebar.menuConfig[user.role] || [];
    const initials = Utils.getInitials(user.name);
    const color    = Utils.getRoleColor(user.role);

    sidebar.innerHTML = `

      <!-- ── Logo ── -->
      <div class="sidebar-logo">
        <div class="logo-icon">💼</div>
        <div>
          <div class="logo-text">Gretex</div>
          <div class="logo-sub">Invoice System</div>
        </div>
      </div>

      <!-- ── User Info ── -->
      <div class="sidebar-user">
        <div class="user-avatar" style="background:${color}">
          ${initials}
        </div>
        <div class="user-info">
          <div class="user-name">${user.name}</div>
          <div class="user-role">${user.role}</div>
        </div>
      </div>

      <!-- ── Nav Menu ── -->
      <nav class="sidebar-nav" id="sidebarNav">
        ${Sidebar.buildMenu(menu, activeId)}
      </nav>

      <!-- ── Footer ── -->
      <div class="sidebar-footer">
        <div class="logout-btn" onclick="Sidebar.logout()">
          <i class="fa fa-right-from-bracket" style="width:22px;text-align:center"></i>
          <span>Logout</span>
        </div>
      </div>
    `;
  },

  // ─────────────────────────────────────────────
  // BUILD: Nav menu HTML
  // ─────────────────────────────────────────────
  buildMenu(menu, activeId) {
    return menu.map(section => `
      <div class="nav-section">
        <div class="nav-section-title">${section.section}</div>
        ${section.items.map(item => {
          if (item.children && item.children.length > 0) {
            const isChildActive = item.children.some(c => c.id === activeId);
            const isParentActive = item.id === activeId || isChildActive;
            return `
              <div class="nav-group">
                <div
                  class="nav-item has-sub ${isParentActive ? "active" : ""} ${isParentActive ? "expanded" : ""}"
                  id="nav-${item.id}"
                  onclick="Sidebar.handleParentNav('${item.id}', '${item.page}', 'sub-${item.id}')"
                  title="${item.label}"
                >
                  <i class="fa ${item.icon} nav-icon"></i>
                  <span class="nav-label">${item.label}</span>
                  <i class="fa fa-chevron-down sub-arrow"></i>
                  ${item.badge
                    ? `<span class="nav-badge" id="badge-${item.badge}" style="display:none">0</span>`
                    : ""
                  }
                </div>
                <div class="sub-menu ${isParentActive ? "open" : ""}" id="sub-${item.id}">
                  ${item.children.map(sub => `
                    <div
                      class="nav-sub-item ${sub.id === activeId ? "active" : ""}"
                      id="nav-sub-${sub.id}"
                      onclick="Sidebar.navigate('${sub.id}', '${sub.page}')"
                      title="${sub.label}"
                    >
                      <i class="fa ${sub.icon || 'fa-circle'} sub-icon" style="font-size:0.65rem;width:14px;text-align:center"></i>
                      <span>${sub.label}</span>
                    </div>
                  `).join("")}
                </div>
              </div>
            `;
          }

          return `
            <div
              class="nav-item ${item.id === activeId ? "active" : ""}"
              id="nav-${item.id}"
              onclick="Sidebar.navigate('${item.id}', '${item.page}')"
              title="${item.label}"
            >
              <i class="fa ${item.icon} nav-icon"></i>
              <span class="nav-label">${item.label}</span>
              ${item.badge
                ? `<span class="nav-badge" id="badge-${item.badge}" style="display:none">0</span>`
                : ""
              }
            </div>
          `;
        }).join("")}
      </div>
    `).join("");
  },

  handleParentNav(id, page, subId) {
    const sub = document.getElementById(subId);
    const parent = document.getElementById(`nav-${id}`);
    const isOpen = sub?.classList.contains("open");
    if (isOpen) {
      sub?.classList.remove("open");
      parent?.classList.remove("expanded");
    } else {
      sub?.classList.add("open");
      parent?.classList.add("expanded");
    }
    Sidebar.navigate(id, page);
  },

  // ─────────────────────────────────────────────
  // NAVIGATE: Go to page/section
  // ─────────────────────────────────────────────
  navigate(id, page) {
    Sidebar.setActive(id);

    const currentPage = window.location.pathname.split("/").pop();
    const targetPage  = page.split("#")[0];
    const hash        = page.includes("#") ? page.split("#")[1] : "dashboard";

    // 2. Check if we are staying on the same page
    if (currentPage === targetPage || targetPage === "" || (currentPage === "" && targetPage === "biller.html")) {

      if (typeof Dashboard !== "undefined") {
        Dashboard.showSection(hash);

        // URL hash update without page reload
        if (hash === "dashboard") {
          history.pushState(null, null, window.location.pathname);
        } else {
          window.location.hash = hash;
        }
      }
    } else {
      // 3. Different page — navigate properly
      window.location.href = page;
    }
  },

  // ─────────────────────────────────────────────
  // SUBMIT INVOICE: Show form to collect details
  // ─────────────────────────────────────────────
  openSubmitInvoice() {
    if (typeof Dashboard !== "undefined") {
      Dashboard.showSection("submit");
    }
  },

  // ─────────────────────────────────────────────
  // TOGGLE: Collapse/Expand sidebar
  // ─────────────────────────────────────────────
  setupToggle() {
    const btn         = document.getElementById("toggleSidebar");
    const sidebar     = document.getElementById("sidebar");
    const mainContent = document.getElementById("mainContent");

    if (!btn) return;

    // Restore state
    const collapsed = localStorage.getItem("sidebar_collapsed") === "true";
    if (collapsed) {
      sidebar.classList.add("collapsed");
      mainContent?.classList.add("expanded");
    }

    btn.addEventListener("click", () => {
      const isCollapsed = sidebar.classList.toggle("collapsed");
      mainContent?.classList.toggle("expanded", isCollapsed);
      localStorage.setItem("sidebar_collapsed", isCollapsed);
    });
  },

  // ─────────────────────────────────────────────
  // MOBILE: Overlay toggle for small screens
  // ─────────────────────────────────────────────
  setupMobile() {
    const btn     = document.getElementById("toggleSidebar");
    const sidebar = document.getElementById("sidebar");

    if (!btn || !sidebar) return;

    if (window.innerWidth <= 768) {
      btn.addEventListener("click", () => {
        sidebar.classList.toggle("mobile-open");
      });

      // Close on outside click
      document.addEventListener("click", (e) => {
        if (!sidebar.contains(e.target) && !btn.contains(e.target)) {
          sidebar.classList.remove("mobile-open");
        }
      });
    }
  },

  // ─────────────────────────────────────────────
  // BADGES: Load red flag counts + approval pending counts
  // ─────────────────────────────────────────────
  async loadBadges() {
    try {
      // Red flags badge (all roles that have it)
      const rfRes = await API.invoices.getRedFlags();
      if (rfRes?.success) {
        const count = rfRes.data.total || 0;
        document.querySelectorAll("[id^='badge-redflags']").forEach(el => {
          if (count > 0) {
            el.textContent   = count > 99 ? "99+" : count;
            el.style.display = "inline-block";
          } else {
            el.style.display = "none";
          }
        });
      }
    } catch (e) {
      console.warn("Red flag badge load error:", e.message);
    }

    try {
      // Approval Queue pending badge (Account & HOD roles)
      const approvalBadge = document.getElementById("badge-approval");
      if (approvalBadge) {
        const user = Auth.getUser();
        let qRes;
        if (user?.role === "HOD") {
          qRes = await API.approval.getQueue("HOD");
        } else {
          qRes = await API.account.getQueue();
        }
        if (qRes?.success) {
          const queue   = qRes.data.queue || [];
          const pending = queue.filter(i =>
            (i.current_stage === "HOD" || i["Current_Stage"] === "HOD" || (i["Approval Status"] || "Pending") === "Pending")
          ).length;

          if (pending > 0) {
            approvalBadge.textContent   = pending > 99 ? "99+" : pending;
            approvalBadge.style.display = "inline-block";
          } else {
            approvalBadge.style.display = "none";
          }
        }
      }
    } catch (e) {
      console.warn("Approval badge load error:", e.message);
    }
  },

  // ─────────────────────────────────────────────
  // SET ACTIVE: Update active nav item
  // ─────────────────────────────────────────────
  setActive(id) {
    document.querySelectorAll(".nav-item, .nav-sub-item").forEach(el => {
      el.classList.remove("active");
    });

    const subEl = document.getElementById(`nav-sub-${id}`);
    if (subEl) {
      subEl.classList.add("active");
      const parentGroup = subEl.closest(".nav-group");
      if (parentGroup) {
        parentGroup.querySelector(".nav-item")?.classList.add("active", "expanded");
        parentGroup.querySelector(".sub-menu")?.classList.add("open");
      }
      return;
    }

    const el = document.getElementById(`nav-${id}`);
    if (el) {
      el.classList.add("active");
      const nextSub = el.nextElementSibling;
      if (nextSub && nextSub.classList.contains("sub-menu")) {
        el.classList.add("expanded");
        nextSub.classList.add("open");
      }
    }
  },

  // ─────────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────────
  async logout() {
    const confirmed = await Utils.confirm(
      "Are you sure you want to logout?",
      "Logout"
    );
    if (confirmed) {
      Loader.show("Logging out...");
      await Auth.logout();
    }
  }

};


// ============================================================
// Header Builder
// ============================================================
const Header = {

  // ─────────────────────────────────────────────
  // RENDER: Build header HTML
  // ─────────────────────────────────────────────
  render(title = "Dashboard") {
    const header = document.getElementById("appHeader");
    if (!header) return;

    const user    = Auth.getUser();
    const initials= Utils.getInitials(user?.name || "?");
    const color   = Utils.getRoleColor(user?.role || "");

    header.innerHTML = `
      <!-- Left: Toggle + Title -->
      <div class="header-left">
        <button class="toggle-btn" id="toggleSidebar" title="Toggle Sidebar">
          <i class="fa fa-bars"></i>
        </button>
        <div>
          <div class="page-title" id="pageTitle">${title}</div>
        </div>
      </div>

      <!-- Right: Actions + User -->
      <div class="header-right">

        <!-- Sync Button -->
        <button class="header-btn" id="syncBtn" title="Sync invoices"
          onclick="Header.syncNow()">
          <i class="fa fa-rotate"></i>
        </button>

        <!-- Notifications -->
        <button class="header-btn" title="Notifications"
          onclick="Header.showNotifications()">
          <i class="fa fa-bell"></i>
          <span class="notif-dot" id="notifDot" style="display:none"></span>
        </button>

        <!-- User Menu -->
        <div class="header-user" onclick="Header.toggleUserMenu()">
          <div class="h-avatar" style="background:${color}">
            ${initials}
          </div>
          <div class="h-name">${user?.name || "User"}</div>
          <i class="fa fa-chevron-down" style="font-size:0.7rem;color:var(--gray-500)"></i>
        </div>

      </div>

      <!-- User Dropdown -->
      <div id="userDropdown" style="
        display   : none;
        position  : absolute;
        top       : 58px;
        right     : 16px;
        background: var(--white);
        border    : 1px solid var(--gray-200);
        border-radius: var(--border-radius);
        box-shadow: var(--shadow-lg);
        min-width : 200px;
        z-index   : 1000;
        overflow  : hidden;
      ">
        <div style="padding:14px 16px;border-bottom:1px solid var(--gray-200)">
          <div style="font-weight:600;font-size:0.875rem">${user?.name}</div>
          <div style="font-size:0.75rem;color:var(--gray-500)">${user?.email || ""}</div>
          <div style="margin-top:6px">${Utils.roleBadge(user?.role || "")}</div>
        </div>
        <div style="padding:6px 0">
          <div class="dropdown-item" onclick="Dashboard.showSection('profile')"
            style="padding:9px 16px;cursor:pointer;font-size:0.85rem;
                   display:flex;align-items:center;gap:10px;color:var(--gray-700)">
            <i class="fa fa-user" style="width:16px"></i> My Profile
          </div>
          <div class="dropdown-item" onclick="Dashboard.showSection('password')"
            style="padding:9px 16px;cursor:pointer;font-size:0.85rem;
                   display:flex;align-items:center;gap:10px;color:var(--gray-700)">
            <i class="fa fa-lock" style="width:16px"></i> Change Password
          </div>
          <div style="border-top:1px solid var(--gray-200);margin:4px 0"></div>
          <div class="dropdown-item" onclick="Sidebar.logout()"
            style="padding:9px 16px;cursor:pointer;font-size:0.85rem;
                   display:flex;align-items:center;gap:10px;color:var(--danger)">
            <i class="fa fa-right-from-bracket" style="width:16px"></i> Logout
          </div>
        </div>
      </div>
    `;

    // Close dropdown on outside click
    document.addEventListener("click", (e) => {
      const dropdown = document.getElementById("userDropdown");
      if (dropdown && !dropdown.contains(e.target) &&
          !e.target.closest(".header-user")) {
        dropdown.style.display = "none";
      }
    });
  },

  // ─────────────────────────────────────────────
  // TOGGLE: User dropdown menu
  // ─────────────────────────────────────────────
  toggleUserMenu() {
    const dropdown = document.getElementById("userDropdown");
    if (!dropdown) return;
    dropdown.style.display =
      dropdown.style.display === "none" ? "block" : "none";
  },

  // ─────────────────────────────────────────────  
  // SET TITLE: Update page title
  // ─────────────────────────────────────────────
  setTitle(title) {
    const el = document.getElementById("pageTitle");
    if (el) el.textContent = title;
    document.title = `${title} — Gretex`;
  },

  // ─────────────────────────────────────────────
  // SYNC: Manually trigger invoice processor
  // ─────────────────────────────────────────────
  async syncNow() {
    const btn = document.getElementById("syncBtn");
    if (!btn) return;

    btn.innerHTML = `<i class="fa fa-spinner fa-spin"></i>`;
    btn.disabled  = true;

    try {
      Toast.info("Syncing invoices...");
      if (typeof Dashboard !== "undefined") {
        await Dashboard.loadCurrentSection();
      }
      Toast.success("Invoices synced successfully!");
    } catch (e) {
      Toast.error("Sync failed: " + e.message);
    } finally {
      btn.innerHTML = `<i class="fa fa-rotate"></i>`;
      btn.disabled  = false;
    }
  },

  // ─────────────────────────────────────────────
  // NOTIFICATIONS
  // ─────────────────────────────────────────────
  showNotifications() {
    Toast.info("No new notifications");
  }

};
// ============================================================================
// SupaApp — api/app.js (Vercel Serverless Function)
// Core Enterprise Backend Engine powered by Supabase PostgreSQL
// Roles: Biller -> HOD -> Account -> Finance -> CFO -> SuperAdmin
// Features: Department Isolation for HOD, Bypass Controls, 100% Parameterized
// ============================================================================

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

// ─────────────────────────────────────────────
// 1. Supabase Singleton Client Initialization
// ─────────────────────────────────────────────
let supabaseInstance = null;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in environment variables.");
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return supabaseInstance;
}

// ─────────────────────────────────────────────
// 2. Helpers: Password Hashing, Tokens & Response
// ─────────────────────────────────────────────
function hashPassword(password) {
  if (!password) return "";
  return crypto.createHash("sha256").update(password.toString()).digest("hex");
}

function generateToken(user) {
  const payload = `${user.email}:${user.role}:${Date.now()}:${crypto.randomBytes(16).toString("hex")}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

const Response = {
  success(res, data = {}, message = "OK") {
    return res.status(200).json({ success: true, message, data });
  },
  error(res, message = "Error", code = 400) {
    return res.status(code).json({ success: false, message, code });
  }
};

// Map incoming UI fields (e.g. "A1. Billed To", "A20. Basic Amount") to PostgreSQL snake_case columns
function mapFieldsToDbPayload(fields = {}) {
  const payload = {};
  if (!fields || typeof fields !== "object") return payload;

  const keyMap = {
    // Section A
    "a1. billed to": "a1_billed_to",
    "a2. our name correct": "a2_our_name_correct",
    "a3. address present": "a3_address_present",
    "a4. our address": "a4_our_address",
    "a5. address correct": "a5_address_correct",
    "a6. pan present": "a6_pan_present",
    "a7. our pan": "a7_our_pan",
    "a8. pan correct": "a8_pan_correct",
    "a9. gst present": "a9_gst_present",
    "a10. our gst": "a10_our_gst",
    "a10. our gst no": "a10_our_gst",
    "a11. gst correct": "a11_gst_correct",
    "a12. invoice date": "a12_invoice_date",
    "a13. invoice number": "a13_invoice_number",
    "a14. vendor name": "a14_vendor_name",
    "a15. vendor address": "a15_vendor_address",
    "a16. bill description": "a16_bill_description",
    "a17. notes": "a17_notes",
    "a18. rev/capital": "a18_rev_capital",
    "a18. rev / capital": "a18_rev_capital",
    "a19. ledger name": "a19_ledger_name",
    "a20. basic amount": "a20_basic_amount",
    "a21. invoice type": "a21_invoice_type",
    "a22. final invoice by": "a22_final_invoice_by",
    "a23. first time vendor": "a23_first_time_vendor",
    "a24. amount justified": "a24_amount_justified",

    // Section B
    "b1. tds applicable": "b1_tds_applicable",
    "b2. vendor pan avail": "b2_vendor_pan_avail",
    "b3. vendor pan": "b3_vendor_pan",
    "b4. pan inoperative": "b4_pan_inoperative",
    "b5. vendor entity type": "b5_vendor_entity_type",
    "b5. entity type": "b5_vendor_entity_type",
    "b6. tds section": "b6_tds_section",
    "b7. tds rate": "b7_tds_rate",
    "b8. tds amount": "b8_tds_amount",

    // Section C
    "c1. gst charged": "c1_gst_charged",
    "c2. vendor gst avail": "c2_vendor_gst_avail",
    "c3. vendor gst no": "c3_vendor_gst_no",
    "c4. taxpayer type": "c4_taxpayer_type",
    "c5. comp gst wrong": "c5_comp_gst_wrong",
    "c6. gst returns filed": "c6_gst_returns_filed",
    "c7. our gst correct": "c7_our_gst_correct",
    "c8. place of supply": "c8_place_of_supply",
    "c9. correct gst type": "c9_correct_gst_type",
    "c10. prior gst pending": "c10_prior_gst_pending",
    "c11. blocked credit": "c11_blocked_credit",

    // Section D
    "d1. final payable amt": "d1_final_payable_amt",
    "d1. final payable": "d1_final_payable_amt",
    "d2. invoice by": "d2_invoice_by",
    "d3. received via": "d3_received_via",
    "d4. hod name": "d4_hod_name",
    "d5. hod approval": "d5_hod_approval",
    "d6. hod screenshot": "d6_hod_screenshot",
    "d7. arvind/alok apprvl": "d7_arvind_alok_apprvl",
    "d8. arvind/alok ss": "d8_arvind_alok_ss",
    "d9. update person": "d9_update_person",
    "d10. update email": "d10_update_email",
    "d11. narration": "d11_narration"
  };

  const numericCols = ["a20_basic_amount", "b8_tds_amount", "d1_final_payable_amt"];

  Object.keys(fields).forEach(rawKey => {
    let val = fields[rawKey];
    const cleanLower = rawKey.trim().toLowerCase();
    
    // Resolve column name
    let col = keyMap[cleanLower];
    if (!col) {
      if (/^[a-d]\d+_[a-z0-9_]+$/.test(cleanLower)) {
        col = cleanLower;
      } else {
        const m = cleanLower.match(/^([a-d]\d+)\.\s*(.*)$/);
        if (m) {
          col = `${m[1]}_${m[2].replace(/[\s\/-]+/g, "_").replace(/[^a-z0-9_]/g, "")}`;
        } else {
          col = cleanLower.replace(/[\s\.-]+/g, "_");
        }
      }
    }

    // Number conversion for numeric columns
    if (numericCols.includes(col)) {
      if (val === "" || val === null || val === undefined) {
        val = 0;
      } else {
        val = Number(String(val).replace(/[^0-9.-]/g, "")) || 0;
      }
    } else if (val === null || val === undefined) {
      val = "";
    }

    payload[col] = val;
  });

  return payload;
}

// Convert a database row from Supabase into complete UI compatible object (all 54 points + snake_case)
function formatInvoiceForUI(b, isNew = false, approvals = []) {
  if (!b) return {};
  let statusLabel = isNew ? "New" : `Sent to ${b.current_stage || "Pending"}`;
  if (!isNew && b.current_stage === "Completed") {
    statusLabel = (b.overall_status === "FAIL" || b.overall_status === "Rejected") ? "Rejected" : "Approved";
  }

  const approvalHistory = (approvals && approvals.length > 0) ? approvals : (b.approval_history || []);
  const billerAction = approvalHistory.find(a => a.stage === "Biller");
  const hodAction = approvalHistory.find(a => a.stage === "HOD");
  const accountAction = approvalHistory.find(a => a.stage === "Account");
  const financeAction = approvalHistory.find(a => a.stage === "Finance");
  const cfoAction = approvalHistory.find(a => a.stage === "CFO");
  const saAction = approvalHistory.find(a => a.stage === "SuperAdmin");

  return {
    ...b,
    queueRowIndex: b.id,
    rowIndex: b.id,
    _sheetRowIndex: b.id,
    _sourceSheet: isNew ? "Invoices" : "Master_Invoices",
    "Approval Status": statusLabel,
    isNew: isNew,
    "Drive URL": b.drive_url || "",
    "Attachment Name": b.attachment_name || "",
    "🚩 Red Flags": b.red_flags || "",
    Timestamp: b.timestamp || b.created_at || new Date().toISOString(),

    "Biller_Send_At": billerAction?.action_taken_at || (isNew ? "" : (b.created_at || b.timestamp)),
    "HOD_Send_At": hodAction?.action_taken_at || "",
    "HOD_Status": hodAction ? (hodAction.action_type.includes("Reject") ? "Rejected" : "Approved") : "",
    "HOD_Remark": hodAction?.remark || "",
    "Account_Send_At": accountAction?.action_taken_at || "",
    "Account_Status": accountAction ? (accountAction.action_type.includes("Reject") ? "Rejected" : "Approved") : "",
    "Account_Remark": accountAction?.remark || "",
    "Finance_Send_At": financeAction?.action_taken_at || "",
    "Finance_Status": financeAction ? (financeAction.action_type.includes("Reject") ? "Rejected" : "Approved") : "",
    "Finance_Remark": financeAction?.remark || "",
    "CFO_Send_At": cfoAction?.action_taken_at || "",
    "CFO_Status": cfoAction ? (cfoAction.action_type.includes("Reject") ? "Rejected" : "Approved") : "",
    "CFO_Remark": cfoAction?.remark || "",
    "SA_Approved_At": saAction?.action_taken_at || b.close_at || "",
    "SA_Status": saAction ? (saAction.action_type.includes("Reject") ? "Rejected" : "Approved") : "",
    "SA_Remark": saAction?.remark || "",
    approval_history: approvalHistory,

    // Section A (Basic & Identification)
    "A1. Billed To": b.a1_billed_to || "N/A",
    "A2. Our Name Correct": b.a2_our_name_correct || "",
    "A3. Address Present": b.a3_address_present || "",
    "A4. Our Address": b.a4_our_address || "",
    "A5. Address Correct": b.a5_address_correct || "",
    "A6. PAN Present": b.a6_pan_present || "",
    "A7. Our PAN": b.a7_our_pan || "",
    "A8. PAN Correct": b.a8_pan_correct || "",
    "A9. GST Present": b.a9_gst_present || "",
    "A10. Our GST": b.a10_our_gst || "",
    "A10. Our GST No": b.a10_our_gst || "",
    "A11. GST Correct": b.a11_gst_correct || "",
    "A12. Invoice Date": b.a12_invoice_date || "N/A",
    "A13. Invoice Number": b.a13_invoice_number || b.invoice_unique_id || "N/A",
    "A14. Vendor Name": b.a14_vendor_name || "N/A",
    "A15. Vendor Address": b.a15_vendor_address || "",
    "A16. Bill Description": b.a16_bill_description || "",
    "A17. Notes": b.a17_notes || "",
    "A18. Rev/Capital": b.a18_rev_capital || "",
    "A18. Rev / Capital": b.a18_rev_capital || "",
    "A19. Ledger Name": b.a19_ledger_name || "",
    "A20. Basic Amount": Number(b.a20_basic_amount) || 0,
    "A21. Invoice Type": b.a21_invoice_type || "",
    "A22. Final Invoice By": b.a22_final_invoice_by || "",
    "A23. First Time Vendor": b.a23_first_time_vendor || "",
    "A24. Amount Justified": b.a24_amount_justified || "",

    // Section B (TDS Compliance)
    "B1. TDS Applicable": b.b1_tds_applicable || "",
    "B2. Vendor PAN Avail": b.b2_vendor_pan_avail || "",
    "B3. Vendor PAN": b.b3_vendor_pan || "",
    "B4. PAN Inoperative": b.b4_pan_inoperative || "",
    "B5. Vendor Entity Type": b.b5_vendor_entity_type || "",
    "B5. Entity Type": b.b5_vendor_entity_type || "",
    "B6. TDS Section": b.b6_tds_section || "",
    "B7. TDS Rate": b.b7_tds_rate || "",
    "B8. TDS Amount": Number(b.b8_tds_amount) || 0,

    // Section C (GST Compliance)
    "C1. GST Charged": b.c1_gst_charged || "",
    "C2. Vendor GST Avail": b.c2_vendor_gst_avail || "",
    "C3. Vendor GST No": b.c3_vendor_gst_no || "",
    "C4. Taxpayer Type": b.c4_taxpayer_type || "",
    "C5. Comp GST Wrong": b.c5_comp_gst_wrong || "",
    "C6. GST Returns Filed": b.c6_gst_returns_filed || "",
    "C7. Our GST Correct": b.c7_our_gst_correct || "",
    "C8. Place of Supply": b.c8_place_of_supply || "",
    "C9. Correct GST Type": b.c9_correct_gst_type || "",
    "C10. Prior GST Pending": b.c10_prior_gst_pending || "",
    "C11. Blocked Credit": b.c11_blocked_credit || "",

    // Section D (Process & Final)
    "D1. Final Payable Amt": Number(b.d1_final_payable_amt) || 0,
    "D1. Final Payable": Number(b.d1_final_payable_amt) || 0,
    "D2. Invoice By": b.d2_invoice_by || "",
    "D3. Received Via": b.d3_received_via || "",
    "D4. HOD Name": b.d4_hod_name || "",
    "D5. HOD Approval": b.d5_hod_approval || "",
    "D6. HOD Screenshot": b.d6_hod_screenshot || "",
    "D7. Arvind/Alok Apprvl": b.d7_arvind_alok_apprvl || "",
    "D8. Arvind/Alok SS": b.d8_arvind_alok_ss || "",
    "D9. Update Person": b.d9_update_person || "",
    "D10. Update Email": b.d10_update_email || "",
    "D11. Narration": b.d11_narration || "",

    Current_Stage: b.current_stage || (isNew ? "New" : ""),
    "Close at": b.close_at || ""
  };
}

// Map role to standard default dashboard page
function getRoleDashboard(role) {
  const clean = (role || "").trim().toLowerCase();
  switch (clean) {
    case "biller": return "biller.html";
    case "hod": return "hod.html";
    case "account": return "account.html";
    case "finance": return "finance.html";
    case "cfo": return "cfo.html";
    case "superadmin": return "superadmin.html";
    case "billing": return "billing.html";
    default: return "index.html";
  }
}

// ─────────────────────────────────────────────
// 3. Auth Token Verification Middleware
// ─────────────────────────────────────────────
async function verifyAuth(supabase, token) {
  if (!token) return { valid: false, message: "Authentication token required" };

  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("*")
    .eq("token", token)
    .single();

  if (sessionErr || !session) {
    return { valid: false, message: "Invalid or expired session. Please log in again." };
  }

  if (new Date() > new Date(session.expires_at)) {
    await supabase.from("sessions").delete().eq("token", token);
    return { valid: false, message: "Session expired. Please log in again." };
  }

  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("id, user_id, name, email, role, department, status")
    .eq("email", session.email)
    .single();

  if (userErr || !user || user.status !== "Active") {
    await supabase.from("sessions").delete().eq("token", token);
    return { valid: false, message: "User account is inactive or not found." };
  }

  return { valid: true, user };
}

// System Audit Logger
async function logAudit(supabase, action, email, details) {
  try {
    await supabase.from("audit_log").insert({
      action,
      user_email: email || "system",
      details: typeof details === "object" ? JSON.stringify(details) : String(details),
      system_user_name: "SupaApp-Backend"
    });
  } catch (err) {
    console.warn("[AuditLog Warning]", err.message);
  }
}

// ─────────────────────────────────────────────
// 4. Main Vercel Serverless Handler
// ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  let body = {};
  if (typeof req.body === "string") {
    try { body = JSON.parse(req.body); } catch (_) { body = {}; }
  } else if (typeof req.body === "object" && req.body !== null) {
    body = req.body;
  }
  const params = { ...req.query, ...body };
  const action = params.action || "";
  const token = params.token || req.headers.authorization?.replace(/^Bearer\s+/i, "") || "";

  let supabase;
  try {
    supabase = getSupabase();
  } catch (initErr) {
    return Response.error(res, initErr.message, 500);
  }

  try {
    // ═══════════════════════════════════════════
    // PUBLIC ACTIONS (No Token Required)
    // ═══════════════════════════════════════════
    if (action === "ping") {
      return Response.success(res, { status: "Active", timestamp: new Date().toISOString() }, "SupaApp API Online");
    }

    if (action === "login") {
      const email = (params.email || "").toString().trim().toLowerCase();
      const password = (params.password || "").toString();

      if (!email || !password) {
        return Response.error(res, "Email and password are required.");
      }

      const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .single();

      if (error || !user) {
        await logAudit(supabase, "LOGIN_FAILED", email, "User not found");
        return Response.error(res, "Invalid email or password.");
      }

      if (user.status !== "Active") {
        await logAudit(supabase, "LOGIN_FAILED", email, `Account status: ${user.status}`);
        return Response.error(res, `Account is ${user.status}. Please contact Admin.`);
      }

      const inputHash = hashPassword(password);
      if (inputHash !== user.password_hash) {
        await logAudit(supabase, "LOGIN_FAILED", email, "Incorrect password");
        return Response.error(res, "Invalid email or password.");
      }

      const sessionToken = generateToken(user);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await supabase.from("sessions").insert({
        token: sessionToken,
        user_id: user.id,
        email: user.email,
        role: user.role,
        department: user.department || "General",
        expires_at: expiresAt
      });

      await supabase.from("users").update({ last_login: new Date().toISOString() }).eq("id", user.id);
      await logAudit(supabase, "LOGIN_SUCCESS", user.email, `Logged in with role: ${user.role} (${user.department})`);

      return Response.success(res, {
        token: sessionToken,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        dashboard: getRoleDashboard(user.role)
      }, "Login successful");
    }

    // ═══════════════════════════════════════════
    // AUTHENTICATED ACTIONS (Token Required)
    // ═══════════════════════════════════════════
    const auth = await verifyAuth(supabase, token);
    if (!auth.valid) {
      return Response.error(res, auth.message, 401);
    }
    const user = auth.user;

    switch (action) {
      // ── Core Auth Actions ──
      case "logout": {
        await supabase.from("sessions").delete().eq("token", token);
        await logAudit(supabase, "LOGOUT", user.email, "Logged out");
        return Response.success(res, {}, "Logged out successfully");
      }

      case "getProfile": {
        return Response.success(res, {
          id: user.id,
          userId: user.user_id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          dashboard: getRoleDashboard(user.role)
        });
      }

      case "changePassword": {
        const { oldPassword, newPassword } = params;
        if (!oldPassword || !newPassword || newPassword.length < 6) {
          return Response.error(res, "New password must be at least 6 characters.");
        }

        const { data: dbUser } = await supabase.from("users").select("password_hash").eq("id", user.id).single();
        if (hashPassword(oldPassword) !== dbUser?.password_hash) {
          return Response.error(res, "Current password is incorrect.");
        }

        await supabase.from("users").update({ password_hash: hashPassword(newPassword) }).eq("id", user.id);
        await logAudit(supabase, "PASSWORD_CHANGED", user.email, "Password changed successfully");
        return Response.success(res, {}, "Password changed successfully");
      }

      case "getUsersByRole": {
        const targetRole = params.role || "";
        let query = supabase.from("users").select("id, name, email, role, department").eq("status", "Active");
        if (targetRole) query = query.eq("role", targetRole);
        const { data: userList } = await query;
        return Response.success(res, { users: userList || [] });
      }

      case "getHODs": {
        const { data: hodList } = await supabase
          .from("users")
          .select("id, name, email, department")
          .eq("role", "HOD")
          .eq("status", "Active");
        return Response.success(res, { hods: hodList || [] });
      }

      // ── Dashboard Statistics ──
      case "getDashboardStats":
      case "getBillerStats": {
        // Raw bills count
        const { count: newCount } = await supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("biller_status", "New");

        // Master pipeline counts
        const { data: masterBills } = await supabase
          .from("master_invoices")
          .select("current_stage, overall_status, a20_basic_amount, department, assigned_hod_email");

        let filteredMaster = masterBills || [];
        // HOD sees only their department/assigned bills
        if (user.role === "HOD") {
          filteredMaster = filteredMaster.filter(b => b.assigned_hod_email === user.email || b.department === user.department);
        }

        let sent = 0, approved = 0, rejected = 0, totalAmount = 0;
        filteredMaster.forEach(b => {
          totalAmount += Number(b.a20_basic_amount) || 0;
          if (b.current_stage !== "Completed") {
            sent++;
          } else {
            if (b.overall_status === "FAIL" || b.overall_status === "Rejected") {
              rejected++;
            } else {
              approved++;
            }
          }
        });

        return Response.success(res, {
          total: (newCount || 0) + filteredMaster.length,
          newBills: newCount || 0,
          pending: sent,
          sent: sent,
          approved: approved,
          rejected: rejected,
          totalAmount: totalAmount
        });
      }

      case "syncBillerQueue": {
        const { count: newCount } = await supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("biller_status", "New");
        return Response.success(res, { count: newCount || 0 });
      }

      // ── Biller Specific Operations ──
      case "getBillerQueue": {
        const { data: newBills } = await supabase
          .from("invoices")
          .select("*")
          .eq("biller_status", "New")
          .order("created_at", { ascending: false });

        const { data: masterBills } = await supabase
          .from("master_invoices")
          .select("*")
          .order("created_at", { ascending: false });

        const masterIds = (masterBills || []).map(b => b.invoice_unique_id).filter(Boolean);
        let approvalsMap = {};
        if (masterIds.length > 0) {
          const { data: allApprovals } = await supabase
            .from("invoice_approvals")
            .select("*")
            .in("invoice_unique_id", masterIds)
            .order("action_taken_at", { ascending: true });
          (allApprovals || []).forEach(a => {
            if (!approvalsMap[a.invoice_unique_id]) approvalsMap[a.invoice_unique_id] = [];
            approvalsMap[a.invoice_unique_id].push(a);
          });
        }

        const formattedNew = (newBills || []).map(b => formatInvoiceForUI(b, true));
        const formattedMaster = (masterBills || []).map(b => formatInvoiceForUI(b, false, approvalsMap[b.invoice_unique_id] || []));
        const combined = [...formattedNew, ...formattedMaster];

        return Response.success(res, {
          queue: combined,
          invoices: formattedNew,
          masterInvoices: formattedMaster,
          total: combined.length
        });
      }

      case "updateBillReview":
      case "updateInvoiceFields": {
        const id = params.queueRowIndex || params.id;
        const fields = params.fields || {};

        if (!id) return Response.error(res, "Invoice ID required");

        // 🛡️ SECURITY RULE: Biller ke alawa aur koi bhi user bill data edit nahi kar sakta!
        if (user.role !== "Biller") {
          return Response.error(res, "Unauthorized: Only Biller can modify invoice fields.", 403);
        }

        // 🛡️ LOCK RULE: Biller ek bar bill aage send kar dega approval ke liye, phir usme koi change nahi ho sakta!
        const { data: rawBill, error: findErr } = await supabase
          .from("invoices")
          .select("id, biller_status")
          .eq("id", id)
          .single();

        if (findErr || !rawBill) {
          return Response.error(res, "Locked: This bill has already been submitted for approval and is permanently locked.", 403);
        }

        if (rawBill.biller_status !== "New") {
          return Response.error(res, `Locked: Bill has already been forwarded (${rawBill.biller_status}) and cannot be modified.`, 403);
        }

        // Convert UI field names (e.g. "A1. Billed To", "A20. Basic Amount") to exact DB snake_case columns
        const updatePayload = mapFieldsToDbPayload(fields);

        if (Object.keys(updatePayload).length === 0) {
          return Response.success(res, {}, "No fields to update");
        }

        // Update ONLY in raw intake 'invoices' table where biller_status is 'New'
        const { error: invErr } = await supabase
          .from("invoices")
          .update(updatePayload)
          .eq("id", id);

        if (invErr) {
          console.error("[Update Raw Invoice Error]", invErr);
          return Response.error(res, `Failed to update invoice: ${invErr.message}`);
        }

        return Response.success(res, { id, updated: updatePayload }, "Invoice updated successfully");
      }

      case "deleteNewBill": {
        const id = params.queueRowIndex || params.id;
        if (!id) return Response.error(res, "Invoice ID required");

        const { data: bill } = await supabase.from("invoices").select("biller_status").eq("id", id).single();
        if (!bill || bill.biller_status !== "New") {
          return Response.error(res, "Only new pending bills can be deleted.");
        }

        await supabase.from("invoices").delete().eq("id", id);
        await logAudit(supabase, "DELETE_BILL", user.email, `Deleted raw invoice ID: ${id}`);
        return Response.success(res, {}, "Invoice deleted successfully");
      }

      case "sendBillForApproval": {
        const id = params.queueRowIndex || params.id;
        const dept = params.department || "General";
        const hodEmail = params.hodEmail || params.targetPerson || "";
        const hodName = params.hodName || hodEmail.split("@")[0] || "";
        const remark = params.remark || params.notes || "Sent for approval";
        const rawFields = params.updatedFields || params.fields || {};
        const updatePayload = mapFieldsToDbPayload(rawFields);

        if (!id) return Response.error(res, "Invoice ID required");

        const { data: rawBill, error: fetchErr } = await supabase
          .from("invoices")
          .select("*")
          .eq("id", id)
          .single();

        if (fetchErr || !rawBill) {
          return Response.error(res, "Invoice not found in raw intake queue.");
        }

        // Merge raw bill with any edited fields
        const billData = { ...rawBill, ...updatePayload };

        // Mark as Sent in raw intake
        await supabase.from("invoices").update({
          ...updatePayload,
          biller_status: "Sent",
          department: dept,
          assigned_hod_email: hodEmail,
          assigned_hod_name: hodName
        }).eq("id", id);

        // Ensure unique ID exists
        const uniqueId = billData.invoice_unique_id || `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

        // Next stage defaults to targetRole or HOD (or Account if HOD not assigned/bypassed)
        const targetRole = params.targetRole || (hodEmail ? "HOD" : "Account");
        const nextStage = ["HOD", "Account", "Finance", "CFO", "SuperAdmin"].includes(targetRole)
          ? targetRole
          : (hodEmail ? "HOD" : "Account");

        // Insert into Master Invoices
        const masterPayload = {
          invoice_unique_id: uniqueId,
          raw_invoice_id: rawBill.id,
          current_stage: nextStage,
          department: dept,
          assigned_hod_email: hodEmail,
          assigned_hod_name: hodName,
          timestamp: billData.timestamp || new Date().toISOString(),
          email_from: billData.email_from,
          email_subject: billData.email_subject,
          attachment_name: billData.attachment_name,
          drive_url: billData.drive_url,
          
          // Section A
          a1_billed_to: billData.a1_billed_to || "N/A",
          a2_our_name_correct: billData.a2_our_name_correct || "",
          a3_address_present: billData.a3_address_present || "",
          a4_our_address: billData.a4_our_address || "",
          a5_address_correct: billData.a5_address_correct || "",
          a6_pan_present: billData.a6_pan_present || "",
          a7_our_pan: billData.a7_our_pan || "",
          a8_pan_correct: billData.a8_pan_correct || "",
          a9_gst_present: billData.a9_gst_present || "",
          a10_our_gst: billData.a10_our_gst || "",
          a11_gst_correct: billData.a11_gst_correct || "",
          a12_invoice_date: billData.a12_invoice_date || "N/A",
          a13_invoice_number: billData.a13_invoice_number || uniqueId,
          a14_vendor_name: billData.a14_vendor_name || "N/A",
          a15_vendor_address: billData.a15_vendor_address || "",
          a16_bill_description: billData.a16_bill_description || "",
          a17_notes: billData.a17_notes || "",
          a18_rev_capital: billData.a18_rev_capital || "",
          a19_ledger_name: billData.a19_ledger_name || "",
          a20_basic_amount: Number(billData.a20_basic_amount) || 0,
          a21_invoice_type: billData.a21_invoice_type || "",
          a22_final_invoice_by: billData.a22_final_invoice_by || "",
          a23_first_time_vendor: billData.a23_first_time_vendor || "",
          a24_amount_justified: billData.a24_amount_justified || "",
          
          // Section B
          b1_tds_applicable: billData.b1_tds_applicable || "",
          b2_vendor_pan_avail: billData.b2_vendor_pan_avail || "",
          b3_vendor_pan: billData.b3_vendor_pan || "",
          b4_pan_inoperative: billData.b4_pan_inoperative || "",
          b5_vendor_entity_type: billData.b5_vendor_entity_type || "",
          b6_tds_section: billData.b6_tds_section || "",
          b7_tds_rate: billData.b7_tds_rate || "",
          b8_tds_amount: Number(billData.b8_tds_amount) || 0,

          // Section C
          c1_gst_charged: billData.c1_gst_charged || "",
          c2_vendor_gst_avail: billData.c2_vendor_gst_avail || "",
          c3_vendor_gst_no: billData.c3_vendor_gst_no || "",
          c4_taxpayer_type: billData.c4_taxpayer_type || "",
          c5_comp_gst_wrong: billData.c5_comp_gst_wrong || "",
          c6_gst_returns_filed: billData.c6_gst_returns_filed || "",
          c7_our_gst_correct: billData.c7_our_gst_correct || "",
          c8_place_of_supply: billData.c8_place_of_supply || "",
          c9_correct_gst_type: billData.c9_correct_gst_type || "",
          c10_prior_gst_pending: billData.c10_prior_gst_pending || "",
          c11_blocked_credit: billData.c11_blocked_credit || "",

          // Section D
          d1_final_payable_amt: Number(billData.d1_final_payable_amt) || Number(billData.a20_basic_amount) || 0,
          d2_invoice_by: billData.d2_invoice_by || "",
          d3_received_via: billData.d3_received_via || "Web Upload",
          d4_hod_name: hodName || billData.d4_hod_name || "",
          d5_hod_approval: billData.d5_hod_approval || "",
          d6_hod_screenshot: billData.d6_hod_screenshot || "",
          d7_arvind_alok_apprvl: billData.d7_arvind_alok_apprvl || "",
          d8_arvind_alok_ss: billData.d8_arvind_alok_ss || "",
          d9_update_person: user.name,
          d10_update_email: user.email,
          d11_narration: remark,
          red_flags: billData.red_flags || "",
          overall_status: billData.overall_status || "REVIEW"
        };

        const { error: insertErr } = await supabase.from("master_invoices").upsert(masterPayload, { onConflict: "invoice_unique_id" });
        if (insertErr) {
          return Response.error(res, `Failed to copy to Master: ${insertErr.message}`);
        }

        // Insert Biller submission into invoice_approvals audit
        await supabase.from("invoice_approvals").insert({
          invoice_unique_id: uniqueId,
          cycle_no: 1,
          stage: "Biller",
          approver_name: user.name,
          approver_email: user.email,
          approver_role: "Biller",
          action_type: "Submitted",
          next_stage: nextStage,
          target_assignee: hodEmail || `${nextStage} Team`,
          received_at: new Date().toISOString(),
          action_taken_at: new Date().toISOString(),
          remark: remark
        });

        await logAudit(supabase, "SUBMIT_FOR_APPROVAL", user.email, `Submitted ${uniqueId} to ${nextStage} (${dept})`);
        return Response.success(res, { invoiceUniqueId: uniqueId }, "Invoice submitted for approval successfully");
      }

      // ── Approval Queue (HOD, Account, Finance, CFO, SuperAdmin) ──
      case "getApprovalQueue":
      case "getInvoices": {
        let query = supabase.from("master_invoices").select("*");

        // Role-based Queue Filters:
        if (user.role === "HOD") {
          // 🛡️ CRITICAL: HOD ONLY sees bills assigned to them or their department
          if (params.stage && params.stage !== "All") {
            query = query.eq("current_stage", params.stage);
          }
          if (user.department && user.department !== "All") {
            query = query.or(`assigned_hod_email.eq.${user.email},department.eq.${user.department}`);
          } else {
            query = query.eq("assigned_hod_email", user.email);
          }
        } else if (user.role === "Account") {
          // Account sees all bills at Account stage
          query = query.eq("current_stage", "Account");
        } else if (user.role === "Finance") {
          // Finance sees all bills at Finance stage
          query = query.eq("current_stage", "Finance");
        } else if (user.role === "CFO") {
          // CFO sees all bills at CFO stage
          query = query.eq("current_stage", "CFO");
        } else if (user.role === "SuperAdmin") {
          // SuperAdmin can filter by requested stage or see active
          if (params.stage && params.stage !== "All") {
            query = query.eq("current_stage", params.stage);
          }
        }

        const { data: queue, error } = await query.order("created_at", { ascending: false });
        if (error) return Response.error(res, error.message);

        const queueIds = (queue || []).map(b => b.invoice_unique_id).filter(Boolean);
        let approvalsMap = {};
        if (queueIds.length > 0) {
          const { data: allApprovals } = await supabase
            .from("invoice_approvals")
            .select("*")
            .in("invoice_unique_id", queueIds)
            .order("action_taken_at", { ascending: true });
          (allApprovals || []).forEach(a => {
            if (!approvalsMap[a.invoice_unique_id]) approvalsMap[a.invoice_unique_id] = [];
            approvalsMap[a.invoice_unique_id].push(a);
          });
        }

        // Format all 54 fields for frontend tables and review modals
        const formatted = (queue || []).map(b => formatInvoiceForUI(b, false, approvalsMap[b.invoice_unique_id] || []));

        return Response.success(res, { queue: formatted, total: formatted.length });
      }

      // ── Approval Decision (Approve / Reject / Bypass) ──
      case "approveBill": {
        const id = params.queueRowIndex || params.id;
        const remark = params.note || params.remark || "Approved";
        const isBypass = params.bypass === true || params.bypassAccount === "true" || params.bypassAccount === true;
        const targetAssignee = params.targetAssignee || params.adminEmail || "";

        if (!id) return Response.error(res, "Invoice ID required");

        const { data: bill, error: findErr } = await supabase
          .from("master_invoices")
          .select("*")
          .eq("id", id)
          .single();

        if (findErr || !bill) return Response.error(res, "Invoice not found");

        // Determine Next Stage in Pipeline:
        // HOD -> Account -> Finance -> CFO -> SuperAdmin -> Completed
        let nextStage = "Completed";
        let actionType = isBypass ? "Approved (Bypass)" : "Approved";

        if (isBypass && params.targetStage) {
          nextStage = params.targetStage;
        } else {
          switch (bill.current_stage) {
            case "HOD": nextStage = "Account"; break;
            case "Account": nextStage = "Finance"; break;
            case "Finance": nextStage = "CFO"; break;
            case "CFO": nextStage = "SuperAdmin"; break;
            case "SuperAdmin": nextStage = "Completed"; break;
            default: nextStage = "Completed";
          }
        }

        const updatePayload = {
          current_stage: nextStage,
          d11_narration: `${bill.d11_narration || ""} | ${user.role} Approved: ${remark}`.trim()
        };

        if (nextStage === "Completed") {
          updatePayload.send_for_billing_at = new Date().toISOString();
          updatePayload.close_at = new Date().toISOString();
        }

        await supabase.from("master_invoices").update(updatePayload).eq("id", id);

        // Record in normalized invoice_approvals audit table
        await supabase.from("invoice_approvals").insert({
          invoice_unique_id: bill.invoice_unique_id,
          cycle_no: 1,
          stage: user.role,
          approver_name: user.name,
          approver_email: user.email,
          approver_role: user.role,
          action_type: actionType,
          next_stage: nextStage,
          target_assignee: targetAssignee || `${nextStage} Team`,
          received_at: bill.updated_at || new Date().toISOString(),
          action_taken_at: new Date().toISOString(),
          remark: remark
        });

        await logAudit(supabase, `${user.role.toUpperCase()}_APPROVE`, user.email, `Approved ${bill.invoice_unique_id} -> ${nextStage}`);
        return Response.success(res, { nextStage }, `Bill approved and forwarded to ${nextStage}`);
      }

      case "rejectBill": {
        const id = params.queueRowIndex || params.id;
        const remark = params.note || params.remark || "Rejected";

        if (!id) return Response.error(res, "Invoice ID required");

        const { data: bill } = await supabase.from("master_invoices").select("*").eq("id", id).single();
        if (!bill) return Response.error(res, "Invoice not found");

        await supabase.from("master_invoices").update({
          current_stage: "Completed",
          overall_status: "FAIL",
          d11_narration: `${bill.d11_narration || ""} | ${user.role} Rejected: ${remark}`.trim(),
          close_at: new Date().toISOString()
        }).eq("id", id);

        await supabase.from("invoice_approvals").insert({
          invoice_unique_id: bill.invoice_unique_id,
          cycle_no: 1,
          stage: user.role,
          approver_name: user.name,
          approver_email: user.email,
          approver_role: user.role,
          action_type: "Rejected",
          next_stage: "Completed",
          received_at: bill.updated_at || new Date().toISOString(),
          action_taken_at: new Date().toISOString(),
          remark: remark
        });

        await logAudit(supabase, `${user.role.toUpperCase()}_REJECT`, user.email, `Rejected ${bill.invoice_unique_id}`);
        return Response.success(res, {}, "Bill marked as rejected.");
      }

      // ── Timeline & Audit History ──
      case "getBillStatusHistory": {
        const uniqueId = params.invoice_unique_id || params.invoiceNumber;
        if (!uniqueId) return Response.error(res, "Invoice Unique ID required");

        const { data: timeline } = await supabase
          .from("invoice_approvals")
          .select("*")
          .eq("invoice_unique_id", uniqueId)
          .order("action_taken_at", { ascending: true });

        return Response.success(res, { timeline: timeline || [] });
      }

      case "getAuditLog": {
        if (!["SuperAdmin", "Admin"].includes(user.role)) {
          return Response.error(res, "Unauthorized to view audit logs", 403);
        }
        const { data: logs } = await supabase
          .from("audit_log")
          .select("*")
          .order("timestamp", { ascending: false })
          .limit(params.limit ? parseInt(params.limit) : 200);

        return Response.success(res, { logs: logs || [] });
      }

      case "getRedFlagInvoices": {
        let query = supabase.from("master_invoices").select("*").neq("red_flags", "").not("red_flags", "is", null);
        if (user.role === "HOD") {
          query = query.or(`assigned_hod_email.eq.${user.email},department.eq.${user.department}`);
        }
        const { data: flags } = await query;
        return Response.success(res, { redFlags: flags || [] });
      }

      // ── User Management (SuperAdmin / Admin) ──
      case "getUsers": {
        if (!["SuperAdmin", "Admin"].includes(user.role)) {
          return Response.error(res, "Unauthorized", 403);
        }
        const { data: userList } = await supabase
          .from("users")
          .select("id, user_id, name, email, role, department, status, created_at, last_login")
          .order("created_at", { ascending: false });

        return Response.success(res, { users: userList || [] });
      }

      case "createUser": {
        if (!["SuperAdmin", "Admin"].includes(user.role)) {
          return Response.error(res, "Unauthorized", 403);
        }
        const { name, email, password, role, department } = params;
        if (!name || !email || !password || !role) {
          return Response.error(res, "Name, email, password, and role are required");
        }

        const newUser = {
          user_id: `USR${Date.now()}`,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password_hash: hashPassword(password),
          role: role.trim(),
          department: department ? department.trim() : "General",
          status: "Active",
          created_by: user.email
        };

        const { error } = await supabase.from("users").insert(newUser);
        if (error) return Response.error(res, `Failed to create user: ${error.message}`);

        await logAudit(supabase, "CREATE_USER", user.email, `Created user: ${newUser.email} (${newUser.role})`);
        return Response.success(res, {}, "User created successfully");
      }

      case "deleteUser": {
        if (user.role !== "SuperAdmin") return Response.error(res, "Unauthorized", 403);
        const { email } = params;
        if (email === user.email) return Response.error(res, "Cannot delete your own account");

        await supabase.from("users").delete().eq("email", email);
        await logAudit(supabase, "DELETE_USER", user.email, `Deleted user: ${email}`);
        return Response.success(res, {}, "User deleted");
      }

      case "toggleUserStatus": {
        if (!["SuperAdmin", "Admin"].includes(user.role)) return Response.error(res, "Unauthorized", 403);
        const { email, status } = params;
        const newStatus = status === "Active" ? "Inactive" : "Active";
        await supabase.from("users").update({ status: newStatus }).eq("email", email);
        return Response.success(res, { status: newStatus }, `User status updated to ${newStatus}`);
      }

      default:
        return Response.error(res, `Action '${action}' not supported`, 404);
    }
  } catch (error) {
    console.error("[SupaApp Error]", error);
    return Response.error(res, `Internal Server Error: ${error.message}`, 500);
  }
};

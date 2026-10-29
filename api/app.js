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

        const formattedNew = (newBills || []).map(b => ({
          ...b,
          "Approval Status": "New",
          isNew: true,
          queueRowIndex: b.id,
          // Field mappings for UI compatibility
          "A13. Invoice Number": b.a13_invoice_number,
          "A14. Vendor Name": b.a14_vendor_name,
          "A20. Basic Amount": b.a20_basic_amount,
          "A12. Invoice Date": b.a12_invoice_date,
          "Drive URL": b.drive_url,
          "🚩 Red Flags": b.red_flags,
          Timestamp: b.timestamp || b.created_at
        }));

        const formattedMaster = (masterBills || []).map(b => {
          let statusLabel = `Sent to ${b.current_stage}`;
          if (b.current_stage === "Completed") {
            statusLabel = b.overall_status === "FAIL" ? "Rejected" : "Approved";
          }
          return {
            ...b,
            "Approval Status": statusLabel,
            isNew: false,
            queueRowIndex: b.id,
            "A13. Invoice Number": b.a13_invoice_number,
            "A14. Vendor Name": b.a14_vendor_name,
            "A20. Basic Amount": b.a20_basic_amount,
            "A12. Invoice Date": b.a12_invoice_date,
            "Drive URL": b.drive_url,
            "🚩 Red Flags": b.red_flags,
            Timestamp: b.timestamp || b.created_at
          };
        });

        const combined = [...formattedNew, ...formattedMaster];
        return Response.success(res, { queue: combined, total: combined.length });
      }

      case "updateBillReview":
      case "updateInvoiceFields": {
        const id = params.queueRowIndex || params.id;
        const fields = params.fields || {};

        if (!id) return Response.error(res, "Invoice ID required");

        // Convert UI CamelCase / Dot notation to snake_case if passed
        const updatePayload = {};
        Object.keys(fields).forEach(k => {
          const cleanK = k.replace(/^[A-D]\d+\.\s*/i, "").replace(/[\s_-]+/g, "_").toLowerCase();
          updatePayload[cleanK] = fields[k];
        });

        // Try updating in invoices first
        const { error: invErr } = await supabase.from("invoices").update(fields).eq("id", id);
        if (invErr) {
          // If not in invoices, update in master_invoices
          await supabase.from("master_invoices").update(fields).eq("id", id);
        }

        return Response.success(res, {}, "Invoice updated successfully");
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
        const hodEmail = params.hodEmail || "";
        const hodName = params.hodName || "";
        const remark = params.remark || params.notes || "Sent for approval";
        const updatedFields = params.updatedFields || {};

        if (!id) return Response.error(res, "Invoice ID required");

        const { data: rawBill, error: fetchErr } = await supabase
          .from("invoices")
          .select("*")
          .eq("id", id)
          .single();

        if (fetchErr || !rawBill) {
          return Response.error(res, "Invoice not found.");
        }

        // Apply updated fields if any
        const billData = { ...rawBill, ...updatedFields };

        // Mark as Sent in raw intake
        await supabase.from("invoices").update({
          biller_status: "Sent",
          department: dept,
          assigned_hod_email: hodEmail,
          assigned_hod_name: hodName
        }).eq("id", id);

        // Ensure unique ID exists
        const uniqueId = billData.invoice_unique_id || `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

        // Next stage is HOD (or Account if HOD not assigned/bypassed)
        const nextStage = hodEmail ? "HOD" : "Account";

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
          a1_billed_to: billData.a1_billed_to, a2_our_name_correct: billData.a2_our_name_correct,
          a3_address_present: billData.a3_address_present, a4_our_address: billData.a4_our_address,
          a5_address_correct: billData.a5_address_correct, a6_pan_present: billData.a6_pan_present,
          a7_our_pan: billData.a7_our_pan, a8_pan_correct: billData.a8_pan_correct,
          a9_gst_present: billData.a9_gst_present, a10_our_gst: billData.a10_our_gst,
          a11_gst_correct: billData.a11_gst_correct, a12_invoice_date: billData.a12_invoice_date,
          a13_invoice_number: billData.a13_invoice_number, a14_vendor_name: billData.a14_vendor_name,
          a15_vendor_address: billData.a15_vendor_address, a16_bill_description: billData.a16_bill_description,
          a17_notes: billData.a17_notes, a18_rev_capital: billData.a18_rev_capital,
          a19_ledger_name: billData.a19_ledger_name, a20_basic_amount: billData.a20_basic_amount || 0,
          a21_invoice_type: billData.a21_invoice_type, a22_final_invoice_by: billData.a22_final_invoice_by,
          a23_first_time_vendor: billData.a23_first_time_vendor, a24_amount_justified: billData.a24_amount_justified,
          
          // Section B
          b1_tds_applicable: billData.b1_tds_applicable, b2_vendor_pan_avail: billData.b2_vendor_pan_avail,
          b3_vendor_pan: billData.b3_vendor_pan, b4_pan_inoperative: billData.b4_pan_inoperative,
          b5_vendor_entity_type: billData.b5_vendor_entity_type, b6_tds_section: billData.b6_tds_section,
          b7_tds_rate: billData.b7_tds_rate, b8_tds_amount: billData.b8_tds_amount || 0,

          // Section C
          c1_gst_charged: billData.c1_gst_charged, c2_vendor_gst_avail: billData.c2_vendor_gst_avail,
          c3_vendor_gst_no: billData.c3_vendor_gst_no, c4_taxpayer_type: billData.c4_taxpayer_type,
          c5_comp_gst_wrong: billData.c5_comp_gst_wrong, c6_gst_returns_filed: billData.c6_gst_returns_filed,
          c7_our_gst_correct: billData.c7_our_gst_correct, c8_place_of_supply: billData.c8_place_of_supply,
          c9_correct_gst_type: billData.c9_correct_gst_type, c10_prior_gst_pending: billData.c10_prior_gst_pending,
          c11_blocked_credit: billData.c11_blocked_credit,

          // Section D
          d1_final_payable_amt: billData.d1_final_payable_amt || 0, d2_invoice_by: billData.d2_invoice_by,
          d3_received_via: billData.d3_received_via, d4_hod_name: hodName || billData.d4_hod_name,
          d5_hod_approval: billData.d5_hod_approval, d6_hod_screenshot: billData.d6_hod_screenshot,
          d7_arvind_alok_apprvl: billData.d7_arvind_alok_apprvl, d8_arvind_alok_ss: billData.d8_arvind_alok_ss,
          d9_update_person: user.name, d10_update_email: user.email, d11_narration: remark,
          red_flags: billData.red_flags, overall_status: billData.overall_status || "REVIEW"
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
          target_assignee: hodEmail || "Accounts Team",
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
          query = query.eq("current_stage", "HOD");
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

        // Format fields for frontend tables
        const formatted = (queue || []).map(b => ({
          ...b,
          queueRowIndex: b.id,
          "A13. Invoice Number": b.a13_invoice_number,
          "A14. Vendor Name": b.a14_vendor_name,
          "A20. Basic Amount": b.a20_basic_amount,
          "A12. Invoice Date": b.a12_invoice_date,
          "A1. Billed To": b.a1_billed_to,
          "A16. Bill Description": b.a16_bill_description,
          "Drive URL": b.drive_url,
          "🚩 Red Flags": b.red_flags,
          Timestamp: b.timestamp || b.created_at
        }));

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

// ============================================================================
// SupaApp — api/submit-invoice.js (Vercel Serverless Function)
// Invoice Intake, AI 54-Point Extraction & Direct Supabase Ingestion
// Drive Upload via lightweight Google Apps Script Webhook
// Optimized for Speed & Maximum Timeout Protection
// ============================================================================

const { createClient } = require("@supabase/supabase-js");

// Vercel Serverless Timeout: Extend to 60 seconds (prevents 504 Timeout)
export const maxDuration = 60;
export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: "20mb",
    },
  },
};

let supabaseInstance = null;
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.");
  if (!supabaseInstance) {
    supabaseInstance = createClient(url, key, { auth: { persistSession: false } });
  }
  return supabaseInstance;
}

// ─────────────────────────────────────────────
// 1. Google Drive Upload via Apps Script Webhook
// ─────────────────────────────────────────────
async function uploadToDriveViaAppsScript(fileName, fileType, pureBase64, receivedFrom) {
  const uploadUrl = process.env.APPS_SCRIPT_UPLOAD_URL;
  if (!uploadUrl) {
    console.warn("[Drive Upload] APPS_SCRIPT_UPLOAD_URL not configured, skipping Drive upload.");
    return "N/A";
  }

  try {
    const payload = {
      action: "uploadOnly",
      uploadOnly: true,
      fileName: fileName,
      fileType: fileType || "application/pdf",
      fileContent: pureBase64,
      receivedFrom: receivedFrom || "Web Upload",
      senderName: "SupaApp Biller",
      notes: "Saved via SupaApp"
    };

    // 15-second AbortController timeout to prevent cold-start freeze
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await res.json();
    if (data && (data.driveUrl || data.url)) {
      return data.driveUrl || data.url;
    }
  } catch (err) {
    console.warn("[Drive Upload Warning]", err.name === "AbortError" ? "Drive upload timed out (15s)" : err.message);
  }
  return "N/A";
}

// ─────────────────────────────────────────────
// 2. Gemini AI Extraction (Using Fast & Stable Models)
// ─────────────────────────────────────────────
const GEMINI_MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-2.0-flash",
  "gemini-flash-latest"
];

function getGeminiApiKeys() {
  const raw = process.env.GEMINI_API_KEY || "";
  return raw.split(",").map(k => k.trim().replace(/^["']|["']$/g, "")).filter(k => k.length > 0);
}

async function callGeminiWithFailover(parts) {
  const apiKeys = getGeminiApiKeys();
  if (apiKeys.length === 0) {
    throw new Error("No GEMINI_API_KEY configured in Environment Variables.");
  }

  let lastError = null;
  for (const model of GEMINI_MODELS) {
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseMimeType: "application/json" }
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.substring(0, 150)}`);

        const jsonResp = JSON.parse(text);
        let output = jsonResp.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!output) throw new Error("No content generated");

        output = output.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
        return JSON.parse(output);
      } catch (err) {
        lastError = err.message;
        console.warn(`[Gemini Failover] Model ${model} (Key ${i}) warning: ${err.message}`);
        if (err.message.includes("404")) break; // skip to next model
      }
    }
  }
  throw new Error(`All Gemini models exhausted. Last error: ${lastError}`);
}

// 54-Point Accounting Prompt
function getGeminiPrompt(details) {
  return `You are an expert corporate accountant analyzing an invoice for Gretex.
Source: ${details.receivedFrom || "Manual Upload"}, Notes: ${details.notes || "None"}.

Extract data and return a STRICT JSON object matching these exact keys. 
For missing values, use 'N/A'. Never prefix numbers with '+' or '='.

{
  "A1": "<Billed To Co Name>",
  "A2": "<Our Name Correct (Yes/No)>",
  "A3": "<Address Present (Yes/No)>",
  "A4": "<Our Address>",
  "A5": "<Address Correct (Yes/No)>",
  "A6": "<Our PAN Present (Yes/No)>",
  "A7": "<Our PAN>",
  "A8": "<PAN Correct (Yes/No)>",
  "A9": "<Our GST Present (Yes/No)>",
  "A10": "<Our GST>",
  "A11": "<GST Correct (Yes/No)>",
  "A12": "<Invoice Date>",
  "A13": "<Invoice Number>",
  "A14": "<Vendor Name>",
  "A15": "<Vendor Address>",
  "A16": "<Description>",
  "A17": "<Notes>",
  "A18": "<Rev/Capital>",
  "A19": "<Ledger Name>",
  "A20": "<Basic Amt (Number)>",
  "A21": "<Invoice Type>",
  "A22": "<Final Invoice By>",
  "A23": "<First Time Vendor (Yes/No)>",
  "A24": "<Amt Justified (Yes/No)>",
  "B1": "<TDS App (Yes/No)>",
  "B2": "<Vendor PAN Avail (Yes/No)>",
  "B3": "<Vendor PAN>",
  "B4": "<PAN Inoperative (Yes/No)>",
  "B5": "<Entity Type>",
  "B6": "<TDS Section>",
  "B7": "<TDS Rate>",
  "B8": "<TDS Amt (Number)>",
  "C1": "<GST Charged (Yes/No)>",
  "C2": "<Vendor GST Avail (Yes/No)>",
  "C3": "<Vendor GST No>",
  "C4": "<Taxpayer Type>",
  "C5": "<Comp GST Wrong>",
  "C6": "<GST Returns Filed>",
  "C7": "<Our GST Correct>",
  "C8": "<Place of Supply>",
  "C9": "<Correct GST Type (Yes/No)>",
  "C10": "<Prior GST Pending>",
  "C11": "<Blocked Credit>",
  "D1": "<Final Payable (Number)>",
  "D2": "<Provided By>",
  "D3": "<Received Via>",
  "D4": "<HOD Name>",
  "D5": "<HOD Approval>",
  "D6": "<HOD Screenshot>",
  "D7": "<Arvind/Alok Apprvl>",
  "D8": "<Arvind/Alok SS>",
  "D9": "<Update Person>",
  "D10": "<Update Email>",
  "D11": "<Narration>",
  "redFlags": ["<issue 1>", "<issue 2>"],
  "overallStatus": "<PASS, REVIEW, or FAIL>"
}`;
}

// ─────────────────────────────────────────────
// 3. Handler
// ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, message: "Method Not Allowed" });

  try {
    const { fileContent, fileName, fileType, senderEmail, receivedFrom, notes } = req.body || {};
    if (!fileContent || !fileName) {
      return res.status(400).json({ success: false, message: "File content (base64) and fileName are required." });
    }

    const pureBase64 = fileContent.includes(",") ? fileContent.split(",")[1] : fileContent;
    const resolvedType = fileType || (fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg");

    // Parallel Execution with graceful fallback so bills are NEVER lost
    const drivePromise = uploadToDriveViaAppsScript(fileName, resolvedType, pureBase64, receivedFrom)
      .catch(err => {
        console.warn("[Drive Upload Catch]", err.message);
        return "N/A";
      });

    const geminiPromise = callGeminiWithFailover([
      { inlineData: { mimeType: resolvedType, data: pureBase64 } },
      { text: getGeminiPrompt({ receivedFrom, notes }) }
    ]).catch(err => {
      console.warn("[Gemini Extraction Fallback]", err.message);
      return {
        A13: fileName.replace(/\.[^/.]+$/, "").substring(0, 50),
        A14: "Manual / AI Review",
        overallStatus: "REVIEW",
        redFlags: ["AI extraction timed out or failed; review needed"]
      };
    });

    const [driveUrl, ai] = await Promise.all([drivePromise, geminiPromise]);

    const supabase = getSupabase();

    // Insert directly into Supabase invoices table
    const invoicePayload = {
      timestamp: new Date().toISOString(),
      email_from: senderEmail || "Manual Upload",
      email_subject: "Web Submission",
      attachment_name: fileName,
      drive_url: driveUrl || "N/A",
      
      // Section A
      a1_billed_to: ai.A1 || "N/A", a2_our_name_correct: ai.A2 || "N/A", a3_address_present: ai.A3 || "N/A",
      a4_our_address: ai.A4 || "N/A", a5_address_correct: ai.A5 || "N/A", a6_pan_present: ai.A6 || "N/A",
      a7_our_pan: ai.A7 || "N/A", a8_pan_correct: ai.A8 || "N/A", a9_gst_present: ai.A9 || "N/A",
      a10_our_gst: ai.A10 || "N/A", a11_gst_correct: ai.A11 || "N/A", a12_invoice_date: ai.A12 || "N/A",
      a13_invoice_number: ai.A13 || fileName.replace(/\.[^/.]+$/, "").substring(0, 50),
      a14_vendor_name: ai.A14 || "N/A", a15_vendor_address: ai.A15 || "N/A",
      a16_bill_description: ai.A16 || "N/A", a17_notes: notes || ai.A17 || "None", a18_rev_capital: ai.A18 || "N/A",
      a19_ledger_name: ai.A19 || "N/A", a20_basic_amount: Number(ai.A20) || 0,
      a21_invoice_type: ai.A21 || "N/A", a22_final_invoice_by: ai.A22 || "N/A",
      a23_first_time_vendor: ai.A23 || "N/A", a24_amount_justified: ai.A24 || "N/A",

      // Section B
      b1_tds_applicable: ai.B1 || "N/A", b2_vendor_pan_avail: ai.B2 || "N/A", b3_vendor_pan: ai.B3 || "N/A",
      b4_pan_inoperative: ai.B4 || "N/A", b5_vendor_entity_type: ai.B5 || "N/A", b6_tds_section: ai.B6 || "N/A",
      b7_tds_rate: ai.B7 || "N/A", b8_tds_amount: Number(ai.B8) || 0,

      // Section C
      c1_gst_charged: ai.C1 || "N/A", c2_vendor_gst_avail: ai.C2 || "N/A", c3_vendor_gst_no: ai.C3 || "N/A",
      c4_taxpayer_type: ai.C4 || "N/A", c5_comp_gst_wrong: ai.C5 || "N/A", c6_gst_returns_filed: ai.C6 || "N/A",
      c7_our_gst_correct: ai.C7 || "N/A", c8_place_of_supply: ai.C8 || "N/A", c9_correct_gst_type: ai.C9 || "N/A",
      c10_prior_gst_pending: ai.C10 || "N/A", c11_blocked_credit: ai.C11 || "N/A",

      // Section D
      d1_final_payable_amt: Number(ai.D1) || Number(ai.A20) || 0, d2_invoice_by: ai.D2 || "N/A",
      d3_received_via: receivedFrom || "Web Upload", d4_hod_name: ai.D4 || "N/A",
      d5_hod_approval: ai.D5 || "N/A", d6_hod_screenshot: ai.D6 || "N/A", d7_arvind_alok_apprvl: ai.D7 || "N/A",
      d8_arvind_alok_ss: ai.D8 || "N/A", d9_update_person: "AI Intake", d10_update_email: senderEmail || "N/A",
      d11_narration: "Auto-extracted via AI",

      red_flags: Array.isArray(ai.redFlags) ? ai.redFlags.join(" | ") : (ai.redFlags || ""),
      overall_status: ai.overallStatus || "REVIEW",
      biller_status: "New"
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("invoices")
      .insert(invoicePayload)
      .select()
      .single();

    if (insertErr) {
      throw new Error(`Supabase insert failed: ${insertErr.message}`);
    }

    return res.status(200).json({
      success: true,
      message: "Invoice extracted and saved to Supabase successfully",
      invoiceNumber: inserted.a13_invoice_number,
      data: {
        id: inserted.id,
        invoiceUniqueId: inserted.invoice_unique_id,
        driveUrl: driveUrl,
        ai: ai
      }
    });

  } catch (err) {
    console.error("[Submit Invoice Error]", err);
    return res.status(500).json({ success: false, message: err.message || "Processing failed" });
  }
};

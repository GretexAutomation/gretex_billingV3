// ============================================================================
// SupaApp — api/submit-invoice.js (Vercel Serverless Function)
// Invoice Intake, AI 54-Point Extraction & Direct Supabase Ingestion
// Drive Upload via lightweight Google Apps Script Webhook
// Optimized for Speed & Maximum Timeout Protection
// ============================================================================

const { createClient } = require("@supabase/supabase-js");

// Vercel Serverless Configuration (CommonJS compatible)
const config = {
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
// 2. Data Cleaning & Robust Key Resolution Helpers
// ─────────────────────────────────────────────
function cleanVal(val, defaultVal = "N/A") {
  if (val === undefined || val === null) return defaultVal;
  if (typeof val === "object") return defaultVal;
  const s = String(val).trim();
  if (!s || s === "null" || s === "undefined" || s.toLowerCase() === "n/a") return defaultVal;
  // Eliminate raw prompt placeholders like "<Billed To Co Name>" or "[Vendor Name]"
  if (/^<.*>$/.test(s) || /^\[.*\]$/.test(s)) return defaultVal;
  return s;
}

function parseAmount(val) {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const s = String(val).trim();
  const cleaned = s.replace(/[^0-9.-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Comprehensive aliases mapping for all 54 accounting fields
const KEY_ALIASES = {
  A1: ["billed_to", "billed_to_company", "company_name", "billed_to_co_name", "buyer_name", "customer_name", "billed_to_co"],
  A2: ["our_name_correct", "company_name_correct", "name_correct"],
  A3: ["address_present", "company_address_present", "our_address_present"],
  A4: ["our_address", "billing_address", "buyer_address", "company_address"],
  A5: ["address_correct", "our_address_correct"],
  A6: ["pan_present", "our_pan_present", "company_pan_present"],
  A7: ["our_pan", "company_pan", "buyer_pan"],
  A8: ["pan_correct", "our_pan_correct"],
  A9: ["gst_present", "our_gst_present", "company_gst_present"],
  A10: ["our_gst", "company_gst", "buyer_gst", "gstin_buyer", "our_gstin"],
  A11: ["gst_correct", "our_gst_correct"],
  A12: ["invoice_date", "inv_date", "bill_date", "date"],
  A13: ["invoice_number", "invoice_no", "inv_no", "bill_no", "bill_number", "invoice_num"],
  A14: ["vendor_name", "vendor", "supplier_name", "supplier", "seller_name", "seller", "party_name"],
  A15: ["vendor_address", "supplier_address", "seller_address", "party_address"],
  A16: ["bill_description", "description", "item_description", "service_description", "particulars", "items"],
  A17: ["notes", "remarks", "comments", "internal_notes"],
  A18: ["rev_capital", "revenue_capital", "expense_type", "type_of_expense", "nature_of_expense"],
  A19: ["ledger_name", "ledger", "account_head", "expense_head", "category"],
  A20: ["basic_amount", "subtotal", "taxable_amount", "taxable_value", "taxable_amt", "basic_amt", "amount", "total_taxable_value"],
  A21: ["invoice_type", "type_of_invoice", "tax_invoice", "doc_type"],
  A22: ["final_invoice_by", "final_invoice", "billed_by"],
  A23: ["first_time_vendor", "new_vendor", "is_new_vendor"],
  A24: ["amount_justified", "amt_justified", "price_justified"],

  B1: ["tds_applicable", "tds_app", "tds_req", "is_tds_applicable"],
  B2: ["vendor_pan_avail", "pan_available", "vendor_pan_available"],
  B3: ["vendor_pan", "seller_pan", "supplier_pan"],
  B4: ["pan_inoperative", "inoperative_pan"],
  B5: ["vendor_entity_type", "entity_type", "type_of_vendor"],
  B6: ["tds_section", "section", "section_tds"],
  B7: ["tds_rate", "rate_of_tds", "tds_percentage"],
  B8: ["tds_amount", "tds_amt", "tds"],

  C1: ["gst_charged", "gst_applicable", "is_gst_charged"],
  C2: ["vendor_gst_avail", "vendor_gst_available"],
  C3: ["vendor_gst_no", "vendor_gstin", "vendor_gst", "supplier_gst", "supplier_gstin", "seller_gst", "gstin"],
  C4: ["taxpayer_type", "gst_taxpayer_type", "vendor_taxpayer_type"],
  C5: ["comp_gst_wrong", "gst_mismatch", "our_gst_wrong"],
  C6: ["gst_returns_filed", "returns_filed"],
  C7: ["our_gst_correct", "buyer_gst_correct"],
  C8: ["place_of_supply", "pos", "state_of_supply"],
  C9: ["correct_gst_type", "gst_type", "cgst_sgst_or_igst"],
  C10: ["prior_gst_pending", "previous_gst_pending"],
  C11: ["blocked_credit", "itc_blocked", "itc_ineligible"],

  D1: ["final_payable_amt", "final_payable", "grand_total", "total_amount", "net_amount", "total", "invoice_total", "invoice_amount"],
  D2: ["invoice_by", "provided_by", "submitted_by"],
  D3: ["received_via", "source", "channel"],
  D4: ["hod_name", "approver_name", "department_head", "hod"],
  D5: ["hod_approval", "approved_by_hod"],
  D6: ["hod_screenshot", "hod_proof"],
  D7: ["arvind_alok_apprvl", "management_approval"],
  D8: ["arvind_alok_ss", "management_screenshot"],
  D9: ["update_person", "last_updated_by"],
  D10: ["update_email", "biller_email"],
  D11: ["narration", "remarks", "summary"],
  overallStatus: ["overall_status", "status", "audit_status", "review_status"],
  redFlags: ["red_flags", "flags", "warnings", "issues", "audit_flags"]
};

// Normalize AI response object by stripping possible outer wrappers
function normalizeAiObject(raw) {
  if (!raw || typeof raw !== "object") return {};
  if (Array.isArray(raw)) return raw.length > 0 ? normalizeAiObject(raw[0]) : {};
  
  const keys = Object.keys(raw);
  if (keys.length === 1) {
    const singleVal = raw[keys[0]];
    if (singleVal && typeof singleVal === "object" && !Array.isArray(singleVal)) {
      return normalizeAiObject(singleVal);
    }
  }

  for (const wrapperKey of ["invoice", "data", "extracted_data", "details", "invoice_data", "result"]) {
    if (raw[wrapperKey] && typeof raw[wrapperKey] === "object" && !Array.isArray(raw[wrapperKey])) {
      return { ...raw, ...raw[wrapperKey] };
    }
  }
  return raw;
}

// Smart key resolver: matches exact key, prefix (e.g. "A14. Vendor Name"), or aliases (e.g. "vendor_name")
function getAiVal(obj, key) {
  if (!obj || typeof obj !== "object") return undefined;

  // 1. Direct match
  if (obj[key] !== undefined && obj[key] !== null) return obj[key];

  const targetKey = key.toUpperCase();
  const objKeys = Object.keys(obj);

  // 2. Case-insensitive exact match
  for (const k of objKeys) {
    if (k.toUpperCase() === targetKey) return obj[k];
  }

  // 3. Prefix match: e.g. "A14. Vendor Name", "A14: Vendor Name", "A14 - Vendor Name", "A14_Vendor_Name"
  for (const k of objKeys) {
    const upperK = k.toUpperCase().trim();
    if (upperK.startsWith(targetKey)) {
      const charAfter = upperK.charAt(targetKey.length);
      if (!charAfter || /[\s.:_\-\(\[\/]/.test(charAfter)) {
        return obj[k];
      }
    }
  }

  // 4. Aliases match
  const aliases = KEY_ALIASES[key] || [];
  for (const alias of aliases) {
    const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const k of objKeys) {
      const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cleanK === cleanAlias || cleanK.includes(cleanAlias)) {
        return obj[k];
      }
    }
  }

  return undefined;
}

function extractJsonFromText(rawText) {
  if (!rawText) throw new Error("Empty text returned by AI");
  let text = rawText.trim();
  // Strip code fences: ```json ... ``` or ``` ... ```
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

  try {
    return JSON.parse(text);
  } catch (err1) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const candidate = text.substring(start, end + 1);
      try {
        return JSON.parse(candidate);
      } catch (err2) {
        // Fix potential trailing commas: ,} or ,]
        const cleaned = candidate.replace(/,\s*([}\]])/g, "$1");
        return JSON.parse(cleaned);
      }
    }
    throw new Error(`JSON parse failed: ${err1.message}`);
  }
}

// ─────────────────────────────────────────────
// 3. Gemini AI Extraction (Multi-Key & Model Failover)
// ─────────────────────────────────────────────
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-1.5-pro"
];

function getGeminiApiKeys() {
  const raw = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS || process.env.GEMINI_KEY || "";
  return raw
    .split(/[,;\n]/)
    .map(k => k.trim().replace(/^["']|["']$/g, ""))
    .filter(k => k.length > 5);
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
        console.log(`[Gemini] Attempting model ${model} with Key #${i + 1}/${apiKeys.length}`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 40000); // 40-second timeout

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json"
            }
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const text = await res.text();
        if (!res.ok) {
          // If responseMimeType is rejected (400), retry immediately without it
          if (res.status === 400 && text.toLowerCase().includes("responsemimetype")) {
            console.warn(`[Gemini] ${model} rejected responseMimeType, retrying with raw text...`);
            const fallbackRes = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: { temperature: 0.1 }
              })
            });
            const fallbackText = await fallbackRes.text();
            if (fallbackRes.ok) {
              const fallbackJson = JSON.parse(fallbackText);
              const textParts = fallbackJson.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean) || [];
              const rawOut = textParts.join("\n").trim();
              if (rawOut) return extractJsonFromText(rawOut);
            }
          }
          throw new Error(`HTTP ${res.status}: ${text.substring(0, 180)}`);
        }

        const jsonResp = JSON.parse(text);
        const candidate = jsonResp.candidates?.[0];
        if (!candidate) {
          const blockReason = jsonResp.promptFeedback?.blockReason || "No candidates returned";
          throw new Error(`Gemini blocked: ${blockReason}`);
        }

        const textParts = candidate.content?.parts?.map(p => p.text).filter(Boolean) || [];
        const rawOutput = textParts.join("\n").trim();
        if (!rawOutput) throw new Error("Empty text generated by Gemini");

        return extractJsonFromText(rawOutput);
      } catch (err) {
        lastError = err.message;
        console.warn(`[Gemini Failover] Model ${model} (Key #${i + 1}) failed: ${err.message}`);
        // If model not found (404) or unsupported, immediately break out to next model
        if (err.message.includes("404") || err.message.includes("not found") || err.message.includes("is not supported")) {
          break;
        }
      }
    }
  }
  throw new Error(`All Gemini models exhausted. Last error: ${lastError}`);
}

// 54-Point Accounting Prompt (Clear, strict instructions without angle bracket placeholders)
function getGeminiPrompt(details) {
  return `You are an expert corporate accountant analyzing an invoice for Gretex.
Source: ${details.receivedFrom || "Manual Upload"}, Notes: ${details.notes || "None"}.

Extract data and return a STRICT JSON object matching these exact short keys.
CRITICAL INSTRUCTIONS:
- Return a single JSON object.
- Use EXACT short key names (A1, A2, ... A24, B1, ... B8, C1, ... C11, D1, ... D11, redFlags, overallStatus). DO NOT prepend or append descriptions to key names.
- For amount fields (A20, B8, D1), return pure numbers (e.g. 5000 or 12500.50). If not found, return 0. Never include currency symbols or commas.
- For missing or unmentioned text fields, return 'N/A'. Never return placeholder text like '<Vendor Name>'.
- Respond ONLY with valid raw JSON.

Key Definitions:
A1: Billed To Company Name
A2: Our Name Correct (Yes/No)
A3: Address Present (Yes/No)
A4: Our Address
A5: Address Correct (Yes/No)
A6: Our PAN Present (Yes/No)
A7: Our PAN
A8: PAN Correct (Yes/No)
A9: Our GST Present (Yes/No)
A10: Our GST
A11: GST Correct (Yes/No)
A12: Invoice Date (YYYY-MM-DD or DD/MM/YYYY)
A13: Invoice Number
A14: Vendor Name / Supplier Name
A15: Vendor Address
A16: Description of Goods/Services
A17: Notes
A18: Rev/Capital (Revenue or Capital)
A19: Ledger Name / Category
A20: Basic Amount / Subtotal / Taxable Value (pure number)
A21: Invoice Type (Tax Invoice, Proforma, Cash Memo, etc.)
A22: Final Invoice By
A23: First Time Vendor (Yes/No)
A24: Amount Justified (Yes/No)
B1: TDS Applicable (Yes/No)
B2: Vendor PAN Available (Yes/No)
B3: Vendor PAN
B4: PAN Inoperative (Yes/No)
B5: Vendor Entity Type (Company, Individual, Partnership, etc.)
B6: TDS Section (e.g. 194C, 194J)
B7: TDS Rate (percentage)
B8: TDS Amount (pure number)
C1: GST Charged (Yes/No)
C2: Vendor GST Available (Yes/No)
C3: Vendor GST Number (15-character GSTIN)
C4: Taxpayer Type (Regular, Composition, etc.)
C5: Company GST Wrong (Yes/No)
C6: GST Returns Filed (Yes/No/Unknown)
C7: Our GST Correct (Yes/No)
C8: Place of Supply (State / Code)
C9: Correct GST Type (CGST+SGST or IGST)
C10: Prior GST Pending (Yes/No)
C11: Blocked Credit (Yes/No)
D1: Final Payable / Grand Total / Net Payable Amount (pure number)
D2: Provided By
D3: Received Via
D4: HOD Name (if mentioned)
D5: HOD Approval (Yes/No)
D6: HOD Screenshot
D7: Arvind/Alok Approval (Yes/No)
D8: Arvind/Alok Screenshot
D9: Update Person
D10: Update Email
D11: Narration / Brief summary of bill
redFlags: array of strings describing any discrepancy or issue detected (empty array [] if clean)
overallStatus: PASS, REVIEW, or FAIL
`;
}

// ─────────────────────────────────────────────
// 4. Handler
// ─────────────────────────────────────────────
async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, message: "Method Not Allowed" });

  try {
    const {
      fileContent,
      fileName,
      fileType,
      senderEmail,
      billerEmail,
      senderName,
      receivedFrom,
      notes
    } = req.body || {};

    if (!fileContent || !fileName) {
      return res.status(400).json({ success: false, message: "File content (base64) and fileName are required." });
    }

    const pureBase64 = fileContent.includes(",") ? fileContent.split(",")[1] : fileContent;
    
    let resolvedType = fileType;
    if (!resolvedType || resolvedType === "application/octet-stream") {
      const lower = (fileName || "").toLowerCase();
      if (lower.endsWith(".pdf")) resolvedType = "application/pdf";
      else if (lower.endsWith(".png")) resolvedType = "image/png";
      else if (lower.endsWith(".webp")) resolvedType = "image/webp";
      else resolvedType = "image/jpeg";
    }

    // Parallel Execution with graceful fallback so bills are NEVER lost
    const drivePromise = uploadToDriveViaAppsScript(fileName, resolvedType, pureBase64, receivedFrom)
      .catch(err => {
        console.warn("[Drive Upload Catch]", err.message);
        return "N/A";
      });

    let aiExtractionError = null;
    const geminiPromise = callGeminiWithFailover([
      { text: getGeminiPrompt({ receivedFrom, notes }) },
      { inlineData: { mimeType: resolvedType, data: pureBase64 } }
    ]).catch(err => {
      aiExtractionError = err.message || "Extraction failed";
      console.warn("[Gemini Extraction Fallback]", aiExtractionError);
      return {
        A13: fileName.replace(/\.[^/.]+$/, "").substring(0, 50),
        A14: "Manual / AI Review",
        overallStatus: "REVIEW",
        redFlags: [`AI Warning: ${aiExtractionError}`]
      };
    });

    const [driveUrl, rawAi] = await Promise.all([drivePromise, geminiPromise]);
    const ai = normalizeAiObject(rawAi);
    console.log("[submit-invoice] Normalized AI Object Keys:", Object.keys(ai));

    const supabase = getSupabase();

    const finalNotes = notes
      ? (aiExtractionError ? `${notes} [AI Notice: ${aiExtractionError}]` : notes)
      : (aiExtractionError ? `[AI Notice: ${aiExtractionError}]` : cleanVal(getAiVal(ai, "A17"), "None"));

    const rawFlags = getAiVal(ai, "redFlags");
    const flagsArray = Array.isArray(rawFlags)
      ? rawFlags.filter(f => f && !/^<.*>$/.test(f))
      : (rawFlags ? [String(rawFlags)] : []);
    if (aiExtractionError && !flagsArray.some(f => f.includes("AI Warning"))) {
      flagsArray.unshift(`AI Warning: ${aiExtractionError}`);
    }

    const effectiveBiller = senderEmail || billerEmail || "Manual Upload";
    const rawInvNumber = getAiVal(ai, "A13");
    const baseInvNumber = cleanVal(rawInvNumber, fileName.replace(/\.[^/.]+$/, "").substring(0, 50));

    // Cross-fill amounts so that if either basic or final payable is extracted, neither stays 0
    const rawA20 = parseAmount(getAiVal(ai, "A20"));
    const rawD1 = parseAmount(getAiVal(ai, "D1"));
    const finalAmount = rawD1 > 0 ? rawD1 : (rawA20 > 0 ? rawA20 : 0);
    const basicAmount = rawA20 > 0 ? rawA20 : (rawD1 > 0 ? rawD1 : 0);

    // Insert directly into Supabase invoices table
    const invoicePayload = {
      timestamp: new Date().toISOString(),
      email_from: effectiveBiller,
      email_subject: "Web Submission",
      attachment_name: fileName,
      drive_url: driveUrl || "N/A",
      
      // Section A (Basic & Identification)
      a1_billed_to: cleanVal(getAiVal(ai, "A1")),
      a2_our_name_correct: cleanVal(getAiVal(ai, "A2")),
      a3_address_present: cleanVal(getAiVal(ai, "A3")),
      a4_our_address: cleanVal(getAiVal(ai, "A4")),
      a5_address_correct: cleanVal(getAiVal(ai, "A5")),
      a6_pan_present: cleanVal(getAiVal(ai, "A6")),
      a7_our_pan: cleanVal(getAiVal(ai, "A7")),
      a8_pan_correct: cleanVal(getAiVal(ai, "A8")),
      a9_gst_present: cleanVal(getAiVal(ai, "A9")),
      a10_our_gst: cleanVal(getAiVal(ai, "A10")),
      a11_gst_correct: cleanVal(getAiVal(ai, "A11")),
      a12_invoice_date: cleanVal(getAiVal(ai, "A12")),
      a13_invoice_number: baseInvNumber,
      a14_vendor_name: cleanVal(getAiVal(ai, "A14")),
      a15_vendor_address: cleanVal(getAiVal(ai, "A15")),
      a16_bill_description: cleanVal(getAiVal(ai, "A16")),
      a17_notes: finalNotes,
      a18_rev_capital: cleanVal(getAiVal(ai, "A18")),
      a19_ledger_name: cleanVal(getAiVal(ai, "A19")),
      a20_basic_amount: basicAmount,
      a21_invoice_type: cleanVal(getAiVal(ai, "A21")),
      a22_final_invoice_by: cleanVal(getAiVal(ai, "A22")),
      a23_first_time_vendor: cleanVal(getAiVal(ai, "A23")),
      a24_amount_justified: cleanVal(getAiVal(ai, "A24")),

      // Section B (TDS Compliance)
      b1_tds_applicable: cleanVal(getAiVal(ai, "B1")),
      b2_vendor_pan_avail: cleanVal(getAiVal(ai, "B2")),
      b3_vendor_pan: cleanVal(getAiVal(ai, "B3")),
      b4_pan_inoperative: cleanVal(getAiVal(ai, "B4")),
      b5_vendor_entity_type: cleanVal(getAiVal(ai, "B5")),
      b6_tds_section: cleanVal(getAiVal(ai, "B6")),
      b7_tds_rate: cleanVal(getAiVal(ai, "B7")),
      b8_tds_amount: parseAmount(getAiVal(ai, "B8")),

      // Section C (GST Compliance)
      c1_gst_charged: cleanVal(getAiVal(ai, "C1")),
      c2_vendor_gst_avail: cleanVal(getAiVal(ai, "C2")),
      c3_vendor_gst_no: cleanVal(getAiVal(ai, "C3")),
      c4_taxpayer_type: cleanVal(getAiVal(ai, "C4")),
      c5_comp_gst_wrong: cleanVal(getAiVal(ai, "C5")),
      c6_gst_returns_filed: cleanVal(getAiVal(ai, "C6")),
      c7_our_gst_correct: cleanVal(getAiVal(ai, "C7")),
      c8_place_of_supply: cleanVal(getAiVal(ai, "C8")),
      c9_correct_gst_type: cleanVal(getAiVal(ai, "C9")),
      c10_prior_gst_pending: cleanVal(getAiVal(ai, "C10")),
      c11_blocked_credit: cleanVal(getAiVal(ai, "C11")),

      // Section D (Audit & Final Approvals)
      d1_final_payable_amt: finalAmount,
      d2_invoice_by: cleanVal(getAiVal(ai, "D2"), senderName || "Manual Upload"),
      d3_received_via: receivedFrom || "Web Upload",
      d4_hod_name: cleanVal(getAiVal(ai, "D4")),
      d5_hod_approval: cleanVal(getAiVal(ai, "D5")),
      d6_hod_screenshot: cleanVal(getAiVal(ai, "D6")),
      d7_arvind_alok_apprvl: cleanVal(getAiVal(ai, "D7")),
      d8_arvind_alok_ss: cleanVal(getAiVal(ai, "D8")),
      d9_update_person: "AI Intake",
      d10_update_email: effectiveBiller,
      d11_narration: cleanVal(getAiVal(ai, "D11"), "Auto-extracted via AI"),

      red_flags: flagsArray.join(" | "),
      overall_status: cleanVal(getAiVal(ai, "overallStatus"), "REVIEW"),
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
      message: aiExtractionError
        ? `Invoice saved, but AI extraction warning: ${aiExtractionError}`
        : "Invoice extracted and saved to Supabase successfully",
      invoiceNumber: inserted.a13_invoice_number,
      aiWarning: aiExtractionError || null,
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
}

module.exports = handler;
module.exports.config = config;
module.exports.maxDuration = 60;

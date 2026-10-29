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
// 2. Data Cleaning & Extraction Helpers
// ─────────────────────────────────────────────
function cleanVal(val, defaultVal = "N/A") {
  if (val === undefined || val === null) return defaultVal;
  const s = String(val).trim();
  if (!s || s === "null" || s === "undefined") return defaultVal;
  // Eliminate raw prompt placeholders like "<Billed To Co Name>"
  if (/^<.*>$/.test(s)) return defaultVal;
  return s;
}

function parseAmount(val) {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (!val) return 0;
  // Strip currency symbols, commas, spaces
  const cleaned = String(val).replace(/[^0-9.-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function getAiKey(obj, key) {
  if (!obj || typeof obj !== "object") return undefined;
  if (obj[key] !== undefined) return obj[key];
  const lower = key.toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lower) return obj[k];
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
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-2.0-flash",
  "gemini-2.0-flash-exp",
  "gemini-1.5-pro",
  "gemini-flash-latest"
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
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 18000);

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
          throw new Error(`HTTP ${res.status}: ${text.substring(0, 160)}`);
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
        console.warn(`[Gemini Failover] Model ${model} (Key ${i + 1}/${apiKeys.length}) failed: ${err.message}`);
        // If model not found on API (404), skip to next model
        if (err.message.includes("404")) break;
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
CRITICAL INSTRUCTIONS:
- For amount fields (A20, B8, D1), return pure numbers (e.g. 5000 or 12500.50). If not found, return 0. Never use commas or currency symbols.
- For missing or unmentioned text fields, return 'N/A' (do NOT return '<placeholder>' or empty strings).
- Respond ONLY with valid raw JSON.

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
// 4. Handler
// ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
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

    const [driveUrl, ai] = await Promise.all([drivePromise, geminiPromise]);

    const supabase = getSupabase();

    const finalNotes = notes
      ? (aiExtractionError ? `${notes} [AI Notice: ${aiExtractionError}]` : notes)
      : (aiExtractionError ? `[AI Notice: ${aiExtractionError}]` : cleanVal(getAiKey(ai, "A17"), "None"));

    const flagsArray = Array.isArray(ai.redFlags)
      ? ai.redFlags.filter(f => f && !/^<.*>$/.test(f))
      : (ai.redFlags ? [String(ai.redFlags)] : []);
    if (aiExtractionError && !flagsArray.some(f => f.includes("AI Warning"))) {
      flagsArray.unshift(`AI Warning: ${aiExtractionError}`);
    }

    const effectiveBiller = senderEmail || billerEmail || "Manual Upload";
    const baseInvNumber = cleanVal(getAiKey(ai, "A13"), fileName.replace(/\.[^/.]+$/, "").substring(0, 50));

    // Insert directly into Supabase invoices table
    const invoicePayload = {
      timestamp: new Date().toISOString(),
      email_from: effectiveBiller,
      email_subject: "Web Submission",
      attachment_name: fileName,
      drive_url: driveUrl || "N/A",
      
      // Section A (Basic & Identification)
      a1_billed_to: cleanVal(getAiKey(ai, "A1")),
      a2_our_name_correct: cleanVal(getAiKey(ai, "A2")),
      a3_address_present: cleanVal(getAiKey(ai, "A3")),
      a4_our_address: cleanVal(getAiKey(ai, "A4")),
      a5_address_correct: cleanVal(getAiKey(ai, "A5")),
      a6_pan_present: cleanVal(getAiKey(ai, "A6")),
      a7_our_pan: cleanVal(getAiKey(ai, "A7")),
      a8_pan_correct: cleanVal(getAiKey(ai, "A8")),
      a9_gst_present: cleanVal(getAiKey(ai, "A9")),
      a10_our_gst: cleanVal(getAiKey(ai, "A10")),
      a11_gst_correct: cleanVal(getAiKey(ai, "A11")),
      a12_invoice_date: cleanVal(getAiKey(ai, "A12")),
      a13_invoice_number: baseInvNumber,
      a14_vendor_name: cleanVal(getAiKey(ai, "A14")),
      a15_vendor_address: cleanVal(getAiKey(ai, "A15")),
      a16_bill_description: cleanVal(getAiKey(ai, "A16")),
      a17_notes: finalNotes,
      a18_rev_capital: cleanVal(getAiKey(ai, "A18")),
      a19_ledger_name: cleanVal(getAiKey(ai, "A19")),
      a20_basic_amount: parseAmount(getAiKey(ai, "A20")),
      a21_invoice_type: cleanVal(getAiKey(ai, "A21")),
      a22_final_invoice_by: cleanVal(getAiKey(ai, "A22")),
      a23_first_time_vendor: cleanVal(getAiKey(ai, "A23")),
      a24_amount_justified: cleanVal(getAiKey(ai, "A24")),

      // Section B (TDS Compliance)
      b1_tds_applicable: cleanVal(getAiKey(ai, "B1")),
      b2_vendor_pan_avail: cleanVal(getAiKey(ai, "B2")),
      b3_vendor_pan: cleanVal(getAiKey(ai, "B3")),
      b4_pan_inoperative: cleanVal(getAiKey(ai, "B4")),
      b5_vendor_entity_type: cleanVal(getAiKey(ai, "B5")),
      b6_tds_section: cleanVal(getAiKey(ai, "B6")),
      b7_tds_rate: cleanVal(getAiKey(ai, "B7")),
      b8_tds_amount: parseAmount(getAiKey(ai, "B8")),

      // Section C (GST Compliance)
      c1_gst_charged: cleanVal(getAiKey(ai, "C1")),
      c2_vendor_gst_avail: cleanVal(getAiKey(ai, "C2")),
      c3_vendor_gst_no: cleanVal(getAiKey(ai, "C3")),
      c4_taxpayer_type: cleanVal(getAiKey(ai, "C4")),
      c5_comp_gst_wrong: cleanVal(getAiKey(ai, "C5")),
      c6_gst_returns_filed: cleanVal(getAiKey(ai, "C6")),
      c7_our_gst_correct: cleanVal(getAiKey(ai, "C7")),
      c8_place_of_supply: cleanVal(getAiKey(ai, "C8")),
      c9_correct_gst_type: cleanVal(getAiKey(ai, "C9")),
      c10_prior_gst_pending: cleanVal(getAiKey(ai, "C10")),
      c11_blocked_credit: cleanVal(getAiKey(ai, "C11")),

      // Section D (Audit & Final Approvals)
      d1_final_payable_amt: parseAmount(getAiKey(ai, "D1")) || parseAmount(getAiKey(ai, "A20")) || 0,
      d2_invoice_by: cleanVal(getAiKey(ai, "D2"), senderName || "Manual Upload"),
      d3_received_via: receivedFrom || "Web Upload",
      d4_hod_name: cleanVal(getAiKey(ai, "D4")),
      d5_hod_approval: cleanVal(getAiKey(ai, "D5")),
      d6_hod_screenshot: cleanVal(getAiKey(ai, "D6")),
      d7_arvind_alok_apprvl: cleanVal(getAiKey(ai, "D7")),
      d8_arvind_alok_ss: cleanVal(getAiKey(ai, "D8")),
      d9_update_person: "AI Intake",
      d10_update_email: effectiveBiller,
      d11_narration: cleanVal(getAiKey(ai, "D11"), "Auto-extracted via AI"),

      red_flags: flagsArray.join(" | "),
      overall_status: cleanVal(getAiKey(ai, "overallStatus"), "REVIEW"),
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

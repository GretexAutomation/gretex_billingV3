const UI = {
  emptyState(msg) {
    return `<div class="empty-state" style="padding:32px;grid-column:1/-1;">
      <div class="empty-icon">📭</div>
      <div class="empty-title">${msg}</div>
    </div>`;
  },
  buildStatusBadge(status) {
    if (status === "Approved") return `<span class="badge badge-approved">✅ Approved</span>`;
    if (status === "Rejected") return `<span class="badge badge-rejected">❌ Rejected</span>`;
    if (status === "Pending")  return `<span class="badge badge-pending">⏳ Pending</span>`;
    if (status.startsWith("Sent")) return `<span class="badge badge-sent">📤 ${status}</span>`;
    if (status === "Reviewed") return `<span class="badge badge-reviewed">👁️ Reviewed</span>`;
    return `<span class="badge badge-new">🆕 New</span>`;
  },
  buildBillCard(b, onClickStr) {
    const status   = b["Approval Status"] || "New";
    const invNo    = b["A13. Invoice Number"] || "—";
    const vendor   = b["A14. Vendor Name"]    || "—";
    const amount   = Utils.formatCurrency(b["A20. Basic Amount"]);
    const payable  = Utils.formatCurrency(b["D1. Final Payable Amt"]);
    const date     = Utils.formatDate(b["Timestamp"]);
    const flags    = b["🚩 Red Flags"] || "";
    const flagCnt  = flags ? flags.split("|").length : 0;
    const rowIndex = b.queueRowIndex !== undefined ? b.queueRowIndex : b.rowIndex;

    const cls = status==="New"      ? "new-bill"      :
                status==="Reviewed" ? "reviewed-bill" :
                status.startsWith("Sent") ? "sent-bill" :
                status==="Approved" ? "approved-bill" :
                status==="Rejected" ? "rejected-bill" : "";

    const badge = this.buildStatusBadge(status);

    return `
      <div class="bill-card ${cls}" onclick="event.stopPropagation(); ${onClickStr.replace('INDEX', rowIndex)}">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
            <strong style="font-size:0.9rem">${invNo}</strong>
            ${badge}
            ${flagCnt > 0 ? `<span class="flag-count">🚩 ${flagCnt}</span>` : ""}
          </div>
          <div style="font-size:0.83rem;color:var(--gray-700);margin-bottom:4px">
            <i class="fa fa-building" style="color:var(--gray-400);width:14px"></i>
            ${Utils.truncate(vendor,32)}
          </div>
          <div style="font-size:0.76rem;color:var(--gray-500);display:flex;gap:14px;flex-wrap:wrap">
            <span><i class="fa fa-calendar" style="width:12px"></i> ${date}</span>
            <span>Basic: ${amount}</span>
            <span>Payable: <strong>${payable}</strong></span>
            ${b["Sent To Role"] ? `<span style="color:var(--secondary)">📤 → ${b["Sent To Role"]}</span>` : ""}
          </div>
          ${status === "Rejected" ? (() => {
              let rBy = "Unknown", rRem = "No remark provided";
              if ((b["Account_Status"] || "").includes("Rejected")) { rBy = "Account"; rRem = b["Account_Remark"] || rRem; }
              else if ((b["CFO_Status"] || "").includes("Rejected")) { rBy = "CFO"; rRem = b["CFO_Remark"] || rRem; }
              else if ((b["Admin_Status"] || "").includes("Rejected")) { rBy = "Admin"; rRem = b["Admin_Remark"] || rRem; }
              else if ((b["SA_Status"] || "").includes("Rejected")) { rBy = "Super Admin"; rRem = b["SA_Remark"] || rRem; }
              return `<div style="margin-top:8px;background:#fff0f0;border-left:3px solid #ea4335;border-radius:4px;padding:6px 10px;font-size:0.75rem;">
                <div style="color:#d32f2f;font-weight:700;margin-bottom:2px">❌ Rejected by ${rBy}</div>
                <div style="color:#5f6368">${rRem}</div>
              </div>`;
          })() : ""}
        </div>
        <div style="flex-shrink:0; text-align: right; margin-top: auto;">
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); ${onClickStr.replace('INDEX', rowIndex)}">
            <i class="fa fa-eye"></i> Read View
          </button>
        </div>
      </div>`;
  },
  generateTrackingTimeline(inv) {
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
};

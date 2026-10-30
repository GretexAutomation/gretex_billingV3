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
        if (isNaN(dt.getTime())) return d;
        return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
      } catch (e) {
        return d;
      }
    };

    const steps = [
      {
        key: "Received",
        label: "Received",
        icon: "fa-envelope",
        date: formatDt(inv["Timestamp"] || inv["created_at"]) || "Done",
        stageIdx: 0
      },
      {
        key: "Biller",
        label: "Biller",
        icon: "fa-user-check",
        date: currIdx > 1 ? (formatDt(inv["Biller_Send_At"] || inv["biller_sent_at"]) || "Done") : "In Review",
        stageIdx: 1
      },
      {
        key: "HOD",
        label: inv.department && inv.department !== "General" ? `HOD (${inv.department})` : "HOD",
        icon: "fa-user-tie",
        date: currIdx > 2 ? (formatDt(inv["HOD_Send_At"]) || "Approved") : (currIdx === 2 ? "In Review" : "Pending..."),
        stageIdx: 2
      },
      {
        key: "Account",
        label: "Account",
        icon: "fa-calculator",
        date: currIdx > 3 ? (formatDt(inv["Account_Send_At"]) || "Approved") : (currIdx === 3 ? "In Review" : "Pending..."),
        stageIdx: 3
      },
      {
        key: "Finance",
        label: "Finance",
        icon: "fa-coins",
        date: currIdx > 4 ? (formatDt(inv["Finance_Send_At"]) || "Approved") : (currIdx === 4 ? "In Review" : "Pending..."),
        stageIdx: 4
      },
      {
        key: "CFO",
        label: "CFO",
        icon: "fa-briefcase",
        date: currIdx > 5 ? (formatDt(inv["CFO_Send_At"]) || "Approved") : (currIdx === 5 ? "In Review" : "Pending..."),
        stageIdx: 5
      },
      {
        key: "SuperAdmin",
        label: "Super Admin",
        icon: "fa-crown",
        date: currentStage === "Completed" ? (formatDt(inv["close_at"] || inv["send_for_billing_at"]) || "Final Approved") : (currIdx === 6 ? "In Review" : "Pending..."),
        stageIdx: 6
      }
    ];

    let html = `<div class="tracking-wrapper"><div class="tracking-container">`;

    steps.forEach((step) => {
      let statusClass = "";
      let iconHtml = `<i class="fa ${step.icon}"></i>`;
      let dateText = step.date;

      if (rejectedAt && (step.key === rejectedAt || (rejectedAt === "Super Admin" && step.key === "SuperAdmin"))) {
        statusClass = "rejected";
        iconHtml = `<i class="fa fa-times"></i>`;
        dateText = "Rejected";
      } else if (rejectedAt && step.stageIdx > stagesOrder.indexOf(rejectedAt)) {
        statusClass = "";
        dateText = "Cancelled";
      } else if (currentStage === "Completed" || step.stageIdx < currIdx) {
        statusClass = "completed";
        iconHtml = `<i class="fa fa-check"></i>`;
      } else if (step.stageIdx === currIdx) {
        statusClass = "active";
      }

      html += `
        <div class="track-step ${statusClass}">
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

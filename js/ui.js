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
    const steps = [
      { key: "Received", label: "Received",    date: inv["Timestamp"],       icon: "fa-envelope" },
      { key: "Biller",   label: "Biller",      date: inv["Biller_Send_At"],  icon: "fa-user-check", statusCol: "" },
      { key: "Account",  label: "Account",     date: inv["Account_Send_At"], icon: "fa-calculator", statusCol: inv["Account_Status"] },
      { key: "CFO",      label: "CFO",         date: inv["CFO_Send_At"],     icon: "fa-briefcase",  statusCol: inv["CFO_Status"] },
      { key: "Admin",    label: "Admin",       date: inv["Admin_Send_At"],   icon: "fa-user-shield",statusCol: inv["Admin_Status"] },
      { key: "SA",       label: "Super Admin", date: inv["SA_Approved_At"],  icon: "fa-crown",      statusCol: inv["SA_Status"] }
    ];

    const currentStage = inv["Current_Stage"] || "New";
    let hasRejected = steps.some(s => s.statusCol && s.statusCol.includes("Rejected"));
    let stageReached = false;
    let html = `<div class="tracking-wrapper"><div class="tracking-container">`;
    let rejectionHtml = "";

    steps.forEach((step) => {
      let statusClass = "";
      let iconHtml = `<i class="fa ${step.icon}"></i>`;
      let dateText = step.date ? step.date : "Pending...";
      if (step.date && step.date !== "") {
        statusClass = "completed";
        iconHtml = `<i class="fa fa-check"></i>`; 
        if (step.statusCol && step.statusCol.includes("Rejected")) {
          statusClass = "rejected";
          iconHtml = `<i class="fa fa-times"></i>`;
          let remark = "";
          if (step.key === "Account") remark = inv["Account_Remark"];
          else if (step.key === "CFO") remark = inv["CFO_Remark"];
          else if (step.key === "Admin") remark = inv["Admin_Remark"];
          else if (step.key === "SA") remark = inv["SA_Remark"];
          if (!remark || remark.trim() === "") remark = "No specific reason provided.";
          rejectionHtml = `
            <div style="margin-top: 20px; background: #fff0f0; border-left: 4px solid #ea4335; border-radius: 8px; padding: 12px 16px;">
              <div style="color: #d32f2f; font-weight: 700; margin-bottom: 4px; font-size: 0.9rem;">❌ Rejected at ${step.label} Stage</div>
              <div style="color: #5f6368; font-size: 0.85rem;"><strong>Reason:</strong> ${remark}</div>
            </div>`;
        }
      } else {
        if (!stageReached && !hasRejected && currentStage !== "Completed") {
          statusClass = "active";
          stageReached = true; 
        }
      }
      html += `<div class="track-step ${statusClass}"><div class="track-icon">${iconHtml}</div><div class="track-text"><h6>${step.label}</h6><p>${dateText}</p></div></div>`;
    });
    html += `</div></div>`;
    if (rejectionHtml) html += rejectionHtml;
    return html;
  }
};

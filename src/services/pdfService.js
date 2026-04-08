const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const LOGO_PATH = path.join(__dirname, "../../pest/public/logo.jpg");

const getCompanySettings = async () => {
  try {
    const CompanySettings = require("../models/CompanySettings");
    let settings = await CompanySettings.findOne();
    if (!settings) {
      settings = await CompanySettings.create({});
    }
    return settings;
  } catch (e) {
    return null;
  }
};

const getLogoBase64 = async () => {
  try {
    const settings = await getCompanySettings();
    if (settings?.logo) {
      return settings.logo;
    }
    if (fs.existsSync(LOGO_PATH)) {
      const buffer = fs.readFileSync(LOGO_PATH);
      return `data:image/jpeg;base64,${buffer.toString("base64")}`;
    }
  } catch (e) {}
  return null;
};

const getCompanyInfo = async () => {
  try {
    const settings = await getCompanySettings();
    if (settings) {
      return {
        name: settings.companyName || "SAFE HOME PESTOCHEM INDIA PVT. LTD.",
        email: settings.email || "enquiry@safehomepestochem.in",
        phone: settings.phone || "25709",
        website: settings.website || "www.safehomepestochem.com",
        headOffice: settings.headOffice?.address || "",
        regionalOffice: settings.regionalOffice?.address || "",
        cin: settings.cinNo || "",
        tan: settings.tanNo || "",
        pan: settings.panNo || "",
        gst: settings.gstNo || "",
      };
    }
  } catch (e) {}
  return {
    name: "SAFE HOME PESTOCHEM INDIA PVT. LTD.",
    email: "enquiry@safehomepestochem.in",
    phone: "25709",
    website: "www.safehomepestochem.com",
    headOffice:
      "House No. 780-J, Chaksa Husain, Pachpedwa, Ramjanki Nagar, Basaratpur, Gorakhpur-273004",
    regionalOffice:
      "H. No-68, Pink City, Sec. 06, Jankipuram Extn., Near Kendria Vihar Colony, Lucknow-226021",
    cin: "U52100UP2022PTC164278",
    tan: "ALDS10486A",
    pan: "ABICS5318P",
    gst: "",
  };
};

const formatCurrency = (num) => {
  if (!num && num !== 0) return "Rs. 0";
  return "Rs. " + Number(num).toLocaleString("en-IN");
};

const formatNum = (num) => {
  if (!num && num !== 0) return "0";
  return Number(num).toLocaleString("en-IN");
};

const formatDate = (date) => {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getJobCardHTML = async (data) => {
  const logo = await getLogoBase64();
  const companyInfo = await getCompanyInfo();
  const cust = data.customer || {};
  const pricing = data.pricing || {};
  const schedule = data.schedule || {};
  const premises = data.premises || {};
  const attDetails = data.attDetails || {};

  const floors = premises.floors || [];
  const amcServices = data.amcServices || [];

  const totalArea = premises.totalArea || 0;
  const baseAmount = pricing.baseAmount || 0;
  const gstAmount = pricing.gstAmount || 0;
  const discountAmount = pricing.discountAmount || 0;
  const finalAmount = pricing.finalAmount || 0;
  const advancePaid = data.billing?.advance || 0;
  const balanceDue = finalAmount - advancePaid;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
    .container { max-width: 750px; margin: 0 auto; }
    .header { background: #0d7a4a; color: white; padding: 20px 25px; display: flex; align-items: center; gap: 20px; }
    .logo { width: 65px; height: 65px; border-radius: 6px; object-fit: contain; background: white; padding: 4px; }
    .company-info h1 { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
    .company-info p { font-size: 10px; opacity: 0.9; }
    .title-bar { background: #e8f5ec; padding: 12px 25px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0d7a4a; }
    .title-bar h2 { color: #0d7a4a; font-size: 16px; font-weight: bold; }
    .title-bar .meta { font-size: 10px; color: #666; }
    .section { padding: 15px 25px; border-bottom: 1px solid #eee; }
    .section-title { font-size: 11px; font-weight: bold; color: #0d7a4a; text-transform: uppercase; letter-spacing: 1px; padding-bottom: 8px; margin-bottom: 12px; border-bottom: 1px solid #d1e8d8; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    .grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; }
    .info-box { background: #f8f9fa; padding: 10px 12px; border-radius: 4px; border-left: 3px solid #0d7a4a; }
    .info-label { font-size: 9px; color: #888; text-transform: uppercase; margin-bottom: 3px; letter-spacing: 0.5px; }
    .info-value { font-size: 12px; font-weight: bold; color: #1a1a1a; }
    .info-value.highlight { color: #0d7a4a; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: bold; background: #0d7a4a; color: white; }
    .services-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .service-tag { background: #e8f5ec; color: #0d7a4a; padding: 5px 12px; border-radius: 4px; font-size: 11px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #0d7a4a; color: white; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; }
    td { padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 11px; }
    .total-row { background: #0d7a4a !important; color: white; font-weight: bold; }
    .pricing-box { background: linear-gradient(135deg, #0d7a4a, #0a5c39); color: white; padding: 20px 25px; border-radius: 8px; }
    .pricing-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed rgba(255,255,255,0.3); font-size: 11px; }
    .pricing-total { display: flex; justify-content: space-between; padding-top: 12px; margin-top: 8px; border-top: 2px solid white; font-size: 14px; font-weight: bold; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; padding: 0 25px; }
    .sig-box { text-align: center; }
    .sig-label { font-size: 9px; color: #888; text-transform: uppercase; margin-bottom: 8px; }
    .sig-area { height: 50px; background: #f8f9fa; border-bottom: 2px solid #333; margin-bottom: 8px; }
    .sig-name { font-size: 11px; font-weight: bold; }
    .sig-date { font-size: 10px; color: #666; }
    .footer { background: #1a1a1a; color: white; padding: 15px 25px; text-align: center; font-size: 9px; margin-top: 20px; }
    .footer p { opacity: 0.8; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
    .two-col .section { border-right: 1px solid #eee; }
    .att-section { background: #f0f7ff; border-left: 3px solid #2563eb; }
    .att-section .section-title { color: #2563eb; border-color: #bfdbfe; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logo ? `<img src="${logo}" class="logo" alt="Logo">` : ""}
      <div class="company-info">
        <h1>${companyInfo.name}</h1>
        <p>Professional Pest Control Services | ISO 9001:2015 Certified</p>
        <p style="font-size: 9px; margin-top: 4px;">Head Office: ${companyInfo.headOffice}</p>
        <p style="font-size: 9px;">Regional Office: ${companyInfo.regionalOffice}</p>
        <p style="font-size: 9px;">${companyInfo.website} | ${companyInfo.email} | Ph: ${companyInfo.phone}</p>
        <p style="font-size: 8px;">CIN: ${companyInfo.cin} | TAN: ${companyInfo.tan} | PAN: ${companyInfo.pan}</p>
      </div>
    </div>
    <div class="title-bar">
      <h2>SERVICE JOB CARD</h2>
      <div class="meta">
        <strong>${data.orderNo || "DRAFT"}</strong> | ${formatDate(data.createdAt)} | <span class="badge">${data.status || "SUBMITTED"}</span>
      </div>
    </div>
    <div class="two-col">
      <div class="section">
        <div class="section-title">Customer Information</div>
        <div class="grid-2">
          <div class="info-box"><div class="info-label">Name</div><div class="info-value">${cust.title || ""} ${cust.name || "-"}</div></div>
          <div class="info-box"><div class="info-label">Phone</div><div class="info-value">${cust.phone || "-"}</div></div>
          <div class="info-box"><div class="info-label">Email</div><div class="info-value" style="font-size:10px">${cust.email || "-"}</div></div>
          <div class="info-box"><div class="info-label">GST No</div><div class="info-value">${cust.gstNo || "-"}</div></div>
        </div>
        <div class="info-box" style="margin-top:12px"><div class="info-label">Address</div><div class="info-value" style="font-size:11px">${cust.address || "-"}, ${cust.city || ""}</div></div>
      </div>
      <div class="section">
        <div class="section-title">Service Details</div>
        <div class="grid-2">
          <div class="info-box"><div class="info-label">Branch</div><div class="info-value">${data.branchId?.branchName || "-"}</div></div>
          <div class="info-box"><div class="info-label">Category</div><div class="info-value">${data.serviceCategory || "-"}</div></div>
          <div class="info-box"><div class="info-label">Service Type</div><div class="info-value highlight">${data.serviceType || "AMC"}</div></div>
          <div class="info-box"><div class="info-label">Premises</div><div class="info-value">${premises.type || "-"}</div></div>
          <div class="info-box"><div class="info-label">Schedule Date</div><div class="info-value">${schedule.date || "-"}</div></div>
          <div class="info-box"><div class="info-label">Schedule Time</div><div class="info-value">${schedule.time || "-"}</div></div>
        </div>
      </div>
    </div>
    ${
      (data.serviceType === "AMC" || data.serviceType === "BOTH") &&
      amcServices.length > 0
        ? `
    <div class="section">
      <div class="section-title">AMC Services (Pest Control)</div>
      <div class="services-list">${amcServices.map((s) => `<span class="service-tag">${s}</span>`).join("")}</div>
      <div class="grid-3" style="margin-top:15px">
        <div class="info-box"><div class="info-label">Rate per Sq.Ft.</div><div class="info-value">${formatCurrency(data.ratePerSqft || 0)}</div></div>
        <div class="info-box"><div class="info-label">Total Area</div><div class="info-value">${formatNum(totalArea)} Sq.Ft.</div></div>
        <div class="info-box"><div class="info-label">Reference</div><div class="info-value">${data.reference || "Walk-in"}</div></div>
      </div>
    </div>`
        : ""
    }
    ${
      data.serviceType === "ATT" || data.serviceType === "BOTH"
        ? `
    <div class="section att-section">
      <div class="section-title">ATT Services (Anti Termite Treatment)</div>
      <div class="grid-4">
        <div class="info-box"><div class="info-label">Treatment</div><div class="info-value highlight">${attDetails.prePost === "POST" ? "POST-TREATMENT" : "PRE-TREATMENT"}</div></div>
        <div class="info-box"><div class="info-label">Treatment Types</div><div class="info-value" style="font-size:10px">${(attDetails.treatmentTypes || []).join(", ") || "-"}</div></div>
        <div class="info-box"><div class="info-label">Chemicals</div><div class="info-value" style="font-size:10px">${(attDetails.chemicals || []).join(", ") || "-"}</div></div>
        <div class="info-box"><div class="info-label">Warranty</div><div class="info-value" style="color:#dc2626">${attDetails.warranty || "-"}</div></div>
      </div>
      <div class="grid-4" style="margin-top:12px">
        <div class="info-box"><div class="info-label">Methods</div><div class="info-value" style="font-size:10px">${(attDetails.methods || []).join(", ") || "-"}</div></div>
        <div class="info-box"><div class="info-label">Base Solution</div><div class="info-value" style="font-size:10px">${(attDetails.baseSolutions || []).join(", ") || "-"}</div></div>
        <div class="info-box"><div class="info-label">Rate per Sq.Ft.</div><div class="info-value">${formatCurrency(data.ratePerSqft || 0)}</div></div>
        <div class="info-box"><div class="info-label">Total Area</div><div class="info-value">${formatNum(totalArea)} Sq.Ft.</div></div>
      </div>
    </div>`
        : ""
    }
    ${
      floors.length > 0
        ? `
    <div class="section">
      <div class="section-title">Premises - Floor Details</div>
      <table>
        <thead><tr><th>Floor</th><th>Length (ft)</th><th>Width (ft)</th><th>Area (sqft)</th></tr></thead>
        <tbody>
          ${floors.map((f) => `<tr><td>${f.label || "Floor"}</td><td>${formatNum(f.length)}</td><td>${formatNum(f.width)}</td><td>${formatNum(f.area)}</td></tr>`).join("")}
          <tr class="total-row"><td colspan="3">TOTAL AREA</td><td>${formatNum(totalArea)} Sq.Ft.</td></tr>
        </tbody>
      </table>
    </div>`
        : ""
    }
    <div class="section">
      <div class="section-title">Price Details</div>
      <div class="pricing-box">
        <div class="pricing-row"><span>Base Amount</span><span>${formatCurrency(baseAmount)}</span></div>
        ${pricing.gstPercent > 0 ? `<div class="pricing-row"><span>GST (${pricing.gstPercent}%)</span><span>+ ${formatCurrency(gstAmount)}</span></div>` : ""}
        ${pricing.discountPercent > 0 ? `<div class="pricing-row"><span>Discount (${pricing.discountPercent}%)</span><span>- ${formatCurrency(discountAmount)}</span></div>` : ""}
        <div class="pricing-total"><span>TOTAL AMOUNT</span><span>${formatCurrency(finalAmount)}</span></div>
        ${advancePaid > 0 ? `<div style="margin-top:12px; padding-top:12px; border-top:1px dashed rgba(255,255,255,0.3);"><div class="pricing-row"><span>Advance Paid</span><span>${formatCurrency(advancePaid)}</span></div><div class="pricing-row"><span>Balance Due</span><span>${formatCurrency(balanceDue)}</span></div></div>` : ""}
      </div>
    </div>
    ${
      data.employeeId?.name
        ? `
    <div class="section">
      <div class="section-title">Field Executive</div>
      <div class="grid-2">
        <div class="info-box"><div class="info-label">Name</div><div class="info-value">${data.employeeId.name}</div></div>
        <div class="info-box"><div class="info-label">Phone</div><div class="info-value">${data.employeeId.phone || "-"}</div></div>
      </div>
    </div>`
        : ""
    }
    <div class="signatures">
      <div class="sig-box"><div class="sig-label">Executive Signature</div><div class="sig-area"></div><div class="sig-name">${data.employeeId?.name || "Executive"}</div><div class="sig-date">Date: ___________</div></div>
      <div class="sig-box"><div class="sig-label">Customer Signature</div><div class="sig-area"></div><div class="sig-name">${cust.name || "Customer"}</div><div class="sig-date">Date: ___________</div></div>
    </div>
    <div class="footer"><p>This is a computer-generated document. Generated on: ${new Date().toLocaleString("en-IN")}</p><p style="margin-top:4px">SAFE HOME PESTOCHEM INDIA PVT. LTD. | ISO 9001:2015 Certified</p><p style="font-size:8px; margin-top:8px; line-height:1.4; opacity:0.85">Terms & Conditions: Service is subject to our standard terms. Please retain this document for future reference. Payments once made are non-refundable unless agreed in writing by authorized personnel.</p></div>
  </div>
</body>
</html>`;
};

const getReceiptHTML = async (data) => {
  const logo = await getLogoBase64();
  const companyInfo = await getCompanyInfo();
  const cust = data.customer || {};
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
    .container { max-width: 750px; margin: 0 auto; }
    .header { background: #0d7a4a; color: white; padding: 20px 25px; display: flex; align-items: center; gap: 20px; }
    .logo { width: 65px; height: 65px; border-radius: 6px; object-fit: contain; background: white; padding: 4px; }
    .company-info h1 { font-size: 18px; font-weight: bold; }
    .company-info p { font-size: 10px; opacity: 0.9; }
    .title-bar { background: #e8f5ec; padding: 12px 25px; border-bottom: 2px solid #0d7a4a; text-align: center; }
    .title-bar h2 { color: #0d7a4a; font-size: 16px; font-weight: bold; }
    .section { padding: 15px 25px; border-bottom: 1px solid #eee; }
    .section-title { font-size: 11px; font-weight: bold; color: #0d7a4a; text-transform: uppercase; padding-bottom: 8px; margin-bottom: 12px; border-bottom: 1px solid #d1e8d8; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .info-box { background: #f8f9fa; padding: 10px 12px; border-radius: 4px; border-left: 3px solid #0d7a4a; }
    .info-label { font-size: 9px; color: #888; text-transform: uppercase; margin-bottom: 3px; }
    .info-value { font-size: 12px; font-weight: bold; color: #1a1a1a; }
    .payment-box { background: linear-gradient(135deg, #0d7a4a, #0a5c39); color: white; padding: 20px 25px; border-radius: 8px; text-align: center; }
    .payment-box .amount { font-size: 28px; font-weight: bold; }
    .pricing-box { background: #f8f9fa; padding: 15px 25px; border-radius: 8px; margin-top: 15px; }
    .pricing-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; }
    .pricing-total { display: flex; justify-content: space-between; padding-top: 10px; margin-top: 10px; border-top: 2px solid #0d7a4a; font-weight: bold; font-size: 14px; color: #0d7a4a; }
    .footer { background: #1a1a1a; color: white; padding: 15px 25px; text-align: center; font-size: 9px; margin-top: 20px; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logo ? `<img src="${logo}" class="logo" alt="Logo">` : ""}
      <div class="company-info">
        <h1>${companyInfo.name}</h1>
        <p>Professional Pest Control Services | ISO 9001:2015 Certified</p>
        <p style="font-size: 9px; margin-top: 4px;">Head Office: ${companyInfo.headOffice}</p>
        <p style="font-size: 9px;">Regional Office: ${companyInfo.regionalOffice}</p>
        <p style="font-size: 9px;">${companyInfo.website} | ${companyInfo.email} | Ph: ${companyInfo.phone}</p>
        <p style="font-size: 8px;">CIN: ${companyInfo.cin} | TAN: ${companyInfo.tan} | PAN: ${companyInfo.pan}</p>
      </div>
    </div>
    <div class="title-bar"><h2>PAYMENT RECEIPT</h2></div>
    <div class="section">
      <div class="section-title">Receipt Details</div>
      <div class="grid-2">
        <div class="info-box"><div class="info-label">Receipt No</div><div class="info-value">${data.receiptNo || "-"}</div></div>
        <div class="info-box"><div class="info-label">Date</div><div class="info-value">${formatDate(data.paymentDate)}</div></div>
        <div class="info-box"><div class="info-label">Service Type</div><div class="info-value">${data.serviceType || "-"}</div></div>
        <div class="info-box"><div class="info-label">Branch</div><div class="info-value">${data.branchId?.branchName || "-"}</div></div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Customer Information</div>
      <div class="grid-2">
        <div class="info-box"><div class="info-label">Name</div><div class="info-value">${data.customerName || "-"}</div></div>
        <div class="info-box"><div class="info-label">Phone</div><div class="info-value">${data.customerPhone || "-"}</div></div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Payment Summary</div>
      <div class="payment-box">
        <div style="font-size:11px;opacity:0.9">Amount Received</div>
        <div class="amount">${formatCurrency(data.advancePaid || 0)}</div>
        <div style="font-size:11px;margin-top:5px">via ${data.paymentMode || "Cash"}${data.transactionId ? " | Ref: " + data.transactionId : ""}</div>
      </div>
      <div class="pricing-box">
        <div class="pricing-row"><span>Total Amount</span><span>${formatCurrency(data.totalAmount || 0)}</span></div>
        <div class="pricing-row"><span>Paid Amount</span><span style="color:#0d7a4a">${formatCurrency(data.advancePaid || 0)}</span></div>
        <div class="pricing-row"><span>Balance Due</span><span style="color:#dc2626">${formatCurrency(data.balanceDue || 0)}</span></div>
        <div class="pricing-total"><span>STATUS</span><span>${(data.balanceDue || 0) <= 0 ? "PAID" : "PARTIALLY PAID"}</span></div>
      </div>
    </div>
    <div class="footer"><p>This is a computer-generated receipt. Generated on: ${new Date().toLocaleString("en-IN")}</p><p style="margin-top:4px">SAFE HOME PESTOCHEM INDIA PVT. LTD. | ISO 9001:2015 Certified</p><p style="font-size:8px; margin-top:8px; line-height:1.4; opacity:0.85">Terms & Conditions: Payment is subject to our standard terms. Please retain this document for future reference. Payments once made are non-refundable unless agreed in writing by authorized personnel.</p></div>
  </div>
</body>
</html>`;
};

const getEnquiryListHTML = (enquiries) => {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
    .container { max-width: 1100px; margin: 0 auto; }
    .header { background: #0d7a4a; color: white; padding: 20px; text-align: center; }
    .header h1 { font-size: 18px; font-weight: bold; }
    .header p { font-size: 10px; opacity: 0.9; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #f1f5f9; padding: 8px 5px; text-align: left; border-bottom: 2px solid #e2e8f0; }
    td { padding: 8px 5px; border-bottom: 1px solid #f1f5f9; }
    .footer { background: #1a1a1a; color: white; padding: 10px; text-align: center; font-size: 9px; margin-top: 20px; }
    @media print { body { print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>ENQUIRY REPORT</h1><p>Total Records: ${enquiries.length} | Generated: ${new Date().toLocaleString("en-IN")}</p></div>
    <table>
      <thead><tr><th>ID</th><th>Customer</th><th>Mobile</th><th>Service</th><th>City</th><th>Status</th><th>Priority</th><th>Source</th></tr></thead>
      <tbody>
        ${enquiries.map((e) => `<tr><td>${e.enquiryId || "-"}</td><td>${e.customerName || "-"}</td><td>${e.mobile || "-"}</td><td>${e.serviceType || "-"}</td><td>${e.city || "-"}</td><td>${e.status || "-"}</td><td>${e.priority || "-"}</td><td>${e.source || "-"}</td></tr>`).join("")}
      </tbody>
    </table>
    <div class="footer">SAFE HOME PESTOCHEM INDIA PVT. LTD.</div>
  </div>
</body>
</html>`;
};

exports.generateJobCardPdf = async (formDoc) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const html = await getJobCardHTML(formDoc);
    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });
    await browser.close();
    return Buffer.from(pdf);
  } catch (error) {
    await browser.close();
    throw error;
  }
};

exports.generateReceiptPdf = async (receiptDoc) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const html = await getReceiptHTML(receiptDoc);
    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });
    await browser.close();
    return Buffer.from(pdf);
  } catch (error) {
    await browser.close();
    throw error;
  }
};

exports.generateEnquiryListPdf = async (enquiries) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(getEnquiryListHTML(enquiries), {
      waitUntil: "networkidle0",
    });
    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });
    await browser.close();
    return Buffer.from(pdf);
  } catch (error) {
    await browser.close();
    throw error;
  }
};

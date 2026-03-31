const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = 'C:/Users/91895/Downloads/pestiside/logo (1).jpg';

const getLogoBase64 = () => {
  try {
    if (fs.existsSync(LOGO_PATH)) {
      const imgBuffer = fs.readFileSync(LOGO_PATH);
      return `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;
    }
    console.log('Logo not found at:', LOGO_PATH);
  } catch (e) {
    console.log('Logo error:', e.message);
  }
  return null;
};

const formatCurrency = (num) => {
  if (!num && num !== 0) return '₹0';
  const rounded = Math.ceil(num || 0);
  return '₹' + Number(rounded).toLocaleString('en-IN');
};

const formatNum = (num) => {
  if (!num && num !== 0) return '0';
  return Math.ceil(num || 0).toLocaleString('en-IN');
};

const formatDate = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ==========================================
// PROFESSIONAL JOB CARD TEMPLATE - ENHANCED
// ==========================================
const generateJobCardHtml = (data) => {
  const logo = getLogoBase64();
  const cust = data.customer || {};
  const premises = data.premises || {};
  const pricing = data.pricing || {};
  const schedule = data.schedule || {};
  const billing = data.billing || {};
  const contract = data.contract || {};
  const executive = data.executive || {};
  const logistics = data.logistics || {};
  const serviceDetails = data.serviceDetails || {};
  
  const amcServices = data.amcServices || [];
  const floors = premises.floors || [];
  
  const hasAMC = data.serviceType === 'AMC' || data.serviceType === 'GPC' || data.serviceType === 'BOTH';
  const hasATT = data.serviceType === 'ATT' || data.serviceType === 'BOTH';
  const isGPC = data.serviceType === 'GPC';
  const isServicePdf = data.currentServiceNumber && data.totalServices;
  
  const areaAmount = Math.ceil((premises.totalArea || 0) * (data.ratePerSqft || 0));
  const floorExtra = Math.ceil(floors.length * (data.perFloorExtra || 0));
  const baseAmount = areaAmount + floorExtra;
  
  const serviceRates = data.serviceRates || {};

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Service Job Card</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; 
      font-size: 11px; 
      color: #1a202c; 
      line-height: 1.5; 
      background: #fff;
    }
    
    .page { max-width: 800px; margin: 0 auto; }
    
    /* HEADER - CLEAN & PROFESSIONAL */
    .header {
      background: linear-gradient(135deg, #1a365d 0%, #2d3748 100%);
      color: white;
      padding: 0;
      position: relative;
    }
    .header-main {
      display: flex;
      align-items: center;
      padding: 20px 30px;
      gap: 20px;
    }
    .logo {
      width: 90px;
      height: 90px;
      object-fit: cover;
      border-radius: 10px;
      border: 3px solid rgba(255,255,255,0.2);
    }
    .company-details {
      flex: 1;
    }
    .company-name {
      font-size: 24px;
      font-weight: 900;
      color: #fff;
      letter-spacing: 0.5px;
    }
    .company-tagline {
      font-size: 11px;
      color: #a0aec0;
      margin-top: 4px;
    }
    .header-right {
      text-align: right;
    }
    .doc-type {
      background: #38a169;
      color: white;
      padding: 8px 20px;
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 2px;
      display: inline-block;
      border-radius: 4px;
    }
    .doc-number {
      font-size: 12px;
      color: #e2e8f0;
      margin-top: 8px;
    }
    .header-info {
      background: rgba(255,255,255,0.05);
      border-top: 1px solid rgba(255,255,255,0.1);
      padding: 12px 30px;
      display: flex;
      gap: 30px;
      flex-wrap: wrap;
    }
    .header-info-item {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .header-info-label {
      font-size: 9px;
      color: #a0aec0;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .header-info-value {
      font-size: 12px;
      font-weight: 700;
      color: #fff;
    }
    .header-bottom {
      background: #38a169;
      padding: 10px 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .service-type-badge {
      background: white;
      color: #1a365d;
      padding: 6px 16px;
      font-size: 11px;
      font-weight: 800;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .order-info {
      color: white;
      font-size: 11px;
    }
    .order-info strong {
      color: #68d391;
    }
    
    /* DETAILS SECTIONS */
    .details-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      padding: 20px 30px;
    }
    .detail-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    .detail-card-header {
      padding: 12px 15px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .detail-card-header.customer { background: #ebf8ff; color: #2b6cb0; }
    .detail-card-header.executive { background: #f0fff4; color: #276749; }
    .detail-card-header.schedule { background: #fffaf0; color: #c05621; }
    .detail-card-header.premises { background: #faf5ff; color: #6b46c1; }
    .detail-card-body {
      padding: 15px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px dotted #e2e8f0;
    }
    .detail-row:last-child { border-bottom: none; }
    .detail-label {
      font-size: 10px;
      color: #718096;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .detail-value {
      font-size: 12px;
      font-weight: 600;
      color: #1a202c;
      text-align: right;
    }
    .detail-name {
      font-size: 16px;
      font-weight: 800;
      color: #1a365d;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e2e8f0;
    }
    
    /* CONTRACT BOX */
    .contract-box {
      background: linear-gradient(135deg, #f0fff4 0%, #c6f6d5 100%);
      border: 2px solid #38a169;
      border-radius: 8px;
      margin: 0 30px 20px;
      padding: 15px 20px;
    }
    .contract-title {
      font-size: 11px;
      font-weight: 800;
      color: #276749;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    .contract-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
    }
    .contract-item {
      text-align: center;
      padding: 10px;
      background: white;
      border-radius: 6px;
    }
    .contract-item label {
      font-size: 9px;
      color: #718096;
      text-transform: uppercase;
      display: block;
      margin-bottom: 4px;
    }
    .contract-item span {
      font-size: 13px;
      font-weight: 700;
      color: #1a365d;
    }
    .contract-item span.highlight { color: #276749; }
    
    /* TABLE */
    .table-section {
      padding: 0 30px 20px;
    }
    .section-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #1a365d;
      padding: 15px 0;
      border-bottom: 2px solid #38a169;
      margin-bottom: 15px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .section-title::before {
      content: '';
      width: 6px;
      height: 6px;
      background: #38a169;
      border-radius: 50%;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .table th {
      background: #1a365d;
      color: white;
      padding: 12px 15px;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 700;
    }
    .table th:nth-child(n+3) { text-align: right; }
    .table td {
      padding: 10px 15px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 11px;
    }
    .table td:nth-child(n+3) { text-align: right; font-weight: 600; }
    .table tr:nth-child(even) { background: #f7fafc; }
    .table .total-row td {
      background: #38a169;
      color: white;
      font-weight: 800;
      font-size: 12px;
      padding: 12px 15px;
    }
    .table .subtotal-row td {
      background: #edf2f7;
      font-weight: 700;
      font-size: 12px;
    }
    .rate-col { color: #38a169; font-weight: 700; }
    
    /* PRICE SUMMARY BOX */
    .price-box {
      background: linear-gradient(135deg, #1a365d 0%, #2d3748 100%);
      margin: 0 30px 20px;
      padding: 20px;
      color: white;
      border-radius: 8px;
    }
    .price-title {
      text-align: center;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #a0aec0;
      padding-bottom: 12px;
      border-bottom: 1px solid #4a5568;
      margin-bottom: 15px;
      font-weight: 600;
    }
    .price-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px dotted #4a5568;
    }
    .price-row:last-child { border-bottom: none; }
    .price-label { color: #a0aec0; font-size: 11px; }
    .price-value { font-weight: 600; font-size: 12px; }
    .price-row.total {
      background: linear-gradient(135deg, #d69e2e 0%, #ecc94b 100%);
      margin: 15px -20px -20px;
      padding: 15px 20px;
      display: flex;
      justify-content: space-between;
      border-radius: 0 0 8px 8px;
    }
    .price-row.total .price-label { color: #1a365d; font-size: 13px; font-weight: 800; }
    .price-row.total .price-value { color: #1a365d; font-size: 20px; font-weight: 900; }
    
    /* SIGNATURES */
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      padding: 0 30px 20px;
    }
    .sig-box {
      border: 2px dashed #cbd5e0;
      padding: 15px;
      text-align: center;
      border-radius: 8px;
      background: #fafbfc;
    }
    .sig-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #4a5568;
      margin-bottom: 10px;
      font-weight: 700;
    }
    .sig-line {
      height: 50px;
      border: 1px solid #e2e8f0;
      background: #fff;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }
    .sig-line img { max-width: 140px; max-height: 45px; }
    .sig-name { font-size: 11px; font-weight: 700; color: #1a365d; }
    
    /* SERVICE SCHEDULE */
    .schedule-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      padding: 0 30px 20px;
    }
    .schedule-card {
      background: white;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      text-align: center;
    }
    .schedule-card.completed { border-color: #38a169; background: #f0fff4; }
    .schedule-card.current { border-color: #ed8936; background: #fffaf0; box-shadow: 0 4px 12px rgba(237, 137, 54, 0.2); }
    .schedule-num { font-size: 18px; font-weight: 900; color: #1a365d; }
    .schedule-date { font-size: 10px; color: #4a5568; margin-top: 4px; }
    
    /* TERMS */
    .terms-box {
      background: #fffaf0;
      border: 1px solid #ed8936;
      border-radius: 8px;
      margin: 0 30px 20px;
      padding: 15px;
    }
    .terms-title { font-size: 11px; font-weight: 800; color: #c05621; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .terms-list { font-size: 10px; color: #4a5568; padding-left: 18px; }
    .terms-list li { margin: 3px 0; }
    
    /* FOOTER */
    .footer {
      background: #1a365d;
      padding: 15px 30px;
      text-align: center;
      color: #a0aec0;
    }
    .footer-text { font-size: 10px; color: #a0aec0; }
    .footer-text span { color: #fff; font-weight: 700; }
    
    .sep { height: 1px; background: #e2e8f0; margin: 0 30px 20px; }
    
    /* ATT DETAILS */
    .att-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
      margin-top: 10px;
    }
    .att-item {
      background: white;
      padding: 10px;
      border-radius: 6px;
      text-align: center;
      border: 1px solid #e2e8f0;
    }
    .att-item label { font-size: 8px; color: #718096; text-transform: uppercase; display: block; }
    .att-item span { font-size: 10px; font-weight: 600; color: #1a365d; }
    
    @media print {
      body { -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page">
    
    <!-- HEADER -->
    <div class="header">
      <div class="header-main">
        ${logo ? `<img src="${logo}" class="logo" />` : `<div class="logo-placeholder">SH</div>`}
        <div class="company-details">
          <div class="company-name">Safe Home Pestochem India Pvt. Ltd.</div>
          <div class="company-tagline">Professional Pest Control Services | ISO 9001:2015 Certified</div>
          <div class="company-address">Shop No. 123, Hazratganj, Lucknow, UP 226001 | Ph: 9876543210</div>
        </div>
        <div class="header-right">
          <div class="doc-type">Job Card</div>
          <div class="doc-number">${data.orderNo || '-'}</div>
        </div>
      </div>
      <div class="header-info">
        <div class="header-info-item">
          <span class="header-info-label">Branch</span>
          <span class="header-info-value">${data.branchId?.branchName || '-'}</span>
        </div>
        <div class="header-info-item">
          <span class="header-info-label">Service</span>
          <span class="header-info-value">${data.serviceType || 'AMC'}</span>
        </div>
        <div class="header-info-item">
          <span class="header-info-label">Category</span>
          <span class="header-info-value">${data.serviceCategory || 'Residential'}</span>
        </div>
        <div class="header-info-item">
          <span class="header-info-label">Status</span>
          <span class="header-info-value">${data.status || 'DRAFT'}</span>
        </div>
        <div class="header-info-item">
          <span class="header-info-label">Date</span>
          <span class="header-info-value">${formatDate(data.createdAt)}</span>
        </div>
      </div>
      <div class="header-bottom">
        <span class="service-type-badge">${data.serviceType || 'AMC'}</span>
        <span class="order-info">Generated: <strong>${new Date().toLocaleString('en-IN')}</strong></span>
      </div>
    </div>
    
    <!-- CUSTOMER & EXECUTIVE DETAILS -->
    <div class="details-row">
      <div class="detail-card">
        <div class="detail-card-header customer">
          <span>Customer Details</span>
          <span style="background:white;padding:4px 10px;border-radius:4px;font-size:9px;">${premises.type || 'Property'}</span>
        </div>
        <div class="detail-card-body">
          <div class="detail-name">${cust.title || ''} ${cust.name || '-'}</div>
          <div class="detail-row">
            <span class="detail-label">Phone</span>
            <span class="detail-value">${cust.phone || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Email</span>
            <span class="detail-value">${cust.email || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Address</span>
            <span class="detail-value">${cust.address || '-'}, ${cust.city || ''}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">GST No</span>
            <span class="detail-value">${cust.gstNo || 'N/A'}</span>
          </div>
        </div>
      </div>
      <div class="detail-card">
        <div class="detail-card-header executive">Assigned Executive</div>
        <div class="detail-card-body">
          <div class="detail-name">${data.employeeId?.name || executive.name || 'Not Assigned'}</div>
          <div class="detail-row">
            <span class="detail-label">Phone</span>
            <span class="detail-value">${data.employeeId?.phone || executive.phone || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Employee ID</span>
            <span class="detail-value">${data.employeeId?.employeeId || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Branch</span>
            <span class="detail-value">${data.branchId?.branchName || '-'}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- SCHEDULE & PREMISES -->
    <div class="details-row">
      <div class="detail-card">
        <div class="detail-card-header schedule">Service Schedule</div>
        <div class="detail-card-body">
          <div class="detail-row">
            <span class="detail-label">Schedule Type</span>
            <span class="detail-value">${schedule.type || data.serviceType || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">First Service Date</span>
            <span class="detail-value">${schedule.date ? formatDate(schedule.date) : '-'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Preferred Time</span>
            <span class="detail-value">${schedule.time || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Total Services</span>
            <span class="detail-value">${schedule.serviceCount || (schedule.period * (schedule.servicesPerMonth || 1))}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Interval</span>
            <span class="detail-value">${schedule.intervalDays || '30'} Days</span>
          </div>
        </div>
      </div>
      <div class="detail-card">
        <div class="detail-card-header premises">Premises Details</div>
        <div class="detail-card-body">
          <div class="detail-row">
            <span class="detail-label">Property Type</span>
            <span class="detail-value">${premises.type || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Total Area</span>
            <span class="detail-value">${formatNum(premises.totalArea || 0)} Sq.Ft.</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">No. of Floors</span>
            <span class="detail-value">${floors.length || 1}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- CONTRACT DETAILS -->
    ${hasAMC && contract ? `
    <div class="contract-box">
      <div class="contract-title">AMC Contract Details</div>
      <div class="contract-grid">
        <div class="contract-item">
          <label>Contract No</label>
          <span>${data.contractNo || contract.contractNo || 'Auto'}</span>
        </div>
        <div class="contract-item">
          <label>Period</label>
          <span>${contract.period || schedule.period || '12'} Months</span>
        </div>
        <div class="contract-item">
          <label>Services/Month</label>
          <span>${schedule.servicesPerMonth || '1'}</span>
        </div>
        <div class="contract-item">
          <label>Total Services</label>
          <span class="highlight">${schedule.serviceCount || (schedule.period * (schedule.servicesPerMonth || 1))}</span>
        </div>
        <div class="contract-item">
          <label>Start Date</label>
          <span>${formatDate(contract.startDate) || formatDate(data.schedule?.date) || '-'}</span>
        </div>
        <div class="contract-item">
          <label>End Date</label>
          <span>${formatDate(contract.endDate) || '-'}</span>
        </div>
        <div class="contract-item">
          <label>Warranty</label>
          <span>${contract.warranty || 'N/A'}</span>
        </div>
        <div class="contract-item">
          <label>Agreement Area</label>
          <span>${formatNum(contract.agreementArea || premises.totalArea || 0)} Sq.Ft.</span>
        </div>
      </div>
    </div>
    ` : ''}
    
    <!-- FLOOR DETAILS -->
    <div class="table-section">
      <div class="section-title">Floor Area Details</div>
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Floor</th>
            <th>Length (ft)</th>
            <th>Width (ft)</th>
            <th>Area (sqft)</th>
          </tr>
        </thead>
        <tbody>
          ${floors.length > 0 ? floors.map((f, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${f.label || `Floor ${i + 1}`}</td>
              <td>${formatNum(f.length)}</td>
              <td>${formatNum(f.width)}</td>
              <td>${formatNum(f.area)}</td>
            </tr>
          `).join('') : `
            <tr>
              <td>1</td>
              <td>Main Area</td>
              <td>-</td>
              <td>-</td>
              <td>${formatNum(premises.totalArea || 0)}</td>
            </tr>
          `}
          <tr class="total-row">
            <td colspan="4">TOTAL AREA</td>
            <td>${formatNum(premises.totalArea || 0)} Sq.Ft.</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <!-- AMC/GPC SERVICES -->
    ${hasAMC && amcServices.length > 0 ? `
    <div class="table-section">
      <div class="section-title">${isGPC ? 'GPC' : 'AMC'} Services - Pest Control</div>
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Service</th>
            <th>Rate/Sq.Ft.</th>
            <th>Area</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${amcServices.map((svc, i) => {
            const rate = serviceRates[svc] || data.ratePerSqft || 0;
            const amount = Math.ceil((premises.totalArea || 0) * rate);
            return `
            <tr>
              <td>${i + 1}</td>
              <td><strong>${svc}</strong></td>
              <td class="rate-col">${formatCurrency(rate)}</td>
              <td>${formatNum(premises.totalArea || 0)}</td>
              <td>${formatCurrency(amount)}</td>
            </tr>
          `}).join('')}
          <tr class="subtotal-row">
            <td colspan="4" style="text-align: right;">${isGPC ? 'GPC' : 'AMC'} Subtotal:</td>
            <td>${formatCurrency(areaAmount)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    ` : ''}
    
    <!-- ATT SERVICES -->
    ${hasATT && data.attDetails ? `
    <div class="table-section">
      <div class="section-title">ATT - Anti Termite Treatment</div>
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Treatment</th>
            <th>Rate/Sq.Ft.</th>
            <th>Area</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td><strong>${data.attDetails.constructionPhase || ''} - ${data.attDetails.treatmentType || 'Treatment'}</strong></td>
            <td class="rate-col">${formatCurrency(data.ratePerSqft || 0)}</td>
            <td>${formatNum(premises.totalArea || 0)}</td>
            <td>${formatCurrency(areaAmount)}</td>
          </tr>
        </tbody>
      </table>
      
      <div class="att-grid">
        <div class="att-item"><label>Phase</label><span>${data.attDetails.constructionPhase || '-'}</span></div>
        <div class="att-item"><label>Treatment</label><span>${data.attDetails.treatmentType || '-'}</span></div>
        <div class="att-item"><label>Chemical</label><span>${data.attDetails.chemical || '-'}</span></div>
        <div class="att-item"><label>Method</label><span>${data.attDetails.method || 'Drill'}</span></div>
        <div class="att-item"><label>Base</label><span>${data.attDetails.base || 'Water'}</span></div>
        <div class="att-item"><label>Warranty</label><span>${data.attDetails.warranty || '-'}</span></div>
      </div>
    </div>
    ` : ''}
    
    <!-- PRICE SUMMARY -->
    <div class="price-box">
      <div class="price-title">Price Summary</div>
      <div class="price-row">
        <span class="price-label">Total Area</span>
        <span class="price-value">${formatNum(premises.totalArea || 0)} Sq.Ft.</span>
      </div>
      <div class="price-row">
        <span class="price-label">Rate per Sq.Ft.</span>
        <span class="price-value">${formatCurrency(data.ratePerSqft || 0)}</span>
      </div>
      ${floorExtra > 0 ? `
      <div class="price-row">
        <span class="price-label">Extra Per Floor (${floors.length} × ${formatCurrency(data.perFloorExtra || 0)})</span>
        <span class="price-value">${formatCurrency(floorExtra)}</span>
      </div>
      ` : ''}
      <div class="price-row">
        <span class="price-label">Base Amount</span>
        <span class="price-value">${formatCurrency(Math.ceil(pricing.baseAmount || baseAmount))}</span>
      </div>
      <div class="price-row">
        <span class="price-label">GST (${pricing.gstPercent || 18}%)</span>
        <span class="price-value">+ ${formatCurrency(Math.ceil(pricing.gstAmount || 0))}</span>
      </div>
      ${(pricing.discountPercent || 0) > 0 ? `
      <div class="price-row">
        <span class="price-label">Discount (${pricing.discountPercent}%)</span>
        <span class="price-value" style="color: #fc8181;">- ${formatCurrency(Math.ceil(pricing.discountAmount || 0))}</span>
      </div>
      ` : ''}
      <div class="price-row total">
        <span class="price-label">TOTAL AMOUNT</span>
        <span class="price-value">${formatCurrency(Math.ceil(pricing.finalAmount || 0))}</span>
      </div>
    </div>
    
    <!-- SERVICE SCHEDULE GRID -->
    ${schedule.scheduledDates && schedule.scheduledDates.length > 0 && !isServicePdf ? `
    <div class="table-section">
      <div class="section-title">AMC Service Schedule (${schedule.scheduledDates.length} Services)</div>
      <div class="schedule-grid">
        ${schedule.scheduledDates.map((s, i) => `
          <div class="schedule-card ${i < (data.currentServiceNumber || 0) ? 'completed' : ''}">
            <div class="schedule-num">${i + 1}</div>
            <div class="schedule-date">${s.formatted || formatDate(s.date)}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}
    
    <!-- SIGNATURES -->
    <div class="signatures">
      <div class="sig-box">
        <span class="sig-label">Executive Signature</span>
        <div class="sig-line">
          ${data.signatures?.employeeSignature ? `<img src="${data.signatures.employeeSignature}" />` : ''}
        </div>
        <span class="sig-name">${data.employeeId?.name || executive.name || 'Executive'}</span>
      </div>
      <div class="sig-box">
        <span class="sig-label">Customer Signature</span>
        <div class="sig-line">
          ${data.signatures?.customerSignature ? `<img src="${data.signatures.customerSignature}" />` : ''}
        </div>
        <span class="sig-name">${cust.name || 'Customer'}</span>
      </div>
    </div>
    
    <!-- TERMS -->
    <div class="terms-box">
      <div class="terms-title">Terms & Conditions</div>
      <ul class="terms-list">
        <li>Service will be performed by our trained technicians using approved chemicals</li>
        <li>Customer should provide access to the premises at scheduled time</li>
        <li>Any additional services beyond AMC scope will be charged extra</li>
        <li>Payment should be made as per the agreed terms</li>
        <li>For complaints or queries, contact our customer care</li>
      </ul>
    </div>
    
    <!-- FOOTER -->
    <div class="footer">
      <div class="footer-text">
        Safe Home Pestochem India Pvt. Ltd. | ISO 9001:2015 Certified | www.safehomepest.com
      </div>
    </div>
    
  </div>
</body>
</html>
  `;
};

// ==========================================
// PDF GENERATION
// ==========================================
exports.generateJobCardPdf = async (formData) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    const html = generateJobCardHtml(formData);
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });
    
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
};

// ==========================================
// RECEIPT HTML TEMPLATE (MATCHING JOB CARD STYLE)
// ==========================================
const generateReceiptHtml = (data) => {
  const logo = getLogoBase64();
  const amc = data.amcId || {};
  const cust = {
    name: data.customerName || data.customer?.name || '-',
    phone: data.customerPhone || data.customer?.phone || '-',
    email: data.customerEmail || data.customer?.email || '-',
    address: data.customerAddress || data.customer?.address || '-',
    city: data.customer?.city || '-',
    gstNo: data.customerGstNo || data.customer?.gstNo || '-'
  };
  
  const floors = data.floors || data.premises?.floors || [];
  const premises = data.premises || {};
  const pricing = data.pricing || {};
  
  const hasAMC = data.serviceType === 'AMC' || data.serviceType === 'GPC' || data.serviceType === 'BOTH';
  const hasATT = data.serviceType === 'ATT' || data.serviceType === 'BOTH';
  const isGPC = data.serviceType === 'GPC';
  
  const totalArea = data.totalArea || premises.totalArea || floors.reduce((sum, f) => sum + (f.area || 0), 0);
  const amountReceived = data.amount || data.advancePaid || data.paidAmount || 0;
  const totalAmount = pricing.finalAmount || data.totalAmount || 0;
  const balanceDue = totalAmount - amountReceived;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Payment Receipt</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; 
      font-size: 11px; 
      color: #1a202c; 
      line-height: 1.5; 
      background: #fff;
    }
    
    .page { max-width: 800px; margin: 0 auto; }
    
    /* HEADER - CLEAN & PROFESSIONAL */
    .header {
      background: linear-gradient(135deg, #1a365d 0%, #2d3748 100%);
      color: white;
      padding: 0;
      position: relative;
    }
    .header-main {
      display: flex;
      align-items: center;
      padding: 20px 30px;
      gap: 20px;
    }
    .logo {
      width: 90px;
      height: 90px;
      object-fit: cover;
      border-radius: 10px;
      border: 3px solid rgba(255,255,255,0.2);
      flex-shrink: 0;
    }
    .logo-placeholder {
      width: 90px;
      height: 90px;
      background: linear-gradient(135deg, #38a169 0%, #2f855a 100%);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      font-weight: 900;
      color: white;
      flex-shrink: 0;
    }
    .company-details {
      flex: 1;
    }
    .company-name {
      font-size: 24px;
      font-weight: 900;
      color: #fff;
      letter-spacing: 0.5px;
    }
    .company-tagline {
      font-size: 11px;
      color: #a0aec0;
      margin-top: 4px;
    }
    .company-address {
      font-size: 10px;
      color: #a0aec0;
      margin-top: 6px;
    }
    .header-right {
      text-align: right;
    }
    .doc-type {
      background: #38a169;
      color: white;
      padding: 8px 20px;
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 2px;
      display: inline-block;
      border-radius: 4px;
    }
    .doc-number {
      font-size: 12px;
      color: #e2e8f0;
      margin-top: 8px;
    }
    .header-info {
      background: rgba(255,255,255,0.05);
      border-top: 1px solid rgba(255,255,255,0.1);
      padding: 12px 30px;
      display: flex;
      gap: 30px;
      flex-wrap: wrap;
    }
    .header-info-item {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .header-info-label {
      font-size: 9px;
      color: #a0aec0;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .header-info-value {
      font-size: 12px;
      font-weight: 700;
      color: #fff;
    }
    .header-bottom {
      background: #38a169;
      padding: 10px 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .receipt-badge {
      background: white;
      color: #1a365d;
      padding: 6px 16px;
      font-size: 11px;
      font-weight: 800;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .order-info {
      color: white;
      font-size: 11px;
    }
    .order-info strong {
      color: #68d391;
    }
    
    /* DETAILS SECTIONS */
    .details-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      padding: 20px 30px;
    }
    .detail-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    .detail-card-header {
      padding: 12px 15px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .detail-card-header.customer { background: #ebf8ff; color: #2b6cb0; }
    .detail-card-header.payment { background: #f0fff4; color: #276749; }
    .detail-card-header.company { background: #faf5ff; color: #6b46c1; }
    .detail-card-body {
      padding: 15px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px dotted #e2e8f0;
    }
    .detail-row:last-child { border-bottom: none; }
    .detail-label {
      font-size: 10px;
      color: #718096;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .detail-value {
      font-size: 12px;
      font-weight: 600;
      color: #1a202c;
      text-align: right;
    }
    .detail-name {
      font-size: 16px;
      font-weight: 800;
      color: #1a365d;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e2e8f0;
    }
    
    /* PAYMENT SUMMARY BOX */
    .payment-box {
      background: linear-gradient(135deg, #1a365d 0%, #2d3748 100%);
      margin: 0 30px 20px;
      padding: 20px;
      color: white;
      border-radius: 8px;
    }
    .payment-title {
      text-align: center;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #a0aec0;
      padding-bottom: 12px;
      border-bottom: 1px solid #4a5568;
      margin-bottom: 15px;
      font-weight: 600;
    }
    .payment-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px dotted #4a5568;
    }
    .payment-row:last-child { border-bottom: none; }
    .payment-label { color: #a0aec0; font-size: 11px; }
    .payment-value { font-weight: 600; font-size: 12px; }
    .payment-row.total {
      background: linear-gradient(135deg, #d69e2e 0%, #ecc94b 100%);
      margin: 15px -20px -20px;
      padding: 15px 20px;
      display: flex;
      justify-content: space-between;
      border-radius: 0 0 8px 8px;
    }
    .payment-row.total .payment-label { color: #1a365d; font-size: 13px; font-weight: 800; }
    .payment-row.total .payment-value { color: #1a365d; font-size: 20px; font-weight: 900; }
    .payment-row.due .payment-label { color: #fc8181; }
    .payment-row.due .payment-value { color: #fc8181; font-weight: 800; }
    
    /* AMOUNT DISPLAY */
    .amount-display {
      text-align: center;
      padding: 30px;
    }
    .amount-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #718096;
      margin-bottom: 10px;
    }
    .amount-value {
      font-size: 48px;
      font-weight: 900;
      color: #1a365d;
    }
    .amount-in-words {
      font-size: 14px;
      color: #4a5568;
      margin-top: 10px;
      font-style: italic;
    }
    
    /* PAYMENT MODE BOX */
    .payment-mode-box {
      background: #f0fff4;
      border: 2px solid #38a169;
      border-radius: 8px;
      margin: 0 30px 20px;
      padding: 15px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .payment-mode-info {
      display: flex;
      gap: 30px;
    }
    .payment-mode-item {
      text-align: center;
    }
    .payment-mode-item label {
      font-size: 9px;
      color: #276749;
      text-transform: uppercase;
      display: block;
      margin-bottom: 4px;
    }
    .payment-mode-item span {
      font-size: 13px;
      font-weight: 700;
      color: #1a365d;
    }
    
    /* FOOTER */
    .footer {
      background: #1a365d;
      padding: 15px 30px;
      text-align: center;
      color: #a0aec0;
    }
    .footer-text { font-size: 10px; color: #a0aec0; }
    .footer-text span { color: #fff; font-weight: 700; }
    
    .sep { height: 1px; background: #e2e8f0; margin: 0 30px 20px; }
    
    @media print {
      body { -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page">
    
    <!-- HEADER -->
    <div class="header">
      <div class="header-main">
        ${logo ? `<img src="${logo}" class="logo" />` : `<div class="logo-placeholder">SH</div>`}
        <div class="company-details">
          <div class="company-name">Safe Home Pestochem India Pvt. Ltd.</div>
          <div class="company-tagline">Professional Pest Control Services | ISO 9001:2015 Certified</div>
          <div class="company-address">Shop No. 123, Hazratganj, Lucknow, UP 226001 | Ph: 9876543210</div>
        </div>
        <div class="header-right">
          <div class="doc-type">Receipt</div>
          <div class="doc-number">${amc.receiptNo || data.receiptNo || '-'}</div>
        </div>
      </div>
      <div class="header-info">
        <div class="header-info-item">
          <span class="header-info-label">Branch</span>
          <span class="header-info-value">${data.branchId?.branchName || '-'}</span>
        </div>
        <div class="header-info-item">
          <span class="header-info-label">Service</span>
          <span class="header-info-value">${data.serviceType || 'AMC'}</span>
        </div>
        <div class="header-info-item">
          <span class="header-info-label">Date</span>
          <span class="header-info-value">${formatDate(data.receiptDate || data.date || new Date())}</span>
        </div>
      </div>
      <div class="header-bottom">
        <span class="receipt-badge">Payment Receipt</span>
        <span class="order-info">Generated: <strong>${new Date().toLocaleString('en-IN')}</strong></span>
      </div>
    </div>
    
    <!-- CUSTOMER & COMPANY DETAILS -->
    <div class="details-row">
      <div class="detail-card">
        <div class="detail-card-header customer">Customer Details</div>
        <div class="detail-card-body">
          <div class="detail-name">${cust.name}</div>
          <div class="detail-row">
            <span class="detail-label">Phone</span>
            <span class="detail-value">${cust.phone}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Email</span>
            <span class="detail-value">${cust.email || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Address</span>
            <span class="detail-value">${cust.address || '-'}, ${cust.city || ''}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">GST No</span>
            <span class="detail-value">${cust.gstNo || 'N/A'}</span>
          </div>
        </div>
      </div>
      <div class="detail-card">
        <div class="detail-card-header company">Payment Details</div>
        <div class="detail-card-body">
          <div class="detail-row">
            <span class="detail-label">Order No</span>
            <span class="detail-value">${data.orderNo || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Contract No</span>
            <span class="detail-value">${data.contractNo || amc.contractNo || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Total Amount</span>
            <span class="detail-value">${formatCurrency(totalAmount)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Amount Paid</span>
            <span class="detail-value" style="color: #38a169;">${formatCurrency(amountReceived)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Balance Due</span>
            <span class="detail-value" style="color: ${balanceDue > 0 ? '#e53e3e' : '#38a169'};">${formatCurrency(balanceDue)}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- AMOUNT DISPLAY -->
    <div class="amount-display">
      <div class="amount-label">Amount Received</div>
      <div class="amount-value">${formatCurrency(amountReceived)}</div>
    </div>
    
    <!-- PAYMENT MODE -->
    <div class="payment-mode-box">
      <div class="payment-mode-info">
        <div class="payment-mode-item">
          <label>Payment Mode</label>
          <span>${data.paymentMode || 'CASH'}</span>
        </div>
        ${data.transactionId || data.transactionNo ? `
        <div class="payment-mode-item">
          <label>Transaction ID</label>
          <span>${data.transactionId || data.transactionNo}</span>
        </div>
        ` : ''}
        ${data.chequeNo ? `
        <div class="payment-mode-item">
          <label>Cheque No</label>
          <span>${data.chequeNo}</span>
        </div>
        ` : ''}
      </div>
    </div>
    
    <!-- PAYMENT SUMMARY -->
    <div class="payment-box">
      <div class="payment-title">Payment Summary</div>
      <div class="payment-row">
        <span class="payment-label">Total Contract Value</span>
        <span class="payment-value">${formatCurrency(totalAmount)}</span>
      </div>
      <div class="payment-row">
        <span class="payment-label">Previous Payments</span>
        <span class="payment-value">${formatCurrency(totalAmount - amountReceived - balanceDue)}</span>
      </div>
      <div class="payment-row">
        <span class="payment-label">Current Payment</span>
        <span class="payment-value" style="color: #68d391;">+ ${formatCurrency(amountReceived)}</span>
      </div>
      ${balanceDue > 0 ? `
      <div class="payment-row due">
        <span class="payment-label">Balance Due</span>
        <span class="payment-value">${formatCurrency(balanceDue)}</span>
      </div>
      ` : `
      <div class="payment-row" style="background: #f0fff4; margin: 10px -20px -20px; padding: 15px 20px; border-radius: 0 0 8px 8px;">
        <span class="payment-label" style="color: #276749; font-weight: 800;">PAYMENT COMPLETE</span>
        <span class="payment-value" style="color: #276749; font-weight: 800;">Thank You!</span>
      </div>
      `}
      <div class="payment-row total">
        <span class="payment-label">TOTAL PAID</span>
        <span class="payment-value">${formatCurrency(amountReceived)}</span>
      </div>
    </div>
    
    <!-- FOOTER -->
    <div class="footer">
      <div class="footer-text">
        Safe Home Pestochem India Pvt. Ltd. | ISO 9001:2015 Certified | www.safehomepest.com
      </div>
    </div>
    
  </div>
</body>
</html>
  `;
};

// ==========================================
// RECEIPT PDF GENERATION
// ==========================================
exports.generateReceiptPdf = async (data) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    const html = generateReceiptHtml(data);
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });
    
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
};

// ==========================================
// SERVICE PDF (AMC Individual Service)
// ==========================================
exports.generateServicePdf = async (formData) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    const html = generateJobCardHtml(formData);
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });
    
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
};

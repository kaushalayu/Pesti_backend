const mongoose = require('mongoose');
require('dotenv').config();
const puppeteer = require('puppeteer');
const Receipt = require('./src/models/Receipt');
const ServiceForm = require('./src/models/ServiceForm');
const Branch = require('./src/models/Branch');
const User = require('./src/models/User');
const CompanySettings = require('./src/models/CompanySettings');
const fs = require('fs');
const path = require('path');

const getCompanySettings = async () => {
  let settings = await CompanySettings.findOne();
  if (!settings) {
    settings = await CompanySettings.create({});
  }
  return settings;
};

const getLogoHtml = async (settings) => {
  if (settings.logo) {
    return `<img src="${settings.logo}" style="width:65px;height:65px;border-radius:6px;object-fit:contain;background:white;padding:4px;">`;
  }
  const LOGO_PATH = path.join(__dirname, '../pest/public/logo.jpg');
  try {
    if (fs.existsSync(LOGO_PATH)) {
      const imgBuffer = fs.readFileSync(LOGO_PATH);
      return `<img src="data:image/jpeg;base64,${imgBuffer.toString('base64')}" style="width:65px;height:65px;border-radius:6px;object-fit:contain;background:white;padding:4px;">`;
    }
  } catch (e) { }
  return '';
};

const generatePdfs = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/pestiside');
  console.log('Connected');

  // Get company settings
  const settings = await getCompanySettings();
  const logoHtml = await getLogoHtml(settings);
  
  const companyInfo = {
    name: settings.companyName || 'SAFE HOME PESTOCHEM INDIA PVT. LTD.',
    email: settings.email || 'enquiry@safehomepestochem.in',
    phone: settings.phone || '25709',
    website: settings.website || 'www.safehomepestochem.com',
    headOffice: settings.headOffice?.address || '',
    regionalOffice: settings.regionalOffice?.address || '',
    cin: settings.cinNo || '',
    tan: settings.tanNo || '',
    pan: settings.panNo || '',
    gst: settings.gstNo || ''
  };

  console.log('Using company settings:', companyInfo.name);

  const receipt = await Receipt.findOne().populate('branchId').populate('employeeId', 'name employeeId');
  if (receipt) {
    const employeeInfo = receipt.employeeId ? `${receipt.employeeId.name} (${receipt.employeeId.employeeId})` : '-';
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt</title><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; }
    .header { background: #0d7a4a; color: white; padding: 20px; display: flex; gap: 20px; align-items: center; }
    .company-info h1 { font-size: 18px; margin-bottom: 4px; }
    .company-info p { font-size: 10px; opacity: 0.9; }
    .title-bar { background: #e8f5ec; padding: 12px 20px; display: flex; justify-content: space-between; border-bottom: 2px solid #0d7a4a; }
    .title-bar h2 { color: #0d7a4a; font-size: 16px; }
    .section { padding: 15px 20px; border-bottom: 1px solid #eee; }
    .section-title { font-size: 11px; font-weight: bold; color: #0d7a4a; text-transform: uppercase; margin-bottom: 12px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    .info-box { background: #f8f9fa; padding: 10px; border-radius: 4px; border-left: 3px solid #0d7a4a; }
    .info-label { font-size: 9px; color: #888; text-transform: uppercase; margin-bottom: 3px; }
    .info-value { font-size: 12px; font-weight: bold; }
    .pricing-box { background: linear-gradient(135deg, #0d7a4a, #0a5c39); color: white; padding: 20px; border-radius: 8px; }
    .pricing-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed rgba(255,255,255,0.3); }
    .pricing-total { display: flex; justify-content: space-between; padding-top: 12px; margin-top: 8px; border-top: 2px solid white; font-size: 14px; font-weight: bold; }
    .footer { background: #1a1a1a; color: white; padding: 15px; text-align: center; font-size: 9px; margin-top: 20px; }
    .terms-page { page-break-before: always; padding: 40px 30px; }
    .terms-title { font-size: 18px; font-weight: bold; color: #0d7a4a; text-transform: uppercase; text-align: center; margin-bottom: 20px; }
    .terms-list { font-size: 10px; padding-left: 20px; line-height: 1.8; }
    .terms-list li { margin-bottom: 8px; }
  </style></head><body>
  <div style="max-width:750px;margin:0 auto;">
    <div class="header">
      ${logoHtml ? `<div>${logoHtml}</div>` : ''}
      <div class="company-info">
        <h1>${companyInfo.name}</h1>
        <p>Professional Pest Control Services | ISO 9001:2015 Certified</p>
        <p style="font-size:9px;margin-top:4px;">Head Office: ${companyInfo.headOffice}</p>
        <p style="font-size:9px;">Regional Office: ${companyInfo.regionalOffice}</p>
        <p style="font-size:9px;">${companyInfo.website} | ${companyInfo.email} | Ph: ${companyInfo.phone}</p>
        <p style="font-size:8px;">CIN: ${companyInfo.cin} | TAN: ${companyInfo.tan} | PAN: ${companyInfo.pan}</p>
      </div>
    </div>
    <div class="title-bar">
      <h2>PAYMENT RECEIPT</h2>
      <div><strong>${receipt.receiptNo}</strong></div>
    </div>
    <div class="section">
      <div class="section-title">Receipt Details</div>
      <div class="grid-3">
        <div class="info-box"><div class="info-label">Date</div><div class="info-value">${receipt.paymentDate ? new Date(receipt.paymentDate).toLocaleDateString('en-IN') : '-'}</div></div>
        <div class="info-box"><div class="info-label">Service Type</div><div class="info-value">${receipt.serviceType || '-'}</div></div>
        <div class="info-box"><div class="info-label">Generated By</div><div class="info-value">${employeeInfo}</div></div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Customer Information</div>
      <div class="grid-2">
        <div class="info-box"><div class="info-label">Name</div><div class="info-value">${receipt.customerName || '-'}</div></div>
        <div class="info-box"><div class="info-label">Phone</div><div class="info-value">${receipt.customerPhone || '-'}</div></div>
      </div>
    </div>
    <div class="pricing-box">
      <div style="text-align:center;margin-bottom:15px;">
        <div style="font-size:11px;opacity:0.9;">Amount Received</div>
        <div style="font-size:28px;font-weight:bold;">₹${(receipt.advancePaid || 0).toLocaleString('en-IN')}</div>
      </div>
      <div class="pricing-row"><span>Total Amount</span><span>₹${(receipt.totalAmount || 0).toLocaleString('en-IN')}</span></div>
      <div class="pricing-row"><span>Paid Amount</span><span>₹${(receipt.advancePaid || 0).toLocaleString('en-IN')}</span></div>
      <div class="pricing-row"><span>Balance Due</span><span>₹${(receipt.balanceDue || 0).toLocaleString('en-IN')}</span></div>
      <div class="pricing-total"><span>STATUS</span><span>${(receipt.balanceDue || 0) <= 0 ? 'PAID' : 'PARTIALLY PAID'}</span></div>
    </div>
    
    <div class="terms-page">
      <div class="terms-title">Terms & Conditions</div>
      <ol class="terms-list">
        <li><strong>Service Coverage:</strong> Services limited to treatment areas specified in job card.</li>
        <li><strong>Warranty:</strong> Valid for period specified in contract. Does not cover new infestations.</li>
        <li><strong>Service Scheduling:</strong> If customer reschedules >2 times, ₹500 recall charge.</li>
        <li><strong>Payment Terms:</strong> Outstanding payments may result in service suspension.</li>
        <li><strong>Liability:</strong> Limited to service fee paid.</li>
        <li><strong>Cancellation:</strong> Cancel 24 hours before scheduled time.</li>
        <li><strong>Customer Responsibility:</strong> Provide access to all areas requiring treatment.</li>
        <li><strong>Post-Treatment:</strong> Follow instructions for effective results.</li>
        <li><strong>Dispute Resolution:</strong> Subject to jurisdiction of branch city courts.</li>
        <li><strong>Agreement:</strong> By accepting, customer agrees to all terms.</li>
      </ol>
    </div>
    
    <div class="footer">
      <p>${companyInfo.name} | ISO 9001:2015 Certified</p>
    </div>
  </div></body></html>`;

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
    await browser.close();
    fs.writeFileSync('receipt_dynamic.pdf', pdf);
    console.log('Receipt PDF: receipt_dynamic.pdf');
  }

  const form = await ServiceForm.findOne().populate('employeeId', 'name employeeId');
  if (form) {
    const employeeInfo = form.employeeId ? `${form.employeeId.name} (${form.employeeId.employeeId})` : '-';
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Job Card</title><style>
    * { margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; }
    .header { background: #0d7a4a; color: white; padding: 20px; display: flex; gap: 20px; align-items: center; }
    .company-info h1 { font-size: 18px; margin-bottom: 4px; }
    .title-bar { background: #e8f5ec; padding: 12px 20px; display: flex; justify-content: space-between; border-bottom: 2px solid #0d7a4a; }
    .title-bar h2 { color: #0d7a4a; font-size: 16px; }
    .section { padding: 15px 20px; border-bottom: 1px solid #eee; }
    .section-title { font-size: 11px; font-weight: bold; color: #0d7a4a; text-transform: uppercase; margin-bottom: 12px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .info-box { background: #f8f9fa; padding: 10px; border-radius: 4px; border-left: 3px solid #0d7a4a; }
    .info-label { font-size: 9px; color: #888; text-transform: uppercase; }
    .info-value { font-size: 12px; font-weight: bold; }
    .pricing-box { background: linear-gradient(135deg, #0d7a4a, #0a5c39); color: white; padding: 20px; border-radius: 8px; }
    .footer { background: #1a1a1a; color: white; padding: 15px; text-align: center; font-size: 9px; margin-top: 20px; }
    .terms-page { page-break-before: always; padding: 40px 30px; }
    .terms-title { font-size: 18px; font-weight: bold; color: #0d7a4a; text-transform: uppercase; text-align: center; margin-bottom: 20px; }
    .terms-list { font-size: 10px; padding-left: 20px; line-height: 1.8; }
    .terms-list li { margin-bottom: 8px; }
  </style></head><body>
  <div style="max-width:750px;margin:0 auto;">
    <div class="header">
      ${logoHtml ? `<div><img src="${logoHtml.replace('src="', 'src="')}" style="width:65px;height:65px;border-radius:6px;"></div>` : ''}
      <div class="company-info">
        <h1>${companyInfo.name}</h1>
        <p style="font-size:10px;">Professional Pest Control Services | ISO 9001:2015 Certified</p>
        <p style="font-size:9px;">Head Office: ${companyInfo.headOffice}</p>
        <p style="font-size:9px;">Regional Office: ${companyInfo.regionalOffice}</p>
        <p style="font-size:9px;">${companyInfo.website} | ${companyInfo.email} | Ph: ${companyInfo.phone}</p>
      </div>
    </div>
    <div class="title-bar">
      <h2>SERVICE JOB CARD</h2>
      <div><strong>${form.orderNo}</strong></div>
    </div>
    <div class="section">
      <div class="section-title">Customer Information</div>
      <div class="grid-2">
        <div class="info-box"><div class="info-label">Name</div><div class="info-value">${form.customer?.name || '-'}</div></div>
        <div class="info-box"><div class="info-label">Phone</div><div class="info-value">${form.customer?.phone || '-'}</div></div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Service Details</div>
      <div class="grid-2">
        <div class="info-box"><div class="info-label">Service Type</div><div class="info-value">${form.serviceType || '-'}</div></div>
        <div class="info-box"><div class="info-label">Created By</div><div class="info-value">${employeeInfo}</div></div>
        <div class="info-box"><div class="info-label">Total Area</div><div class="info-value">${form.premises?.totalArea || 0} sq.ft.</div></div>
      </div>
    </div>
    <div class="pricing-box">
      <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Base Amount</span><span>₹${(form.pricing?.baseAmount || 0).toLocaleString('en-IN')}</span></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>GST</span><span>₹${(form.pricing?.gstAmount || 0).toLocaleString('en-IN')}</span></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0 0 0;border-top:1px solid white;font-weight:bold;"><span>Total</span><span>₹${(form.pricing?.finalAmount || 0).toLocaleString('en-IN')}</span></div>
    </div>
    
    <div class="terms-page">
      <div class="terms-title">Terms & Conditions - ${form.serviceType}</div>
      <ol class="terms-list">
        <li><strong>Service Coverage:</strong> Services limited to treatment areas in job card.</li>
        <li><strong>Warranty:</strong> Valid for contract period. Does not cover new infestations.</li>
        <li><strong>Service Scheduling:</strong> If reschedule >2 times, ₹500 charge.</li>
        <li><strong>Payment:</strong> Outstanding may cause suspension.</li>
        <li><strong>Liability:</strong> Limited to service fee.</li>
        <li><strong>Post-Treatment:</strong> Follow technician instructions.</li>
      </ol>
    </div>
    
    <div class="footer">
      <p>${companyInfo.name} | ISO 9001:2015 Certified</p>
    </div>
  </div></body></html>`;

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
    await browser.close();
    fs.writeFileSync('jobcard_dynamic.pdf', pdf);
    console.log('Job Card PDF: jobcard_dynamic.pdf');
  }

  console.log('\nDone! All PDFs generated with dynamic company settings.');
  process.exit(0);
};

generatePdfs();

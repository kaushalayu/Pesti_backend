const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const LOGO_PATH = path.join(__dirname, '../../pest/public/logo.jpg');
const getLogo = () => {
  try {
    if (fs.existsSync(LOGO_PATH)) {
      return fs.readFileSync(LOGO_PATH);
    }
  } catch (e) {}
  return null;
};

const BRAND_COLOR = '#059669';
const BRAND_LIGHT = '#d1fae5';
const ATT_COLOR = '#2563eb';
const ATT_LIGHT = '#dbeafe';
const DARK = '#1e293b';
const GRAY = '#64748b';
const LIGHT_GRAY = '#f1f5f9';

const formatCurrency = (num) => {
  if (!num && num !== 0) return 'Rs. 0.00';
  return 'Rs. ' + Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatNum = (num) => {
  if (!num && num !== 0) return '0';
  return Number(num).toLocaleString('en-IN');
};

const formatDate = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 50;
const CONTENT_W = PAGE_W - (MARGIN * 2);

const checkPage = (doc, y, need = 120) => {
  if (y > PAGE_H - need) {
    doc.addPage();
    return MARGIN + 10;
  }
  return y;
};

const drawLogoHeader = (doc) => {
  const logo = getLogo();
  let y = MARGIN;
  
  if (logo) {
    doc.image(logo, MARGIN, y, { width: 45, height: 45 });
    doc.fontSize(14).font('Helvetica-Bold').fillColor(DARK)
      .text('SAFE HOME PESTOCHEM INDIA PVT. LTD.', MARGIN + 55, y + 5, { width: CONTENT_W - 55 });
    doc.fontSize(7).font('Helvetica').fillColor(GRAY)
      .text('ISO 9001:2015 Certified Company', MARGIN + 55, y + 22);
  } else {
    doc.fontSize(14).font('Helvetica-Bold').fillColor(DARK)
      .text('SAFE HOME PESTOCHEM INDIA PVT. LTD.', MARGIN, y, { width: CONTENT_W });
    doc.fontSize(7).font('Helvetica').fillColor(GRAY)
      .text('ISO 9001:2015 Certified Company', MARGIN, y + 18);
  }
  
  return y + 55;
};

const drawTitle = (doc, y, title, color = BRAND_COLOR) => {
  y += 5;
  doc.fontSize(12).font('Helvetica-Bold').fillColor(color)
    .text(title, MARGIN, y, { width: CONTENT_W, align: 'center' });
  y += 18;
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(color).lineWidth(1.5).stroke();
  return y + 12;
};

const drawSectionHeader = (doc, y, title, color = BRAND_COLOR) => {
  doc.fontSize(9).font('Helvetica-Bold').fillColor(color).text(title, MARGIN, y);
  return y + 5;
};

const drawHR = (doc, y, color = '#e2e8f0') => {
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(color).lineWidth(0.5).stroke();
  return y;
};

const drawLabelValue = (doc, y, label, value, x1 = MARGIN, x2 = 150) => {
  doc.fontSize(8).font('Helvetica').fillColor(GRAY).text(label + ':', x1, y);
  doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK).text(String(value || '-'), x2, y);
  return y + 13;
};

const drawTwoColumns = (doc, y, items) => {
  const colW = CONTENT_W / 2;
  items.forEach((item, i) => {
    const x1 = MARGIN + (i % 2) * colW;
    const x2 = x1 + 85;
    doc.fontSize(8).font('Helvetica').fillColor(GRAY).text(item.label + ':', x1, y);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK).text(String(item.value || '-'), x2, y);
    if (i % 2 === 1) y += 13;
  });
  if (items.length % 2 === 1) y += 13;
  return y;
};

const drawBox = (doc, y, items, bgColor = LIGHT_GRAY) => {
  doc.rect(MARGIN, y, CONTENT_W, items.length * 13 + 16).fillAndStroke(bgColor, '#e2e8f0');
  let yy = y + 8;
  items.forEach((item, i) => {
    const x1 = MARGIN + 10;
    doc.fontSize(8).font('Helvetica').fillColor(GRAY).text(item.label + ':', x1, yy);
    doc.fontSize(8).font(item.bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(item.color || DARK).text(String(item.value || '-'), x1 + 85, yy);
    if ((i + 1) % 2 === 0 || i === items.length - 1) yy += 13;
  });
  return y + items.length * 13 + 20;
};

const drawTable = (doc, y, headers, rows, colWidths) => {
  const numCols = headers.length;
  if (!colWidths) {
    const equalW = CONTENT_W / numCols;
    colWidths = headers.map(() => equalW);
  }
  
  let x = MARGIN;
  doc.fontSize(7).font('Helvetica-Bold').fillColor(GRAY);
  headers.forEach((h, i) => {
    doc.text(h, x, y, { width: colWidths[i], align: i === 0 ? 'left' : 'right' });
    x += colWidths[i];
  });
  y += 14;
  
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor('#e2e8f0').lineWidth(0.3).stroke();
  y += 6;
  
  doc.fontSize(8).font('Helvetica').fillColor(DARK);
  rows.forEach(row => {
    x = MARGIN;
    row.forEach((cell, i) => {
      doc.text(String(cell || '-'), x, y, { width: colWidths[i], align: i === 0 ? 'left' : 'right' });
      x += colWidths[i];
    });
    y += 13;
  });
  
  return y + 5;
};

const drawSignature = (doc, y) => {
  y += 10;
  doc.fontSize(7).font('Helvetica').fillColor(GRAY)
    .text('Executive Signature', MARGIN + 30, y, { width: 120, align: 'center' })
    .text('Customer Signature', PAGE_W - MARGIN - 150, y, { width: 120, align: 'center' });
  y += 5;
  doc.rect(MARGIN + 20, y, 120, 35).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
  doc.rect(PAGE_W - MARGIN - 140, y, 120, 35).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
  return y + 50;
};

const drawFooter = (doc, y) => {
  doc.fontSize(7).font('Helvetica').fillColor(GRAY)
    .text('This is a computer-generated document.', MARGIN, y, { width: CONTENT_W, align: 'center' })
    .text('Generated on: ' + new Date().toLocaleString('en-IN'), MARGIN, y + 10, { width: CONTENT_W, align: 'center' });
};

const drawPageNumbers = (doc) => {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).fillColor(GRAY)
      .text('Page ' + (i + 1) + ' of ' + range.count, MARGIN, PAGE_H - 30, { width: CONTENT_W, align: 'center' });
  }
};

// ==========================================
// RECEIPT PDF GENERATION
// ==========================================
exports.generateReceiptPdf = async (receiptDoc) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      let y = drawLogoHeader(doc);
      y = drawTitle(doc, y, 'PAYMENT RECEIPT / INVOICE');

      // Receipt Info
      y = drawSectionHeader(doc, y, 'Receipt Information');
      y = drawHR(doc, y) + 8;
      y = drawTwoColumns(doc, y, [
        { label: 'Receipt No', value: receiptDoc.receiptNo },
        { label: 'Date', value: formatDate(receiptDoc.paymentDate) },
        { label: 'Service Type', value: receiptDoc.serviceType },
        { label: 'Status', value: receiptDoc.status },
        { label: 'Branch', value: receiptDoc.branchId?.branchName || '-' }
      ]);

      // Customer Info
      y = drawSectionHeader(doc, y, 'Customer Information');
      y = drawHR(doc, y) + 8;
      y = drawTwoColumns(doc, y, [
        { label: 'Name', value: receiptDoc.customerName },
        { label: 'Phone', value: receiptDoc.customerPhone },
        { label: 'Email', value: receiptDoc.customerEmail || '-' },
        { label: 'GST No', value: receiptDoc.customerGstNo || '-' }
      ]);
      y = drawLabelValue(doc, y, 'Address', receiptDoc.customerAddress || '-');

      // Floor Details
      if (receiptDoc.floors && receiptDoc.floors.length > 0) {
        y = checkPage(doc, y, 100);
        y = drawSectionHeader(doc, y, 'Floor Wise Area Details');
        y = drawHR(doc, y) + 8;
        
        const headers = ['Floor', 'Length (ft)', 'Width (ft)', 'Area (sqft)'];
        const colWidths = [150, 120, 120, 150];
        const rows = receiptDoc.floors.map(f => [f.label || 'Floor', formatNum(f.length), formatNum(f.width), formatNum(f.area)]);
        
        y = drawTable(doc, y, headers, rows, colWidths);
        
        let totalArea = receiptDoc.floors.reduce((sum, f) => sum + (f.area || 0), 0);
        doc.fontSize(9).font('Helvetica-Bold').fillColor(BRAND_COLOR)
          .text('TOTAL AREA:', MARGIN, y, { width: 150 })
          .text(formatNum(totalArea) + ' Sq.Ft.', PAGE_W - MARGIN - 150, y, { width: 150, align: 'right' });
        y += 20;
      }

      // AMC Section
      if (receiptDoc.serviceType === 'AMC' || receiptDoc.serviceType === 'BOTH') {
        y = checkPage(doc, y, 150);
        y = drawSectionHeader(doc, y, 'AMC Services (Pest Control)', BRAND_COLOR);
        y = drawHR(doc, y, BRAND_COLOR) + 8;
        
        // Contract Details
        if (receiptDoc.amcId && receiptDoc.amcId.contractNo) {
          const amc = receiptDoc.amcId;
          y = drawTwoColumns(doc, y, [
            { label: 'Contract No', value: amc.contractNo },
            { label: 'Status', value: amc.status || 'ACTIVE', color: BRAND_COLOR, bold: true },
            { label: 'Start Date', value: formatDate(amc.startDate) },
            { label: 'End Date', value: formatDate(amc.endDate) }
          ]);
          if (amc.servicesIncluded && amc.servicesIncluded.length > 0) {
            doc.fontSize(8).font('Helvetica').fillColor(GRAY).text('Services:', MARGIN, y);
            y += 13;
            doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK)
              .text(amc.servicesIncluded.join(', '), MARGIN + 85, y - 13);
          }
        }
        
        // Rate & Amount
        y += 5;
        y = drawBox(doc, y, [
          { label: 'Total Area', value: formatNum(receiptDoc.totalArea || 0) + ' Sq.Ft.' },
          { label: 'Rate per Sq.Ft.', value: formatCurrency(receiptDoc.amcRatePerSqft || 0) },
          { label: 'AMC Amount', value: formatCurrency(receiptDoc.amcAmount || 0), color: BRAND_COLOR, bold: true }
        ], BRAND_LIGHT);
      }

      // ATT Section
      if (receiptDoc.serviceType === 'ATT' || receiptDoc.serviceType === 'BOTH') {
        y = checkPage(doc, y, 150);
        y = drawSectionHeader(doc, y, 'ATT Services (Anti Termite Treatment)', ATT_COLOR);
        y = drawHR(doc, y, ATT_COLOR) + 8;
        
        const att = receiptDoc.attDetails || {};
        y = drawTwoColumns(doc, y, [
          { label: 'Phase', value: att.constructionPhase || '-' },
          { label: 'Treatment', value: att.treatmentType || '-' },
          { label: 'Chemical', value: att.chemical || '-' },
          { label: 'Method', value: att.method || '-' }
        ]);
        if (att.warranty) y = drawLabelValue(doc, y, 'Warranty', att.warranty);
        
        y += 5;
        y = drawBox(doc, y, [
          { label: 'Total Area', value: formatNum(receiptDoc.totalArea || 0) + ' Sq.Ft.' },
          { label: 'Rate per Sq.Ft.', value: formatCurrency(att.ratePerSqft || receiptDoc.attRatePerSqft || 0) },
          { label: 'ATT Amount', value: formatCurrency(receiptDoc.attAmount || 0), color: ATT_COLOR, bold: true }
        ], ATT_LIGHT);
      }

      // Price Calculation
      y = checkPage(doc, y, 160);
      y = drawSectionHeader(doc, y, 'Price Calculation');
      y = drawHR(doc, y) + 8;
      y = drawBox(doc, y, [
        { label: 'Base Amount', value: formatCurrency(receiptDoc.baseAmount || 0) },
        { label: 'GST (' + (receiptDoc.gstPercent || 18) + '%)', value: '+' + formatCurrency(receiptDoc.gstAmount || 0), color: BRAND_COLOR },
        { label: 'Discount (' + (receiptDoc.discountPercent || 0) + '%)', value: '-' + formatCurrency(receiptDoc.discountAmount || 0), color: '#dc2626' }
      ]);
      
      y += 5;
      doc.rect(MARGIN, y, CONTENT_W, 30).fillAndStroke('#f0fdf4', BRAND_COLOR);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND_COLOR)
        .text('TOTAL:', MARGIN + 10, y + 8)
        .text(formatCurrency(receiptDoc.totalAmount || 0), PAGE_W - MARGIN - 120, y + 8, { width: 110, align: 'right' });
      y += 35;

      // Payment Summary
      y = drawSectionHeader(doc, y, 'Payment Details');
      y = drawHR(doc, y) + 8;
      y = drawTwoColumns(doc, y, [
        { label: 'Payment Mode', value: receiptDoc.paymentMode },
        { label: 'Transaction ID', value: receiptDoc.transactionId || '-' },
        { label: 'Paid Amount', value: formatCurrency(receiptDoc.advancePaid || 0), color: BRAND_COLOR },
        { label: 'Balance Due', value: formatCurrency(receiptDoc.balanceDue || 0), color: receiptDoc.balanceDue > 0 ? '#dc2626' : BRAND_COLOR }
      ]);

      y = checkPage(doc, y, 80);
      y = drawSignature(doc, y);
      y += 10;
      drawFooter(doc, y);
      
      drawPageNumbers(doc);
      doc.end();
    } catch (error) {
      console.error('PDF Error:', error);
      reject(error);
    }
  });
};

// ==========================================
// JOB CARD PDF GENERATION
// ==========================================
exports.generateJobCardPdf = async (formDoc) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      let y = drawLogoHeader(doc);
      y = drawTitle(doc, y, 'SERVICE JOB CARD');

      // Order Info
      y = drawSectionHeader(doc, y, 'Order Information');
      y = drawHR(doc, y) + 8;
      y = drawTwoColumns(doc, y, [
        { label: 'Order No', value: formDoc.orderNo },
        { label: 'Date', value: formatDate(formDoc.createdAt) },
        { label: 'Status', value: formDoc.status },
        { label: 'Branch', value: formDoc.branchId?.branchName || '-' }
      ]);

      // Customer Info
      y = drawSectionHeader(doc, y, 'Customer Information');
      y = drawHR(doc, y) + 8;
      const cust = formDoc.customer || {};
      y = drawTwoColumns(doc, y, [
        { label: 'Name', value: cust.name || '-' },
        { label: 'Phone', value: cust.phone || '-' },
        { label: 'Email', value: cust.email || '-' },
        { label: 'GST No', value: cust.gstNo || '-' }
      ]);
      if (cust.address) y = drawLabelValue(doc, y, 'Address', cust.address);

      // Service Details
      y = drawSectionHeader(doc, y, 'Service Details');
      y = drawHR(doc, y) + 8;
      y = drawTwoColumns(doc, y, [
        { label: 'Category', value: formDoc.serviceCategory || '-' },
        { label: 'Service Type', value: formDoc.serviceType || 'AMC' },
        { label: 'Premises', value: formDoc.premises?.type || '-' },
        { label: 'Reference', value: formDoc.reference || 'Walk-in' }
      ]);

      // Schedule
      if (formDoc.schedule) {
        y = drawSectionHeader(doc, y, 'Schedule');
        y = drawHR(doc, y) + 8;
        y = drawTwoColumns(doc, y, [
          { label: 'Type', value: formDoc.schedule.type || '-' },
          { label: 'Date', value: formDoc.schedule.date || '-' },
          { label: 'Time', value: formDoc.schedule.time || '-' }
        ]);
      }

      // AMC Services
      if ((formDoc.serviceType === 'AMC' || formDoc.serviceType === 'BOTH') && formDoc.amcServices?.length > 0) {
        y = checkPage(doc, y, 100);
        y = drawSectionHeader(doc, y, 'AMC Services', BRAND_COLOR);
        y = drawHR(doc, y, BRAND_COLOR) + 8;
        doc.fontSize(8).font('Helvetica').fillColor(DARK)
          .text(formDoc.amcServices.join(', '), MARGIN, y, { width: CONTENT_W });
        y += 15;
        y = drawTwoColumns(doc, y, [
          { label: 'Rate per Sq.Ft.', value: formatCurrency(formDoc.ratePerSqft || 0) },
          { label: 'Total Area', value: formatNum(formDoc.premises?.totalArea || 0) + ' Sq.Ft.' }
        ]);
      }

      // ATT Services
      if ((formDoc.serviceType === 'ATT' || formDoc.serviceType === 'BOTH') && formDoc.attDetails) {
        y = checkPage(doc, y, 120);
        y = drawSectionHeader(doc, y, 'ATT Services', ATT_COLOR);
        y = drawHR(doc, y, ATT_COLOR) + 8;
        const att = formDoc.attDetails;
        y = drawTwoColumns(doc, y, [
          { label: 'Phase', value: att.constructionPhase || '-' },
          { label: 'Treatment', value: att.treatmentType || '-' },
          { label: 'Chemical', value: att.chemical || '-' },
          { label: 'Warranty', value: att.warranty || '-' }
        ]);
      }

      // Floor Details
      if (formDoc.premises?.floors?.length > 0) {
        y = checkPage(doc, y, 100);
        y = drawSectionHeader(doc, y, 'Premises - Floor Details');
        y = drawHR(doc, y) + 8;
        
        const headers = ['Floor', 'Length', 'Width', 'Area'];
        const colWidths = [150, 120, 120, 150];
        const rows = formDoc.premises.floors.map(f => [f.label || 'Floor', formatNum(f.length) + ' ft', formatNum(f.width) + ' ft', formatNum(f.area) + ' sqft']);
        
        y = drawTable(doc, y, headers, rows, colWidths);
        
        doc.fontSize(9).font('Helvetica-Bold').fillColor(BRAND_COLOR)
          .text('TOTAL AREA:', MARGIN, y, { width: 150 })
          .text(formatNum(formDoc.premises.totalArea || 0) + ' Sq.Ft.', PAGE_W - MARGIN - 150, y, { width: 150, align: 'right' });
        y += 20;
      }

      // Pricing
      if (formDoc.pricing) {
        y = checkPage(doc, y, 120);
        y = drawSectionHeader(doc, y, 'Pricing');
        y = drawHR(doc, y) + 8;
        y = drawBox(doc, y, [
          { label: 'Base Amount', value: formatCurrency(formDoc.pricing.baseAmount || 0) },
          { label: 'GST (' + (formDoc.pricing.gstPercent || 18) + '%)', value: '+' + formatCurrency(formDoc.pricing.gstAmount || 0) },
          { label: 'Final Amount', value: formatCurrency(formDoc.pricing.finalAmount || 0), color: BRAND_COLOR, bold: true }
        ]);
      }

      // Pesticides
      if (formDoc.pesticides?.length > 0) {
        y = checkPage(doc, y, 80);
        y = drawSectionHeader(doc, y, 'Pesticides / Chemicals Used');
        y = drawHR(doc, y) + 8;
        
        const headers = ['#', 'Name', 'Quantity', 'Rate'];
        const colWidths = [30, 200, 120, 180];
        const rows = formDoc.pesticides.map((p, i) => [
          String(i + 1), p.name || '-', (p.quantity || '-') + ' ' + (p.unit || 'L'), formatCurrency(p.rate || 0)
        ]);
        
        y = drawTable(doc, y, headers, rows, colWidths);
      }

      // Executive
      if (formDoc.employeeId?.name) {
        y = drawSectionHeader(doc, y, 'Executive');
        y = drawHR(doc, y) + 8;
        y = drawTwoColumns(doc, y, [
          { label: 'Name', value: formDoc.employeeId.name },
          { label: 'Phone', value: formDoc.employeeId.phone || '-' }
        ]);
      }

      y = checkPage(doc, y, 80);
      y = drawSignature(doc, y);
      y += 10;
      drawFooter(doc, y);
      
      drawPageNumbers(doc);
      doc.end();
    } catch (error) {
      console.error('PDF Error:', error);
      reject(error);
    }
  });
};

// ==========================================
// ENQUIRY LIST PDF
// ==========================================
exports.generateEnquiryListPdf = async (enquiries) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 30, layout: 'landscape', bufferPages: true });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      doc.fontSize(14).font('Helvetica-Bold').fillColor(DARK)
        .text('ENQUIRY REPORT', 30, 30, { width: 800, align: 'center' });
      
      doc.fontSize(8).font('Helvetica').fillColor(GRAY)
        .text('Total Records: ' + enquiries.length + ' | Generated: ' + new Date().toLocaleString('en-IN'), 30, 50, { width: 800 });

      const headers = ['ID', 'Customer', 'Mobile', 'Service', 'City', 'Status', 'Priority', 'Source'];
      const colWidths = [90, 130, 80, 90, 80, 80, 70, 70];
      
      let y = 70;
      let x = 30;
      
      doc.fontSize(8).font('Helvetica-Bold').fillColor(GRAY);
      headers.forEach((h, i) => {
        doc.text(h, x, y, { width: colWidths[i] });
        x += colWidths[i];
      });
      y += 15;
      
      doc.moveTo(30, y).lineTo(830, y).strokeColor('#e2e8f0').lineWidth(0.3).stroke();
      y += 8;

      doc.fontSize(7).font('Helvetica').fillColor(DARK);
      enquiries.forEach((enq) => {
        if (y > 550) {
          doc.addPage();
          y = 30;
        }
        
        x = 30;
        const row = [
          enq.enquiryId || '-',
          (enq.customerName || '').substring(0, 20),
          enq.mobile || '-',
          enq.serviceType || '-',
          enq.city || '-',
          enq.status || '-',
          enq.priority || '-',
          enq.source || '-'
        ];
        
        row.forEach((cell, i) => {
          doc.text(cell, x, y, { width: colWidths[i] });
          x += colWidths[i];
        });
        y += 13;
      });

      drawPageNumbers(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

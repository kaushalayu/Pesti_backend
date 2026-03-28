const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const LOGO_PATH = path.join(__dirname, '../../public/logo.jpg');
const ICON_PATH = path.join(__dirname, '../../public/icons.svg');

const getLogo = () => {
  try {
    if (fs.existsSync(LOGO_PATH)) {
      return fs.readFileSync(LOGO_PATH);
    }
  } catch (err) {
    console.log('Logo not found, using text only');
  }
  return null;
};

const BRAND_COLOR = '#16a34a';
const DARK_COLOR = '#1e293b';

const drawHeader = (doc, title) => {
  const logo = getLogo();
  
  if (logo) {
    doc.image(logo, 50, 40, { width: 50, height: 50 });
    doc.text('SAFE HOME PESTOCHEM INDIA PVT. LTD.', 110, 45, { align: 'left', width: 400 });
  } else {
    doc.fontSize(16).font('Helvetica-Bold').fillColor(DARK_COLOR).text('SAFE HOME PESTOCHEM INDIA PVT. LTD.', 50, 45, { align: 'left', width: 500 });
  }
  
  doc.fontSize(8).font('Helvetica').fillColor('#64748b').text('ISO 9001:2015 Certified Company', logo ? 110 : 50, 65, { align: 'left', width: 400 });
  
  doc.fontSize(14).font('Helvetica-Bold').fillColor(BRAND_COLOR).text(title, 50, 95, { align: 'center', width: 500 });
  
  doc.moveTo(50, 115).lineTo(550, 115).strokeColor(BRAND_COLOR).lineWidth(2).stroke();
  
  return 130;
};

const drawSection = (doc, y, title, data) => {
  doc.fontSize(10).font('Helvetica-Bold').fillColor(BRAND_COLOR).text(title, 50, y, { width: 500 });
  y += 5;
  doc.moveTo(50, y).lineTo(550, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  y += 12;
  
  doc.font('Helvetica').fontSize(9).fillColor(DARK_COLOR);
  data.forEach(([label, value]) => {
    if (value && value !== 'undefined' && value !== 'null' && value !== '') {
      doc.text(`${label}:`, 50, y, { continued: true, width: 120 });
      doc.text(String(value), 170, y, { width: 380 });
      y += 14;
    }
  });
  
  return y + 8;
};

const drawTwoColumnSection = (doc, y, title, leftData, rightData) => {
  doc.fontSize(10).font('Helvetica-Bold').fillColor(BRAND_COLOR).text(title, 50, y, { width: 500 });
  y += 5;
  doc.moveTo(50, y).lineTo(550, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  y += 12;
  
  let leftY = y;
  let rightY = y;
  
  doc.font('Helvetica').fontSize(9).fillColor(DARK_COLOR);
  
  leftData.forEach(([label, value]) => {
    if (value && value !== 'undefined' && value !== 'null' && value !== '') {
      doc.text(`${label}:`, 50, leftY, { continued: true, width: 100 });
      doc.text(String(value), 150, leftY, { width: 200 });
      leftY += 14;
    }
  });
  
  rightData.forEach(([label, value]) => {
    if (value && value !== 'undefined' && value !== 'null' && value !== '') {
      doc.text(`${label}:`, 310, rightY, { continued: true, width: 100 });
      doc.text(String(value), 410, rightY, { width: 140 });
      rightY += 14;
    }
  });
  
  return Math.max(leftY, rightY) + 8;
};

const drawTable = (doc, y, title, headers, rows) => {
  doc.fontSize(10).font('Helvetica-Bold').fillColor(BRAND_COLOR).text(title, 50, y, { width: 500 });
  y += 5;
  doc.moveTo(50, y).lineTo(550, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  y += 12;
  
  const colWidths = [150, 100, 150, 150];
  let x = 50;
  
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b');
  headers.forEach((header, i) => {
    doc.text(header, x, y, { width: colWidths[i] });
    x += colWidths[i];
  });
  y += 15;
  
  doc.moveTo(50, y).lineTo(550, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  y += 8;
  
  doc.font('Helvetica').fontSize(9).fillColor(DARK_COLOR);
  rows.forEach(row => {
    x = 50;
    row.forEach((cell, i) => {
      doc.text(String(cell || '-'), x, y, { width: colWidths[i] });
      x += colWidths[i];
    });
    y += 14;
  });
  
  return y + 8;
};

const drawSignatureBox = (doc, y) => {
  doc.fontSize(10).font('Helvetica-Bold').fillColor(BRAND_COLOR).text('Signatures', 50, y, { width: 500 });
  y += 5;
  doc.moveTo(50, y).lineTo(550, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  y += 15;
  
  doc.font('Helvetica').fontSize(8).fillColor('#64748b');
  doc.text('Employee Signature', 80, y, { width: 150, align: 'center' });
  doc.text('Customer Signature', 320, y, { width: 150, align: 'center' });
  y += 5;
  
  doc.rect(50, y, 150, 40).strokeColor('#cbd5e1').lineWidth(1).stroke();
  doc.rect(290, y, 150, 40).strokeColor('#cbd5e1').lineWidth(1).stroke();
  
  y += 50;
  
  doc.text('Date: ________', 50, y, { width: 100 });
  doc.text('Date: ________', 320, y, { width: 100 });
  
  return y + 20;
};

const drawFooter = (doc, y) => {
  doc.fontSize(7).font('Helvetica').fillColor('#94a3b8');
  doc.text('This is a computer-generated document. No signature required.', 50, y, { align: 'center', width: 500 });
  doc.text(`Generated on: ${new Date().toLocaleString('en-IN')}`, 50, y + 12, { align: 'center', width: 500 });
  return y + 25;
};

/**
 * Generates a Professional Service Report PDF (Single Page)
 */
exports.generateJobCardPdf = async (formDoc) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4',
        margin: 40,
        bufferPages: true
      });
      
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      let y = drawHeader(doc, 'SERVICE REPORT');

      y = drawSection(doc, y, 'Order Information', [
        ['Order No', formDoc.orderNo || 'N/A'],
        ['Date', new Date(formDoc.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })],
        ['Status', formDoc.status || 'N/A'],
        ['Branch', formDoc.branchId?.branchName || formDoc.branchId?.city || 'N/A']
      ]);

      y = drawTwoColumnSection(doc, y, 'Customer Details', [
        ['Name', `${formDoc.customer?.title || ''} ${formDoc.customer?.name || ''}`.trim()],
        ['Phone', formDoc.customer?.phone || 'N/A'],
        ['City', formDoc.customer?.city || 'N/A']
      ], [
        ['Address', formDoc.customer?.address || 'N/A'],
        ['GST No', formDoc.customer?.gstNo || '-'],
        ['Email', formDoc.customer?.email || '-']
      ]);

      y = drawTwoColumnSection(doc, y, 'Service Details', [
        ['Category', formDoc.serviceCategory || 'N/A'],
        ['Schedule', formDoc.schedule?.type || 'N/A'],
        ['Pest Control', formDoc.amcServices?.join(', ') || '-']
      ], [
        ['Date', formDoc.schedule?.date || '-'],
        ['Time', formDoc.schedule?.time || '-'],
        ['Premises', formDoc.premises?.type || '-']
      ]);

      if (formDoc.attDetails?.constructionPhase) {
        y = drawSection(doc, y, 'Treatment Details', [
          ['Phase', formDoc.attDetails.constructionPhase],
          ['Treatment', formDoc.attDetails.treatmentType],
          ['Chemical', formDoc.attDetails.chemical],
          ['Method', formDoc.attDetails.method],
          ['Base', formDoc.attDetails.base]
        ]);
      }

      y = drawSection(doc, y, 'Billing Information', [
        ['Total Amount', `Rs. ${(formDoc.billing?.total || 0).toLocaleString('en-IN')}`],
        ['Advance Paid', `Rs. ${(formDoc.billing?.advance || 0).toLocaleString('en-IN')}`],
        ['Balance Due', `Rs. ${(formDoc.billing?.due || 0).toLocaleString('en-IN')}`],
        ['Payment Mode', formDoc.billing?.paymentMode || 'N/A']
      ]);

      if (formDoc.contract?.contractNo) {
        y = drawSection(doc, y, 'Contract Details', [
          ['Contract No', formDoc.contract.contractNo],
          ['Period', formDoc.contract.period || '-'],
          ['Warranty', formDoc.contract.warranty || '-']
        ]);
      }

      y = drawSignatureBox(doc, y);
      y = drawFooter(doc, y);

      doc.render();

      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(7).fillColor('#94a3b8');
        doc.text('Page ' + (i + 1) + ' of ' + range.count, 50, 820, { align: 'center', width: 500 });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generates a Professional Payment Receipt PDF (Single Page)
 */
exports.generateReceiptPdf = async (receiptDoc) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4',
        margin: 40,
        bufferPages: true
      });
      
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      let y = drawHeader(doc, 'PAYMENT RECEIPT');

      y = drawSection(doc, y, 'Receipt Information', [
        ['Receipt No', receiptDoc.receiptNo || 'N/A'],
        ['Date', new Date(receiptDoc.paymentDate || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })],
        ['Status', receiptDoc.status || 'N/A'],
        ['Branch', receiptDoc.branchId?.branchName || receiptDoc.branchId?.city || 'N/A']
      ]);

      y = drawSection(doc, y, 'Customer Information', [
        ['Name', receiptDoc.customerName || 'N/A'],
        ['Phone', receiptDoc.customerPhone || '-'],
        ['Email', receiptDoc.customerEmail || '-']
      ]);

      y = drawSection(doc, y, 'Payment Details', [
        ['Description', receiptDoc.serviceDescription || '-'],
        ['Payment Mode', receiptDoc.paymentMode || 'N/A'],
        ['Reference No', receiptDoc.chequeNo || '-']
      ]);

      doc.fontSize(12).font('Helvetica-Bold').fillColor(BRAND_COLOR).text('Amount Summary', 50, y, { width: 500 });
      y += 5;
      doc.moveTo(50, y).lineTo(550, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      y += 15;

      const boxWidth = 115;
      const amounts = [
        ['Total Amount', `Rs. ${(receiptDoc.amount || 0).toLocaleString('en-IN')}`, '#f1f5f9', DARK_COLOR],
        ['Amount Paid', `Rs. ${(receiptDoc.advancePaid || 0).toLocaleString('en-IN')}`, '#dcfce7', '#16a34a'],
        ['Balance Due', `Rs. ${(receiptDoc.balanceDue || 0).toLocaleString('en-IN')}`, receiptDoc.balanceDue > 0 ? '#fef2f2' : '#dcfce7', receiptDoc.balanceDue > 0 ? '#dc2626' : '#16a34a']
      ];
      
      let boxX = 50;
      amounts.forEach(([label, value, bg, color]) => {
        doc.rect(boxX, y, boxWidth, 45).fillColor(bg).fill();
        doc.fontSize(8).font('Helvetica').fillColor('#64748b').text(label, boxX + 8, y + 8, { width: boxWidth - 16 });
        doc.fontSize(14).font('Helvetica-Bold').fillColor(color).text(value, boxX + 8, y + 22, { width: boxWidth - 16 });
        boxX += boxWidth + 10;
      });
      y += 55;

      y = drawSignatureBox(doc, y);
      y = drawFooter(doc, y);

      doc.render();

      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(7).fillColor('#94a3b8');
        doc.text('Page ' + (i + 1) + ' of ' + range.count, 50, 820, { align: 'center', width: 500 });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generates Enquiry Export Report PDF
 */
exports.generateEnquiryListPdf = async (enquiries) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4',
        margin: 40,
        layout: 'landscape',
        bufferPages: true
      });
      
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      let y = drawHeader(doc, 'ENQUIRY REPORT');

      doc.fontSize(9).font('Helvetica').fillColor('#64748b');
      doc.text(`Total Records: ${enquiries.length} | Generated: ${new Date().toLocaleString('en-IN')}`, 50, y, { width: 750 });
      y += 20;

      const headers = ['ID', 'Customer', 'Mobile', 'Service', 'City', 'Status', 'Priority', 'Source'];
      const colWidths = [90, 120, 90, 90, 80, 90, 70, 70];
      
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#64748b');
      let x = 50;
      headers.forEach((header, i) => {
        doc.text(header, x, y, { width: colWidths[i] });
        x += colWidths[i];
      });
      y += 15;
      
      doc.moveTo(50, y).lineTo(780, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      y += 8;

      doc.font('Helvetica').fontSize(8).fillColor(DARK_COLOR);
      enquiries.forEach((enq) => {
        if (y > 560) {
          doc.addPage();
          y = 50;
        }
        
        x = 50;
        const row = [
          enq.enquiryId || '-',
          (enq.customerName || '').substring(0, 18),
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
        y += 14;
      });

      doc.render();

      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(7).fillColor('#94a3b8');
        doc.text('Page ' + (i + 1) + ' of ' + range.count, 50, 560, { align: 'center', width: 700 });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

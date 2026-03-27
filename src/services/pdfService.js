const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

/**
 * Generates a Job Card PDF and returns the buffer.
 */
exports.generateJobCardPdf = async (formDoc) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // --- HEADER ---
      doc.fontSize(20).font('Helvetica-Bold').text('SAFE HOME PESTOCHEM INDIA PVT. LTD.', { align: 'center' });
      doc.fontSize(10).font('Helvetica').text('Iso 9001:2015 Certified Company', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica-Bold').text('SERVICE REPORT / JOB CARD', { align: 'center', underline: true });
      doc.moveDown();

      // --- META INFO ---
      doc.fontSize(10).font('Helvetica');
      doc.text(`Order No: ${formDoc.orderNo || 'N/A'}`);
      doc.text(`Date: ${new Date(formDoc.createdAt).toLocaleDateString()}`);
      doc.moveDown();

      // --- CUSTOMER DETAILS ---
      doc.font('Helvetica-Bold').text('Customer Details', { underline: true });
      doc.font('Helvetica').moveDown(0.5);
      doc.text(`Name: ${formDoc.customer?.title || ''} ${formDoc.customer?.name || ''}`);
      doc.text(`Address: ${formDoc.customer?.address || ''}, ${formDoc.customer?.city || ''}`);
      doc.text(`Phone: ${formDoc.customer?.phone || ''}`);
      if (formDoc.customer?.gstNo) doc.text(`GST No: ${formDoc.customer?.gstNo}`);
      doc.moveDown();

      // --- SERVICE DETAILS ---
      doc.font('Helvetica-Bold').text('Service Details', { underline: true });
      doc.font('Helvetica').moveDown(0.5);
      doc.text(`Category: ${formDoc.serviceCategory}`);
      if (formDoc.amcServices && formDoc.amcServices.length > 0) {
        doc.text(`AMC Services: ${formDoc.amcServices.join(', ')}`);
      }
      doc.text(`Schedule: ${formDoc.schedule}`);
      doc.moveDown();

      // --- ATT DETAILS (If Applicable) ---
      if (formDoc.attDetails?.constructionPhase) {
        doc.font('Helvetica-Bold').text('ATT Details', { underline: true });
        doc.font('Helvetica').moveDown(0.5);
        doc.text(`Phase: ${formDoc.attDetails.constructionPhase}`);
        doc.text(`Treatment: ${formDoc.attDetails.treatmentType}`);
        doc.text(`Chemical: ${formDoc.attDetails.chemical}`);
        doc.text(`Method: ${formDoc.attDetails.method}`);
        doc.text(`Base: ${formDoc.attDetails.base}`);
        doc.moveDown();
      }

      // --- BILLING DETAILS ---
      doc.font('Helvetica-Bold').text('Billing Details', { underline: true });
      doc.font('Helvetica').moveDown(0.5);
      doc.text(`Total Amount: Rs. ${formDoc.billing?.total || 0}`);
      doc.text(`Advance Paid: Rs. ${formDoc.billing?.advance || 0}`);
      doc.text(`Balance Due: Rs. ${formDoc.billing?.due || 0}`);
      doc.text(`Payment Mode: ${formDoc.billing?.paymentMode || 'N/A'}`);
      doc.moveDown();

      // --- CONTRACT & WARRANTY ---
      doc.font('Helvetica-Bold').text('Contract & Warranty', { underline: true });
      doc.font('Helvetica').moveDown(0.5);
      doc.text(`Contract No: ${formDoc.contract?.contractNo || 'N/A'}`);
      doc.text(`Period: ${formDoc.contract?.period || 'N/A'}`);
      doc.text(`Warranty: ${formDoc.contract?.warranty || 'N/A'}`);
      doc.moveDown(3);

      // --- SIGNATURES ---
      // Simple text placeholders for signatures (Canvas data URIs require an external image processor if base64)
      const currentY = doc.y;
      doc.font('Helvetica-Bold').text('Employee Signature', 50, currentY);
      doc.text('Customer Signature', 400, currentY, { align: 'right' });

      // End PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generates an official Payment Receipt PDF and returns the buffer.
 */
exports.generateReceiptPdf = async (receiptDoc) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // --- HEADER ---
      doc.fontSize(20).font('Helvetica-Bold').text('SAFE HOME PESTOCHEM INDIA PVT. LTD.', { align: 'center' });
      doc.fontSize(10).font('Helvetica').text('Iso 9001:2015 Certified Company', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica-Bold').text('PAYMENT RECEIPT', { align: 'center', underline: true });
      doc.moveDown();

      // --- META INFO ---
      doc.fontSize(10).font('Helvetica');
      doc.text(`Receipt No: ${receiptDoc.receiptNo}`);
      doc.text(`Date: ${new Date(receiptDoc.paymentDate).toLocaleDateString()}`);
      if (receiptDoc.formId) doc.text(`Linked Form: ${receiptDoc.formId.orderNo || 'N/A'}`);
      doc.moveDown();

      // --- CUSTOMER INFO ---
      doc.font('Helvetica-Bold').text('Received From:', { underline: true });
      doc.font('Helvetica').moveDown(0.5);
      doc.text(`Name: ${receiptDoc.customerName}`);
      if (receiptDoc.customerEmail) doc.text(`Email: ${receiptDoc.customerEmail}`);
      if (receiptDoc.customerPhone) doc.text(`Phone: ${receiptDoc.customerPhone}`);
      doc.moveDown();

      // --- BILLING INFO ---
      doc.font('Helvetica-Bold').text('Payment Details:', { underline: true });
      doc.font('Helvetica').moveDown(0.5);
      doc.text(`Description: ${receiptDoc.serviceDescription}`);
      doc.text(`Payment Mode: ${receiptDoc.paymentMode}`);
      if (receiptDoc.chequeNo) doc.text(`Cheque/Transaction No: ${receiptDoc.chequeNo}`);
      doc.moveDown();

      doc.font('Helvetica-Bold');
      doc.text(`Total Amount: \t\tRs. ${receiptDoc.amount}`);
      doc.text(`Amount Paid (Advance):\tRs. ${receiptDoc.advancePaid}`);
      doc.text(`Balance Due: \t\tRs. ${receiptDoc.balanceDue}`);
      doc.moveDown();
      
      doc.text(`Payment Status: ${receiptDoc.status}`);
      doc.moveDown(3);

      // --- FOOTER ---
      doc.fontSize(10).font('Helvetica-Oblique').text('This is a computer-generated receipt and does not require a physical signature.', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generates a tabulated list of Enquiries for export.
 */
exports.generateEnquiryListPdf = async (enquiries) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 30, layout: 'landscape' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // --- HEADER ---
      doc.fontSize(16).font('Helvetica-Bold').text('Enquiry Export Report', { align: 'center' });
      doc.fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(2);

      // --- TABLE HEADER ---
      const startX = 30;
      let currentY = doc.y;
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('ID', startX, currentY, { width: 80 });
      doc.text('Name', startX + 80, currentY, { width: 100 });
      doc.text('Mobile', startX + 180, currentY, { width: 100 });
      doc.text('Service', startX + 280, currentY, { width: 100 });
      doc.text('Status', startX + 380, currentY, { width: 100 });
      doc.text('Priority', startX + 480, currentY, { width: 80 });
      doc.text('City', startX + 560, currentY, { width: 100 });
      
      currentY += 15;
      doc.moveTo(startX, currentY).lineTo(750, currentY).stroke();
      currentY += 10;

      // --- ROW LOOP ---
      doc.font('Helvetica').fontSize(9);
      enquiries.forEach((enq) => {
        if (currentY > doc.page.height - 50) {
          doc.addPage({ layout: 'landscape', margin: 30 });
          currentY = 50; // reset
        }
        
        doc.text(enq.enquiryId || 'N/A', startX, currentY, { width: 80 });
        doc.text(enq.customerName || '', startX + 80, currentY, { width: 100 });
        doc.text(enq.mobile || '', startX + 180, currentY, { width: 100 });
        doc.text(enq.serviceType || '', startX + 280, currentY, { width: 100 });
        doc.text(enq.status || '', startX + 380, currentY, { width: 100 });
        doc.text(enq.priority || '', startX + 480, currentY, { width: 80 });
        doc.text(enq.city || '', startX + 560, currentY, { width: 100 });
        
        currentY += 15;
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

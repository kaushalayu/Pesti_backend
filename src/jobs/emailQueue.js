const transporter = require('../config/email');
const { generateJobCardPdf, generateReceiptPdf } = require('../services/pdfService');
const ServiceForm = require('../models/ServiceForm');
const Receipt = require('../models/Receipt');

// ── Optional Bull Queue (Redis-backed) ──────────────────────────────────────
// If Redis is not configured or unavailable, emails are sent DIRECTLY (inline).
// This way the server never crashes due to missing Redis.
// ─────────────────────────────────────────────────────────────────────────────

let bullQueue = null;
let useQueue = false;

const tryInitBull = () => {
  if (!process.env.REDIS_URL) return; // No Redis configured — skip silently

  try {
    const Queue = require('bull');
    const parsed = new URL(process.env.REDIS_URL);
    const isTLS = parsed.protocol === 'rediss:';

    const redisOpts = {
      host: parsed.hostname,
      port: Number(parsed.port) || (isTLS ? 6380 : 6379),
      password: decodeURIComponent(parsed.password) || undefined,
      tls: isTLS ? { rejectUnauthorized: false } : undefined,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      connectTimeout: 5000,
      lazyConnect: true,
    };

    bullQueue = new Queue('email-queue', { redis: redisOpts });

    // Swallow Redis errors — NEVER let them crash the server
    bullQueue.on('error', (err) => {
      if (useQueue) {
        console.warn('[Email Queue] Redis disconnected, switching to inline mode:', err.message);
        useQueue = false;
      }
    });

    bullQueue.client.on('ready', () => {
      console.log('[Email Queue] Redis connected ✓ — background jobs active.');
      useQueue = true;
    });

    bullQueue.client.on('error', (err) => {
      useQueue = false; // Silently fall back — no crash
    });

    // Register the processor
    bullQueue.process(processEmailJob);

  } catch (err) {
    console.warn('[Email Queue] Bull init skipped:', err.message);
    bullQueue = null;
    useQueue = false;
  }
};

// ── Core Email Processor ─────────────────────────────────────────────────────
const processEmailJob = async (jobOrData) => {
  // When called directly (inline), jobOrData is { type, data }
  // When called by Bull, jobOrData is a Job object with .data
  const { type, data } = jobOrData?.data ?? jobOrData;

  switch (type) {
    case 'WELCOME_EMAIL':
      await transporter.sendMail({
        from: `"SafeHome Pestochem" <${process.env.EMAIL_FROM}>`,
        to: data.email,
        subject: 'Welcome to SafeHome Pestochem - Your Login Credentials',
        html: `
          <p>Hi ${data.name},</p>
          <p>Your account has been created successfully.</p>
          <p><b>Login Email:</b> ${data.email}</p>
          <p><b>Temporary Password:</b> ${data.password}</p>
          <p>Please log in and change your password immediately.</p>
          <p><a href="${process.env.FRONTEND_URL}/login">Login Here</a></p>
        `,
      });
      break;

    case 'PASSWORD_RESET_ALERT':
      await transporter.sendMail({
        from: `"SafeHome Pestochem" <${process.env.EMAIL_FROM}>`,
        to: data.email,
        subject: 'Alert: Your Password Has Been Reset by Admin',
        html: `
          <p>Hi ${data.name},</p>
          <p>Your password was recently reset by an administrator.</p>
          <p><b>Your New Password:</b> ${data.password}</p>
          <p>Please log in and change this password immediately.</p>
          <p><a href="${process.env.FRONTEND_URL}/login">Login Here</a></p>
        `,
      });
      break;

    case 'SUBMIT_JOB_CARD':
      const form = await ServiceForm.findById(data.formId).populate('branchId').lean();
      if (!form || !form.customer?.email) break;

      const jobCardBuffer = await generateJobCardPdf(form);
      await transporter.sendMail({
        from: `"SafeHome Pestochem" <${process.env.EMAIL_FROM}>`,
        to: form.customer.email,
        subject: `Service Job Card - SafeHome Pestochem (${form.orderNo})`,
        html: `
          <p>Dear ${form.customer.title || ''} ${form.customer.name},</p>
          <p>Thank you for choosing SafeHome Pestochem. Attached is your service job card.</p>
          <p>Order No: <b>${form.orderNo}</b></p>
          <p>Regards,<br>SafeHome Pestochem India Pvt Ltd</p>
        `,
        attachments: [{ filename: `JobCard_${form.orderNo}.pdf`, content: jobCardBuffer, contentType: 'application/pdf' }],
      });
      await ServiceForm.findByIdAndUpdate(data.formId, { emailSentAt: Date.now() });
      break;

    case 'SERVICE_SCHEDULED':
      const scheduledForm = await ServiceForm.findById(data.formId).populate('branchId').lean();
      if (!scheduledForm || !scheduledForm.customer?.email) break;
      await transporter.sendMail({
        from: `"SafeHome Pestochem" <${process.env.EMAIL_FROM}>`,
        to: scheduledForm.customer.email,
        subject: `Service Scheduled - SafeHome Pestochem (${scheduledForm.orderNo})`,
        html: `
          <p>Dear ${scheduledForm.customer.title || ''} ${scheduledForm.customer.name},</p>
          <p>Your pest control service has been scheduled.</p>
          <p>Order No: <b>${scheduledForm.orderNo}</b></p>
          <p>Service Date: <b>${scheduledForm.schedule?.date || 'To be confirmed'}</b></p>
          <p>Branch: <b>${scheduledForm.branchId?.branchName || 'N/A'}</b></p>
          <p>Please ensure someone is available at your premises on the scheduled date.</p>
          <p>Regards,<br>SafeHome Pestochem India Pvt Ltd</p>
        `,
      });
      break;

    case 'SERVICE_COMPLETED':
      const completedForm = await ServiceForm.findById(data.formId).populate('branchId').lean();
      if (!completedForm || !completedForm.customer?.email) break;
      await transporter.sendMail({
        from: `"SafeHome Pestochem" <${process.env.EMAIL_FROM}>`,
        to: completedForm.customer.email,
        subject: `Service Completed - SafeHome Pestochem (${completedForm.orderNo})`,
        html: `
          <p>Dear ${completedForm.customer.title || ''} ${completedForm.customer.name},</p>
          <p>Your pest control service has been successfully completed.</p>
          <p>Order No: <b>${completedForm.orderNo}</b></p>
          <p>Final Amount: <b>Rs. ${(completedForm.pricing?.finalAmount || completedForm.billing?.total || 0).toLocaleString('en-IN')}</b></p>
          <p>Balance Due: <b>Rs. ${(completedForm.billing?.due || 0).toLocaleString('en-IN')}</b></p>
          <p>Thank you for choosing SafeHome Pestochem!</p>
          <p>Regards,<br>SafeHome Pestochem India Pvt Ltd</p>
        `,
      });
      break;

    case 'SEND_RECEIPT':
      const receipt = await Receipt.findById(data.receiptId).populate('branchId formId').lean();
      if (!receipt?.customerEmail) break;

      const receiptBuffer = await generateReceiptPdf(receipt);
      await transporter.sendMail({
        from: `"SafeHome Pestochem" <${process.env.EMAIL_FROM}>`,
        to: receipt.customerEmail,
        subject: `Payment Receipt ${receipt.receiptNo} - SafeHome Pestochem`,
        html: `
          <p>Dear ${receipt.customerName},</p>
          <p>Thank you for your payment. Attached is your official receipt.</p>
          <p>Receipt No: <b>${receipt.receiptNo}</b></p>
          <p>Amount Paid: <b>Rs. ${receipt.advancePaid}</b></p>
          <p>Regards,<br>SafeHome Pestochem India Pvt Ltd</p>
        `,
        attachments: [{ filename: `Receipt_${receipt.receiptNo}.pdf`, content: receiptBuffer, contentType: 'application/pdf' }],
      });
      break;

    default:
      console.warn('[Email Queue] Unknown job type:', type);
  }
};

// ── Public .add() API — matches Bull's queue.add() signature ─────────────────
// Controllers call: emailQueue.add({ type, data })
// This transparently uses Bull if Redis is up, or sends inline if not.
const emailQueue = {
  add: async (payload) => {
    if (useQueue && bullQueue) {
      // Background via Redis Bull
      return bullQueue.add(payload, {
        attempts: 2,
        backoff: { type: 'fixed', delay: 5000 },
        removeOnComplete: true,
      });
    }

    // Inline fallback — send directly (non-blocking best-effort)
    setImmediate(async () => {
      try {
        await processEmailJob(payload);
      } catch (err) {
        console.warn('[Email] Inline send failed:', err.message);
      }
    });
  },
};

// Boot
tryInitBull();

module.exports = emailQueue;

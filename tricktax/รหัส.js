/**
 * TRICKS TAX — Backend (Google Apps Script)
 * ตรงตาม flow ใน logic.md:
 *   หน้าแรก → FREE (เข้าเครื่องคำนวณทันที) / PRO (กรอกอีเมล → ตรวจสอบ → FREE หรือ PRO)
 *   ใช้งานแอป → ต้องการซื้อ PRO? → แสดง QR PromptPay → ลูกค้าสแกนจ่าย
 *   → กรอกอีเมล + เลขอ้างอิง → บันทึกคำขอ → (แอดมิน)ตรวจสอบการชำระเงิน → เปิด PRO อัตโนมัติ
 *
 * ตั้งค่าก่อนใช้งาน (แก้ในบล็อก CONFIG ด้านล่าง):
 *   1. SPREADSHEET_ID  → ใส่ Sheet ID ของคุณ
 *   2. ADMIN_EMAIL     → อีเมลแอดมินที่จะรับแจ้งเตือนคำขอเปิด PRO ใหม่
 *   3. PROMPTPAY_ID / PRICE_THB ในไฟล์ mobile_app.html ให้ตรงกับราคาที่ตั้งไว้ที่นี่ (PRICE_THB)
 *
 * หลังวาง Code.gs และ mobile_app.html (เปลี่ยนชื่อไฟล์เป็น index หรือใช้ include) ในโปรเจกต์เดียวกันแล้ว:
 *   - รันฟังก์ชัน setup() หนึ่งครั้งจาก editor เพื่อสร้างชีต/หัวตาราง และตั้ง Trigger อัตโนมัติ
 *   - Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone)
 */

// ============================================================
// CONFIG — แก้ตรงนี้จุดเดียว
// ============================================================
const CONFIG = {
  SPREADSHEET_ID: '1Qwz2_SM9j_B9MN6hjWkjkN3LJrdjhvmXW54Tc6B2W0c', // <-- ใส่ Sheet ID ของคุณ
  ADMIN_EMAIL: 'Punyawat.arm5@gmail.com',             // <-- อีเมลแอดมินรับแจ้งเตือน
  PRICE_THB: 199,
  PREMIUM_DURATION_DAYS: 365,
  APP_NAME: 'Tricks Tax',
  // วันสุดท้ายยื่นภาษี (เดือน-วัน) ใช้คำนวณว่าจะส่งอีเมลเตือนวันไหนบ้าง
  DEADLINE_MONTH: 3,   // มีนาคม
  DEADLINE_DAY: 31,
  REMINDER_DAYS_BEFORE: [30, 14, 7, 1] // ส่งเตือนตอนเหลือกี่วันก่อนกำหนด
};

const SHEETS = {
  MEMBERS: 'Members',
  UPGRADE_REQUESTS: 'UpgradeRequests',
  TAX_DATA: 'TaxData',
  HISTORY: 'History',
  REMINDERS: 'Reminders'
};

// ============================================================
// เว็บแอป entry point
// ============================================================
function doGet() {
  return HtmlService.createTemplateFromFile('trick tax')
    .evaluate()
    .setTitle(CONFIG.APP_NAME)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
// setup() — รันครั้งเดียวจาก editor: สร้างชีต + หัวตาราง + ตั้ง trigger
// ============================================================
function setup() {
  getSheet_(SHEETS.MEMBERS, ['Email', 'Premium', 'PremiumUntil', 'UpdatedAt']);
  getSheet_(SHEETS.UPGRADE_REQUESTS, ['Timestamp', 'Email', 'Ref', 'Approved', 'ApprovedAt', 'Status']);
  getSheet_(SHEETS.TAX_DATA, ['Timestamp', 'Email', 'Salary', 'Business', 'Freelance', 'Insurance', 'LumpSum',
    'WithholdingTax', 'PlanIns', 'PlanFund', 'PlanThaiEsg', 'Notes', 'CalculatedTax', 'NetIncome']);
  getSheet_(SHEETS.HISTORY, ['Timestamp', 'Email', 'Gross', 'CalculatedTax', 'NetIncome',
    'WithholdingTax', 'PlanIns', 'PlanFund', 'PlanThaiEsg', 'Notes']);
  getSheet_(SHEETS.REMINDERS, ['Email', 'Enabled', 'UpdatedAt']);

  // ผูก onEdit แบบ installable trigger (ให้สิทธิ์ส่งอีเมลได้ ต่างจาก simple onEdit)
  const ss = getSpreadsheet_();
  const already = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'onEditInstallable_');
  if (!already) {
    ScriptApp.newTrigger('onEditInstallable_').forSpreadsheet(ss).onEdit().create();
  }
  // Trigger รายวันสำหรับส่งอีเมลเตือนก่อนวันยื่นภาษี
  const dailyExists = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'sendDeadlineReminders');
  if (!dailyExists) {
    ScriptApp.newTrigger('sendDeadlineReminders').timeBased().everyDays(1).atHour(8).create();
  }
  Logger.log('Setup เสร็จสิ้น: สร้างชีตและ trigger เรียบร้อย');
}

// ============================================================
// Helpers
// ============================================================
function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function getSheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

function normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function findRowByEmail_(sheet, emailColIndex, email) {
  const data = sheet.getDataRange().getValues();
  const target = normalizeEmail_(email);
  for (let i = 1; i < data.length; i++) {
    if (normalizeEmail_(data[i][emailColIndex]) === target) {
      return { rowIndex: i + 1, values: data[i] };
    }
  }
  return null;
}

function addDaysISO_(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function fmtDateTH_(date) {
  return Utilities.formatDate(new Date(date), Session.getScriptTimeZone() || 'Asia/Bangkok', 'dd/MM/yyyy');
}

// ============================================================
// Membership
// ============================================================
function TT_getMembership(email) {
  const sh = getSheet_(SHEETS.MEMBERS, ['Email', 'Premium', 'PremiumUntil', 'UpdatedAt']);
  const found = findRowByEmail_(sh, 0, email);
  if (!found) return { premium: false, premiumUntil: null };

  const [, premiumFlag, premiumUntil] = found.values;
  const untilDate = premiumUntil ? new Date(premiumUntil) : null;
  const stillValid = !!premiumFlag && untilDate && untilDate.getTime() >= Date.now();

  // หมดอายุแล้ว → auto ปิดสถานะ
  if (premiumFlag && untilDate && !stillValid) {
    sh.getRange(found.rowIndex, 2).setValue(false);
  }

  return {
    premium: stillValid,
    premiumUntil: untilDate ? untilDate.toISOString() : null
  };
}

function upsertMember_(email, premium, premiumUntilDate) {
  const sh = getSheet_(SHEETS.MEMBERS, ['Email', 'Premium', 'PremiumUntil', 'UpdatedAt']);
  const found = findRowByEmail_(sh, 0, email);
  const now = new Date();
  if (found) {
    sh.getRange(found.rowIndex, 2, 1, 3).setValues([[premium, premiumUntilDate || '', now]]);
  } else {
    sh.appendRow([normalizeEmail_(email), premium, premiumUntilDate || '', now]);
  }
}

// ============================================================
// Upgrade request (ลูกค้าจ่ายเงิน → กรอกอีเมล+เลขอ้างอิง)
// ============================================================
function TT_submitUpgradeRequest(payload) {
  const email = normalizeEmail_(payload && payload.email);
  const ref = String((payload && payload.ref) || '').trim();
  if (!email || email.indexOf('@') === -1) throw new Error('อีเมลไม่ถูกต้อง');
  if (!ref) throw new Error('กรุณากรอกเลขอ้างอิง/หมายเหตุการโอน');

  const sh = getSheet_(SHEETS.UPGRADE_REQUESTS, ['Timestamp', 'Email', 'Ref', 'Approved', 'ApprovedAt', 'Status']);
  sh.appendRow([new Date(), email, ref, false, '', 'PENDING']);

  notifyAdminNewRequest_(email, ref);
  return { ok: true };
}

function notifyAdminNewRequest_(email, ref) {
  if (!CONFIG.ADMIN_EMAIL || CONFIG.ADMIN_EMAIL.indexOf('@') === -1) return;
  try {
    MailApp.sendEmail({
      to: CONFIG.ADMIN_EMAIL,
      subject: `[${CONFIG.APP_NAME}] คำขอเปิด PRO ใหม่ — ${email}`,
      body: `มีคำขอเปิด Premium ใหม่\n\nอีเมล: ${email}\nเลขอ้างอิง: ${ref}\nเวลา: ${fmtDateTH_(new Date())}\n\nกรุณาตรวจสอบยอดโอนใน PromptPay แล้วติ๊กช่อง "Approved" ในชีต UpgradeRequests เพื่อเปิด PRO ให้ลูกค้าอัตโนมัติ`
    });
  } catch (e) {
    Logger.log('notifyAdminNewRequest_ failed: ' + e);
  }
}

/**
 * Installable onEdit trigger: เมื่อแอดมินติ๊ก Approved = TRUE ในชีต UpgradeRequests
 * → เปิด PRO ให้อีเมลนั้นอัตโนมัติ (คอลัมน์ D = Approved, checkbox)
 */
function onEditInstallable_(e) {
  try {
    const sh = e.range.getSheet();
    if (sh.getName() !== SHEETS.UPGRADE_REQUESTS) return;
    if (e.range.getColumn() !== 4) return; // คอลัมน์ D = Approved
    if (e.range.getRow() === 1) return;    // หัวตาราง

    const approved = e.range.getValue() === true;
    if (!approved) return;

    const row = e.range.getRow();
    const email = normalizeEmail_(sh.getRange(row, 2).getValue());
    const statusCell = sh.getRange(row, 6);
    if (statusCell.getValue() === 'APPROVED') return; // กันอนุมัติซ้ำ

    const until = addDaysISO_(new Date(), CONFIG.PREMIUM_DURATION_DAYS);
    upsertMember_(email, true, until);

    sh.getRange(row, 5).setValue(new Date()); // ApprovedAt
    statusCell.setValue('APPROVED');

    notifyCustomerApproved_(email, until);
  } catch (err) {
    Logger.log('onEditInstallable_ error: ' + err);
  }
}

function notifyCustomerApproved_(email, untilDate) {
  if (!email || email.indexOf('@') === -1) return;
  try {
    MailApp.sendEmail({
      to: email,
      subject: `[${CONFIG.APP_NAME}] เปิดใช้งาน PRO เรียบร้อยแล้ว 🎉`,
      body: `สวัสดีครับ\n\nระบบตรวจสอบการชำระเงินเรียบร้อยแล้ว บัญชีของคุณ (${email}) ได้รับสิทธิ์ PRO แล้ว\nใช้งานได้ถึงวันที่ ${fmtDateTH_(untilDate)}\n\nขอบคุณที่ใช้บริการ ${CONFIG.APP_NAME}`
    });
  } catch (e) {
    Logger.log('notifyCustomerApproved_ failed: ' + e);
  }
}

// ============================================================
// Tax data (ทุกครั้งที่กดคำนวณ+บันทึก)
// ============================================================
function saveTaxData(data) {
  const sh = getSheet_(SHEETS.TAX_DATA, ['Timestamp', 'Email', 'Salary', 'Business', 'Freelance', 'Insurance',
    'LumpSum', 'WithholdingTax', 'PlanIns', 'PlanFund', 'PlanThaiEsg', 'Notes', 'CalculatedTax', 'NetIncome']);
  sh.appendRow([
    new Date(),
    normalizeEmail_(data.email),
    Number(data.salary || 0),
    Number(data.business || 0),
    Number(data.freelance || 0),
    Number(data.insurance || 0),
    Number(data.lumpSum || 0),
    Number(data.withholdingTax || 0),
    Number(data.planIns || 0),
    Number(data.planFund || 0),
    Number(data.planThaiEsg || 0),
    String(data.notes || ''),
    Number(data.calculatedTax || 0),
    Number(data.netIncome || 0)
  ]);
  return { ok: true };
}

// ============================================================
// Premium history / snapshot (สำหรับฟีเจอร์ Premium: ประวัติ, เปรียบเทียบ, export CSV)
// ============================================================
function TT_savePremiumSnapshot(payload) {
  const email = normalizeEmail_(payload && payload.email);
  if (!email) return { ok: false };
  const sh = getSheet_(SHEETS.HISTORY, ['Timestamp', 'Email', 'Gross', 'CalculatedTax', 'NetIncome',
    'WithholdingTax', 'PlanIns', 'PlanFund', 'PlanThaiEsg', 'Notes']);
  sh.appendRow([
    new Date(),
    email,
    Number(payload.gross || 0),
    Number(payload.calculatedTax || 0),
    Number(payload.netIncome || 0),
    Number(payload.withholdingTax || 0),
    Number(payload.planIns || 0),
    Number(payload.planFund || 0),
    Number(payload.planThaiEsg || 0),
    String(payload.notes || '')
  ]);
  return { ok: true };
}

function TT_getTaxHistory(email) {
  const target = normalizeEmail_(email);
  if (!target) return [];
  const sh = getSheet_(SHEETS.HISTORY, ['Timestamp', 'Email', 'Gross', 'CalculatedTax', 'NetIncome',
    'WithholdingTax', 'PlanIns', 'PlanFund', 'PlanThaiEsg', 'Notes']);
  const data = sh.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    if (normalizeEmail_(data[i][1]) === target) {
      rows.push({
        date: fmtDateTH_(data[i][0]),
        gross: data[i][2],
        tax: data[i][3],
        net: data[i][4]
      });
    }
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  return rows;
}

// ============================================================
// Deadline reminder (แจ้งเตือนก่อนวันยื่นภาษี)
// ============================================================
function TT_getDeadlineReminderStatus(email) {
  const sh = getSheet_(SHEETS.REMINDERS, ['Email', 'Enabled', 'UpdatedAt']);
  const found = findRowByEmail_(sh, 0, email);
  return { enabled: !!(found && found.values[1] === true) };
}

function TT_setDeadlineReminderStatus(email, enabled) {
  const target = normalizeEmail_(email);
  if (!target) throw new Error('ไม่พบอีเมลผู้ใช้งาน');
  const sh = getSheet_(SHEETS.REMINDERS, ['Email', 'Enabled', 'UpdatedAt']);
  const found = findRowByEmail_(sh, 0, target);
  const now = new Date();
  if (found) {
    sh.getRange(found.rowIndex, 2, 1, 2).setValues([[!!enabled, now]]);
  } else {
    sh.appendRow([target, !!enabled, now]);
  }
  return { enabled: !!enabled };
}

/**
 * รันทุกวัน (ตั้ง trigger ไว้ใน setup()) — ส่งอีเมลเตือนเฉพาะวันที่ตรงกับ
 * CONFIG.REMINDER_DAYS_BEFORE ก่อนถึงวันที่ 31 มี.ค. ให้เฉพาะสมาชิก PRO
 * ที่เปิดรับการแจ้งเตือนไว้
 */
function sendDeadlineReminders() {
  const now = new Date();
  const year = now.getMonth() < CONFIG.DEADLINE_MONTH ? now.getFullYear()
    : (now.getMonth() === CONFIG.DEADLINE_MONTH - 1 && now.getDate() <= CONFIG.DEADLINE_DAY ? now.getFullYear() : now.getFullYear() + 1);
  const deadline = new Date(year, CONFIG.DEADLINE_MONTH - 1, CONFIG.DEADLINE_DAY);
  const daysLeft = Math.round((deadline - now) / (1000 * 60 * 60 * 24));

  if (CONFIG.REMINDER_DAYS_BEFORE.indexOf(daysLeft) === -1) return;

  const reminderSh = getSheet_(SHEETS.REMINDERS, ['Email', 'Enabled', 'UpdatedAt']);
  const reminderData = reminderSh.getDataRange().getValues();
  const enabledEmails = [];
  for (let i = 1; i < reminderData.length; i++) {
    if (reminderData[i][1] === true) enabledEmails.push(normalizeEmail_(reminderData[i][0]));
  }
  if (!enabledEmails.length) return;

  const membersSh = getSheet_(SHEETS.MEMBERS, ['Email', 'Premium', 'PremiumUntil', 'UpdatedAt']);
  const membersData = membersSh.getDataRange().getValues();
  const premiumEmails = new Set();
  for (let i = 1; i < membersData.length; i++) {
    const untilDate = membersData[i][2] ? new Date(membersData[i][2]) : null;
    if (membersData[i][1] === true && untilDate && untilDate.getTime() >= Date.now()) {
      premiumEmails.add(normalizeEmail_(membersData[i][0]));
    }
  }

  enabledEmails.forEach(email => {
    if (!premiumEmails.has(email)) return;
    try {
      MailApp.sendEmail({
        to: email,
        subject: `[${CONFIG.APP_NAME}] เหลืออีก ${daysLeft} วันก่อนถึงกำหนดยื่นภาษี`,
        body: `แจ้งเตือนจาก ${CONFIG.APP_NAME}\n\nเหลือเวลาอีก ${daysLeft} วัน ก่อนถึงกำหนดยื่นภาษีเงินได้บุคคลธรรมดา (${CONFIG.DEADLINE_DAY}/${CONFIG.DEADLINE_MONTH}/${year})\n\nเข้าแอปเพื่อตรวจสอบและคำนวณภาษีของคุณอีกครั้งได้เลย`
      });
    } catch (e) {
      Logger.log('sendDeadlineReminders failed for ' + email + ': ' + e);
    }
  });
}

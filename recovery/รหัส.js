/**********************************************************************
 * RECOVERY APP - Code.gs
 * ระบบบันทึกรายการรับซื้อของเก่า + วิเคราะห์ลูกค้า + ออกบิล PDF
 *
 * วิธีติดตั้ง (ทำครั้งเดียว):
 * 1. เปิด https://script.google.com -> สร้างโปรเจกต์ใหม่ (New project)
 * 2. วางไฟล์นี้ทับไฟล์ Code.gs เดิม
 * 3. เพิ่มไฟล์ HTML ชื่อ "recovery" แล้ววางเนื้อหาไฟล์ recovery.html ที่ได้ให้
 *    (ชื่อไฟล์ต้องตรงกับที่ doGet() เรียกใช้ทุกตัวอักษร ไม่งั้นแอปจะเปิดไม่ขึ้นเลย)
 * 4. กลับมาไฟล์นี้ เลือกฟังก์ชัน setupProject แล้วกด Run (รันครั้งเดียว)
 *    - ระบบจะสร้าง Google Sheet ใหม่ชื่อ "recovery-database"
 *    - ระบบจะสร้างโฟลเดอร์ Drive ใหม่ชื่อ "recovery-PDF" สำหรับเก็บบิล PDF
 *    - ดู URL ทั้งสองได้จาก Logs (Ctrl+Enter หรือเมนู Execution log)
 * 5. เมื่อพร้อมจะย้ายที่เก็บ PDF ไปโฟลเดอร์อื่นในอนาคต ให้นำ "URL โฟลเดอร์ Drive"
 *    มาวางแทนที่ค่าว่างใน CONFIG.PDF_FOLDER_URL_OVERRIDE ด้านล่าง แล้วบันทึก
 *    (ไม่ต้องรัน setupProject ซ้ำ ระบบจะใช้โฟลเดอร์ใหม่ที่ระบุทันที)
 * 6. Deploy > New deployment > Web app > Execute as: Me, Who has access: ตามต้องการ
 **********************************************************************/

// ======================= CONFIG (แก้ไขได้) =======================
const CONFIG = {
  // สเปรดชีตฐานข้อมูลที่ใช้งานจริง (นำ ID จากลิงก์ชีตมาวางตรงนี้)
  // ถ้าปล่อยว่าง ระบบจะใช้ชีตที่ setupProject() เคยสร้างไว้แทน
  SPREADSHEET_ID: '1uJwlG-m98dNswq8ncGBcqiXlF4imbEAJ-DUea0k_U1Y',

  // ชื่อชีตย่อยต่าง ๆ ภายในสเปรดชีต
  SHEET_MASTER_ITEMS: 'รายการสินค้า',   // ชีตรายการสินค้าที่รับซื้อ (ประเภท/รายการ/ราคา/หน่วย)
  SHEET_SALES: 'ข้อมูลการขาย',          // ชีตบันทึกทุกรายการที่บันทึกจากหน้าออกบิล

  // โฟลเดอร์ Drive สำหรับเก็บ PDF ใบเสร็จ (นำ URL โฟลเดอร์มาวางตรงนี้)
  // ถ้าปล่อยว่างไว้ ระบบจะใช้โฟลเดอร์ที่ setupProject() สร้างให้อัตโนมัติ
  PDF_FOLDER_URL_OVERRIDE: 'https://drive.google.com/drive/folders/1QwAcJ1nFQcGedyIYPlLPVOkOY46-a3Rh?usp=sharing',

  // เกณฑ์แบ่งระดับลูกค้า (ยอดซื้อสะสมบาท ในช่วงเวลาที่เลือกดู)
  CUSTOMER_LEVELS: [
    { min: 1500, label: 'VIP' },
    { min: 1000, label: 'ระดับทอง' },
    { min: 500,  label: 'ระดับเงิน' },
    { min: 200,     label: 'ทั่วไป' }
  ]
};

// เวอร์ชันของสคริปต์นี้ ใช้เช็คว่า deploy เวอร์ชันล่าสุดสำเร็จหรือยัง
function getAppVersion() {
  return 'v6-edit-bill-and-manage-items-2026-09-09';
}

// ======================= DEBUG: รันฟังก์ชันนี้ตรง ๆ ในตัวแก้ไขเพื่อดูผลลัพธ์จริง =======================
// วิธีใช้: 1) แก้ชื่อลูกค้าในบรรทัดถัดไปให้ตรงกับที่ต้องการทดสอบ (คัดลอกมาจาก dropdown ในแอปเป๊ะ ๆ)
//         2) เลือกฟังก์ชัน "debugCustomerHistory" จากเมนู dropdown ข้างปุ่ม "เรียกใช้" ด้านบน
//         3) กด "เรียกใช้" แล้วดูผลลัพธ์เต็ม ๆ ที่แผง "บันทึกการดำเนินการ" ด้านล่าง
function debugCustomerHistory() {
  const testName = 'เอกชัย 62'; // <-- แก้ตรงนี้ให้ตรงกับชื่อลูกค้าที่มีปัญหา
  Logger.log('CONFIG.SPREADSHEET_ID = ' + CONFIG.SPREADSHEET_ID);
  try {
    const ss = getSpreadsheet_();
    Logger.log('เปิดสเปรดชีตสำเร็จ: ' + ss.getUrl());
    const sheet = getSheet_(CONFIG.SHEET_SALES);
    Logger.log('พบชีต "' + CONFIG.SHEET_SALES + '" แล้ว, จำนวนแถวข้อมูล = ' + sheet.getLastRow() + ', จำนวนคอลัมน์ทั้งหมดของชีต = ' + sheet.getMaxColumns());
    const names = getCustomerNameList();
    Logger.log('รายชื่อลูกค้าทั้งหมดในระบบ: ' + JSON.stringify(names));
    Logger.log('มีชื่อ "' + testName + '" อยู่ในรายชื่อหรือไม่: ' + names.includes(testName));
  } catch (e) {
    Logger.log('เกิดข้อผิดพลาดระหว่างตรวจสอบเบื้องต้น: ' + e.message + '\n' + e.stack);
  }

  const result = getCustomerHistory(testName);
  Logger.log('ผลลัพธ์จาก getCustomerHistory: ' + JSON.stringify(result, null, 2));

  // ตรวจสอบชนิดข้อมูลดิบของทุกเซลล์ในแถวของลูกค้าคนนี้ (ช่วยหาค่าประหลาดที่ทำให้ส่งข้อมูลกลับเบราว์เซอร์ไม่ได้)
  try {
    const sheet2 = getSheet_(CONFIG.SHEET_SALES);
    const values2 = getSalesValues_(sheet2);
    const headers = ['วันเวลา','เลขที่บิล','ชื่อลูกค้า','ประเภท','รายการ','จำนวนรอบ','น้ำหนัก','หน่วย','ราคาต่อหน่วย','ยอดรวม','ลิงก์PDF'];
    values2.forEach(function(row, i) {
      if (String(row[2]).trim() !== testName.trim()) return;
      Logger.log('--- แถวข้อมูลดิบที่ ' + (i + 2) + ' ---');
      row.forEach(function(cell, colIdx) {
        Logger.log('  [' + (headers[colIdx] || ('คอลัมน์ ' + colIdx)) + '] ชนิด=' + (typeof cell) + (cell instanceof Date ? '(Date)' : '') + ' ค่า=' + cell);
      });
    });
  } catch (e2) {
    Logger.log('ตรวจสอบแถวดิบไม่สำเร็จ: ' + e2.message);
  }
}

// ======================= ENTRY POINT =======================
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('recovery')
    .setTitle('recovery')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ======================= SETUP (รันครั้งเดียว หรือรันซ้ำได้อย่างปลอดภัย) =======================
function setupProject() {
  const props = PropertiesService.getScriptProperties();

  // 1) เปิดสเปรดชีตที่กำหนดใน CONFIG ถ้ามี ไม่งั้นสร้างใหม่ (หรือใช้ตัวที่เคยสร้างไว้)
  let ss;
  const configId = (CONFIG.SPREADSHEET_ID || '').trim();
  if (configId) {
    ss = SpreadsheetApp.openById(configId);
  } else {
    const existingId = props.getProperty('SPREADSHEET_ID');
    if (existingId) {
      ss = SpreadsheetApp.openById(existingId);
    } else {
      ss = SpreadsheetApp.create('recovery-database');
      props.setProperty('SPREADSHEET_ID', ss.getId());
    }
  }

  // 2) สร้างชีตรายการสินค้า พร้อมหัวตาราง
  let masterSheet = ss.getSheetByName(CONFIG.SHEET_MASTER_ITEMS);
  if (!masterSheet) {
    masterSheet = ss.getSheets()[0];
    masterSheet.setName(CONFIG.SHEET_MASTER_ITEMS);
    masterSheet.appendRow(['ประเภท', 'รายการ', 'ราคา', 'หน่วยเรียก']);
    masterSheet.appendRow(['เศษเหล็ก', 'เหล็กหนา', 8, 'กก.']);
    masterSheet.appendRow(['เศษเหล็ก', 'เหล็กบาง', 6, 'กก.']);
    masterSheet.appendRow(['พลาสติก', 'ขวด PET', 12, 'กก.']);
    masterSheet.appendRow(['อุปกรณ์ไฟฟ้า', 'แบตเตอรี่รถยนต์', 25, 'ลูก']);
    masterSheet.setFrozenRows(1);
  }

  // 3) สร้างชีตข้อมูลการขาย พร้อมหัวตาราง
  let salesSheet = ss.getSheetByName(CONFIG.SHEET_SALES);
  if (!salesSheet) {
    salesSheet = ss.insertSheet(CONFIG.SHEET_SALES);
    salesSheet.appendRow([
      'วันเวลา', 'เลขที่บิล', 'ชื่อลูกค้า', 'ประเภท', 'รายการ',
      'จำนวนรอบ', 'น้ำหนัก/จำนวนรวม', 'หน่วย', 'ราคาต่อหน่วย', 'ยอดรวม', 'ลิงก์ PDF'
    ]);
    salesSheet.setFrozenRows(1);
  }

  // 4) สร้างโฟลเดอร์ Drive สำหรับเก็บ PDF (ถ้ายังไม่เคยสร้าง)
  let folderId = props.getProperty('PDF_FOLDER_ID');
  let folder;
  if (folderId) {
    folder = DriveApp.getFolderById(folderId);
  } else {
    folder = DriveApp.createFolder('recovery-PDF');
    props.setProperty('PDF_FOLDER_ID', folder.getId());
  }

  Logger.log('ตั้งค่าเรียบร้อยแล้ว!');
  Logger.log('ลิงก์สเปรดชีต: ' + ss.getUrl());
  Logger.log('ลิงก์โฟลเดอร์เก็บ PDF: ' + folder.getUrl());
  Logger.log('หากต้องการเปลี่ยนปลายทางโฟลเดอร์ PDF ในภายหลัง ให้นำลิงก์โฟลเดอร์ใหม่ไปวางใน CONFIG.PDF_FOLDER_URL_OVERRIDE');

  return { spreadsheetUrl: ss.getUrl(), pdfFolderUrl: folder.getUrl() };
}

// ======================= HELPERS =======================
function getSpreadsheet_() {
  // ให้ความสำคัญกับ ID ที่กำหนดตายตัวใน CONFIG ก่อนเสมอ
  const configId = (CONFIG.SPREADSHEET_ID || '').trim();
  if (configId) {
    return SpreadsheetApp.openById(configId);
  }
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('ยังไม่ได้ตั้งค่าโปรเจกต์ กรุณารันฟังก์ชัน setupProject() ก่อนใช้งาน หรือกำหนด CONFIG.SPREADSHEET_ID');
  }
  return SpreadsheetApp.openById(id);
}

function getSheet_(name) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new Error('ไม่พบชีตชื่อ "' + name + '" กรุณารัน setupProject() อีกครั้ง');
  }
  return sheet;
}

// คืนค่าโฟลเดอร์ Drive สำหรับเก็บ PDF โดยให้ความสำคัญกับ URL ที่ผู้ใช้กำหนดเองก่อน
function getPdfFolder_() {
  const override = (CONFIG.PDF_FOLDER_URL_OVERRIDE || '').trim();
  if (override) {
    const id = extractDriveIdFromUrl_(override);
    if (id) return DriveApp.getFolderById(id);
  }
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty('PDF_FOLDER_ID');
  if (folderId) return DriveApp.getFolderById(folderId);

  // สำรอง: ถ้ายังไม่เคยตั้งค่าอะไรเลย ให้สร้างโฟลเดอร์ใหม่ทันที
  const folder = DriveApp.createFolder('recovery-PDF');
  props.setProperty('PDF_FOLDER_ID', folder.getId());
  return folder;
}

function extractDriveIdFromUrl_(url) {
  const m = url.match(/[-\w]{25,}/);
  return m ? m[0] : null;
}

function formatDateKey_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// คืนค่าวันจันทร์ของสัปดาห์ที่ date อยู่ (ใช้จัดกลุ่มยอดขายรายสัปดาห์)
function getMondayOfWeek_(date) {
  const day = date.getDay(); // 0=อาทิตย์
  const diffToMonday = (day === 0 ? 6 : day - 1);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - diffToMonday);
}

// ---------- ตัวช่วยแปลงค่าเซลล์ให้เป็นข้อมูลพื้นฐานที่ส่งกลับเบราว์เซอร์ได้เสมอ ----------
// กันปัญหา: เซลล์มีค่า error จากสูตร (#REF!, #N/A ฯลฯ), วันที่ผิดรูปแบบ, หรือค่าว่าง
// ซึ่งถ้าไม่แปลงก่อน อาจทำให้ google.script.run ส่งผลลัพธ์กลับมาเป็น null ทั้งก้อนโดยไม่มี error ให้เห็นเลย
function safeString_(v) {
  if (v === null || v === undefined) return '';
  try { return String(v).trim(); } catch (e) { return ''; }
}
function safeNumber_(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}
function safeDateString_(v) {
  try {
    const d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.toISOString();
  } catch (e) {
    return '';
  }
}

// อ่านข้อมูลทั้งหมดจากชีตข้อมูลการขายอย่างปลอดภัย (กันปัญหาชีตมีจำนวนคอลัมน์ไม่ครบ 11 คอลัมน์)
const SALES_COLS = 11; // วันเวลา,เลขที่บิล,ชื่อลูกค้า,ประเภท,รายการ,จำนวนรอบ,น้ำหนัก/จำนวนรวม,หน่วย,ราคาต่อหน่วย,ยอดรวม,ลิงก์PDF
function getSalesValues_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const numCols = Math.min(SALES_COLS, sheet.getMaxColumns());
  const values = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  // เติมคอลัมน์ที่ขาดหายไปให้ครบ 11 ช่อง เพื่อไม่ให้ index หลุด
  if (numCols < SALES_COLS) {
    return values.map(function(row) {
      while (row.length < SALES_COLS) row.push('');
      return row;
    });
  }
  return values;
}

// ======================= 1) รายการสินค้า (Master Items) =======================
function getMasterItemsFromSheet() {
  const sheet = getSheet_(CONFIG.SHEET_MASTER_ITEMS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const items = [];
  values.forEach(function(row) {
    const category = row[0], name = row[1], price = row[2], unit = row[3];
    if (!category || !name) return; // ข้ามแถวว่าง
    items.push({
      category: String(category).trim(),
      name: String(name).trim(),
      price: Number(price) || 0,
      unit: unit ? String(unit).trim() : 'หน่วย'
    });
  });
  return items;
}

// เพิ่มประเภท/รายการใหม่ที่ผู้ใช้พิมพ์เอง ลงในชีตรายการสินค้า (Master Items)
// รับ: { category, name, price, unit } คืนค่า: { status, items } โดย items คือรายการสินค้าล่าสุดทั้งหมด
function addMasterItem(itemData) {
  try {
    const category = safeString_(itemData && itemData.category);
    const name = safeString_(itemData && itemData.name);
    const price = safeNumber_(itemData && itemData.price);
    const unit = safeString_(itemData && itemData.unit) || 'หน่วย';

    if (!category || !name) {
      return { status: 'error', message: 'กรุณาระบุประเภทและชื่อรายการให้ครบถ้วน' };
    }

    const sheet = getSheet_(CONFIG.SHEET_MASTER_ITEMS);
    const items = getMasterItemsFromSheet();
    const exists = items.some(function(it) {
      return it.category.trim().toLowerCase() === category.toLowerCase() &&
             it.name.trim().toLowerCase() === name.toLowerCase();
    });

    if (!exists) {
      sheet.appendRow([category, name, price, unit]);
    }

    return { status: 'success', items: getMasterItemsFromSheet() };
  } catch (err) {
    var errMsg = (err && err.message) ? err.message : String(err);
    Logger.log('Error addMasterItem: ' + errMsg + (err && err.stack ? ('\n' + err.stack) : ''));
    return { status: 'error', message: errMsg };
  }
}

// ======================= 2) บันทึกรายการขาย + สร้าง PDF =======================
function saveTransactionsToServer(transactions, customerName) {
  try {
    if (!transactions || transactions.length === 0) {
      return { status: 'error', message: 'ไม่มีรายการให้บันทึก' };
    }
    if (!customerName || !customerName.trim()) {
      return { status: 'error', message: 'กรุณาระบุชื่อลูกค้า' };
    }

    const sheet = getSheet_(CONFIG.SHEET_SALES);
    const now = new Date();
    const billId = 'BILL-' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');

    let grandTotal = 0;
    let totalWeight = 0;

    // สร้าง PDF ใบเสร็จก่อน เพื่อนำลิงก์ไปบันทึกในทุกแถว
    const pdfUrl = createReceiptPdf_(billId, customerName, transactions, now);

    const rows = transactions.map(function(tx) {
      grandTotal += tx.total;
      totalWeight += tx.weight;
      return [
        now,
        billId,
        customerName.trim(),
        tx.category,
        tx.name,
        (tx.rounds || []).join(' + '),
        tx.weight,
        tx.unit || 'หน่วย',
        tx.price,
        tx.total,
        pdfUrl
      ];
    });

    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

    return { status: 'success', billId: billId, pdfUrl: pdfUrl, grandTotal: grandTotal };
  } catch (err) {
    var errMsg = (err && err.message) ? err.message : String(err);
    Logger.log('Error: ' + errMsg + (err && err.stack ? ('\n' + err.stack) : ''));
    return { status: 'error', message: errMsg };
  }
}

// สร้างไฟล์ PDF ใบเสร็จ แล้วบันทึกลงโฟลเดอร์ที่กำหนดใน CONFIG
function createReceiptPdf_(billId, customerName, transactions, dateObj) {
  const dateStr = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm 'น.'");

  let rowsHtml = '';
  let totalWeight = 0, grandTotal = 0;
  transactions.forEach(function(tx) {
    totalWeight += tx.weight;
    grandTotal += tx.total;
    rowsHtml += '<tr>' +
      '<td>' + tx.name + '</td>' +
      '<td style="text-align:center;">' + (tx.rounds || []).length + ' รอบ<br>(' + tx.weight + ' ' + (tx.unit || '') + ')</td>' +
      '<td style="text-align:right;">' + tx.total.toFixed(2) + '</td>' +
      '</tr>';
  });

  const html = HtmlService.createHtmlOutput(
    '<html><head><meta charset="UTF-8"><style>' +
    'body{font-family:Sarabun,Arial,sans-serif;padding:20px;color:#1f2937;}' +
    'h2{color:#0f766e;margin-bottom:2px;}' +
    'table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px;}' +
    'th,td{border-bottom:1px solid #e2e8f0;padding:6px;text-align:left;}' +
    'th{color:#0f766e;}' +
    '.total{font-size:16px;font-weight:bold;color:#0f766e;text-align:right;margin-top:10px;}' +
    '</style></head><body>' +
    '<h2>ใบรับซื้อของเก่า</h2>' +
    '<div>เลขที่บิล: ' + billId + '</div>' +
    '<div>วันที่: ' + dateStr + '</div>' +
    '<div>ชื่อร้านค้า/ลูกค้า: ' + customerName + '</div>' +
    '<table><thead><tr><th>รายการ</th><th>รอบ/จำนวน</th><th>รวม (฿)</th></tr></thead>' +
    '<tbody>' + rowsHtml + '</tbody></table>' +
    '<div>น้ำหนัก/จำนวนรวม: ' + totalWeight.toFixed(2) + '</div>' +
    '<div class="total">ยอดเงินรวมทั้งสิ้น: ' + grandTotal.toFixed(2) + ' ฿</div>' +
    '</body></html>'
  );

  const pdfBlob = html.getBlob().getAs('application/pdf').setName(billId + '.pdf');
  const folder = getPdfFolder_();
  const file = folder.createFile(pdfBlob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

// ======================= 3) แดชบอร์ด =======================
function getDashboardData(startDateStr, endDateStr) {
  try {
    const sheet = getSheet_(CONFIG.SHEET_SALES);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { status: 'success', totalAmount: 0, totalWeight: 0, totalBills: 0, categories: {}, items: [] };
    }

    const start = startDateStr ? new Date(startDateStr + 'T00:00:00') : null;
    const end = endDateStr ? new Date(endDateStr + 'T23:59:59') : null;

    const values = getSalesValues_(sheet);
    let totalAmount = 0, totalWeight = 0;
    const billIds = new Set();
    const categories = {};
    const itemTotals = {};
    const dailyMap = {};  // 'yyyy-MM-dd' -> {amount, weight}
    const weeklyMap = {}; // 'yyyy-MM-dd' (วันจันทร์ของสัปดาห์นั้น) -> {amount, weight}

    values.forEach(function(row) {
      const date = row[0];
      const billId = safeString_(row[1]);
      const category = safeString_(row[3]) || 'ไม่ระบุ';
      const itemName = safeString_(row[4]) || 'ไม่ระบุ';
      const weight = safeNumber_(row[6]);
      const total = safeNumber_(row[9]);
      if (!(date instanceof Date) || isNaN(date.getTime())) return;
      if (start && date < start) return;
      if (end && date > end) return;

      totalAmount += total;
      totalWeight += weight;
      billIds.add(billId);
      categories[category] = (categories[category] || 0) + total;
      itemTotals[itemName] = (itemTotals[itemName] || 0) + total;

      const dayKey = formatDateKey_(date);
      if (!dailyMap[dayKey]) dailyMap[dayKey] = { amount: 0, weight: 0 };
      dailyMap[dayKey].amount += total;
      dailyMap[dayKey].weight += weight;

      const weekKey = formatDateKey_(getMondayOfWeek_(date));
      if (!weeklyMap[weekKey]) weeklyMap[weekKey] = { amount: 0, weight: 0 };
      weeklyMap[weekKey].amount += total;
      weeklyMap[weekKey].weight += weight;
    });

    const items = Object.keys(itemTotals)
      .map(function(name) { return { name: name, amount: itemTotals[name] }; })
      .sort(function(a, b) { return b.amount - a.amount; });

    const dailyTrend = Object.keys(dailyMap)
      .map(function(key) { return { date: key, amount: dailyMap[key].amount, weight: dailyMap[key].weight }; })
      .sort(function(a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });

    const weeklyTrend = Object.keys(weeklyMap)
      .map(function(key) { return { date: key, amount: weeklyMap[key].amount, weight: weeklyMap[key].weight }; })
      .sort(function(a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });

  return {
    status: 'success',
    totalAmount: totalAmount,
    totalWeight: totalWeight,
    totalBills: billIds.size,
    categories: categories,
    items: items,
    trend: { daily: dailyTrend, weekly: weeklyTrend }
  };
  } catch (err) {
    var errMsg = (err && err.message) ? err.message : String(err);
    Logger.log('Error: ' + errMsg + (err && err.stack ? ('\n' + err.stack) : ''));
    return { status: 'error', message: errMsg };
  }
}

// ======================= 4) วิเคราะห์ลูกค้า =======================
// period: 'week' | 'month' | 'all'
function getPeriodStartDate_(period) {
  const now = new Date();
  if (period === 'week') {
    const day = now.getDay(); // 0=อาทิตย์
    const diffToMonday = (day === 0 ? 6 : day - 1);
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
    return monday;
  }
  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return null; // 'all' หรือไม่ระบุ = ไม่กรอง
}

function classifyCustomerLevel_(totalAmount) {
  for (let i = 0; i < CONFIG.CUSTOMER_LEVELS.length; i++) {
    if (totalAmount >= CONFIG.CUSTOMER_LEVELS[i].min) {
      return CONFIG.CUSTOMER_LEVELS[i].label;
    }
  }
  return 'ทั่วไป';
}

function getAllCustomersSummary(period) {
  try {
    const sheet = getSheet_(CONFIG.SHEET_SALES);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { status: 'success', customers: [] };

    const startDate = getPeriodStartDate_(period);
    const values = getSalesValues_(sheet);

    const map = {}; // customerName -> {totalAmount, totalWeight, bills:Set, lastDate:Date}
    values.forEach(function(row) {
      const date = row[0], customerName = safeString_(row[2]), weight = safeNumber_(row[6]), total = safeNumber_(row[9]);
      const billId = safeString_(row[1]);
      if (!customerName) return;
      if (startDate && date instanceof Date && date < startDate) return;

      if (!map[customerName]) {
        map[customerName] = { totalAmount: 0, totalWeight: 0, bills: new Set(), lastDate: null };
      }
      map[customerName].totalAmount += total;
      map[customerName].totalWeight += weight;
      map[customerName].bills.add(billId);
      if (date instanceof Date && !isNaN(date.getTime())) {
        if (!map[customerName].lastDate || date > map[customerName].lastDate) {
          map[customerName].lastDate = date;
        }
      }
    });

    const customers = Object.keys(map).map(function(name) {
      const d = map[name];
      return {
        customerName: name,
        totalAmount: d.totalAmount,
        totalWeight: d.totalWeight,
        totalBills: d.bills.size,
        lastPurchaseDate: d.lastDate ? safeDateString_(d.lastDate) : '',
        level: classifyCustomerLevel_(d.totalAmount)
      };
    }).sort(function(a, b) { return b.totalAmount - a.totalAmount; });

    return { status: 'success', customers: customers };
  } catch (err) {
    var errMsg = (err && err.message) ? err.message : String(err);
    Logger.log('Error: ' + errMsg + (err && err.stack ? ('\n' + err.stack) : ''));
    return { status: 'error', message: errMsg };
  }
}

function getCustomerNameList() {
  const sheet = getSheet_(CONFIG.SHEET_SALES);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 3, lastRow - 1, 1).getValues(); // คอลัมน์ C = ชื่อลูกค้า
  const names = new Set();
  values.forEach(function(row) {
    if (row[0]) names.add(String(row[0]).trim());
  });
  return Array.from(names).sort();
}

function getCustomerHistory(customerName) {
  try {
    const sheet = getSheet_(CONFIG.SHEET_SALES);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { status: 'success', customerName: customerName, level: 'ทั่วไป', totalAmount: 0, totalWeight: 0, totalBills: 0, bills: [] };

    const values = getSalesValues_(sheet);
    let totalAmount = 0, totalWeight = 0;
    const billsMap = {}; // billId -> {billId, date, pdfUrl, total, weight, items:[]}

    values.forEach(function(row) {
      const rawDate = row[0], rawBillId = row[1], name = row[2];
      if (String(name).trim() !== String(customerName).trim()) return;

      // แปลงค่าทุกช่องให้เป็นชนิดข้อมูลพื้นฐาน (string/number) เสมอ
      // กันปัญหาเซลล์มีค่าพิเศษ (เช่น error จากสูตร, วันที่แบบแปลก ๆ) ที่ทำให้ส่งข้อมูลกลับเบราว์เซอร์ไม่ได้
      const billId = safeString_(rawBillId);
      const dateStr = safeDateString_(rawDate);
      const category = safeString_(row[3]);
      const itemName = safeString_(row[4]);
      const weight = safeNumber_(row[6]);
      const unit = safeString_(row[7]) || 'หน่วย';
      const price = safeNumber_(row[8]);
      const total = safeNumber_(row[9]);
      const pdfUrl = safeString_(row[10]);

      totalAmount += total;
      totalWeight += weight;

      if (!billsMap[billId]) {
        billsMap[billId] = { billId: billId, date: dateStr, pdfUrl: pdfUrl, total: 0, weight: 0, items: [] };
      }
      billsMap[billId].total += total;
      billsMap[billId].weight += weight;
      billsMap[billId].items.push({ category: category, item: itemName, weight: weight, unit: unit, price: price, total: total });
    });

    // เรียงบิลล่าสุดขึ้นก่อน
    const bills = Object.keys(billsMap)
      .map(function(id) { return billsMap[id]; })
      .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

    return {
      status: 'success',
      customerName: customerName,
      level: classifyCustomerLevel_(totalAmount),
      totalAmount: totalAmount,
      totalWeight: totalWeight,
      totalBills: bills.length,
      bills: bills
    };
  } catch (err) {
    var errMsg = (err && err.message) ? err.message : String(err);
    Logger.log('Error: ' + errMsg + (err && err.stack ? ('\n' + err.stack) : ''));
    return { status: 'error', message: errMsg };
  }
}

// ======================= 5) วันที่ข้อมูลเก่าสุด (ใช้ตั้งค่าเริ่มต้นของตัวกรองวันที่) =======================
function getEarliestSalesDate() {
  try {
    const sheet = getSheet_(CONFIG.SHEET_SALES);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { status: 'success', date: '' };
    const values = getSalesValues_(sheet);
    let earliest = null;
    values.forEach(function(row) {
      const d = row[0];
      if (d instanceof Date && !isNaN(d.getTime())) {
        if (!earliest || d < earliest) earliest = d;
      }
    });
    return { status: 'success', date: earliest ? formatDateKey_(earliest) : '' };
  } catch (err) {
    var errMsg = (err && err.message) ? err.message : String(err);
    Logger.log('Error getEarliestSalesDate: ' + errMsg);
    return { status: 'error', message: errMsg };
  }
}

// ======================= 6) วิเคราะห์เชิงลึกรายลูกค้า (สไตล์ Power BI) =======================
// customerName: '' หรือ null = ลูกค้าทั้งหมด
function getCustomerDetailedAnalysis(customerName, startDateStr, endDateStr) {
  try {
    const sheet = getSheet_(CONFIG.SHEET_SALES);
    const lastRow = sheet.getLastRow();
    const emptyResult = {
      status: 'success', customerName: customerName || '', totalAmount: 0, totalWeight: 0,
      totalBills: 0, byUnit: [], items: []
    };
    if (lastRow < 2) return emptyResult;

    const start = startDateStr ? new Date(startDateStr + 'T00:00:00') : null;
    const end = endDateStr ? new Date(endDateStr + 'T23:59:59') : null;
    const nameFilter = (customerName || '').trim();

    const values = getSalesValues_(sheet);
    let totalAmount = 0, totalWeight = 0;
    const billIds = new Set();
    const unitMap = {}; // unit -> {weight, amount}
    const items = [];

    values.forEach(function(row) {
      const rawDate = row[0];
      if (!(rawDate instanceof Date) || isNaN(rawDate.getTime())) return;
      if (start && rawDate < start) return;
      if (end && rawDate > end) return;

      const name = safeString_(row[2]);
      if (nameFilter && name !== nameFilter) return;

      const billId = safeString_(row[1]);
      const category = safeString_(row[3]);
      const itemName = safeString_(row[4]);
      const weight = safeNumber_(row[6]);
      const unit = safeString_(row[7]) || 'หน่วย';
      const price = safeNumber_(row[8]);
      const total = safeNumber_(row[9]);

      totalAmount += total;
      totalWeight += weight;
      billIds.add(billId);

      if (!unitMap[unit]) unitMap[unit] = { weight: 0, amount: 0 };
      unitMap[unit].weight += weight;
      unitMap[unit].amount += total;

      items.push({
        date: safeDateString_(rawDate),
        billId: billId,
        customerName: name,
        category: category,
        item: itemName,
        weight: weight,
        unit: unit,
        price: price,
        total: total
      });
    });

    items.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

    const byUnit = Object.keys(unitMap)
      .map(function(u) { return { unit: u, weight: unitMap[u].weight, amount: unitMap[u].amount }; })
      .sort(function(a, b) { return b.amount - a.amount; });

    return {
      status: 'success',
      customerName: nameFilter,
      totalAmount: totalAmount,
      totalWeight: totalWeight,
      totalBills: billIds.size,
      byUnit: byUnit,
      items: items
    };
  } catch (err) {
    var errMsg = (err && err.message) ? err.message : String(err);
    Logger.log('Error getCustomerDetailedAnalysis: ' + errMsg + (err && err.stack ? ('\n' + err.stack) : ''));
    return { status: 'error', message: errMsg };
  }
}

// ======================= 7) วิเคราะห์สินค้า: รายการนี้ลูกค้าคนไหนซื้อมากที่สุด =======================
function getTopCustomersForItem(category, itemName, startDateStr, endDateStr) {
  try {
    const sheet = getSheet_(CONFIG.SHEET_SALES);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { status: 'success', customers: [] };

    const start = startDateStr ? new Date(startDateStr + 'T00:00:00') : null;
    const end = endDateStr ? new Date(endDateStr + 'T23:59:59') : null;
    const catFilter = safeString_(category);
    const nameFilter = safeString_(itemName);

    const values = getSalesValues_(sheet);
    const map = {}; // customerName -> {amount, weight, bills:Set, unit}

    values.forEach(function(row) {
      const rawDate = row[0];
      if (!(rawDate instanceof Date) || isNaN(rawDate.getTime())) return;
      if (start && rawDate < start) return;
      if (end && rawDate > end) return;

      const rowCategory = safeString_(row[3]);
      const rowItemName = safeString_(row[4]);
      if (rowCategory !== catFilter || rowItemName !== nameFilter) return;

      const customerName = safeString_(row[2]);
      if (!customerName) return;
      const billId = safeString_(row[1]);
      const weight = safeNumber_(row[6]);
      const unit = safeString_(row[7]) || 'หน่วย';
      const total = safeNumber_(row[9]);

      if (!map[customerName]) map[customerName] = { amount: 0, weight: 0, bills: new Set(), unit: unit };
      map[customerName].amount += total;
      map[customerName].weight += weight;
      map[customerName].bills.add(billId);
    });

    const customers = Object.keys(map).map(function(name) {
      const d = map[name];
      return { customerName: name, amount: d.amount, weight: d.weight, unit: d.unit, totalBills: d.bills.size };
    }).sort(function(a, b) { return b.amount - a.amount; });

    return { status: 'success', customers: customers };
  } catch (err) {
    var errMsg = (err && err.message) ? err.message : String(err);
    Logger.log('Error getTopCustomersForItem: ' + errMsg + (err && err.stack ? ('\n' + err.stack) : ''));
    return { status: 'error', message: errMsg };
  }
}

// ======================= 8) แก้ไข/ยกเลิกบิล =======================
// ลบทุกแถวที่เป็นของบิลนี้ออกจากชีต (เรียงลบจากแถวล่างขึ้นบนกันปัญหา index เลื่อน)
function deleteBill(billId) {
  try {
    const id = safeString_(billId);
    if (!id) return { status: 'error', message: 'ไม่พบเลขที่บิล' };

    const sheet = getSheet_(CONFIG.SHEET_SALES);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { status: 'error', message: 'ไม่มีข้อมูลในระบบ' };

    const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    const rowsToDelete = [];
    let pdfUrl = '';
    values.forEach(function(row, idx) {
      if (safeString_(row[1]) === id) {
        rowsToDelete.push(idx + 2); // แถวจริงในชีต (แถวที่ 1 คือหัวตาราง)
        if (!pdfUrl) pdfUrl = safeString_(row[10]);
      }
    });

    if (rowsToDelete.length === 0) {
      return { status: 'error', message: 'ไม่พบบิลเลขที่ ' + id + ' ในระบบ' };
    }

    // ลบจากแถวล่างสุดขึ้นไปก่อน กันปัญหาหมายเลขแถวเลื่อนระหว่างลบ
    rowsToDelete.sort(function(a, b) { return b - a; });
    rowsToDelete.forEach(function(rowNum) { sheet.deleteRow(rowNum); });

    // ย้ายไฟล์ PDF เก่าของบิลนี้ไปถังขยะ (ถ้ามี)
    if (pdfUrl) {
      try {
        const fileId = extractDriveIdFromUrl_(pdfUrl);
        if (fileId) DriveApp.getFileById(fileId).setTrashed(true);
      } catch (eTrash) {
        Logger.log('ลบไฟล์ PDF เก่าไม่สำเร็จ (ข้ามไป): ' + eTrash.message);
      }
    }

    return { status: 'success', deletedRows: rowsToDelete.length };
  } catch (err) {
    var errMsg = (err && err.message) ? err.message : String(err);
    Logger.log('Error deleteBill: ' + errMsg + (err && err.stack ? ('\n' + err.stack) : ''));
    return { status: 'error', message: errMsg };
  }
}

// แก้ไขบิลที่บันทึกไปแล้ว: ลบแถวเดิมของบิลนี้ทิ้ง แล้วบันทึกรายการใหม่ทับด้วยเลขที่บิลเดิม
// รักษาวันที่เดิมของบิลไว้ (ไม่เปลี่ยนวันที่ตอนแก้ไข) และสร้าง PDF ใบใหม่แทนที่ใบเก่า
function updateBillTransactions(billId, customerName, transactions) {
  try {
    const id = safeString_(billId);
    if (!id) return { status: 'error', message: 'ไม่พบเลขที่บิลที่จะแก้ไข' };
    if (!transactions || transactions.length === 0) {
      return { status: 'error', message: 'ไม่มีรายการให้บันทึก' };
    }
    if (!customerName || !customerName.trim()) {
      return { status: 'error', message: 'กรุณาระบุชื่อลูกค้า' };
    }

    const sheet = getSheet_(CONFIG.SHEET_SALES);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { status: 'error', message: 'ไม่มีข้อมูลในระบบ' };

    // หาวันที่เดิมของบิลนี้ (ใช้แถวแรกที่เจอ) ก่อนลบทิ้ง
    const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    let originalDate = null;
    let oldPdfUrl = '';
    const rowsToDelete = [];
    values.forEach(function(row, idx) {
      if (safeString_(row[1]) === id) {
        rowsToDelete.push(idx + 2);
        if (!originalDate && row[0] instanceof Date) originalDate = row[0];
        if (!oldPdfUrl) oldPdfUrl = safeString_(row[10]);
      }
    });

    if (rowsToDelete.length === 0) {
      return { status: 'error', message: 'ไม่พบบิลเลขที่ ' + id + ' ในระบบ (อาจถูกลบไปแล้ว)' };
    }
    if (!originalDate) originalDate = new Date();

    // ลบแถวเดิมของบิลนี้ทั้งหมดก่อน
    rowsToDelete.sort(function(a, b) { return b - a; });
    rowsToDelete.forEach(function(rowNum) { sheet.deleteRow(rowNum); });

    // ย้ายไฟล์ PDF ใบเก่าไปถังขยะ
    if (oldPdfUrl) {
      try {
        const fileId = extractDriveIdFromUrl_(oldPdfUrl);
        if (fileId) DriveApp.getFileById(fileId).setTrashed(true);
      } catch (eTrash) {
        Logger.log('ลบไฟล์ PDF ใบเก่าไม่สำเร็จ (ข้ามไป): ' + eTrash.message);
      }
    }

    // สร้าง PDF ใบใหม่ (ยังใช้เลขที่บิลเดิม แต่วันที่ตามวันที่เดิมของบิล)
    const pdfUrl = createReceiptPdf_(id, customerName, transactions, originalDate);

    let grandTotal = 0;
    const rows = transactions.map(function(tx) {
      grandTotal += tx.total;
      return [
        originalDate,
        id,
        customerName.trim(),
        tx.category,
        tx.name,
        (tx.rounds || []).join(' + '),
        tx.weight,
        tx.unit || 'หน่วย',
        tx.price,
        tx.total,
        pdfUrl
      ];
    });

    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

    return { status: 'success', billId: id, pdfUrl: pdfUrl, grandTotal: grandTotal };
  } catch (err) {
    var errMsg = (err && err.message) ? err.message : String(err);
    Logger.log('Error updateBillTransactions: ' + errMsg + (err && err.stack ? ('\n' + err.stack) : ''));
    return { status: 'error', message: errMsg };
  }
}

// ======================= 9) จัดการรายการสินค้า (แก้ไข/ลบ) =======================
// แก้ไขราคา/หน่วย/ชื่อของรายการสินค้าที่มีอยู่แล้ว ระบุตัวตนเดิมด้วย originalCategory + originalName
function updateMasterItem(originalCategory, originalName, newItemData) {
  try {
    const origCat = safeString_(originalCategory);
    const origName = safeString_(originalName);
    if (!origCat || !origName) {
      return { status: 'error', message: 'ไม่พบรายการเดิมที่จะแก้ไข' };
    }

    const newCategory = safeString_(newItemData && newItemData.category) || origCat;
    const newName = safeString_(newItemData && newItemData.name) || origName;
    const newPrice = safeNumber_(newItemData && newItemData.price);
    const newUnit = safeString_(newItemData && newItemData.unit) || 'หน่วย';

    const sheet = getSheet_(CONFIG.SHEET_MASTER_ITEMS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { status: 'error', message: 'ยังไม่มีรายการสินค้าในระบบ' };

    const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    let foundRow = -1;
    for (let i = 0; i < values.length; i++) {
      const cat = safeString_(values[i][0]).toLowerCase();
      const name = safeString_(values[i][1]).toLowerCase();
      if (cat === origCat.toLowerCase() && name === origName.toLowerCase()) {
        foundRow = i + 2;
        break;
      }
    }

    if (foundRow === -1) {
      return { status: 'error', message: 'ไม่พบรายการ "' + origName + '" ในระบบ (อาจถูกแก้ไขไปแล้ว)' };
    }

    sheet.getRange(foundRow, 1, 1, 4).setValues([[newCategory, newName, newPrice, newUnit]]);

    return { status: 'success', items: getMasterItemsFromSheet() };
  } catch (err) {
    var errMsg = (err && err.message) ? err.message : String(err);
    Logger.log('Error updateMasterItem: ' + errMsg + (err && err.stack ? ('\n' + err.stack) : ''));
    return { status: 'error', message: errMsg };
  }
}

// ลบรายการสินค้าออกจากรายการสินค้าหลัก (ไม่กระทบข้อมูลการขายที่บันทึกไปแล้วในอดีต)
function deleteMasterItem(category, name) {
  try {
    const cat = safeString_(category);
    const itemName = safeString_(name);
    if (!cat || !itemName) return { status: 'error', message: 'ไม่พบรายการที่จะลบ' };

    const sheet = getSheet_(CONFIG.SHEET_MASTER_ITEMS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { status: 'error', message: 'ยังไม่มีรายการสินค้าในระบบ' };

    const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    let foundRow = -1;
    for (let i = 0; i < values.length; i++) {
      const rowCat = safeString_(values[i][0]).toLowerCase();
      const rowName = safeString_(values[i][1]).toLowerCase();
      if (rowCat === cat.toLowerCase() && rowName === itemName.toLowerCase()) {
        foundRow = i + 2;
        break;
      }
    }

    if (foundRow === -1) {
      return { status: 'error', message: 'ไม่พบรายการ "' + itemName + '" ในระบบ (อาจถูกลบไปแล้ว)' };
    }

    sheet.deleteRow(foundRow);

    return { status: 'success', items: getMasterItemsFromSheet() };
  } catch (err) {
    var errMsg = (err && err.message) ? err.message : String(err);
    Logger.log('Error deleteMasterItem: ' + errMsg + (err && err.stack ? ('\n' + err.stack) : ''));
    return { status: 'error', message: errMsg };
  }
}
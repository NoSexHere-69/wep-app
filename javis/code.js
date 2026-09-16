function doGet() {
  return HtmlService.createHtmlOutputFromFile('store')
    .setTitle('Armr')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover');
}

// ชีตหลักที่เก็บรายชื่อแอปทั้งหมด (คอลัมน์: number | name | wepapp | sheet)
var SHEET_ID = '1YprXivmWqHmTRQpDIbWu56ahM84GISros2faLfZDLnM';

/**
 * เรียกจากฝั่งหน้าเว็บ (google.script.run.getAppsData())
 * อ่านทุกแถวจากชีตหลัก แล้วสร้างไอคอน (favicon) ให้อัตโนมัติ
 * จากโดเมนของลิงก์ webapp — ถ้า webapp ว่างจะ fallback ไปใช้ลิงก์ sheet แทน
 * ไม่ต้องมีคอลัมน์ icon แยกต่างหาก แค่แปะลิงก์ในชีต ระบบจะหาไอคอนให้เอง
 */
function getAppsData() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheets()[0];
  var values = sheet.getDataRange().getValues();
  var apps = [];

  for (var i = 1; i < values.length; i++) { // ข้าม header แถวแรก
    var row = values[i];
    var name = row[1];
    if (!name) continue; // ข้ามแถวว่าง

    var webapp = row[2] ? String(row[2]).trim() : '';
    var sheetLink = row[3] ? String(row[3]).trim() : '';
    var linkForIcon = webapp || sheetLink;
    var domain = extractDomain_(linkForIcon);

    apps.push({
      number: row[0],
      name: String(name).trim(),
      webapp: webapp,
      sheet: sheetLink,
      group: domain ? domain.toUpperCase() : 'UNLINKED',
      icon: domain ? ('https://www.google.com/s2/favicons?sz=128&domain=' + domain) : ''
    });
  }
  return apps;
}

// ดึง hostname ออกจาก URL อย่างปลอดภัย (คืนค่าว่างถ้า parse ไม่ได้)
function extractDomain_(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}
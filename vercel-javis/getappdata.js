// ทำหน้าที่แทน getAppsData() เดิมที่เคยรันใน Apps Script
// อ่านชีตหลัก (คอลัมน์: number | name | webapp | sheet) ผ่าน Google Sheets API
// โดยใช้ Service Account แทนสิทธิ์พิเศษที่ Apps Script เคยให้ฟรี

import { google } from "googleapis";

// ใส่ Sheet ID ของคุณตรงนี้ (เอามาจาก code.js เดิม)
const SHEET_ID = "1YprXivmWqHmTRQpDIbWu56ahM84GISros2faLfZDLnM";

// ชื่อชีต + ช่วงคอลัมน์ที่จะอ่าน — ปรับ "Sheet1" ให้ตรงกับชื่อชีตจริงถ้าไม่ตรง
const RANGE = "Sheet1!A:D";

export default async function handler(req, res) {
  try {
    const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

    if (!process.env.GOOGLE_CLIENT_EMAIL || !privateKey) {
      throw new Error(
        "ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY ใน Environment Variables"
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey,
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: RANGE,
    });

    const rows = response.data.values || [];
    const apps = [];

    // แถวแรกคือ header ข้ามไป (เหมือนโค้ดเดิม i = 1)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = row[1];
      if (!name) continue; // ข้ามแถวว่าง

      const webapp = row[2] ? String(row[2]).trim() : "";
      const sheetLink = row[3] ? String(row[3]).trim() : "";
      const linkForIcon = webapp || sheetLink;
      const domain = extractDomain(linkForIcon);

      apps.push({
        number: row[0],
        name: String(name).trim(),
        webapp,
        sheet: sheetLink,
        group: domain ? domain.toUpperCase() : "UNLINKED",
        icon: domain
          ? "https://www.google.com/s2/favicons?sz=128&domain=" + domain
          : "",
      });
    }

    // cache ผลลัพธ์ไว้ 60 วิ ที่ edge เพื่อลด quota การเรียก Sheets API
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json(apps);
  } catch (err) {
    console.error("getAppsData error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ดึง hostname ออกจาก URL อย่างปลอดภัย (เหมือนโค้ดเดิม)
function extractDomain(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return "";
  }
}
# วิธีตั้งค่า (ทำครั้งเดียว)

## 1. สร้าง Service Account บน Google Cloud
1. เข้า https://console.cloud.google.com/
2. สร้างโปรเจกต์ใหม่ (หรือใช้โปรเจกต์เดิม) — เมนูมุมบนซ้าย
3. เปิดใช้งาน **Google Sheets API**
   - ไปที่ "APIs & Services" → "Library" → ค้นหา "Google Sheets API" → กด **Enable**
4. สร้าง Service Account
   - ไปที่ "APIs & Services" → "Credentials" → **Create Credentials** → **Service Account**
   - ตั้งชื่ออะไรก็ได้ เช่น `wep-app-reader`
   - กด Done (ไม่ต้องให้สิทธิ์ role อะไรเพิ่มก็ได้ เพราะจะไปแชร์สิทธิ์ที่ระดับชีตแทน)
5. สร้าง Key
   - คลิกเข้าไปที่ Service Account ที่สร้าง → แท็บ **Keys** → **Add Key** → **Create new key** → เลือก **JSON**
   - ไฟล์ JSON จะดาวน์โหลดมา — **เก็บไว้ให้ดี ห้ามเผยแพร่ ห้ามใส่ใน GitHub**

## 2. แชร์สิทธิ์เข้า Google Sheet ให้ Service Account
1. เปิดไฟล์ JSON ที่ดาวน์โหลดมา หาค่า `client_email` (หน้าตาแบบ `xxxx@xxxx.iam.gserviceaccount.com`)
2. เปิด Google Sheet (ID: `1YprXivmWqHmTRQpDIbWu56ahM84GISros2faLfZDLnM`)
3. กด **Share** → แปะอีเมลนั้น → ให้สิทธิ์ **Viewer** พอ (แค่อ่านข้อมูล) → Share

## 3. ตั้งค่า Environment Variables บน Vercel
ไปที่โปรเจกต์บน Vercel → **Settings** → **Environment Variables** เพิ่ม 2 ตัวนี้:

| Key | Value |
|---|---|
| `GOOGLE_CLIENT_EMAIL` | ค่า `client_email` จากไฟล์ JSON |
| `GOOGLE_PRIVATE_KEY` | ค่า `private_key` จากไฟล์ JSON (ทั้งก้อน รวม `-----BEGIN PRIVATE KEY-----` ด้วย) |

**หมายเหตุสำคัญ:** วาง `private_key` ไปได้เลยตามที่อยู่ในไฟล์ JSON (มี `\n` อยู่ในนั้น) โค้ดใน `api/getAppsData.js` จัดการแปลงให้เองแล้ว

หลังตั้งค่าเสร็จ ต้อง **Redeploy** โปรเจกต์ใหม่ 1 ครั้งเพื่อให้ env vars มีผล

## 4. ถ้าชื่อชีตไม่ใช่ "Sheet1"
เปิด `api/getAppsData.js` แก้บรรทัด:
```js
const RANGE = "Sheet1!A:D";
```
เปลี่ยน `Sheet1` เป็นชื่อชีตจริงของคุณ (ดูได้จาก tab ล่างของ Google Sheet)

## โครงสร้างไฟล์
```
wep-app-vercel/
├── index.html          ← หน้าเว็บ (เดิมคือ store.html)
├── api/
│   └── getAppsData.js  ← backend ดึงข้อมูลจากชีต แทนที่ SpreadsheetApp เดิม
├── package.json
└── README.md
```

อัพโหลดโฟลเดอร์นี้ทั้งหมดเข้า GitHub repo (แทนที่เนื้อหาเดิมในโฟลเดอร์ `javis` หรือสร้าง repo ใหม่ก็ได้) แล้ว Vercel จะ deploy ให้อัตโนมัติ
# Stockdd Mobile — Frontend

React + TypeScript + Vite frontend สำหรับ Stockdd Mobile (Inventory Management System)

## Tech Stack

- **React 18 + TypeScript**
- **Vite** — dev server + build (+ proxy `/api` ไป backend :8080)
- **TanStack Query v5** — server state + caching
- **React Router v6** — routing + protected routes
- **Axios** — HTTP client พร้อม JWT interceptor + auto-refresh
- **Zustand** — auth state (persisted ใน localStorage)
- **Tailwind CSS** — styling
- **react-hook-form** — form management
- **react-hot-toast** — notifications
- **lucide-react** — icons

## Setup

```bash
cd stockddmobile-frontend

# 1) Install dependencies
npm install

# 2) (Optional) Copy env file
cp .env.example .env.local

# 3) Start dev server
npm run dev
# เปิด http://localhost:5173
```

> **ต้องรัน Backend (`stockddmobile`) ที่ `localhost:8080` ก่อน** —
> Vite dev server จะ proxy `/api` ไปยัง backend อัตโนมัติ (ไม่ติด CORS ใน dev)

## Test Accounts

| Role    | Username   | Password       |
|---------|------------|----------------|
| ADMIN   | admin      | Admin@1234     |
| MANAGER | manager01  | Manager@1234   |
| STAFF   | staff01    | Staff@1234     |

## Pages

| Path                | Role          | คำอธิบาย |
|---------------------|---------------|----------|
| `/login`            | Public        | Login form |
| `/`                 | Authenticated | Dashboard — สถิติ + ตารางสต็อกล่าสุด |
| `/inventory`        | Authenticated | รายการสต็อก + IMEI scan |
| `/products`         | Authenticated | สินค้า (ADMIN/MANAGER สร้างได้) |
| `/products/:id`     | Authenticated | รายละเอียด + Variants |
| `/inbound`          | Authenticated | รับสินค้าเข้า (รองรับ IMEI หลายตัว) |
| `/outbound`         | Authenticated | จ่ายสินค้าออก (รองรับ IMEI หลายตัว) |
| `/transactions`     | MANAGER/ADMIN | ประวัติ stock movements |
| `/alerts`           | MANAGER/ADMIN | Low Stock Alerts + acknowledge |

## Architecture Notes

- **Authentication flow:** Login → store `accessToken` + `refreshToken` ใน Zustand (persist ใน localStorage)
- **Axios interceptor:**
  - Request: แนบ `Authorization: Bearer <accessToken>`
  - Response 401: ลอง POST `/auth/refresh` อัตโนมัติ → ถ้าสำเร็จ retry request เดิม / ถ้าล้มเหลว clear state + redirect `/login`
- **TanStack Query:** invalidate keys หลัง mutation → UI sync เอง
- **RBAC:** `ProtectedRoute` รับ `roles` array — STAFF เข้า `/transactions` `/alerts` ไม่ได้

## Build & Deploy

```bash
npm run build        # output ใน dist/
npm run preview      # serve dist/ ดูก่อน deploy
```

## Connect ไปกับ Backend Production

แก้ `.env.production`:
```
VITE_API_BASE_URL=https://api.stockddmobile.com/api/v1
```

แล้วใน backend (`stockddmobile/src/main/resources/application.yaml`):
```yaml
app:
  cors:
    allowed-origins: https://app.stockddmobile.com
```

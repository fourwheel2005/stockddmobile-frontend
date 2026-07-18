/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_WS_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** build id ฝังตอน build (FIX-095) — เทียบกับ /version.json เพื่อตรวจเวอร์ชันใหม่ */
declare const __BUILD_ID__: string;

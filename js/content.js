/* ============================================================
   content.js — Nạp nội dung cho website (không cần backend).

   Thứ tự ưu tiên:
   1. /content.json  — GitHub Pages (Jekyll) tự dựng từ các file do trang /admin (Decap CMS) tạo ra.
   2. Google Sheets  — nếu data.js có sheet.url (dự phòng / cách cũ).
   3. js/data.js     — dữ liệu mặc định, luôn hiển thị được kể cả khi mở file:// hay mất mạng.

   Phần Google Sheets:
   - Tải từng tab dưới dạng CSV qua endpoint công khai
        https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:csv&sheet=<Tên tab>
   - Chuyển cột tiếng Việt → trường dữ liệu, gộp vào VEC_DATA, rồi gọi VEC.render() lại.
   Cột được nhận dạng theo tiêu đề (không phân biệt hoa/thường, dấu):
     ThongBao     : Tiêu đề | Ngày | Nội dung | Quan trọng
     SuKien       : Ngày | Tiêu đề | Giờ | Nơi
     BaiGiang     : Ngày | Tựa đề | Diễn giả | Kinh Thánh | Loạt bài | Thời lượng | Tóm tắt | Link audio | Link video
     HocKinhThanh : Ngày | Tựa đề | Kinh Thánh | Người hướng dẫn | Loạt bài | Tóm tắt | Link tài liệu | Link video
     GioNhom      : Thứ | Giờ | Tên buổi nhóm | Nơi | Mô tả | Thời lượng (phút) | Chính
     LienHe       : Mục | Giá trị      (email, điện thoại, whatsapp, zalo, facebook, youtube,
                                        nơi nhóm, địa chỉ, ghi chú đường đi)
   ============================================================ */
(function () {
  "use strict";
  const D = window.VEC_DATA || {};
  if (!window.VEC || typeof window.VEC.render !== "function") return;
  if (location.protocol === "file:") return; // trình duyệt chặn fetch khi mở file trực tiếp → dùng data.js

  /* ---------- 1) content.json — do GitHub Pages dựng từ các file trong /admin ---------- */
  fetch("content.json?_=" + Date.now(), { cache: "no-store" })
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status))))
    .then((text) => {
      if (!/^\s*\{/.test(text)) throw new Error("not built"); // chạy local không có Jekyll → file còn là template
      const j = JSON.parse(text);
      const got = {};
      for (const k of ["announcements", "events", "sermons", "studies", "services", "ministries", "verses"]) {
        if (Array.isArray(j[k])) got[k] = j[k];
      }
      for (const s of got.sermons || []) s.audio = mediaUrl(s.audio);
      for (const s of got.studies || []) s.notes = mediaUrl(s.notes);
      if (j.church || j.location) got.contact = { church: j.church || {}, location: j.location || {} };
      window.VEC.render(merge(D, got, true));
    })
    .catch(loadSheet);

  /* ---------- 2) Google Sheets (nếu có link trong data.js) ---------- */
  function loadSheet() {
  const cfg = D.sheet || {};
  const id = extractId(cfg.url || "");
  if (!id) return;

  const tabs = Object.assign({
    announcements: "ThongBao", events: "SuKien", sermons: "BaiGiang",
    studies: "HocKinhThanh", services: "GioNhom", contact: "LienHe",
  }, cfg.tabs || {});

  const CACHE_KEY = "vec-sheet-cache-v1";
  // Hiển thị bản đã lưu lần trước ngay lập tức (tránh nháy), rồi tải bản mới.
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
    if (cached && cached.id === id) window.VEC.render(merge(D, cached.data));
  } catch (_) { /* bỏ qua */ }

  Promise.all(Object.entries(tabs).map(([key, name]) =>
    fetchCsv(id, name).then((rows) => [key, rows]).catch(() => [key, null])
  )).then((pairs) => {
    const got = {};
    for (const [key, rows] of pairs) {
      if (!rows) continue;                 // tab không tồn tại / lỗi → bỏ qua
      const mapped = MAP[key] ? MAP[key](rows) : null;
      if (mapped) got[key] = mapped;
    }
    if (!Object.keys(got).length) return;
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ id, data: got })); } catch (_) { /* bỏ qua */ }
    window.VEC.render(merge(D, got));
  });
  }

  /* ---------- Gộp dữ liệu mới vào dữ liệu gốc ---------- */
  // allowEmpty = true: danh sách rỗng từ content.json vẫn được tôn trọng (vd. đã xoá hết thông báo)
  function merge(base, got, allowEmpty) {
    const out = Object.assign({}, base);
    for (const k of ["announcements", "events", "sermons", "studies", "services", "ministries", "verses"]) {
      if (Array.isArray(got[k]) && (allowEmpty || got[k].length)) out[k] = got[k];
    }
    if (got.contact) {
      out.church = Object.assign({}, base.church, got.contact.church);
      out.location = Object.assign({}, base.location, got.contact.location);
    }
    return out;
  }

  /* ---------- Chuyển hàng CSV → đối tượng ---------- */
  const MAP = {
    announcements: (rows) => rows.map((r) => ({
      title: pick(r, "tieu de", "tua de", "title"),
      date: toISO(pick(r, "ngay", "ngay dang", "date")),
      body: pick(r, "noi dung", "chi tiet", "body"),
      pinned: yes(pick(r, "quan trong", "ghim", "pinned")),
    })).filter((a) => a.title),

    events: (rows) => rows.map((r) => ({
      date: toISO(pick(r, "ngay", "date")),
      title: pick(r, "tieu de", "tua de", "su kien", "title"),
      time: pick(r, "gio", "time"),
      where: pick(r, "noi", "dia diem", "where"),
    })).filter((e) => e.title && e.date),

    sermons: (rows) => rows.map((r) => ({
      date: toISO(pick(r, "ngay", "date")),
      title: pick(r, "tua de", "tieu de", "title"),
      speaker: pick(r, "dien gia", "nguoi giang", "speaker"),
      scripture: pick(r, "kinh thanh", "doan kinh thanh", "scripture"),
      series: pick(r, "loat bai", "chu de", "series"),
      duration: pick(r, "thoi luong", "duration"),
      summary: pick(r, "tom tat", "summary"),
      audio: mediaUrl(pick(r, "link audio", "audio", "mp3", "link mp3")),
      video: pick(r, "link video", "video", "youtube", "link youtube"),
    })).filter((s) => s.title),

    studies: (rows) => rows.map((r) => ({
      date: toISO(pick(r, "ngay", "date")),
      title: pick(r, "tua de", "tieu de", "bai hoc", "title"),
      scripture: pick(r, "kinh thanh", "doan kinh thanh", "scripture"),
      leader: pick(r, "nguoi huong dan", "huong dan", "dien gia", "leader"),
      series: pick(r, "loat bai", "sach", "chu de", "series"),
      summary: pick(r, "tom tat", "ghi chu", "summary"),
      notes: mediaUrl(pick(r, "link tai lieu", "tai lieu", "pdf", "notes")),
      video: pick(r, "link video", "video", "youtube", "link youtube"),
    })).filter((s) => s.title),

    services: (rows) => rows.map((r) => ({
      weekday: toWeekday(pick(r, "thu", "ngay", "weekday")),
      time: normTime(pick(r, "gio", "time")),
      title: pick(r, "ten buoi nhom", "buoi nhom", "tieu de", "title"),
      where: pick(r, "noi", "dia diem", "where"),
      desc: pick(r, "mo ta", "noi dung", "desc"),
      durationMin: Number(pick(r, "thoi luong (phut)", "thoi luong", "phut", "duration")) || 120,
      primary: yes(pick(r, "chinh", "buoi chinh", "primary")),
    })).filter((s) => s.title && s.weekday >= 0 && s.time),

    contact: (rows) => {
      const church = {}, location = {};
      for (const r of rows) {
        const k = norm(pick(r, "muc", "khoa", "ten", "key")), v = pick(r, "gia tri", "noi dung", "value");
        if (!k || v === "") continue;
        if (/^e-?mail$/.test(k)) church.email = v;
        else if (/dien thoai|phone|sdt/.test(k)) church.phone = v;
        else if (/whatsapp/.test(k)) church.whatsapp = v;
        else if (/zalo/.test(k)) church.zalo = v;
        else if (/facebook/.test(k)) church.facebook = v;
        else if (/youtube/.test(k)) church.youtube = v;
        else if (/^(noi nhom|ten noi nhom)$/.test(k)) location.name = v;
        else if (/dia chi/.test(k)) location.address = v;
        else if (/ghi chu|duong di/.test(k)) location.note = v;
        else if (/ban do|map/.test(k)) location.mapQuery = v;
      }
      return { church, location };
    },
  };

  /* ---------- Tiện ích ---------- */
  function extractId(url) {
    const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (m) return m[1];
    return /^[a-zA-Z0-9-_]{20,}$/.test(url.trim()) ? url.trim() : "";
  }

  async function fetchCsv(id, sheetName) {
    const u = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
    const res = await fetch(u, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const text = await res.text();
    if (/^\s*</.test(text)) throw new Error("not csv"); // trang đăng nhập / lỗi HTML
    const table = parseCsv(text);
    if (table.length < 2) return [];
    const head = table[0].map(norm);
    return table.slice(1).filter((r) => r.some((c) => c.trim() !== "")).map((r) => {
      const o = {}; head.forEach((h, i) => { if (h) o[h] = (r[i] || "").trim(); }); return o;
    });
  }

  function parseCsv(text) {
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  // bỏ dấu tiếng Việt + thường hoá để so khớp tiêu đề cột
  function norm(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
      .toLowerCase().replace(/[^a-z0-9()/ ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function pick(r, ...names) {
    for (const n of names) { const k = norm(n); if (k in r && r[k] !== "") return r[k]; }
    // khớp một phần (vd. "Link audio (mp3)")
    for (const n of names) { const k = norm(n); const hit = Object.keys(r).find((h) => h.startsWith(k)); if (hit && r[hit] !== "") return r[hit]; }
    return "";
  }
  const yes = (v) => /^(x|v|✓|co|có|yes|true|1)$/i.test(String(v || "").trim());

  // Chấp nhận 2026-10-05, 05/10/2026, 5/10/2026, 5-10-2026, 05.10.2026 (ngày/tháng/năm)
  function toISO(v) {
    const s = String(v || "").trim();
    if (!s) return "";
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (m) {
      let d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]); if (y < 100) y += 2000;
      if (d <= 12 && mo > 12) [d, mo] = [mo, d]; // ai đó nhập tháng/ngày
      return `${y}-${pad(mo)}-${pad(d)}`;
    }
    return s;
  }
  const pad = (n) => String(n).padStart(2, "0");
  function normTime(v) {
    const m = String(v || "").trim().match(/^(\d{1,2})[:h.](\d{2})?/);
    return m ? `${pad(m[1])}:${m[2] || "00"}` : "";
  }
  function toWeekday(v) {
    const s = norm(v);
    if (!s) return -1;
    if (/^(cn|chua nhat|chu nhat|sun)/.test(s)) return 0;
    const words = { hai: 1, ba: 2, tu: 3, nam: 4, sau: 5, bay: 6 };
    const w = s.match(/^(?:thu|t)\s*(hai|ba|tu|nam|sau|bay)\b/); if (w) return words[w[1]];
    const m = s.match(/^(?:thu|t)?\s*([2-8])\b/); if (m) return Number(m[1]) === 8 ? 0 : Number(m[1]) - 1; // "Thứ 4", "T4", "4" → Thứ Tư
    if (/^[01]$/.test(s)) return 0;
    return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].findIndex((d) => s.startsWith(d));
  }
  // Link Google Drive "Xem" → link tải trực tiếp để phát được trong trình phát
  function mediaUrl(u) {
    const s = String(u || "").trim();
    const m = s.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([a-zA-Z0-9_-]+)/);
    if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
    const d = s.match(/^(https:\/\/www\.dropbox\.com\/[^?]+)/);
    if (d) return `${d[1]}?raw=1`;
    return s;
  }
})();

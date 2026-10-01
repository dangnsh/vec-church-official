/* ============================================================
   Page logic: render VEC_DATA, next-service clock, sermon archive,
   Bible-study list, player.  No scroll-reveal, no tilt — the page
   is still except the hero.

   render(D) can be called again (content.js does this after it
   pulls fresh rows from Google Sheets).
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const TZ = "Asia/Singapore";
  const DAY = ["Chúa Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  const DAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const parse = (iso) => new Date(iso + "T00:00:00");
  const valid = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso || "") && !isNaN(parse(iso));
  const dmy = (iso) => { if (!valid(iso)) return esc(iso || ""); const d = parse(iso); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; };
  const longDate = (iso) => valid(iso) ? `${DAY[parse(iso).getDay()]} ${dmy(iso)}` : esc(iso || "");
  const mmss = (s) => { if (!isFinite(s)) return "0:00"; const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, "0")}`; };
  const PLAY = '<svg class="ip" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><svg class="ipa" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  const DL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>';
  const EXT = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>';
  const isYouTube = (u) => /youtu\.?be/.test(u || "");

  /* ---------- State shared between render() and the player ---------- */
  let D = window.VEC_DATA || {};
  let sermons = [];
  let primary = null;
  let current = -1;
  const audio = $("#audio"), player = $("#player"), sel = $("#seriesSelect");

  /* ---------- One-time wiring (menu, form, player controls) ---------- */
  const menu = $("#menu"), menuBtn = $("#menuBtn");
  menuBtn.addEventListener("click", () => { const open = menu.classList.toggle("open"); menuBtn.setAttribute("aria-expanded", String(open)); });
  $$("a", menu).forEach((a) => a.addEventListener("click", () => { menu.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }));
  const links = $$("a", menu);
  const spy = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    links.forEach((a) => a.getAttribute("href") === "#" + e.target.id ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current"));
  }), { rootMargin: "-35% 0px -60% 0px" });
  $$("main section[id]").forEach((s) => spy.observe(s));
  $("#year").textContent = new Date().getFullYear();

  $("#contactForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (!f.get("name") || !f.get("contact")) return toast("Vui lòng điền họ tên và cách liên lạc để chúng tôi hồi âm.");
    const subject = encodeURIComponent(`[Website] ${f.get("topic")} – ${f.get("name")}`);
    const body = encodeURIComponent(`Họ tên: ${f.get("name")}\nLiên hệ: ${f.get("contact")}\nChủ đề: ${f.get("topic")}\n\n${f.get("message") || ""}`);
    window.location.href = `mailto:${D.church?.email || ""}?subject=${subject}&body=${body}`;
  });

  sel.addEventListener("change", renderArchive);
  $("#sermonSearch").addEventListener("input", renderArchive);
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-idx]"); if (!b) return;
    const i = Number(b.dataset.idx);
    if (i === current) toggle(); else load(i);
  });
  $("#pPlay").addEventListener("click", toggle);
  $("#pPrev").addEventListener("click", () => current > 0 && load(current - 1));
  $("#pNext").addEventListener("click", () => current < sermons.length - 1 && load(current + 1));
  $("#pClose").addEventListener("click", () => { audio.pause(); audio.removeAttribute("src"); audio.load(); current = -1; player.hidden = true; document.body.classList.remove("has-player"); sync(); });
  const speeds = [1, 1.25, 1.5, 2, 0.75]; let si = 0;
  $("#pSpeed").addEventListener("click", () => { si = (si + 1) % speeds.length; audio.playbackRate = speeds[si]; $("#pSpeed").textContent = `${speeds[si]}×`; });
  const seek = $("#pSeek"); let scrubbing = false;
  audio.addEventListener("timeupdate", () => { if (scrubbing || !audio.duration) return; const p = audio.currentTime / audio.duration; seek.value = Math.round(p * 1000); seek.style.setProperty("--pct", `${p * 100}%`); $("#pCur").textContent = mmss(audio.currentTime); });
  audio.addEventListener("loadedmetadata", () => { $("#pDur").textContent = mmss(audio.duration); });
  audio.addEventListener("play", sync); audio.addEventListener("pause", sync);
  audio.addEventListener("ended", () => current < sermons.length - 1 && load(current + 1));
  audio.addEventListener("error", () => { if (audio.getAttribute("src")) toast("Không tải được file âm thanh. Kiểm tra lại đường dẫn của bài giảng."); });
  seek.addEventListener("input", () => { scrubbing = true; seek.style.setProperty("--pct", `${seek.value / 10}%`); $("#pCur").textContent = mmss((seek.value / 1000) * (audio.duration || 0)); });
  seek.addEventListener("change", () => { if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration; scrubbing = false; });
  document.addEventListener("keydown", (e) => { if (e.code === "Space" && !player.hidden && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); toggle(); } });

  /* ---------- Next occurrence of a service (Singapore time) ---------- */
  function nextOccurrence(svc) {
    const [hh, mm] = String(svc.time || "0:0").split(":").map(Number);
    const now = new Date();
    const sg = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
    const offset = sg - now;
    for (let add = 0; add < 8; add++) {
      const d = new Date(sg); d.setDate(sg.getDate() + add); d.setHours(hh, mm, 0, 0);
      if (d.getDay() === Number(svc.weekday) && d.getTime() + (svc.durationMin || 90) * 6e4 > sg.getTime()) return { at: new Date(d - offset), sg: d };
    }
    return null;
  }
  const isLive = (svc) => { const n = nextOccurrence(svc); return n && n.at <= new Date(); };

  /* ---------- Render everything that comes from data ---------- */
  function render(data) {
    D = data || D;

    /* Verse of the day */
    if (D.verses?.length) {
      const now = new Date(), start = new Date(now.getFullYear(), 0, 0);
      const v = D.verses[Math.floor((now - start) / 864e5) % D.verses.length];
      $("#verseText").textContent = `“${v.text}”`; $("#verseRef").textContent = v.ref;
    }

    /* Timetable + hero line + calendar */
    const services = D.services || [];
    primary = services.find((s) => s.primary) || services[0] || null;
    const tt = $("#timetable");
    if (tt) {
      tt.innerHTML = services.map((s) => `
        <li>
          <div class="day">${DAY[Number(s.weekday)] || ""}<b>${esc(s.time)}</b></div>
          <div>
            <h3>${esc(s.title)}${isLive(s) ? '<span class="live">Đang nhóm</span>' : ""}</h3>
            <p class="where">${esc(s.where)}</p>
            <p class="desc">${esc(s.desc)}</p>
          </div>
        </li>`).join("");
    }
    if (primary) {
      const n = nextOccurrence(primary);
      const when = $("#heroWhen");
      if (n && when) {
        const sgToday = new Date(new Date().toLocaleString("en-US", { timeZone: TZ })); sgToday.setHours(0, 0, 0, 0);
        const day0 = new Date(n.sg); day0.setHours(0, 0, 0, 0);
        const diffDays = Math.round((day0 - sgToday) / 864e5);
        const dayWord = diffDays === 0 ? "Hôm nay" : diffDays === 1 ? "Ngày mai" : `${DAY[Number(primary.weekday)]} ${n.sg.getDate()}/${n.sg.getMonth() + 1}`;
        when.textContent = isLive(primary) ? `Đang nhóm lại lúc này tại ${primary.where}` : `${dayWord}, ${primary.time} tại ${primary.where}`;
      }
      const cal = $("#locCalLink");
      if (cal && n) {
        const ics = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
        const end = new Date(n.at.getTime() + (primary.durationMin || 120) * 6e4);
        const byday = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][Number(primary.weekday)];
        const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//VEC Singapore//VI", "BEGIN:VEVENT",
          `UID:vec-sg-${primary.weekday}-${String(primary.time).replace(":", "")}@vec.church`, `DTSTAMP:${ics(new Date())}`,
          `DTSTART:${ics(n.at)}`, `DTEND:${ics(end)}`, `RRULE:FREQ=WEEKLY;BYDAY=${byday}`,
          `SUMMARY:${primary.title} - ${D.church?.name || ""}`, `LOCATION:${D.location?.name || ""}, ${D.location?.address || ""}`,
          "END:VEVENT", "END:VCALENDAR"].join("\r\n");
        cal.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(body);
      }
    }

    /* Place */
    if (D.location) {
      const L = D.location;
      $("#locName").textContent = L.name; $("#locAddr").textContent = L.address; $("#locNote").textContent = L.note || "";
      $("#footerAddr").textContent = L.address;
      const q = encodeURIComponent(L.mapQuery || L.address);
      $("#locMapLink").href = `https://www.google.com/maps/dir/?api=1&destination=${q}`;
      const frame = $("#locMapFrame"), src = `https://www.google.com/maps?q=${q}&output=embed&z=16`;
      if (frame.getAttribute("src") !== src) frame.src = src;
    }

    /* Bulletin */
    const ann = $("#announceList");
    if (ann) {
      const items = [...(D.announcements || [])].sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || String(b.date).localeCompare(String(a.date)));
      ann.innerHTML = items.length ? items.map((a) => `
        <li>
          <h4>${esc(a.title)}${a.pinned ? '<span class="pin">Cần lưu ý</span>' : ""}</h4>
          <p>${esc(a.body)}</p>
          ${a.date ? `<time datetime="${esc(a.date)}">Đăng ${longDate(a.date)}</time>` : ""}
        </li>`).join("") : '<li class="empty">Chưa có thông báo mới.</li>';
    }

    /* Agenda */
    const ev = $("#eventList");
    if (ev) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const up = (D.events || []).filter((e) => valid(e.date) && parse(e.date) >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
      ev.innerHTML = up.length ? up.map((e) => {
        const d = parse(e.date);
        return `<li><div class="d">${d.getDate()}<small>${DAY_SHORT[d.getDay()]}, tháng ${d.getMonth() + 1}</small></div><div><h4>${esc(e.title)}</h4><p>${esc([e.time, e.where].filter(Boolean).join(", "))}</p></div></li>`;
      }).join("") : '<li class="empty">Chưa có ngày nào được lên lịch. Xem lại sau giờ nhóm Chúa Nhật.</li>';
    }

    /* Ministries */
    const ml = $("#ministryList");
    if (ml && D.ministries) {
      ml.innerHTML = D.ministries.map((m) => `<div><dt>${esc(m.name)}</dt><dd>${esc(m.desc)}</dd>${m.lead ? `<dd>${esc(m.lead)}</dd>` : ""}</div>`).join("");
    }

    /* About / footer */
    if (D.church?.founded) { $("#foundedYear").textContent = D.church.founded; $("#foundedYear2").textContent = D.church.founded; }

    /* Contact */
    const cl = $("#contactList");
    if (cl && D.church) {
      const C = D.church, L = D.location || {};
      const rows = [
        C.email && ["Email", `<a href="mailto:${esc(C.email)}">${esc(C.email)}</a>`],
        C.phone && ["Điện thoại", `<a href="tel:${esc(String(C.phone).replace(/\s/g, ""))}">${esc(C.phone)}</a>`],
        C.whatsapp && ["WhatsApp", `<a href="https://wa.me/${esc(String(C.whatsapp).replace(/\D/g, ""))}" target="_blank" rel="noopener">Nhắn tin qua WhatsApp</a>`],
        C.zalo && ["Zalo", `<a href="${esc(C.zalo)}" target="_blank" rel="noopener">Nhóm Zalo Hội Thánh</a>`],
        L.address && ["Nơi nhóm", `${esc(L.name)}<br>${esc(L.address)}`],
        primary && ["Giờ nhóm chính", `${DAY[Number(primary.weekday)]} ${esc(primary.time)}`],
      ].filter(Boolean);
      cl.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
      const soc = [C.facebook && ["Facebook", C.facebook], C.youtube && ["YouTube", C.youtube]].filter(Boolean);
      $("#footerSocial").innerHTML = soc.map(([k, v]) => `<li><a href="${esc(v)}" target="_blank" rel="noopener">${k}</a></li>`).join("");
    }

    /* Sermons */
    const playingSrc = current >= 0 && sermons[current] ? sermons[current].audio : null;
    sermons = [...(D.sermons || [])].filter((s) => s.title).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    current = playingSrc ? sermons.findIndex((s) => s.audio === playingSrc) : -1;

    const latest = $("#latest");
    if (latest) {
      const s = sermons[0];
      latest.innerHTML = s ? `
        <div>
          <p class="kicker">Bài giảng mới nhất, ${longDate(s.date)}</p>
          <h3>${esc(s.title)}</h3>
          <p class="summary">${esc(s.summary || "")}</p>
          <div class="actions">
            ${s.audio ? `<button class="button" data-idx="0">${PLAY} Nghe bài giảng</button>` : ""}
            ${s.audio ? `<a class="link-arrow" href="${esc(s.audio)}" download>Tải file MP3</a>` : ""}
            ${s.video ? `<a class="${s.audio ? "link-arrow" : "button"}" href="${esc(s.video)}" target="_blank" rel="noopener">Xem video${isYouTube(s.video) ? " trên YouTube" : ""}</a>` : ""}
          </div>
        </div>
        <dl class="meta">
          <dt>Diễn giả</dt><dd>${esc(s.speaker)}</dd>
          <dt>Kinh Thánh</dt><dd>${esc(s.scripture)}</dd>
          ${s.series ? `<dt>Loạt bài</dt><dd>${esc(s.series)}</dd>` : ""}
          ${s.duration ? `<dt>Thời lượng</dt><dd>${esc(s.duration)}</dd>` : ""}
        </dl>` : '<p class="empty">Chưa có bài giảng nào được đăng.</p>';
      const heroLink = $("#heroSermonLink"); if (heroLink && s) heroLink.textContent = `Nghe bài giảng “${s.title}”`;
    }

    const keep = sel.value;
    sel.innerHTML = '<option value="">Tất cả loạt bài</option>';
    [...new Set(sermons.map((s) => s.series).filter(Boolean))].forEach((n) => { const o = document.createElement("option"); o.value = o.textContent = n; sel.appendChild(o); });
    sel.value = [...sel.options].some((o) => o.value === keep) ? keep : "";
    renderArchive();

    /* Bible study */
    const sl = $("#studyList");
    if (sl) {
      const studies = [...(D.studies || [])].filter((s) => s.title).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      sl.innerHTML = studies.map((s) => `
        <li>
          <span class="date">${dmy(s.date)}</span>
          <div>
            <h4>${esc(s.title)}</h4>
            <p class="speaker">${esc([s.scripture, s.leader, s.series].filter(Boolean).join(" — "))}</p>
            ${s.summary ? `<p class="note">${esc(s.summary)}</p>` : ""}
          </div>
          <span class="act">
            ${s.notes ? `<a href="${esc(s.notes)}" target="_blank" rel="noopener">${DL} Tài liệu</a>` : ""}
            ${s.video ? `<a href="${esc(s.video)}" target="_blank" rel="noopener">${EXT} ${isYouTube(s.video) ? "YouTube" : "Video"}</a>` : ""}
          </span>
        </li>`).join("");
      $("#studyEmpty").hidden = studies.length > 0;
    }
    sync();
  }

  function renderArchive() {
    const q = $("#sermonSearch").value.trim().toLowerCase(), series = sel.value;
    const rows = sermons.filter((s) => (!series || s.series === series) && (!q || [s.title, s.speaker, s.scripture, s.series, s.summary].join(" ").toLowerCase().includes(q)));
    $("#sermonList").innerHTML = rows.map((s) => {
      const i = sermons.indexOf(s);
      const act = s.audio
        ? `<button class="play" data-idx="${i}" aria-label="Nghe ${esc(s.title)}">${PLAY}</button><a href="${esc(s.audio)}" download aria-label="Tải ${esc(s.title)}">${DL}</a>`
        : s.video ? `<a href="${esc(s.video)}" target="_blank" rel="noopener" aria-label="Xem ${esc(s.title)}">${EXT}</a>` : "";
      return `<li data-idx="${i}" class="${i === current && !audio.paused ? "playing" : ""}">
        <span class="date">${dmy(s.date)}</span>
        <div><h4>${esc(s.title)}</h4><p class="speaker">${esc(s.speaker)}${s.series ? `, ${esc(s.series)}` : ""}</p></div>
        <span class="scripture">${esc(s.scripture)}</span>
        <span class="dur">${esc(s.duration || "")}</span>
        <span class="act">${act}</span>
      </li>`;
    }).join("");
    $("#sermonEmpty").hidden = rows.length > 0;
  }

  /* ---------- Player ---------- */
  function load(i) {
    const s = sermons[i]; if (!s || !s.audio) return;
    current = i; audio.src = s.audio; audio.load();
    $("#pTitle").textContent = s.title; $("#pSub").textContent = [s.speaker, s.scripture, dmy(s.date)].filter(Boolean).join(", ");
    $("#pDownload").href = s.audio;
    player.hidden = false; document.body.classList.add("has-player");
    audio.play().catch(() => toast("Trình duyệt chặn tự phát. Bấm nút phát để nghe."));
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: s.speaker || "", album: D.church?.name || "" });
      navigator.mediaSession.setActionHandler("previoustrack", () => current > 0 && load(current - 1));
      navigator.mediaSession.setActionHandler("nexttrack", () => current < sermons.length - 1 && load(current + 1));
    }
  }
  function toggle() { if (audio.src) audio.paused ? audio.play() : audio.pause(); }
  function sync() {
    const on = !audio.paused && !!audio.src;
    $("#iconPlay").hidden = on; $("#iconPause").hidden = !on;
    $$("#sermonList li").forEach((li) => li.classList.toggle("playing", Number(li.dataset.idx) === current && on));
    $$("#latest .button").forEach((b) => b.classList.toggle("playing", Number(b.dataset.idx) === current && on));
  }

  /* ---------- Toast ---------- */
  let toastEl, timer;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(timer); timer = setTimeout(() => toastEl.classList.remove("show"), 3500);
  }

  /* First paint from data.js; content.js may call render() again with Sheet data. */
  render(D);
  window.VEC = { render, toast };
})();

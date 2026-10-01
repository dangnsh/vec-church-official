# Website Hội Thánh Tin Lành Việt Nam tại Singapore

Website tĩnh (HTML/CSS/JS) với hiệu ứng thập tự giá 3D (Three.js) dành cho tín hữu:
giờ nhóm, thông báo, lịch sự kiện, bài giảng hằng tuần (nghe trực tiếp / tải về),
bài học Kinh Thánh giữa tuần, ban ngành và liên hệ.

Không cần máy chủ, không cần cơ sở dữ liệu. **Nội dung được cập nhật qua trang quản trị `/admin`**
(Decap CMS, giao diện form như WordPress, đăng nhập bằng GitHub) — hoặc qua Google Sheets, hoặc sửa
trực tiếp file `js/data.js`.

## Cấu trúc

```
vec_church_site/
├── index.html          # Bố cục trang
├── css/style.css       # Giao diện: giấy trắng ngà, xanh Tin Lành, chữ Literata
├── js/main.js          # Logic giao diện: giờ nhóm kế tiếp, trình phát audio, lọc bài giảng…
├── js/content.js       # Nạp nội dung: content.json → Google Sheets → data.js
├── js/data.js          # Dữ liệu mặc định (dự phòng) + ô dán link Google Sheet
├── js/scene.js         # Thập tự giá 3D bằng hạt sáng trong hero
├── lib/three/          # Three.js r160 bản cục bộ (chạy được cả khi mở file:// và không cần CDN)
│
├── admin/              # ★ Trang quản trị Decap CMS (index.html + config.yml)
├── _bai_giang/         # Mỗi bài giảng một file .md (do /admin tạo)
├── _hoc_kinh_thanh/    # Bài học Kinh Thánh
├── _thong_bao/         # Thông báo
├── _su_kien/           # Sự kiện
├── _data/              # Giờ nhóm, liên hệ, ban ngành, câu gốc (.yml)
├── content.json        # Mẫu Liquid → GitHub Pages dựng thành JSON cho website đọc
├── _config.yml         # Cấu hình Jekyll tối thiểu (GitHub Pages dùng sẵn)
├── uploads/            # File PDF/hình do /admin tải lên
│
├── templates/*.csv     # File mẫu nếu dùng Google Sheets thay cho /admin
├── tests/              # Kiểm thử nhanh (node tests/content_test.js)
└── assets/             # Favicon, hình ảnh
```

## Cập nhật nội dung (dành cho người không chuyên)

### Cách 1 — Trang quản trị `/admin` (Decap CMS, khuyên dùng)

Vào **https://vec.church/admin/** → *Login with GitHub* → chọn mục (Bài giảng, Học Kinh Thánh, Thông báo,
Sự kiện, Cài đặt chung) → **New** → điền form → **Publish**. Khoảng 1–2 phút sau website cập nhật
(GitHub Pages dựng lại). Không cần biết Git hay code; mỗi lần Publish là một commit vào repo.

**Thiết lập một lần (người quản trị kỹ thuật, ≈15 phút).** Site vẫn ở GitHub Pages; Netlify chỉ dùng
làm "cổng đăng nhập GitHub" vì GitHub Pages không chạy được bước này. Không host gì trên Netlify.

1. **Đưa code lên repo** đang deploy vec.church (ghi đè bản cũ). Vào *Settings → Pages* của repo,
   chắc chắn nguồn là **Deploy from a branch** (Jekyll có sẵn sẽ dựng `content.json`).
   Repo **không được** có file `.nojekyll`.
2. **Tạo GitHub OAuth App**: GitHub → *Settings → Developer settings → OAuth Apps → New OAuth App*
   - Application name: `VEC Church Admin`
   - Homepage URL: `https://vec.church`
   - Authorization callback URL: `https://api.netlify.com/auth/done`
   → Generate a new client secret; giữ lại **Client ID** và **Client Secret**.
3. **Đăng ký cổng đăng nhập trên Netlify** (tài khoản miễn phí, đăng nhập bằng GitHub):
   *Add new site → Deploy manually* (kéo thả một thư mục trống bất kỳ, chỉ để có "site").
   Vào *Site configuration → Access & security → OAuth → Install provider → GitHub*,
   dán Client ID / Client Secret.
4. Mở `admin/config.yml`, sửa 2 dòng `repo:` (dạng `tai-khoan/ten-repo`) và `branch:`.
   Commit lên repo.
5. Vào `https://vec.church/admin/`, bấm *Login with GitHub*. Xong.

**Ai được quyền đăng bài?** Bất kỳ ai được thêm làm *Collaborator* (quyền Write) của repo trên GitHub
— họ chỉ cần có tài khoản GitHub, không cần biết dùng Git. Thêm tại *Settings → Collaborators*.

**File mp3 bài giảng:** không nên commit vào repo (GitHub Pages giới hạn 1 GB, repo sẽ phình nhanh).
Tải mp3 lên Google Drive → *Chia sẻ → Bất kỳ ai có đường liên kết* → dán link vào ô *Link audio*;
website tự đổi sang dạng phát trực tiếp. Hoặc đăng YouTube và điền *Link video*.
PDF bài học nhỏ (vài MB) thì tải thẳng trong form được.

**Thử tại máy (tuỳ chọn):** trong thư mục site chạy `npx decap-server` (cửa sổ 1) và
`python3 -m http.server 8080` (cửa sổ 2), mở `http://localhost:8080/admin/` — sửa thử mà không cần đăng nhập,
thay đổi ghi vào file local. Lưu ý `content.json` chỉ được dựng trên GitHub Pages (hoặc khi chạy `jekyll serve`),
nên bản local hiển thị dữ liệu từ `data.js`.

### Cách 2 — Google Sheets (không cần GitHub)

Dùng khi chưa muốn cấp quyền GitHub cho người đăng bài. Website chỉ đọc Sheet khi **không có**
`content.json` hợp lệ (tức là không chạy trên GitHub Pages), hoặc bạn có thể xoá `content.json` để ép dùng Sheet.

Làm **một lần** để thiết lập:

1. Tạo một Google Sheet mới, đặt tên ví dụ *"Nội dung website Hội Thánh"*.
2. Với mỗi file trong thư mục `templates/` → trong Sheet chọn **Tệp → Nhập (Import) → Tải lên**,
   chọn **"Chèn (các) trang tính mới"**. Đổi tên tab cho đúng tên file:
   `ThongBao`, `SuKien`, `BaiGiang`, `HocKinhThanh`, `GioNhom`, `LienHe`.
   (Có thể bỏ tab nào không dùng — website sẽ lấy dữ liệu mặc định trong `data.js` cho tab đó.)
3. **Tệp → Cài đặt (Settings) → Ngôn ngữ: Việt Nam** để ngày hiển thị dạng ngày/tháng/năm.
4. Bấm **Chia sẻ** (góc phải trên) → *Bất kỳ ai có đường liên kết* → **Người xem** → Sao chép liên kết.
5. Mở `js/data.js`, dán liên kết vào dòng `sheet: { url: "..." }`. Tải site lên lại một lần.

Từ đó về sau, **ai được cấp quyền Chỉnh sửa trên Sheet đều cập nhật được website** mà không cần
đụng tới code: thêm một dòng mới vào tab tương ứng, lưu, tải lại trang web (1–2 phút để Google cập nhật).

| Tab | Cột | Ghi chú |
| --- | --- | --- |
| `ThongBao` | Tiêu đề, Ngày, Nội dung, Quan trọng | Đánh `x` vào *Quan trọng* để ghim lên đầu. |
| `SuKien` | Ngày, Tiêu đề, Giờ, Nơi | Tự ẩn sự kiện đã qua, chỉ hiện 6 sự kiện gần nhất. |
| `BaiGiang` | Ngày, Tựa đề, Diễn giả, Kinh Thánh, Loạt bài, Thời lượng, Tóm tắt, Link audio, Link video | *Link audio*: dán link Google Drive của file mp3 (xem bên dưới). Có thể chỉ điền *Link video* (YouTube). |
| `HocKinhThanh` | Ngày, Tựa đề, Kinh Thánh, Người hướng dẫn, Loạt bài, Tóm tắt, Link tài liệu, Link video | *Link tài liệu*: PDF/Google Docs; *Link video*: YouTube/Zoom. |
| `GioNhom` | Thứ, Giờ, Tên buổi nhóm, Nơi, Mô tả, Thời lượng (phút), Chính | *Thứ*: `CN`, `Thứ 4`, `T7`… Đánh `x` ở *Chính* cho buổi thờ phượng chính (dùng cho dòng "Chúa Nhật này…" và nút Thêm vào lịch). |
| `LienHe` | Mục, Giá trị | Email, Điện thoại, WhatsApp, Zalo, Facebook, YouTube, Nơi nhóm, Địa chỉ, Ghi chú đường đi. |

Quy ước:

- **Ngày**: `05/10/2026` (ngày/tháng/năm) hoặc `2026-10-05`. Dòng mới nhất không cần để trên cùng — website tự sắp xếp.
- **Giờ**: `14:00` hoặc `14h00`.
- Thứ tự cột không quan trọng, nhưng **tiêu đề cột phải giữ nguyên** (không phân biệt hoa/thường, dấu).
- Dòng trống bị bỏ qua. Dòng thiếu *Tựa đề/Tiêu đề* bị bỏ qua.

**File mp3 bài giảng** — cách đơn giản nhất:

1. Tải mp3 lên Google Drive (nên có thư mục riêng *"Bài giảng"*).
2. Chuột phải → **Chia sẻ** → *Bất kỳ ai có đường liên kết* → **Sao chép liên kết**.
3. Dán nguyên liên kết đó (dạng `https://drive.google.com/file/d/…/view`) vào cột *Link audio*.
   Website tự đổi sang dạng phát trực tiếp.

> Drive phát tốt với file dưới ~100 MB (một bài giảng 45 phút ở 64–96 kbps ≈ 20–30 MB).
> Nếu muốn chuyên nghiệp hơn về lâu dài: đưa bài giảng lên YouTube (chỉ cần điền *Link video*)
> hoặc một dịch vụ podcast (Spotify for Podcasters) rồi dán link mp3 của họ.

Nếu website không đổi sau khi sửa Sheet: kiểm tra (a) Sheet đã chia sẻ *Bất kỳ ai có đường liên kết*;
(b) tên tab đúng; (c) tải lại trang với Ctrl+Shift+R. Khi có lỗi, site **tự quay về** nội dung trong `data.js`
chứ không hiển thị trang trống.

### Cách 3 — Sửa thẳng `js/data.js`

Dành cho người quản trị kỹ thuật. Mở file bằng Notepad/VS Code, sửa chữ trong dấu ngoặc kép `"..."`,
giữ nguyên dấu phẩy và ngoặc. Các khối: `services`, `announcements`, `events`, `sermons`, `studies`,
`ministries`, `verses`, `church`, `location`. Lưu ý: khi site chạy trên GitHub Pages thì `content.json`
(từ `/admin`) được ưu tiên hơn `data.js`; `data.js` chỉ là dự phòng.

## Chạy thử tại máy

- Nhấp đôi `index.html` là xem được (kể cả thập tự giá 3D). Bản đồ và phông chữ Google cần Internet.
- Đọc từ Google Sheets **chỉ hoạt động khi chạy qua http/https** (trình duyệt chặn `fetch` ở `file://`).
  Để thử tính năng này tại máy:

  ```bash
  cd vec_church_site
  python3 -m http.server 8080     # rồi mở http://localhost:8080
  ```

## Đưa lên mạng (thay vec.church)

Site tĩnh → deploy miễn phí lên **Cloudflare Pages** (kéo thả thư mục), Netlify Drop, GitHub Pages
hoặc Firebase Hosting; sau đó trỏ tên miền `vec.church` (CNAME) về đó. Mỗi lần đổi code/`data.js`
chỉ cần kéo thả lại; **đổi nội dung qua Google Sheets thì không cần deploy lại**.

## Hướng thiết kế

Theo checklist `frontend-design` (Anthropic) và `impeccable`: không nhãn in hoa, không card kính,
không chữ gradient, không fade-up từng section. Bố cục như **tờ chương trình thờ phượng**: đường kẻ mảnh,
danh sách, khoảng trắng. Một khoảnh khắc chuyển động duy nhất: hero.

- Màu: giấy `#F6F5F0`, mực `#16213A`, xanh `#1D4F91`, xanh đậm `#0F2D5C`; hạt sáng ngà `#FFF6DF` / vàng trầm `#D9BC74`.
- Chữ: Literata (serif) + Be Vietnam Pro (menu, nhãn, nút).

## Tính năng

- Hero 3D: ~4 600 hạt sáng tụ lại thành thập tự giá khi mở trang, lấp lánh, nghiêng theo chuột /
  cảm biến điện thoại, tan ra khi cuộn. Tắt khi không có WebGL; tôn trọng `prefers-reduced-motion`.
- Dòng đầu hero tự ghi buổi nhóm kế tiếp ("Hôm nay, 14:00 tại …") theo giờ Singapore; nút tải lịch `.ics` lặp hằng tuần.
- Trình phát bài giảng cố định cuối trang: phát/tạm dừng, tua, tốc độ 0.75×–2×, bài trước/kế, tải về,
  phím Space, Media Session (điều khiển từ màn hình khoá điện thoại).
- Tìm kiếm & lọc bài giảng theo loạt bài; mục Học Kinh Thánh với link tài liệu/video.
- Responsive cho điện thoại (thập tự giá xuống dưới phần chữ).

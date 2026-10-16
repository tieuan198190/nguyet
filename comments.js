// ============================================
// Comment livestream — hiện comment Facebook ngay trên màn hình quét mã
// Lấy dữ liệu từ workflow n8n "API Sổ Chốt Đơn" (bảng fb_comments)
// Thử giao diện không cần n8n: mở trang với ?demo=1
// ============================================

const COMMENT_API_URL = 'https://vmi3164630.contaboserver.net/webhook/so-chot-don';
const COMMENT_API_KEY = 'ea173f757e798cfb316a0a08cd5ccaad'; // giống KEY trong node "Kiểm tra key" (n8n chỉ trả dữ liệu cho tieuan198190.github.io)
const COMMENT_POLL_SECONDS = 3;   // bao lâu lấy comment mới một lần
const COMMENT_MAX_VISIBLE = 5;    // số comment gần nhất hiện trên màn
const COMMENT_MAX_AGE_MINUTES = 30; // comment cũ hơn chừng này phút tự biến mất (cả số "khách hỏi" cũng chỉ tính trong khoảng này)
const COMMENT_SHOW_FULL_PHONE = false; // SĐT đã được n8n che sẵn trước khi gửi về trang, nên luôn hiện dạng 0901 ••• 513

(function () {
  'use strict';

  // Thiếu API trình duyệt (ví dụ khi chạy app.test.js bằng Node) thì bỏ qua,
  // để khung comment không bao giờ làm hỏng phần quét mã
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function' ||
      typeof URLSearchParams === 'undefined' || typeof MutationObserver === 'undefined' || typeof location === 'undefined') return;

  const DEMO = new URLSearchParams(location.search).has('demo');
  const comments = new Map(); // comment_id -> comment
  const pageIds = new Set();
  let since = 0;
  let errorCount = 0;
  let connected = false;
  let lastShownIds = new Set();

  // —— Đọc mã sản phẩm, size, SĐT trong comment ——
  const SIZE_LABELS = { XXL: '2XL', XXXL: '3XL' };
  const SIZE_RE = '4XL|3XL|2XL|XXXL|XXL|XL|M|L';
  const codeRe = new RegExp('(^|[^\\p{L}\\d])([A-Za-z]{1,2}\\d{2,4})(?:\\s*[-_ ]?\\s*(' + SIZE_RE + '))?(?![\\p{L}\\d])', 'giu');
  const sizeAloneRe = new RegExp('(?:(?:size|sz|sai|sài)\\s*:?\\s*(' + SIZE_RE + ')(?![\\p{L}\\d]))|(?<![\\p{L}\\d])(4XL|3XL|2XL|XXXL|XXL|XL)(?![\\p{L}\\d])', 'giu');
  // SĐT đầy đủ, hoặc SĐT đã được n8n che sẵn dạng 0901•••513
  const phoneRe = /(?:\+?84|0)(?:[\s.\-]?\d){9}|0\d{3}\s?•••\s?\d{3}/g;
  const SKIP_PREFIX = new Set(['x', 'sl', 'sz', 'kg', 'cm', 'ib', 'dt']);

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normSize = (s) => { const u = String(s || '').toUpperCase(); return SIZE_LABELS[u] || u; };
  const baseCode = (s) => String(s || '').toUpperCase().split('-')[0].trim();

  function normPhone(raw) {
    const s = String(raw || '');
    if (/^\s*0\d{3}\s?•••\s?\d{3}\s*$/.test(s)) return s.replace(/\s/g, ''); // đã che sẵn từ n8n
    let d = s.replace(/\D/g, '');
    if (d.startsWith('84')) d = '0' + d.slice(2);
    return /^0[35789]\d{8}$/.test(d) ? d : null;
  }
  function showPhone(p) {
    if (p.includes('•') || !COMMENT_SHOW_FULL_PHONE) return p.slice(0, 4) + ' ••• ' + p.slice(-3);
    return p.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');
  }

  function parse(msg) {
    const ranges = [], phones = [], codes = [];
    for (const m of msg.matchAll(phoneRe)) {
      const p = normPhone(m[0]);
      if (p) { phones.push(p); ranges.push({ s: m.index, e: m.index + m[0].length, t: 'phone', p }); }
    }
    for (const m of msg.matchAll(codeRe)) {
      const code = m[2].toUpperCase();
      if (SKIP_PREFIX.has(code.replace(/\d+/g, '').toLowerCase())) continue;
      const s = m.index + m[1].length, e = m.index + m[0].length;
      if (ranges.some((r) => s < r.e && e > r.s)) continue;
      codes.push({ code, size: m[3] ? normSize(m[3]) : '' });
      ranges.push({ s, e, t: 'code', code });
    }
    if (codes.length) {
      for (const m of msg.matchAll(sizeAloneRe)) {
        const s = m.index, e = s + m[0].length;
        if (ranges.some((r) => s < r.e && e > r.s)) continue;
        const target = codes.find((c) => !c.size);
        if (target) target.size = normSize(m[1] || m[2]);
        ranges.push({ s, e, t: 'size' });
      }
    }
    ranges.sort((a, b) => a.s - b.s);
    return { phones, codes, ranges };
  }

  function messageHtml(c, currentCode) {
    const msg = c.msg;
    let html = '', i = 0;
    for (const r of c.parsed.ranges) {
      html += esc(msg.slice(i, r.s));
      const text = msg.slice(r.s, r.e);
      if (r.t === 'phone') html += '<mark class="lc-phone">' + esc(showPhone(r.p)) + '</mark>';
      else if (r.t === 'code') html += '<mark class="lc-code' + (currentCode && baseCode(r.code) === currentCode ? ' is-current' : '') + '">' + esc(text) + '</mark>';
      else html += '<mark class="lc-size">' + esc(text) + '</mark>';
      i = r.e;
    }
    return html + esc(msg.slice(i));
  }

  // —— Dữ liệu ——
  function addRows(rows) {
    let added = 0;
    for (const r of rows) {
      const j = r && r.json ? r.json : r;
      if (!j || !j.comment_id) continue;
      const msg = String(j.message ?? '');
      if (j.page_id) pageIds.add(String(j.page_id));
      const c = {
        id: String(j.comment_id), post: String(j.post_id ?? ''), page: String(j.page_id ?? ''),
        // "who": mã ẩn danh của khách do n8n tạo (không phải ID Facebook), chỉ dùng để đếm số khách
        fromId: String(j.who ?? j.from_id ?? ''), name: String(j.from_name ?? '') || 'Khách', msg,
        verb: String(j.verb ?? 'add'), ts: Number(j.created_ts) || Math.floor(Date.now() / 1000),
        ai: { order: Number(j.ai_order) || 0, code: String(j.ai_code ?? ''), size: String(j.ai_size ?? ''), phone: String(j.ai_phone ?? '') },
        parsed: parse(msg),
        tags: parseTags(j.tags),
      };
      if (!comments.has(c.id)) added++;
      comments.set(c.id, c);
      since = Math.max(since, c.ts);
    }
    // Giữ bộ nhớ gọn: chỉ giữ 600 comment gần nhất
    if (comments.size > 600) {
      const keep = [...comments.values()].sort((a, b) => b.ts - a.ts).slice(0, 600);
      comments.clear();
      for (const c of keep) comments.set(c.id, c);
    }
    return added;
  }

  // Tag khách từ Pancake (Bom Hàng, Đã từng mua...), n8n gửi dạng chuỗi JSON [{text, color}]
  function parseTags(raw) {
    let list = raw;
    if (typeof raw === 'string') { try { list = JSON.parse(raw || '[]'); } catch { list = []; } }
    if (!Array.isArray(list)) return [];
    return list
      .map((t) => ({ text: String((t && t.text) || '').trim(), color: /^#[0-9a-f]{3,8}$/i.test(String(t && t.color)) ? t.color : '' }))
      .filter((t) => t.text);
  }
  // Chỉ hiện các tag này trên màn live, theo thứ tự ưu tiên (tag khác như Nhân, Thảo, chờ cọc... bị bỏ qua)
  // warn: hiện thành nhãn màu đặc · stop: thêm viền đỏ cả dòng (không nên bán / phải cẩn thận)
  const SHOW_TAGS = [
    { name: 'Bom Hàng', warn: true, stop: true },
    { name: 'Không bán nữa', warn: true, stop: true },
    { name: 'Phải Cọc Full', warn: true, stop: true },
    { name: 'Cảnh báo', warn: true },
    { name: 'Khách Vip' },
    { name: 'Đã từng mua' },
  ];
  const tagKey = (s) => String(s || '').normalize('NFC').trim().toLowerCase();
  const tagRule = (t) => SHOW_TAGS.findIndex((r) => tagKey(r.name) === tagKey(t.text));
  const shownTags = (c) => c.tags.filter((t) => tagRule(t) !== -1).sort((a, b) => tagRule(a) - tagRule(b));
  const isBom = (c) => shownTags(c).some((t) => SHOW_TAGS[tagRule(t)].stop);

  // Chữ trắng hay đen tuỳ màu nền tag (tag "Không bán nữa" nền vàng chanh cần chữ đen)
  function inkFor(hex) {
    let h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    if ([r, g, b].some(Number.isNaN)) return '#fff';
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#1d1d1f' : '#fff';
  }

  // Hiện tối đa 2 tag quan trọng nhất cho đỡ rối mắt
  function tagsHtml(c) {
    return shownTags(c).slice(0, 2).map((t) => {
      const rule = SHOW_TAGS[tagRule(t)];
      const style = t.color ? '--tag:' + t.color + (rule.warn ? ';--tag-ink:' + inkFor(t.color) : '') : '';
      return '<span class="lc-ptag' + (rule.warn ? ' is-warn' : '') + '"' + (style ? ' style="' + style + '"' : '') + '>' + esc(t.text) + '</span>';
    }).join('');
  }

  const isShop = (c) => !!c.fromId && (c.fromId === c.page || pageIds.has(c.fromId));

  // Bài đang live = bài có nhiều comment nhất trong 10 phút gần đây
  function activePost(list) {
    const cutoff = Math.floor(Date.now() / 1000) - 600;
    const counts = new Map();
    for (const c of list) if (c.ts >= cutoff) counts.set(c.post, (counts.get(c.post) || 0) + 1);
    if (!counts.size) return list.length ? list[0].post : '';
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  // Comment có nhắc tới mã đang quét không, và size nào
  function hitsFor(c, code) {
    if (!code) return [];
    const hits = c.parsed.codes.filter((x) => baseCode(x.code) === code);
    if (!hits.length && c.ai.order === 1 && baseCode(c.ai.code) === code) hits.push({ code, size: normSize(c.ai.size) });
    return hits;
  }

  function currentProductCode() {
    // app.js xoá ô nhập sau mỗi lần quét, nên lấy mã từ tiêu đề sản phẩm đang hiện
    const page = document.getElementById('result-page');
    const title = document.getElementById('product-title');
    if (!page || !title || page.style.display === 'none') return '';
    const code = baseCode(title.textContent.replace(/\u00a0/g, ' '));
    return /^[A-Z]{1,2}\d{2,4}$/.test(code) ? code : '';
  }

  // —— Giao diện ——
  // Khung bình luận riêng (không đè lên ảnh), nằm dưới sản phẩm hoặc dưới màn chờ
  document.body.classList.add('live-layout');

  const panel = document.createElement('section');
  panel.className = 'live-panel';
  panel.setAttribute('aria-label', 'Bình luận livestream');
  // Tóm tắt ở đầu khung: 3 dòng "N khách hỏi MÃ" cho 3 mã được hỏi gần nhất
  const demand = document.createElement('div');
  demand.className = 'lp-asks';
  panel.appendChild(demand);
  const ASK_ROWS = 3;
  const feed = document.createElement('div');
  feed.className = 'live-feed';
  feed.setAttribute('aria-live', 'polite');
  panel.appendChild(feed);

  // Trang kết quả: khung bình luận đè lên phần dưới ảnh. Màn chờ: nằm ở đáy màn hình
  function placeElements() {
    const result = document.getElementById('result-page');
    const resultVisible = result && result.style.display !== 'none';
    const target = resultVisible ? document.querySelector('.image-container') : document.getElementById('welcome-page');
    panel.classList.toggle('on-welcome', !resultVisible);
    if (target && panel.parentElement !== target) target.appendChild(panel);
  }

  // Ghi số khách hỏi vào từng ô size có sẵn: chấm số xanh ở góc ô
  let demandBySize = new Map();
  function annotateSizes() {
    for (const li of document.querySelectorAll('#size-list li')) {
      const sizeEl = li.querySelector('.size-info');
      if (!sizeEl) continue;
      let tag = li.querySelector('.size-demand');
      const n = demandBySize.get(normSize(sizeEl.textContent.trim())) || 0;
      if (!n) { if (tag) tag.remove(); continue; }
      if (!tag) { tag = document.createElement('span'); tag.className = 'size-demand'; li.appendChild(tag); }
      tag.textContent = String(n);
      tag.title = n + ' khách hỏi size này';
    }
  }

  function render() {
    placeElements();
    const code = currentProductCode();
    const oldest = Math.floor(Date.now() / 1000) - COMMENT_MAX_AGE_MINUTES * 60;
    const all = [...comments.values()]
      .filter((c) => !isShop(c) && c.verb !== 'remove' && c.ts >= oldest)
      .sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
    const post = activePost([...all].reverse());
    const live = all.filter((c) => c.post === post);

    // Số khách hỏi mã đang quét: tổng (dòng tóm tắt) và theo từng size (ô size). Tag chỉ hiện trong từng comment
    demandBySize = new Map();
    if (code) {
      const buyers = new Set(), bySize = new Map();
      for (const c of live) {
        const hits = hitsFor(c, code);
        if (!hits.length) continue;
        const who = c.fromId || c.name;
        buyers.add(who);
        for (const h of hits) {
          if (!h.size) continue;
          if (!bySize.has(h.size)) bySize.set(h.size, new Set());
          bySize.get(h.size).add(who);
        }
      }
      for (const [s, set] of bySize) demandBySize.set(s, set.size);
    }
    annotateSizes();

    // Số khách hỏi từng mã trong buổi live (1 khách hỏi nhiều lần một mã chỉ tính 1) + lần hỏi gần nhất
    const asks = new Map(); // mã -> { who: Set, last: ts }
    for (const c of live) {
      const codes = new Set(c.parsed.codes.map((x) => baseCode(x.code)));
      if (c.ai.order === 1 && c.ai.code) codes.add(baseCode(c.ai.code));
      for (const k of codes) {
        if (!/^[A-Z]{1,2}\d{2,4}$/.test(k)) continue;
        if (!asks.has(k)) asks.set(k, { who: new Set(), last: 0 });
        const a = asks.get(k);
        a.who.add(c.fromId || c.name);
        a.last = Math.max(a.last, c.ts);
      }
    }
    // 3 mã được hỏi gần nhất; mã mới nhất nằm dưới cùng, sát khung comment
    const recent = [...asks.entries()].sort((a, b) => b[1].last - a[1].last || b[1].who.size - a[1].who.size).slice(0, ASK_ROWS).reverse();
    demand.innerHTML = recent.map(([k, a]) =>
      '<div class="lp-ask' + (k === code ? ' is-current' : '') + '"><b>' + a.who.size + '</b> khách hỏi ' + esc(k) + '</div>').join('');
    demand.hidden = !recent.length;

    // Danh sách comment: mới nhất ở dưới cùng, như khung chat livestream
    const shown = live.slice(-COMMENT_MAX_VISIBLE);
    if (!shown.length) {
      feed.innerHTML = '<div class="lc-empty">' + (connected || DEMO ? 'Chưa có bình luận mới trong ' + COMMENT_MAX_AGE_MINUTES + ' phút qua' : 'Đang kết nối tới bình luận…') + '</div>';
      lastShownIds = new Set();
      return;
    }
    feed.innerHTML = shown.map((c) => {
      const hit = hitsFor(c, code).length > 0;
      const phone = c.parsed.phones[0] || normPhone(c.ai.phone);
      const isNew = !lastShownIds.has(c.id);
      return '<div class="lc' + (hit ? ' is-hit' : '') + (isNew ? ' is-new' : '') + (isBom(c) ? ' is-bom' : '') + '">' +
        '<div class="lc-top"><span class="lc-name">' + esc(c.name) + '</span>' + tagsHtml(c) +
        (!c.parsed.phones.length && phone ? '<span class="lc-phone">' + esc(showPhone(phone)) + '</span>' : '') +
        '<span class="lc-time">' + esc(clock(c.ts)) + '</span></div>' +
        '<div class="lc-msg">' + messageHtml(c, code) + '</div>' +
        '</div>';
    }).join('');
    lastShownIds = new Set(shown.map((c) => c.id));
  }

  // Luôn hiện giờ Việt Nam, kể cả khi máy đặt múi giờ khác
  function clock(ts) {
    const vn = new Date((ts + 7 * 3600) * 1000);
    return String(vn.getUTCHours()).padStart(2, '0') + ':' + String(vn.getUTCMinutes()).padStart(2, '0');
  }

  // —— Lấy comment từ n8n ——
  async function poll() {
    try {
      const url = new URL(COMMENT_API_URL);
      url.searchParams.set('key', COMMENT_API_KEY);
      url.searchParams.set('since', String(since ? since - 120 : 0));
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (data.comments || []);
      const added = addRows(rows);
      errorCount = 0;
      if (!connected || added) { connected = true; render(); }
    } catch (err) {
      errorCount++;
      if (errorCount === 1 || errorCount % 20 === 0) console.warn('[Comment] Không lấy được comment:', err.message);
      if (connected && errorCount >= 3) { connected = false; render(); }
    }
    const wait = COMMENT_POLL_SECONDS * 1000 * (errorCount ? Math.min(2 ** errorCount, 20) : 1);
    setTimeout(poll, wait);
  }

  // —— Chế độ mẫu (?demo=1) ——
  function startDemo() {
    const names = ['Ngọc Trâm', 'Thu Hà', 'Lan Phương', 'Kim Oanh', 'Mai Anh', 'Hồng Nhung', 'Bích Ngọc', 'Thảo Vy'];
    const generic = ['đẹp quá shop ơi', 'giá bao nhiêu vậy shop', 'em 72kg mặc size gì ạ', 'ship về Cần Thơ bao lâu', 'còn màu đen không shop', 'inbox em nha'];
    let n = 0;
    const make = () => {
      n++;
      // Trộn nhiều mã: phần lớn hỏi mã đang quét, còn lại hỏi các mã khác
      const code = n % 2 === 0 ? (currentProductCode() || 'A601') : ['A601', 'N789', 'T123', 'A601', 'N792'][n % 5];
      const sizes = ['XL', '2XL', '3XL', 'L'];
      const variants = [
        'chốt ' + code + ' ' + sizes[n % 4],
        code + ' size ' + sizes[(n + 1) % 4] + ' 0901 234 5' + String(n % 10) + String((n * 3) % 10),
        generic[n % generic.length],
        'lấy ' + code + '-' + sizes[(n + 2) % 4] + ' nha',
        generic[(n + 3) % generic.length],
      ];
      return {
        comment_id: 'demo_' + n, post_id: 'demo_post', page_id: 'demo_page', from_id: 'u' + (n % names.length),
        from_name: names[n % names.length], message: variants[n % variants.length], verb: 'add', created_ts: Math.floor(Date.now() / 1000),
        tags: [
          [{ text: 'Bom Hàng', color: '#e8402b' }, { text: 'Đã từng mua', color: '#52ab6b' }],
          [{ text: 'Khách Vip', color: '#587b9d' }, { text: 'Nhân', color: '#e0b6a2' }],
          [{ text: 'Không bán nữa', color: '#e2f046' }],
          [{ text: 'Phải Cọc Full', color: '#e8402b' }],
          [{ text: 'Cảnh báo', color: '#ec9534' }, { text: 'Đã từng mua', color: '#52ab6b' }],
          [{ text: 'Đã từng mua', color: '#52ab6b' }, { text: 'chờ cọc', color: '#c6c592' }],
          [], [],
        ][n % names.length],
      };
    };
    connected = true;
    for (let i = 0; i < 6; i++) addRows([make()]);
    render();
    setInterval(() => { addRows([make()]); render(); }, 2500);
  }

  // —— Khởi động ——
  function init() {
    // Vẽ lại ngay khi đổi trang chờ <-> trang kết quả hoặc quét mã mới
    const result = document.getElementById('result-page');
    if (result) new MutationObserver(render).observe(result, { attributes: true, attributeFilter: ['style'] });
    // app.js vẽ lại danh sách size sau mỗi lần tìm: ghi lại số khách vào các ô size mới
    const sizeList = document.getElementById('size-list');
    if (sizeList) new MutationObserver(annotateSizes).observe(sizeList, { childList: true });
    const original = window.searchProduct;
    if (typeof original === 'function') {
      window.searchProduct = async function () {
        const out = await original.apply(this, arguments);
        render();
        return out;
      };
    }
    render();
    if (DEMO) startDemo(); else poll();
    // Vẽ lại mỗi 30 giây để comment quá hạn tự biến mất, kể cả khi không có comment mới
    setInterval(render, 30000);
  }

  const safeInit = () => { try { init(); } catch (err) { console.warn('[Comment] Không khởi động được khung comment:', err); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeInit);
  else safeInit();
})();

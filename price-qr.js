// ============================================
// Quét QR giá: đang xem một sản phẩm thì quét QR
//   "GIA-585K-<mã bí mật>" để đổi giá bán lẻ của sản phẩm đó (mọi size) trên nhanh.vn
//   "GIA-GOC-<mã bí mật>"  để trả về giá gốc (giá trước lần đổi sale đầu tiên bằng QR)
// rồi tải lại thông tin sản phẩm.
// Mã bí mật chỉ nằm trên tờ QR in ra; n8n (workflow "Đổi giá bằng QR (trang live)") kiểm tra,
// trang web không giữ mã này. Mỗi lần đổi giá, n8n nhắn Telegram cho chủ shop.
// ============================================

const PRICE_QR_URL = 'https://vmi3164630.contaboserver.net/webhook/doi-gia-qr';

(function () {
  'use strict';

  // Thiếu API trình duyệt (ví dụ khi chạy app.test.js bằng Node) thì bỏ qua
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function' ||
      typeof URLSearchParams === 'undefined' || typeof fetch !== 'function') return;

  const PRICE_QR = /^GIA-(?:(\d{2,5})K|GOC)-[A-Z0-9]+$/i;
  let lastProduct = ''; // mã sản phẩm đang hiện trên màn hình và tìm thấy (để biết đổi giá cho mã nào)
  let pending = null;   // lần tìm sản phẩm đang chạy (quét QR giá ngay sau mã mới thì chờ nó xong)
  let searchSeq = 0;    // tăng mỗi lần quét mã sản phẩm, để biết đã có sản phẩm mới hơn chưa
  let busy = false;

  const fmt = (n) => Number(n).toLocaleString('vi-VN') + 'đ';
  const notify = (msg, type) => {
    if (typeof window.showNotification === 'function') window.showNotification(msg, type);
    else console.log('[Giá QR]', msg);
  };

  async function applyPrice(qr, refresh) {
    const input = document.getElementById('productCode');
    if (input) input.value = ''; // xoá ngay để ô nhập không tự tìm "GIA-..." như một mã sản phẩm
    if (busy) {
      notify('Đang đổi giá, chờ xong rồi quét lại', 'error');
      return;
    }
    busy = true;

    // Vừa quét mã sản phẩm mới mà chưa tải xong: chờ, để không áp giá nhầm cho sản phẩm trước đó
    if (pending) {
      try { await pending; } catch (err) { /* lỗi tải đã được app.js báo */ }
    }
    if (!lastProduct) {
      busy = false;
      notify('Hãy quét sản phẩm (tìm thấy được) trước, rồi mới quét QR giá', 'error');
      return;
    }

    const code = lastProduct;
    const mySeq = searchSeq;
    const k = qr.match(PRICE_QR)[1];
    const price = k ? Number(k) * 1000 : 0; // không có giá = QR "Trả giá gốc"
    notify(price ? 'Đang đổi giá ' + code + ' thành ' + fmt(price) + '…' : 'Đang trả giá gốc cho ' + code + '…');
    try {
      const res = await fetch(PRICE_QR_URL, { method: 'POST', body: new URLSearchParams({ productCode: code, qr }) });
      const data = await res.json();
      if (data.changed) notify(price ? 'Đã đổi giá ' + code + ' thành ' + fmt(price) : 'Đã trả giá gốc cho ' + code);
      else notify(data.text || 'Không đổi được giá', 'error');
    } catch (err) {
      notify('Không kết nối được để đổi giá, hãy quét lại', 'error');
    } finally {
      busy = false;
    }

    // Lấy lại thông tin sản phẩm từ nhanh.vn để hiện giá mới,
    // trừ khi trong lúc chờ đã quét sang sản phẩm khác (không kéo màn hình về sản phẩm cũ)
    if (searchSeq !== mySeq) return;
    if (input) input.value = code;
    return refresh();
  }

  function init() {
    const original = window.searchProduct;
    if (typeof original !== 'function') return;

    window.searchProduct = async function () {
      const input = document.getElementById('productCode');
      const value = String((input && input.value) || '').trim().toUpperCase();
      const args = arguments;
      if (PRICE_QR.test(value)) return applyPrice(value, () => original.apply(this, args));

      // Quét mã sản phẩm: quên sản phẩm cũ ngay, chỉ nhớ mã mới khi tìm thấy (giá hiện dạng "585.000 đ")
      lastProduct = '';
      searchSeq++;
      const run = (async () => {
        const out = await original.apply(this, args);
        const priceEl = document.getElementById('product-price');
        if (value && priceEl && /\d.*đ/.test(priceEl.textContent || '')) lastProduct = value;
        return out;
      })();
      pending = run;
      try {
        return await run;
      } finally {
        if (pending === run) pending = null;
      }
    };
  }

  try { init(); } catch (err) { console.warn('[Giá QR] Không khởi động được:', err); }
})();

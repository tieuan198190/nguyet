// --- PHẦN 1: GIỮ NGUYÊN HOÀN TOÀN PHẦN WORKER VÀ LOCATION ---

let productData = []; // Vẫn khai báo để không lỗi, nhưng KHÔNG DÙNG
let locationData = [];

console.log('[Main] Khởi tạo Data Parser Worker...');
const dataParser = new Worker('data_parser.js');

dataParser.onmessage = function(event) {
    const { type, payload } = event.data;
    console.log(`✅ [Main] Đã nhận dữ liệu ${type} đã xử lý từ Worker.`);

    if (type === 'product') {
        productData = payload; // Vẫn nhận, nhưng không dùng
    } else if (type === 'location') {
        locationData = payload;
    }
    
    refreshCurrentSearch();
};

dataParser.onerror = error => console.error('[Main] Lỗi từ Worker:', error);

async function fetchDataWithCacheCheck(url, storageKey, dataType) {
    console.log(`⏳ [Main] Đang kiểm tra cập nhật cho: ${storageKey}`);
    const localETag = localStorage.getItem(`${storageKey}_ETag`);
    const headers = { 'Cache-Control': 'no-cache' };
    if (localETag) headers['If-None-Match'] = localETag;

    try {
        const response = await fetch(url, { headers });
        if (response.status === 304) {
            console.log(`✅ [Main] Dữ liệu ${storageKey} đã mới nhất.`);
            return;
        }
        if (response.ok) {
            const newETag = response.headers.get('ETag');
            const dataText = await response.text();
            if (newETag) localStorage.setItem(`${storageKey}_ETag`, newETag);
            dataParser.postMessage({ type: dataType, payload: dataText });
        } else {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
    } catch (error) {
        console.error(`❌ [Main] Lỗi khi fetch ${storageKey}:`, error);
    }
}

// --- PHẦN 2: SỬA HÀM TÌM KIẾM — PRODUCT DÙNG WEBHOOK, LOCATION DÙNG S3 ---

const WEBHOOK_URL = 'https://n8n-hongnhung198198-u40833.vm.elestio.app/webhook/22aa9e0d-0baa-48db-8f14-fe2da449de38';

async function searchProduct() {
  const inputEl = document.getElementById('productCode');
  const productCode = inputEl.value.trim().toUpperCase();
  if (!productCode) return;

  // 1. Lấy location từ locationData (giữ nguyên logic cũ)
  const locationResults = locationData.filter(l => l.code === productCode);

  // 2. Gọi webhook để lấy product
  let productResults = [];
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCode })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.found) {
        // Chuyển đổi định dạng webhook → giống productData cũ
        productResults = data.sizes.map(size => ({
          parentCode: productCode,
          size: size.size,
          stock: size.stock,
          imageUrl: data.imageUrl,
          price: data.price
        }));
      }
    }
  } catch (err) {
    console.error('Lỗi gọi webhook:', err);
    // productResults giữ là [] → hiển thị "không tìm thấy"
  }

  // 3. Hiển thị kết quả (giữ nguyên hàm cũ)
  displayResults(productResults, locationResults, productCode);

  // 4. Xoá input & focus (giữ nguyên)
  inputEl.value = '';
  inputEl.focus();
}

// --- GIỮ NGUYÊN HOÀN TOÀN HÀM displayResults() ---

function displayResults(productResults, locationResults, productCode) {
  const imageEl = document.getElementById('product-image');
  const priceEl = document.getElementById('product-price');
  const locationEl = document.getElementById('location-info');
  const sizeListEl = document.getElementById('size-list');

  sizeListEl.innerHTML = '';

  if (productResults.length > 0) {
      imageEl.src = productResults[0].imageUrl || 'comap_logo.jpg';
      priceEl.textContent = `${productResults[0].price.toLocaleString('vi-VN')} đ`;

      const availableSizes = productResults.filter(item => item.stock > 0);
      if (availableSizes.length > 0) {
          availableSizes.forEach(item => {
              const li = document.createElement('li');
              li.innerHTML = `
                <span class="size-info"><strong>${item.size}</strong></span>
                <span class="stock-info">    <strong>${item.stock}</strong></span>
              `;
              sizeListEl.appendChild(li);
          });
      } else {
          const li = document.createElement('li');
          li.textContent = 'Sản phẩm này đã hết hàng';
          sizeListEl.appendChild(li);
      }
  } else {
      imageEl.src = 'comap_logo.jpg';
      priceEl.textContent = 'Không có giá';
      const li = document.createElement('li');
      li.textContent = `Không tìm thấy sản phẩm ${productCode}`;
      sizeListEl.appendChild(li);
  }

  if (locationResults.length > 0) {
      locationEl.textContent = locationResults.map(l => `${l.key} - ${l.value}`).join('; ');
  } else {
      locationEl.textContent = 'Không có vị trí';
  }
}

// --- GIỮ NGUYÊN CÁC HÀM KHÁC: goBack, refreshCurrentSearch, v.v. ---

function goBack() {
    document.getElementById('result-page').style.display = 'none';
    document.getElementById('welcome-page').style.display = 'block';
    const welcomeInput = document.getElementById('welcomeProductCode');
    welcomeInput.value = '';
    welcomeInput.focus();
}

function refreshCurrentSearch() {
    const resultPageVisible = document.getElementById("result-page").style.display === "block";
    if (resultPageVisible) {
        console.log("[Main] Dữ liệu nền đã thay đổi, tự động làm mới kết quả...");
        searchProduct();
    }
}

// --- PHẦN 3: KHỞI TẠO — CHỈ TẢI LOCATION, BỎ TẢI PRODUCT ---

function periodicUpdate() {
    // const productUrl = "..."; // 🚫 KHÔNG CẦN TẢI PRODUCT TỪ S3 NỮA
    const locationUrl = "https://productdata19971998.s3.ap-southeast-1.amazonaws.com/ma_chatlieu2.txt";
    
    console.log('--- Bắt đầu chu kỳ kiểm tra cập nhật ---');
    // fetchDataWithCacheCheck(productUrl, 'product', 'product'); // 🚫 COMMENT DÒNG NÀY
    fetchDataWithCacheCheck(locationUrl, 'location', 'location');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('backButton').addEventListener('click', goBack);
    periodicUpdate();
    setInterval(periodicUpdate, 120000);
});
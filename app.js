// File: app.js

// --- PHẦN 1: KHỞI TẠO VÀ QUẢN LÝ DỮ LIỆU NỀN ---

let productData = [];
let locationData = [];

console.log('[Main] Khởi tạo Data Parser Worker...');
const dataParser = new Worker('data_parser.js');

// Lắng nghe kết quả đã xử lý trả về từ Worker
dataParser.onmessage = function(event) {
    const { type, payload } = event.data;
    console.log(`✅ [Main] Đã nhận dữ liệu ${type} đã xử lý từ Worker.`);

    if (type === 'product') {
        productData = payload;
    } else if (type === 'location') {
        locationData = payload;
    }
    
    // Tự động cập nhật lại kết quả nếu người dùng đang xem
    refreshCurrentSearch();
};

dataParser.onerror = error => console.error('[Main] Lỗi từ Worker:', error);

// Hàm fetch dữ liệu từ S3, kiểm tra ETag và gửi cho Worker xử lý
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
            
            console.log(`[Main] Gửi dữ liệu ${storageKey} sang cho Worker xử lý...`);
            dataParser.postMessage({ type: dataType, payload: dataText });
        } else {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
    } catch (error) {
        console.error(`❌ [Main] Lỗi khi fetch ${storageKey}:`, error);
    }
}

// --- PHẦN 2: LOGIC HIỂN THỊ VÀ TƯƠNG TÁC GIAO DIỆN ---

// Hàm tìm kiếm chính, được gọi từ cả 2 trang
function searchProduct() {
  const inputEl = document.getElementById('productCode'); // Lấy element để dùng lại
  const productCode = inputEl.value.toUpperCase().trim();
  if (!productCode) return;

  const productResults = productData.filter(p => p.parentCode === productCode);
  const locationResults = locationData.filter(l => l.code === productCode);
  
  displayResults(productResults, locationResults, productCode);
  
  // ✅ THÊM 2 DÒNG NÀY VÀO CUỐI HÀM
  inputEl.value = '';     // Xoá nội dung trong ô input
  inputEl.focus();      // Tự động trỏ chuột vào lại ô input
}

// Hàm hiển thị toàn bộ thông tin lên trang kết quả
function displayResults(productResults, locationResults, productCode) {
  const imageEl = document.getElementById('product-image');
  const priceEl = document.getElementById('product-price');
  const locationEl = document.getElementById('location-info');
  const sizeListEl = document.getElementById('size-list');

  // Xóa dữ liệu cũ
  sizeListEl.innerHTML = '';

  if (productResults.length > 0) {
      // Cập nhật hình ảnh và giá từ sản phẩm đầu tiên tìm thấy
      imageEl.src = productResults[0].imageUrl || 'comap_logo.jpg';
      priceEl.textContent = `${productResults[0].price.toLocaleString('vi-VN')} đ`;

      // ✅ BẮT ĐẦU THAY ĐỔI: Lọc ra các size có tồn kho > 0
      const availableSizes = productResults.filter(item => item.stock > 0);

      if (availableSizes.length > 0) {
          // Nếu có size còn hàng, hiển thị chúng
          availableSizes.forEach(item => {
              const li = document.createElement('li');
              li.innerHTML = `
              <span class="size-info"><strong>${item.size}</strong></span>
              <span class="stock-info">  -  <strong>${item.stock}</strong></span>
          `;
              sizeListEl.appendChild(li);
          });
      } else {
          // Nếu tất cả các size đều đã hết hàng
          const li = document.createElement('li');
          li.textContent = 'Sản phẩm này đã hết hàng';
          sizeListEl.appendChild(li);
      }
      // ✅ KẾT THÚC THAY ĐỔI

  } else {
      // Nếu không tìm thấy sản phẩm
      imageEl.src = 'comap_logo.jpg';
      priceEl.textContent = 'Không có giá';
      const li = document.createElement('li');
      li.textContent = `Không tìm thấy sản phẩm ${productCode}`;
      sizeListEl.appendChild(li);
  }

  // Hiển thị thông tin vị trí (giữ nguyên)
  if (locationResults.length > 0) {
      locationEl.textContent = locationResults.map(l => `${l.key} - ${l.value}`).join('; ');
  } else {
      locationEl.textContent = 'Không có vị trí';
  }
}

// Hàm quay về trang chủ
function goBack() {
    document.getElementById('result-page').style.display = 'none';
    document.getElementById('welcome-page').style.display = 'block';
    const welcomeInput = document.getElementById('welcomeProductCode');
    welcomeInput.value = '';
    welcomeInput.focus();
}

// Hàm tự động cập nhật lại kết quả đang xem
function refreshCurrentSearch() {
    const resultPageVisible = document.getElementById("result-page").style.display === "block";
    if (resultPageVisible) {
        console.log("[Main] Dữ liệu nền đã thay đổi, tự động làm mới kết quả...");
        searchProduct();
    }
}

// --- PHẦN 3: KHỞI TẠO VÀ VÒNG LẶP CẬP NHẬT ---

function periodicUpdate() {
    const productUrl = "https://productdata19971998.s3.ap-southeast-1.amazonaws.com/processed_new.txt";
    const locationUrl = "https://productdata19971998.s3.ap-southeast-1.amazonaws.com/ma_chatlieu2.txt";
    
    console.log('--- Bắt đầu chu kỳ kiểm tra cập nhật ---');
    fetchDataWithCacheCheck(productUrl, 'product', 'product');
    fetchDataWithCacheCheck(locationUrl, 'location', 'location');
}

// Gán sự kiện và bắt đầu vòng lặp khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('backButton').addEventListener('click', goBack);
    
    periodicUpdate();
    setInterval(periodicUpdate, 120000); // 2 phút
});
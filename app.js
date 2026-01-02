// --- PHẦN 1: GIỮ NGUYÊN HOÀN TOÀN PHẦN WORKER VÀ LOCATION ---

let productData = []; // Vẫn khai báo để không lỗi, nhưng KHÔNG DÙNG
let locationData = [];

console.log('[Main] Khởi tạo Data Parser Worker...');
const dataParser = new Worker('data_parser.js');

dataParser.onmessage = function(event) {
    try {
        const { type, payload } = event.data;
        console.log(`✅ [Main] Đã nhận dữ liệu ${type} đã xử lý từ Worker.`);

        if (type === 'product') {
            productData = Array.isArray(payload) ? payload : []; // Vẫn nhận, nhưng không dùng
        } else if (type === 'location') {
            locationData = Array.isArray(payload) ? payload : [];
            console.log(`✅ [Main] Đã cập nhật locationData với ${locationData.length} items`);
        }
        
        // Chỉ refresh nếu DOM đã sẵn sàng
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            refreshCurrentSearch();
        }
    } catch (err) {
        console.error('[Main] Lỗi khi xử lý message từ Worker:', err);
    }
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
const WEBHOOK_TIMEOUT = 10000; // 10 giây

// Hàm gọi webhook với timeout và retry
async function callWebhook(productCode, retries = 2) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT);

  try {
    console.log(`🔗 [Webhook] Đang gọi webhook...`);
    console.log(`   URL: ${WEBHOOK_URL}`);
    console.log(`   Mã sản phẩm: ${productCode}`);
    console.log(`   Body:`, JSON.stringify({ productCode }));
    
    const requestBody = { productCode };
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log(`📥 [Webhook] Response status: ${res.status} ${res.statusText}`);
    console.log(`📥 [Webhook] Response headers:`, Object.fromEntries(res.headers.entries()));

    if (!res.ok) {
      let errorText = '';
      try {
        errorText = await res.text();
        console.error(`❌ [Webhook] HTTP Error ${res.status}:`, errorText);
      } catch (e) {
        errorText = res.statusText;
        console.error(`❌ [Webhook] HTTP Error ${res.status}:`, errorText);
      }
      throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
    }

    // Kiểm tra content type trước khi parse JSON
    const contentType = res.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      try {
        const text = await res.text();
        console.log(`📦 [Webhook] Response text:`, text);
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error(`❌ [Webhook] Lỗi parse JSON:`, parseErr);
        throw new Error('Server trả về dữ liệu không hợp lệ (không phải JSON)');
      }
    } else {
      const text = await res.text();
      console.warn(`⚠️ [Webhook] Response không phải JSON, content-type: ${contentType}`);
      console.log(`📦 [Webhook] Response text:`, text);
      // Thử parse như JSON nếu có thể
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server trả về format không hỗ trợ: ${contentType}`);
      }
    }
    
    console.log(`✅ [Webhook] Dữ liệu đã parse:`, data);
    
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    
    if (err.name === 'AbortError') {
      console.error('[Webhook] Timeout - Không nhận được phản hồi sau 10 giây');
      throw new Error('Timeout: Webhook không phản hồi. Vui lòng thử lại.');
    }
    
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      console.error('[Webhook] Lỗi kết nối mạng:', err);
      throw new Error('Không thể kết nối đến server. Kiểm tra kết nối internet.');
    }

    if (err.message.includes('CORS')) {
      console.error('[Webhook] Lỗi CORS:', err);
      throw new Error('Lỗi CORS: Server không cho phép truy cập từ trình duyệt này.');
    }

    // Retry logic
    if (retries > 0) {
      console.log(`[Webhook] Thử lại... (còn ${retries} lần)`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Đợi 1 giây
      return callWebhook(productCode, retries - 1);
    }

    throw err;
  }
}

// Expose searchProduct globally để có thể gọi từ HTML
window.searchProduct = async function() {
  const inputEl = document.getElementById('productCode');
  if (!inputEl) {
    console.error('[Search] Không tìm thấy input element');
    return;
  }
  
  const productCode = inputEl.value.trim().toUpperCase();
  if (!productCode) {
    console.warn('[Search] Mã sản phẩm trống');
    return;
  }

  // Hiển thị loading
  showLoading(true);

  // 1. Gọi webhook để lấy product + location
  let productResults = [];
  let errorMessage = null;
  let locationText = '';
  
  try {
    const data = await callWebhook(productCode);
    console.log(`📊 [Search] Dữ liệu nhận được từ webhook:`, data);
    
    // Xử lý nhiều format response có thể có
    if (data) {
      const candidates = [];
      if (Array.isArray(data)) {
        data.forEach(entry => {
          if (entry && Array.isArray(entry.data)) {
            entry.data.forEach(item => candidates.push(item));
          } else {
            candidates.push(entry);
          }
        });
      } else if (data.data && Array.isArray(data.data)) {
        data.data.forEach(item => candidates.push(item));
      } else {
        candidates.push(data);
      }

      const sizeItems = [];
      let fallbackImage = '';
      let fallbackPrice = null;

      candidates.forEach(item => {
        if (!item) return;

        if (!locationText && (item.chatlieu || item.Chatlieu || item.location)) {
          locationText = item.chatlieu || item.Chatlieu || item.location;
        }

        fallbackImage = fallbackImage || item.imageUrl || item.image || item.image_url || '';
        if (fallbackPrice === null && (item.price || item.Price || item.priceValue)) {
          fallbackPrice = parseFloat(item.price || item.Price || item.priceValue || 0);
        }

        if (item.found === true && Array.isArray(item.sizes)) {
          productResults = item.sizes.map(size => ({
            parentCode: productCode,
            size: size.size || size.Size || size.name,
            stock: parseInt(size.stock || size.Stock || size.quantity || 0),
            imageUrl: item.imageUrl || item.image || item.image_url || fallbackImage,
            price: parseFloat(item.price || item.Price || item.priceValue || fallbackPrice || 0)
          }));
        } else if (item.size || item.Size || item.name) {
          sizeItems.push(item);
        }
      });

      if (productResults.length === 0 && sizeItems.length > 0) {
        productResults = sizeItems.map(item => ({
          parentCode: productCode,
          size: item.size || item.Size || item.name,
          stock: parseInt(item.stock || item.Stock || item.quantity || 0),
          imageUrl: item.imageUrl || item.image || item.image_url || fallbackImage,
          price: parseFloat(item.price || item.Price || item.priceValue || fallbackPrice || 0)
        }));
      }

      if (productResults.length > 0) {
        console.log(`✅ [Search] Tìm thấy ${productResults.length} size cho sản phẩm ${productCode}`);
      } else {
        console.log(`ℹ️ [Search] Webhook trả về nhưng không có dữ liệu sản phẩm hợp lệ`);
        console.log(`   Format nhận được:`, typeof data, Array.isArray(data) ? 'Array' : 'Object');
      }
    } else {
      console.log(`ℹ️ [Search] Webhook trả về null/undefined`);
    }
  } catch (err) {
    console.error('❌ [Search] Lỗi khi gọi webhook:', err);
    errorMessage = err.message || 'Không thể kết nối đến webhook';
  } finally {
    showLoading(false);
  }

  // 2. Hiển thị kết quả
  displayResults(productResults, locationText, productCode, errorMessage);

  // 4. Xoá input & focus (giữ nguyên)
  inputEl.value = '';
  inputEl.focus();
}

// Hàm hiển thị/ẩn loading indicator
function showLoading(show) {
  try {
    const priceEl = document.getElementById('product-price');
    const sizeListEl = document.getElementById('size-list');
    
    if (!priceEl || !sizeListEl) {
      console.warn('[Loading] Không tìm thấy elements để hiển thị loading');
      return;
    }
    
    if (show) {
      priceEl.textContent = 'Đang tìm kiếm...';
      sizeListEl.innerHTML = '<li style="text-align: center; color: var(--text-secondary);">Đang tải dữ liệu...</li>';
    }
  } catch (err) {
    console.error('[Loading] Lỗi khi hiển thị loading:', err);
  }
}

// --- GIỮ NGUYÊN HOÀN TOÀN HÀM displayResults() ---

function displayResults(productResults, locationText, productCode, errorMessage = null) {
  // Đảm bảo các tham số là hợp lệ
  productResults = Array.isArray(productResults) ? productResults : [];
  productCode = productCode || 'N/A';
  
  const imageEl = document.getElementById('product-image');
  const priceEl = document.getElementById('product-price');
  const locationEl = document.getElementById('location-info');
  const sizeListEl = document.getElementById('size-list');

  // Kiểm tra elements tồn tại
  if (!imageEl || !priceEl || !locationEl || !sizeListEl) {
    console.error('[DisplayResults] Một hoặc nhiều elements không tồn tại');
    return;
  }

  sizeListEl.innerHTML = '';

  // Hiển thị lỗi nếu có
  if (errorMessage) {
    imageEl.src = 'comap_logo.jpg';
    priceEl.textContent = 'Lỗi kết nối';
    priceEl.style.color = '#ef4444';
    
    const li = document.createElement('li');
    li.style.cssText = 'color: #ef4444; text-align: center; padding: 20px; background: rgba(239, 68, 68, 0.1); border: 2px solid rgba(239, 68, 68, 0.3);';
    li.innerHTML = `
      <strong>⚠️ Lỗi kết nối webhook</strong><br>
      <small style="font-size: 0.9rem; margin-top: 8px; display: block;">${errorMessage}</small>
    `;
    sizeListEl.appendChild(li);
    
    // Reset màu sau 3 giây
    setTimeout(() => {
      priceEl.style.color = '';
    }, 3000);
    
    locationEl.textContent = locationText || 'Không có vị trí';
    return;
  }

  // Reset màu giá
  priceEl.style.color = '';

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
          li.style.cssText = 'text-align: center; color: var(--text-secondary);';
          sizeListEl.appendChild(li);
      }
  } else {
      imageEl.src = 'comap_logo.jpg';
      priceEl.textContent = 'Không có giá';
      const li = document.createElement('li');
      li.textContent = `Không tìm thấy sản phẩm ${productCode}`;
      li.style.cssText = 'text-align: center; color: var(--text-secondary);';
      sizeListEl.appendChild(li);
  }

  locationEl.textContent = locationText || 'Không có vị trí';
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
    try {
        const resultPage = document.getElementById("result-page");
        if (!resultPage) return;
        
        const resultPageVisible = resultPage.style.display === "block";
        if (resultPageVisible) {
            console.log("[Main] Dữ liệu nền đã thay đổi, tự động làm mới kết quả...");
            const inputEl = document.getElementById('productCode');
            if (inputEl && inputEl.value.trim()) {
                searchProduct();
            }
        }
    } catch (err) {
        console.error('[Refresh] Lỗi khi refresh:', err);
    }
}

// --- PHẦN 3: KHỞI TẠO — CHỈ TẢI LOCATION, BỎ TẢI PRODUCT ---

function periodicUpdate() {
    console.log('--- Bắt đầu chu kỳ kiểm tra cập nhật ---');
}

// Hàm test webhook connection (có thể gọi từ console)
window.testWebhook = async function(testCode = 'TEST') {
    console.log('🧪 [Test] Bắt đầu test webhook...');
    console.log('🧪 [Test] URL:', WEBHOOK_URL);
    console.log('🧪 [Test] Mã test:', testCode);
    
    try {
        const startTime = Date.now();
        const data = await callWebhook(testCode);
        const duration = Date.now() - startTime;
        
        console.log('✅ [Test] Webhook hoạt động tốt!');
        console.log('✅ [Test] Thời gian phản hồi:', duration + 'ms');
        console.log('✅ [Test] Dữ liệu nhận được:', data);
        return { success: true, data, duration };
    } catch (err) {
        console.error('❌ [Test] Webhook lỗi:', err);
        console.error('❌ [Test] Chi tiết:', {
            message: err.message,
            name: err.name,
            stack: err.stack
        });
        return { success: false, error: err.message };
    }
};

document.addEventListener('DOMContentLoaded', () => {
    try {
        const backButton = document.getElementById('backButton');
        if (backButton) {
            backButton.addEventListener('click', goBack);
        } else {
            console.warn('[Init] Không tìm thấy backButton');
        }
        
        periodicUpdate();
        setInterval(periodicUpdate, 120000);
        
        // Log thông tin webhook khi khởi động
        console.log('🔗 [Init] Webhook URL:', WEBHOOK_URL);
        console.log('💡 [Init] Để test webhook, chạy: testWebhook("MÃ_SẢN_PHẨM") trong console');
        console.log('📦 [Init] locationData đã được khởi tạo:', Array.isArray(locationData));
    } catch (err) {
        console.error('[Init] Lỗi khi khởi tạo:', err);
    }
});

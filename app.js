let productData = [];
let locationData = [];
let dataLoaded = false;

// Load dữ liệu sản phẩm từ file
function loadProductData() {
  const s3FileUrl = "https://productdata19971998.s3.ap-southeast-1.amazonaws.com/processed_new.txt";
  return fetch(s3FileUrl)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      return response.text();
    })
    .then(data => {
      const lines = data.split('\n');
      productData = [];
      lines.forEach(line => {
        const [parentCode, size, stock, price, imageUrl] = line.split(',').map(item => item.trim());
        if (parentCode && size && stock && price) {
          productData.push({
            parentCode,
            size,
            stock: parseInt(stock, 10),
            price: parseFloat(price),
            imageUrl: imageUrl || null
          });
        }
      });
      console.log('Product data loaded:', productData);
    })
    .catch(error => {
      console.error('Error loading product data:', error);
      alert('Không thể tải dữ liệu sản phẩm. Vui lòng thử lại sau.');
    });
}

function loadLocationData() {
  const locationS3Url = "https://productdata19971998.s3.ap-southeast-1.amazonaws.com/ma_chatlieu2.txt";
  return fetch(locationS3Url)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      return response.text();
    })
    .then(data => {
      const lines = data.split('\n');
      locationData = [];
      lines.forEach(line => {
        const parts = line.split(',').map(item => item.trim());
        if (parts.length >= 3) {
          const [parentCode, shelf, row] = parts;
          if (parentCode && shelf && row) {
            locationData.push({ parentCode, shelf, row });
          }
        } else if (line.trim() !== "") {
          console.warn(`Skipping malformed line in location data: "${line}"`);
        }
      });
      console.log('Location data loaded:', locationData);
    })
    .catch(error => {
      console.error('Error loading location data:', error);
      alert('Không thể tải dữ liệu vị trí. Vui lòng thử lại sau.');
    });
}

function searchProduct() {
  if (!dataLoaded) {
    alert("Đang tải dữ liệu. Đợi 5-10s đi!");
    return;
  }

  const inputField = document.getElementById('productCode');
  const productCode = inputField.value.trim().toLowerCase();
  const locationDiv = document.getElementById('location-info');
  const sizeList = document.getElementById('size-list');
  const productImage = document.getElementById('product-image');
  const priceDiv = document.getElementById('product-price');

  fetch('https://n8n-hongnhung198198-u40833.vm.elestio.app/webhook/c4f3af18-ed7a-4233-a255-387227711ef2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productCode: productCode.toUpperCase(),
      timestamp: new Date().toISOString()
    })
  }).catch(err => console.error("Lỗi gửi mã về n8n:", err));

  sizeList.innerHTML = '';
  locationDiv.innerHTML = 'Không có vị trí';
  productImage.style.display = 'none';
  priceDiv.innerHTML = '';

  const results = productData.filter(product => product.parentCode.toLowerCase() === productCode);

  if (results.length === 0) {
    alert("Sai Mã Sản Phẩm!");
    setTimeout(() => {
      inputField.value = "";
      inputField.focus();
    }, 500);
    return;
  }

  const location = locationData.find(loc => loc.parentCode.toLowerCase() === productCode);
  if (location) {
    locationDiv.innerHTML = `<b>${location.shelf.toUpperCase()}</b><br><b>${location.row.toUpperCase()}</b>`;
  }

  if (results[0] && typeof results[0].price !== 'undefined') {
    priceDiv.innerHTML = `Giá: <b>${results[0].price.toLocaleString('vi-VN')} VND</b>`;
  }

  let hasStock = false;
  const sizeOrder = ["S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL"];
  const compareSizes = (a, b) => {
    const sizeA = a.size.toUpperCase();
    const sizeB = b.size.toUpperCase();
    const indexA = sizeOrder.indexOf(sizeA);
    const indexB = sizeOrder.indexOf(sizeB);
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  };

  const productsInStock = results.filter(product => product.stock > 0);
  productsInStock.sort(compareSizes);

  if (productsInStock.length > 0) {
    productsInStock.forEach(product => {
      sizeList.innerHTML += `<p><b>${product.stock}</b> ${product.size.toUpperCase()}</p>`;
      hasStock = true;
    });
  }

  if (!hasStock) {
    sizeList.innerHTML = '<p>Hết hàng</p>';
  }

  if (results[0] && results[0].imageUrl) {
    productImage.src = results[0].imageUrl;
    productImage.style.display = 'block';
  }

  setTimeout(() => {
    inputField.value = "";
    inputField.focus();
  }, 500);
}

// Khi trang được tải, load dữ liệu và thiết lập sự kiện
window.onload = function() {
  Promise.all([loadProductData(), loadLocationData()])
    .then(() => {
      console.log('✅ Dữ liệu đã sẵn sàng');
      dataLoaded = true;

      const productInput = document.getElementById('productCode');
      if (!productInput) {
        console.error("Không tìm thấy ô nhập liệu 'productCode'.");
        return;
      }

      let debounceTimeout = null;

      productInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
          event.preventDefault();
          searchProduct();
        }
      });

      productInput.addEventListener("input", function() {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
          if (productInput.value.trim() !== "") {
            searchProduct();
          }
        }, 500);
      });
    })
    .catch(error => {
      console.error('Lỗi khi tải dữ liệu:', error);
      alert('Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại.');
    });
};


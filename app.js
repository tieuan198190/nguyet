let productData = [];
let locationData = [];
let dataLoaded = false;

// Load dữ liệu sản phẩm
function loadProductData() {
  const s3FileUrl = "https://productdata19971998.s3.ap-southeast-1.amazonaws.com/processed_new.txt"; // Đường dẫn file sản phẩm
  const urlWithTimestamp = `${s3FileUrl}?t=${new Date().getTime()}`; // Thêm timestamp để tránh cache

  return fetch(urlWithTimestamp)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.text();
    })
    .then(data => {
      const lines = data.split('\n');
      productData = []; // Xóa dữ liệu cũ để cập nhật mới
      lines.forEach(line => {
        const [parentCode, size, stock, price, imageUrl] = line.split(',').map(item => item.trim());
        if (parentCode && size && stock && price) {
          productData.push({
            parentCode: parentCode,
            size: size,
            stock: parseInt(stock, 10),
            price: parseFloat(price), // Lưu giá cho từng sản phẩm (chung cho mọi size)
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

// Load dữ liệu vị trí
function loadLocationData() {
  const locationFileUrl = "location.txt"; // Đường dẫn file vị trí

  return fetch(locationFileUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.text();
    })
    .then(data => {
      const lines = data.split('\n');
      locationData = []; // Xóa dữ liệu cũ
      lines.forEach(line => {
        const [parentCode, shelf, row] = line.split(',').map(item => item.trim());
        if (parentCode && shelf && row) {
          locationData.push({
            parentCode: parentCode,
            shelf: shelf,
            row: row
          });
        }
      });
      console.log('Location data loaded:', locationData);
    })
    .catch(error => {
      console.error('Error loading location data:', error);
      alert('Không thể tải dữ liệu vị trí. Vui lòng thử lại sau.');
    });
}

// Tìm kiếm sản phẩm
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

  // Xóa nội dung cũ
  sizeList.innerHTML = '';
  locationDiv.innerHTML = 'Không có vị trí';
  productImage.style.display = 'none';
  priceDiv.innerHTML = '';

  // Lọc dữ liệu sản phẩm
  const results = productData.filter(product => product.parentCode.toLowerCase() === productCode);

  // Nếu không tìm thấy
  if (results.length === 0) {
    alert("Sai Mã Sản Phẩm!");
    // Sau khi cảnh báo, xóa input & focus để quét tiếp
    setTimeout(() => {
      inputField.value = "";
      inputField.focus();
    }, 500);
    return;
  }

  // Hiển thị vị trí
  const location = locationData.find(loc => loc.parentCode.toLowerCase() === productCode);
  if (location) {
    locationDiv.innerHTML = `<b>${location.shelf.toUpperCase()}</b><br><b>${location.row.toUpperCase()}</b>`;
  }

  // Hiển thị giá
  const productPrice = results[0].price;
  priceDiv.innerHTML = `Giá: <b>${productPrice.toLocaleString('vi-VN')} VND</b>`;

  // Hiển thị size & số lượng
  let hasStock = false;
  results.forEach(product => {
    if (product.stock > 0) {
      sizeList.innerHTML += `<p><b>${product.stock}</b> ${product.size}</p>`;
      hasStock = true;
    }
  });
  if (!hasStock) {
    sizeList.innerHTML = '<p>Hết hàng</p>';
  }

  // Hiển thị hình ảnh
  const imageUrl = results[0].imageUrl || null;
  if (imageUrl) {
    productImage.src = imageUrl;
    productImage.style.display = 'block';
  }

  // Xóa input & focus lại để sẵn sàng quét mã tiếp
  setTimeout(() => {
    inputField.value = "";
    inputField.focus();
  }, 500);
}

// Khi trang được tải
window.onload = function() {
  Promise.all([loadProductData(), loadLocationData()])
    .then(() => {
      console.log('Both data files have been loaded');
      dataLoaded = true;

      // 2) Tự động tìm khi quét ở Result Page
      const productInput = document.getElementById('productCode');
      let timeout = null;

      // Bắt phím Enter
      productInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          searchProduct();
        }
      });

      // Debounce 500ms khi máy quét không gửi Enter
      productInput.addEventListener("input", function() {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          if (productInput.value.trim() !== "") {
            searchProduct();
          }
        }, 500);
      });
    })
    .catch(error => {
      console.error('Error loading data:', error);
      alert('Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại.');
    });
};

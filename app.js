let productData = [];
let locationData = [];
let dataLoaded = false;

// Load dữ liệu sản phẩm từ file
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
            size: size, // Giữ nguyên size gốc từ file
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

// Load dữ liệu vị trí từ S3
function loadLocationData() {
  const locationS3Url = "https://productdata19971998.s3.ap-southeast-1.amazonaws.com/ma_chatlieu2.txt";
  const urlWithTimestamp = `${locationS3Url}?t=${new Date().getTime()}`;

  return fetch(urlWithTimestamp)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status} when fetching location data.`);
      }
      return response.text();
    })
    .then(data => {
      const lines = data.split('\n');
      locationData = [];
      lines.forEach(line => {
        const parts = line.split(',').map(item => item.trim());
        if (parts.length >= 3) {
            const parentCode = parts[0];
            const shelf = parts[1];
            const row = parts[2];

            if (parentCode && shelf && row) {
                locationData.push({
                parentCode: parentCode,
                shelf: shelf,
                row: row
                });
            }
        } else if (line.trim() !== "") {
            console.warn(`Skipping malformed line in location data: "${line}"`);
        }
      });
      console.log('Location data loaded from S3:', locationData);
    })
    .catch(error => {
      console.error('Error loading location data from S3:', error);
      alert('Không thể tải dữ liệu vị trí từ S3. Vui lòng thử lại sau.');
    });
}

// Tìm kiếm sản phẩm và hiển thị kết quả
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
  // Kích hoạt webhook
  fetch('https://n8n-hongnhung198198-u40833.vm.elestio.app/webhook/c4f3af18-ed7a-4233-a255-387227711ef2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productCode: productCode.toUpperCase(),  // Ví dụ: N123
      timestamp: new Date().toISOString()
    })
  }).catch(err => {
    console.error("Lỗi gửi mã về n8n:", err);
  });
  // Xóa nội dung cũ
  sizeList.innerHTML = '';
  locationDiv.innerHTML = 'Không có vị trí';
  productImage.style.display = 'none';
  priceDiv.innerHTML = '';

  // Lọc dữ liệu sản phẩm theo mã
  const results = productData.filter(product => product.parentCode.toLowerCase() === productCode);

  if (results.length === 0) {
    alert("Sai Mã Sản Phẩm!");
    setTimeout(() => {
      inputField.value = "";
      inputField.focus();
    }, 500);
    return;
  }

  // Hiển thị thông tin vị trí (nếu có)
  const location = locationData.find(loc => loc.parentCode.toLowerCase() === productCode);
  if (location) {
    locationDiv.innerHTML = `<b>${location.shelf.toUpperCase()}</b><br><b>${location.row.toUpperCase()}</b>`;
  }

  // Hiển thị giá chung của sản phẩm (lấy từ sản phẩm đầu tiên tìm thấy)
  if (results[0] && typeof results[0].price !== 'undefined') {
    priceDiv.innerHTML = `Giá: <b>${results[0].price.toLocaleString('vi-VN')} VND</b>`;
  }


  // --- BẮT ĐẦU PHẦN SẮP XẾP VÀ HIỂN THỊ SIZE ---
  let hasStock = false;

  // Định nghĩa thứ tự các size
  const sizeOrder = ["S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL"]; //Thêm các size khác nếu có

  // Hàm so sánh để sắp xếp
  const compareSizes = (a, b) => {
    // Chuyển size về chữ hoa để đồng nhất khi so sánh
    const sizeA = a.size.toUpperCase();
    const sizeB = b.size.toUpperCase();

    const indexA = sizeOrder.indexOf(sizeA);
    const indexB = sizeOrder.indexOf(sizeB);

    // Nếu cả hai size đều không có trong sizeOrder, giữ nguyên
    if (indexA === -1 && indexB === -1) return 0;
    // Nếu chỉ sizeA không có, đẩy sizeA xuống cuối
    if (indexA === -1) return 1;
    // Nếu chỉ sizeB không có, đẩy sizeB xuống cuối
    if (indexB === -1) return -1;

    return indexA - indexB;
  };

  // Lọc ra các sản phẩm có hàng và sau đó sắp xếp chúng
  const productsInStock = results.filter(product => product.stock > 0);
  productsInStock.sort(compareSizes);

  if (productsInStock.length > 0) {
    productsInStock.forEach(product => {
      // Hiển thị size bằng chữ hoa để đồng nhất với sizeOrder
      sizeList.innerHTML += `<p><b>${product.stock}</b> ${product.size.toUpperCase()}</p>`;
      hasStock = true; // Đánh dấu là có ít nhất một sản phẩm có hàng
    });
  }

  if (!hasStock) { // Nếu không có sản phẩm nào trong productsInStock (tức là không có size nào có hàng)
    sizeList.innerHTML = '<p>Hết hàng</p>';
  }
  // --- KẾT THÚC PHẦN SẮP XẾP VÀ HIỂN THỊ SIZE ---


  // Hiển thị hình ảnh sản phẩm nếu có (lấy từ sản phẩm đầu tiên tìm thấy)
  if (results[0] && results[0].imageUrl) {
    productImage.src = results[0].imageUrl;
    productImage.style.display = 'block';
  } else {
    productImage.style.display = 'none'; // Ẩn nếu không có ảnh
  }

  // Xóa input & focus lại để sẵn sàng quét mã mới
  setTimeout(() => {
    inputField.value = "";
    inputField.focus();
  }, 500);
}

// Khi trang được tải, load dữ liệu và thiết lập sự kiện
window.onload = function() {
  Promise.all([loadProductData(), loadLocationData()])
    .then(() => {
      console.log('Cả hai file dữ liệu đã được tải');
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

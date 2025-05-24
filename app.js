let productData = [];
let locationData = []; // Biến này sẽ được điền dữ liệu từ S3
let dataLoaded = false;

// Load dữ liệu sản phẩm từ file (Giữ nguyên hàm này của bạn)
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
            price: parseFloat(price), // Lưu giá chung cho sản phẩm
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

// Load dữ liệu vị trí từ S3 (ĐÃ SỬA ĐỔI)
function loadLocationData() {
  // Đường dẫn file vị trí mới từ S3
  const locationS3Url = "https://productdata19971998.s3.ap-southeast-1.amazonaws.com/ma_chatlieu2.txt";
  const urlWithTimestamp = `${locationS3Url}?t=${new Date().getTime()}`; // Thêm timestamp để tránh cache

  return fetch(urlWithTimestamp) // Sử dụng URL mới có timestamp
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status} when fetching location data.`);
      }
      return response.text();
    })
    .then(data => {
      const lines = data.split('\n');
      locationData = []; // Xóa dữ liệu cũ
      lines.forEach(line => {
        // Giả sử file ma_chatlieu2.txt cũng có định dạng parentCode,shelf,row
        // Nếu định dạng khác, bạn cần điều chỉnh cách parse ở đây
        const parts = line.split(',').map(item => item.trim());
        // Kiểm tra xem có đủ phần tử không, ví dụ file ma_chatlieu2.txt có thể có định dạng khác
        // Ở đây tôi vẫn giả định nó có 3 phần tử như file location.txt cũ
        if (parts.length >= 3) { // linh hoạt hơn nếu có nhiều cột hơn nhưng chỉ lấy 3 cột đầu
            const parentCode = parts[0];
            const shelf = parts[1]; // Hoặc tên cột tương ứng trong file ma_chatlieu2.txt
            const row = parts[2];   // Hoặc tên cột tương ứng

            if (parentCode && shelf && row) {
                locationData.push({
                parentCode: parentCode,
                shelf: shelf, // Đảm bảo tên thuộc tính khớp với cách bạn dùng ở searchProduct
                row: row      // Đảm bảo tên thuộc tính khớp với cách bạn dùng ở searchProduct
                });
            }
        } else if (line.trim() !== "") { // Ghi log nếu dòng không trống nhưng không đúng định dạng
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

// Tìm kiếm sản phẩm và hiển thị kết quả (Giữ nguyên hàm này của bạn)
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
  // Đảm bảo rằng thuộc tính 'shelf' và 'row' trong locationData khớp với cách bạn truy cập ở đây
  const location = locationData.find(loc => loc.parentCode.toLowerCase() === productCode);
  if (location) {
    locationDiv.innerHTML = `<b>${location.shelf.toUpperCase()}</b><br><b>${location.row.toUpperCase()}</b>`;
  }

  // Hiển thị giá chung của sản phẩm
  const productPrice = results[0].price;
  priceDiv.innerHTML = `Giá: <b>${productPrice.toLocaleString('vi-VN')} VND</b>`;

  // Hiển thị size và số lượng sản phẩm
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

  // Hiển thị hình ảnh sản phẩm nếu có
  const imageUrl = results[0].imageUrl || null;
  if (imageUrl) {
    productImage.src = imageUrl;
    productImage.style.display = 'block';
  }

  // Xóa input & focus lại để sẵn sàng quét mã mới
  setTimeout(() => {
    inputField.value = "";
    inputField.focus();
  }, 500);
}

// Khi trang được tải, load dữ liệu và thiết lập sự kiện tự động tìm kiếm ở Result Page (Giữ nguyên)
window.onload = function() {
  Promise.all([loadProductData(), loadLocationData()])
    .then(() => {
      console.log('Both data files have been loaded');
      dataLoaded = true;

      const productInput = document.getElementById('productCode');
      let debounceTimeout = null;

      // Bắt sự kiện keydown (Enter) để gọi searchProduct()
      productInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
          event.preventDefault();
          searchProduct();
        }
      });

      // Sự kiện input với debounce 500ms (nếu máy quét không gửi Enter)
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
      console.error('Error loading data:', error);
      alert('Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại.');
    });
};

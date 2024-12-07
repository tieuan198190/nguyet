let productData = [];
let locationData = [];
let dataLoaded = false;

function loadProductData() {
    return fetch('product_data.txt')
        .then(response => response.text())
        .then(data => {
            const lines = data.split('\n');
            lines.forEach(line => {
                const [parentCode, size, stock, imageUrl] = line.split(',').map(item => item.trim());
                productData.push({
                    parentCode: parentCode.trim(),
                    size: size.trim(),
                    stock: parseInt(stock, 10),
                    imageUrl: imageUrl ? imageUrl.trim() : null
                });
            });
            console.log('Product data loaded:', productData);
        })
        .catch(error => console.error('Error loading product data:', error));
}

function loadLocationData() {
    return fetch('location.txt')
        .then(response => response.text())
        .then(data => {
            const lines = data.split('\n');
            lines.forEach(line => {
                const [parentCode, shelf, row] = line.split(',').map(item => item.trim());
                locationData.push({
                    parentCode: parentCode.trim(),
                    shelf: shelf.trim(),
                    row: row.trim()
                });
            });
            console.log('Location data loaded:', locationData);
        })
        .catch(error => console.error('Error loading location data:', error));
}
function searchProduct() {
    if (!dataLoaded) {
        alert("Data is still loading. Please wait.");
        return;
    }

    const productCode = document.getElementById('productCode').value.trim().toLowerCase();

    const locationDiv = document.getElementById('location-info');
    const sizeList = document.getElementById('size-list');
    const productImage = document.getElementById('product-image');

    sizeList.innerHTML = ''; // Xóa nội dung cũ
    locationDiv.innerHTML = ''; // Xóa nội dung vị trí cũ
    productImage.style.display = 'none'; // Ẩn ảnh mặc định

    const locations = locationData.filter(loc => loc.parentCode.toLowerCase() === productCode);
    const results = productData.filter(product => product.parentCode.toLowerCase() === productCode);

    // Kiểm tra mã sản phẩm
    if (results.length === 0) {
        alert("SAI MÃ SẢN PHẨM!");
        return;
    }

    // Hiển thị thông tin vị trí
    if (locations.length > 0) {
        const location = locations[locations.length - 1];
        locationDiv.innerHTML = `${location.shelf.toUpperCase()}, ${location.row.toUpperCase()}`;
    } else {
        locationDiv.innerHTML = 'Không có vị trí';
    }

    // Hiển thị thông tin size
    let hasStock = false; // Biến kiểm tra nếu có sản phẩm còn hàng
    results.forEach(product => {
        if (product.stock > 0) { // Chỉ hiển thị size nếu stock > 0
            sizeList.innerHTML += `<p><b>${product.stock}</b> ${product.size}</p>`;
            hasStock = true; // Có ít nhất một sản phẩm còn hàng
        }
    });

    if (!hasStock) {
        sizeList.innerHTML = '<p>Hết hàng</p>'; // Hiển thị thông báo hết hàng nếu không có sản phẩm nào còn hàng
    }

    // Hiển thị hình ảnh sản phẩm
    const imageUrl = results.find(product => product.imageUrl)?.imageUrl || null;
    if (imageUrl) {
        productImage.src = imageUrl;
        productImage.style.display = 'block'; // Hiển thị ảnh
    }
}


window.onload = function() {
    Promise.all([loadProductData(), loadLocationData()])
        .then(() => {
            console.log('Both data files have been loaded');
            dataLoaded = true;
        })
        .catch(error => {
            console.error('Error loading data:', error);
            alert('There was an error loading the data files. Please try again later.');
        });
};

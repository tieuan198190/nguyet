let productData = [];
let locationData = [];
let dataLoaded = false;

// Load dữ liệu sản phẩm từ S3
function loadProductData() {
    const s3FileUrl = "https://productdata198170.s3.ap-southeast-1.amazonaws.com/processed_data.txt";
    const urlWithTimestamp = `${s3FileUrl}?t=${new Date().getTime()}`;

    return fetch(urlWithTimestamp)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.text();
        })
        .then(data => {
            const lines = data.split('\n');
            productData = [];
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
        .catch(error => {
            console.error('Error loading product data:', error);
            alert('Không thể tải dữ liệu sản phẩm. Vui lòng thử lại sau.');
        });
}

// Load dữ liệu vị trí từ file nội bộ
function loadLocationData() {
    return fetch('location.txt')
        .then(response => response.text())
        .then(data => {
            const lines = data.split('\n');
            locationData = [];
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

// Tìm kiếm sản phẩm
function searchProduct() {
    if (!dataLoaded) {
        alert("Data is still loading. Please wait.");
        return;
    }

    const productCode = document.getElementById('productCode').value.trim().toLowerCase();
    const locationDiv = document.getElementById('location-info');
    const sizeList = document.getElementById('size-list');
    const productImage = document.getElementById('product-image');

    sizeList.innerHTML = '';
    locationDiv.innerHTML = '';
    productImage.style.display = 'none';

    const locations = locationData.filter(loc => loc.parentCode.toLowerCase() === productCode);
    const results = productData.filter(product => product.parentCode.toLowerCase() === productCode);

    if (results.length === 0) {
        alert("SAI MÃ SẢN PHẨM!");
        return;
    }

    if (locations.length > 0) {
        const location = locations[locations.length - 1];
        locationDiv.innerHTML = `${location.shelf.toUpperCase()}, ${location.row.toUpperCase()}`;
    } else {
        locationDiv.innerHTML = 'Không Có Vị Trí';
    }

    results.forEach(product => {
        if (product.stock > 0) {
            const sizeItem = document.createElement('p');
            sizeItem.textContent = `${product.stock} ${product.size}`;
            sizeList.appendChild(sizeItem);
        }
    });

    const imageUrl = results.find(product => product.imageUrl)?.imageUrl || null;
    if (imageUrl) {
        productImage.src = imageUrl;
        productImage.style.display = 'block';
    }
}

// Hàm in toàn bộ danh sách size
function printAllSizes() {
    const sizeList = document.querySelectorAll('#size-list p');
    const productCode = document.getElementById('productCode').value.trim().toUpperCase();

    let content = `
        <div style="text-align: center; font-family: Arial, sans-serif;">
            <h1 style="font-size: 120px; margin-bottom: 50px;">${productCode}</h1>
    `;

    sizeList.forEach(item => {
        content += `<p style="font-size: 100px; margin: 20px 0; line-height: 1.0;">${item.textContent}</p>`;
    });

    content += `</div>`;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Print Sizes</title>
        </head>
        <body style="margin: 0; padding: 20px;">
            ${content}
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

// Chuyển từ Welcome Page sang Result Page
function goToResultPage() {
    const welcomeProductCode = document.getElementById('welcomeProductCode').value.trim();
    if (welcomeProductCode) {
        document.getElementById('productCode').value = welcomeProductCode;
        document.getElementById('welcome-page').style.display = 'none';
        document.getElementById('result-page').style.display = 'block';
        searchProduct();
    } else {
        alert("Vui lòng nhập mã sản phẩm!");
    }
}

// Khi trang được tải
window.onload = function () {
    Promise.all([loadProductData(), loadLocationData()])
        .then(() => {
            console.log('Both data files have been loaded');
            dataLoaded = true;

            // Thêm sự kiện click vào div.sizes
            const sizesDiv = document.querySelector('.sizes');
            sizesDiv.addEventListener('click', printAllSizes);
        })
        .catch(error => {
            console.error('Error loading data:', error);
            alert('There was an error loading the data files. Please try again later.');
        });
};
// File: data_parser.js
self.onmessage = function(event) {
    console.log('[Worker] Đã nhận dữ liệu, bắt đầu xử lý...');
    const { type, payload } = event.data;

    if (!payload) {
        console.log('[Worker] Không có dữ liệu để xử lý.');
        self.postMessage({ type, payload: [] });
        return;
    }

    let processedData = [];
    const lines = payload.split('\n');

    try {
        if (type === 'product') {
            lines.forEach(line => {
                if (!line) return;
                const [parentCode, size, stock, price, imageUrl] = line.split(',').map(item => item.trim());
                if (parentCode && size && stock && price) {
                    processedData.push({
                        parentCode,
                        size,
                        stock: parseInt(stock, 10),
                        price: parseFloat(price),
                        imageUrl: imageUrl || 'comap_logo.jpg'
                    });
                }
            });
        } else if (type === 'location') {
            lines.forEach(line => {
                if (!line) return;
                const [code, key, value] = line.split(',').map(item => item.trim());
                if (code && key && value) {
                    processedData.push({ code, key, value });
                }
            });
        }
        console.log(`[Worker] Xử lý xong ${processedData.length} mục cho ${type}.`);
    } catch (error) {
        console.error(`[Worker] Lỗi khi đang xử lý dữ liệu ${type}:`, error);
        processedData = [];
    }
    
    self.postMessage({ type, payload: processedData });
};
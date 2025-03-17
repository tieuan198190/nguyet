let combinedDataGlobal = []; // Biến toàn cục để lưu trữ dữ liệu đã xử lý

// Nút để xử lý và kết hợp file
document.getElementById("processFiles").addEventListener("click", async () => {
    const file1 = document.getElementById("inputFile1").files[0];
    const file2 = document.getElementById("inputFile2").files[0];

    if (!file1 || !file2) {
        alert("Please upload both files!");
        return;
    }

    // Đọc và làm sạch dữ liệu từ file 1 và file 2
    const data1 = await readExcel(file1);
    const cleanedData1 = cleanFile1(data1);

    const data2 = await readExcel(file2);
    const cleanedData2 = cleanFile2(data2);

    // Kết hợp dữ liệu từ hai file
    const combinedData = combineFiles(cleanedData1, cleanedData2);
    combinedDataGlobal = combinedData; // Lưu kết quả vào biến toàn cục
    console.log("Combined Data:", combinedData);

    // Kích hoạt nút download và chia file
    document.getElementById("downloadFile").disabled = false;
    document.getElementById("splitFiles").disabled = false;
});

// Nút để tải xuống file kết quả đã xử lý
document.getElementById("downloadFile").addEventListener("click", () => {
    if (combinedDataGlobal.length === 0) {
        alert("No data to download. Please process files first.");
        return;
    }

    // Xuất dữ liệu ra file Excel và tải xuống
    exportToExcel(combinedDataGlobal, "Combined_Data.xlsx");
});

// Nút để chia và tải xuống các file đã chia
document.getElementById("splitFiles").addEventListener("click", () => {
    if (combinedDataGlobal.length === 0) {
        alert("No data to split. Please process files first.");
        return;
    }

    const numParts = parseInt(document.getElementById("numParts").value, 10);
    if (isNaN(numParts) || numParts < 1) {
        alert("Please enter a valid number of parts.");
        return;
    }

    // Chia và tải xuống file
    splitAndDownload(combinedDataGlobal, numParts);
});

// Hàm chia dữ liệu và tải xuống
function splitAndDownload(data, numParts) {
    // Xáo trộn dữ liệu ngẫu nhiên
    const shuffledData = data.sort(() => Math.random() - 0.5);

    // Chia dữ liệu thành `numParts` phần
    const parts = [];
    const partSize = Math.ceil(shuffledData.length / numParts);
    for (let i = 0; i < numParts; i++) {
        const start = i * partSize;
        const end = start + partSize;
        const part = shuffledData.slice(start, end);

        // Sắp xếp từng phần theo "Mã" sau khi chia
        const sortedPart = part.sort((a, b) => {
            if (a["Mã"] < b["Mã"]) return -1;
            if (a["Mã"] > b["Mã"]) return 1;
            return 0;
        });

        parts.push(sortedPart);
    }

    // Tải xuống từng phần
    parts.forEach((part, index) => {
        const fileName = `Split_Part_${index + 1}.xlsx`;
        exportToExcel(part, fileName);
    });

    alert(`${numParts} files have been created and downloaded.`);
}

// Hàm xuất dữ liệu ra file Excel
function exportToExcel(data, fileName) {
    const worksheet = XLSX.utils.json_to_sheet(data); // Chuyển JSON thành sheet
    const workbook = XLSX.utils.book_new(); // Tạo workbook mới
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data"); // Thêm sheet vào workbook
    XLSX.writeFile(workbook, fileName); // Tải xuống file
}

// Hàm đọc file Excel
async function readExcel(file) {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: "array" });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 });
            resolve(json);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// Hàm làm sạch File 1
function cleanFile1(data) {
    const headers = data[2]; // Lấy tiêu đề cột từ dòng 3
    const cleanedData = data.slice(3).map(row => {
        const newRow = {};
        headers.forEach((header, index) => {
            newRow[header] = row[index] || "";
        });
        return newRow;
    });

    return cleanedData.map(row => ({
        "STT": row["STT"],
        "Mã": row["Mã"],
        "Tên": row["Tên"],
        "Điện thoại": row["Điện thoại"].replace(/\D/g, ""), // Chỉ giữ lại số
        "Ghi Chú": row["Ghi chú"]
    }));
}

// Hàm làm sạch File 2
function cleanFile2(data) {
    const headers = data[0]; // Lấy tiêu đề cột từ dòng đầu tiên
    const cleanedData = data.slice(1).map(row => {
        const newRow = {};
        headers.forEach((header, index) => {
            newRow[header] = row[index] || "";
        });
        return newRow;
    });

    const normalizedData = cleanedData.map(row => {
        row["Điện thoại"] = row["Điện thoại"].replace(/\D/g, ""); // Chỉ giữ lại số
        return row;
    });

    return Array.from(
        new Map(normalizedData.map(item => [item["Điện thoại"], item])).values()
    );
}

// Hàm kết hợp dữ liệu từ hai file
function combineFiles(file1Data, file2Data) {
    return file1Data.map(row1 => {
        let match = null;

        if (row1["Điện thoại"]) {
            // Nếu có số điện thoại, ghép bằng "Điện thoại"
            match = file2Data.find(row2 => row2["Điện thoại"] === row1["Điện thoại"]);
        }

        if (!match && row1["Tên"]) {
            // Nếu không có số điện thoại, ghép bằng "Tên"
            match = file2Data.find(row2 => row2["Tên"] === row1["Tên"]);
        }

        const noiDung = match ? match["Nội dung"] : ""; // Lấy nội dung từ File 2
        const ghiChu = row1["Ghi Chú"] || ""; // Ghi chú từ File 1

        // Xử lý cột 'Comment KH'
        let commentKH = noiDung;
        if (ghiChu && !noiDung.includes(ghiChu)) {
            commentKH = `${noiDung}\n${ghiChu}`.trim(); // Kết hợp nếu không trùng
        }

        return {
            "Tên": row1["Tên"],
            "Điện thoại": row1["Điện thoại"],
            "Mã": row1["Mã"],
            "Comment KH": commentKH
        };
    });
}
// Khi người dùng upload file 1
document.getElementById("inputFile1").addEventListener("change", function () {
    const file1Name = document.getElementById("file1Name");
    const file1Status = document.getElementById("file1Status");
    if (this.files.length > 0) {
        file1Name.textContent = this.files[0].name; // Hiển thị tên file
        file1Status.textContent = "Tải Lên Thành Công!";
        file1Status.style.color = "#28a745";
    } else {
        file1Name.textContent = "No file chosen";
        file1Status.textContent = "";
    }
});

// Khi người dùng upload file 2
document.getElementById("inputFile2").addEventListener("change", function () {
    const file2Name = document.getElementById("file2Name");
    const file2Status = document.getElementById("file2Status");
    if (this.files.length > 0) {
        file2Name.textContent = this.files[0].name; // Hiển thị tên file
        file2Status.textContent = "Tải Lên Thành Công!";
        file2Status.style.color = "#28a745";
    } else {
        file2Name.textContent = "No file chosen";
        file2Status.textContent = "";
    }
});



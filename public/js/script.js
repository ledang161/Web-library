const btnBatDau = document.getElementById("btnBatDau");

btnBatDau.addEventListener("click", function () {
    document.getElementById("danh-sach").scrollIntoView({
        behavior: "smooth"
    });
});

async function hienThiThietBi() {
    const danhSach = document.getElementById("danhSachThietBi");

    try {
        const response = await fetch("/api/equipment");

        if (!response.ok) {
            throw new Error("Không thể tải thiết bị");
        }

        const thietBi = await response.json();

        danhSach.innerHTML = "";

        thietBi.forEach(item => {
            const card = document.createElement("div");
            card.className = "card";

            const ten = document.createElement("h3");
            ten.textContent = item.name;

            const soLuong = document.createElement("p");
            soLuong.textContent = `Số lượng: ${item.quantity}`;

            const nutMuon = document.createElement("button");
            nutMuon.textContent = "Mượn thiết bị";
            nutMuon.className = "btn-muon";

            if (item.quantity <= 0 || item.status !== "available") {
                nutMuon.disabled = true;
                nutMuon.textContent = "Hết thiết bị";
            }

            nutMuon.addEventListener("click", function () {
                const formMuon = document.getElementById("form-muon");

                document.getElementById("formMuon").reset();

                document.getElementById("equipmentId").value = item.id;
                document.getElementById("tenThietBi").value = item.name;

                const soLuongMuon = document.getElementById("soLuongMuon");

                soLuongMuon.value = 1;
                soLuongMuon.max = item.quantity;

                formMuon.style.display = "block";

                formMuon.scrollIntoView({
                    behavior: "smooth"
                });
            });

            card.appendChild(ten);
            card.appendChild(soLuong);
            card.appendChild(nutMuon);

            danhSach.appendChild(card);
        });

    } catch (error) {
        danhSach.textContent = "Không thể tải danh sách thiết bị.";
        console.error(error);
    }
}

document.getElementById("dongForm").addEventListener("click", function () {
    document.getElementById("form-muon").style.display = "none";
});

document.getElementById("formMuon").addEventListener("submit", async function (event) {
    event.preventDefault();

    const form = document.getElementById("formMuon");
    const nutGui = form.querySelector('button[type="submit"]');

    const equipmentId = Number(document.getElementById("equipmentId").value);
    const ngayMuon = document.getElementById("ngayMuon").value;
    const ngayTra = document.getElementById("ngayTra").value;
    const soLuongMuon = document.getElementById("soLuongMuon");
    const ghiChu = document.getElementById("ghiChu").value;

    const soLuong = Number(soLuongMuon.value);
    const soLuongToiDa = Number(soLuongMuon.max);

    if (
        !Number.isInteger(soLuong) ||
        soLuong < 1 ||
        soLuong > soLuongToiDa
    ) {
        alert("Số lượng mượn không hợp lệ!");
        return;
    }

    if (!ngayMuon || !ngayTra) {
        alert("Vui lòng chọn ngày mượn và ngày trả!");
        return;
    }

    const homNay = new Date();
    const ngayHienTai =
        homNay.getFullYear() + "-" +
        String(homNay.getMonth() + 1).padStart(2, "0") + "-" +
        String(homNay.getDate()).padStart(2, "0");

    if (ngayMuon < ngayHienTai) {
        alert("Ngày mượn không được trước ngày hiện tại!");
        return;
    }

    if (ngayTra < ngayMuon) {
        alert("Ngày trả không được trước ngày mượn!");
        return;
    }

    const duLieuMuon = {
        equipmentId: equipmentId,
        quantity: soLuong,
        borrowDate: ngayMuon,
        returnDate: ngayTra,
        note: ghiChu
    };

    nutGui.disabled = true;
    nutGui.textContent = "Đang gửi yêu cầu...";

    try {
        const response = await fetch("/api/borrow", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(duLieuMuon)
        });

        const ketQua = await response.json();

        if (!response.ok) {
            alert(ketQua.message || "Không thể gửi yêu cầu mượn!");
            return;
        }

        alert(
            "Gửi yêu cầu mượn thành công!\n" +
            "Mã yêu cầu: " + ketQua.requestId + "\n" +
            "Trạng thái: Chờ duyệt"
        );

        form.reset();

        document.getElementById("form-muon").style.display = "none";

    } catch (error) {
        console.error(error);
        alert("Không thể kết nối đến máy chủ!");
    } finally {
        nutGui.disabled = false;
        nutGui.textContent = "Gửi yêu cầu mượn";
    }
});

hienThiThietBi();

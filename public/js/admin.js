
async function xuLyYeuCau(requestId, status) {
    const hanhDong = {
        approved: "duyệt",
        rejected: "từ chối",
        borrowed: "bàn giao thiết bị cho",
        returned: "xác nhận trả thiết bị của"
    };

    if (!hanhDong[status]) {
        return;
    }

    if (!confirm(
        `Bạn có chắc muốn ${hanhDong[status]} yêu cầu #${requestId}?`
    )) {
        return;
    }

    try {
        const response = await fetch(
            `/api/borrow-requests/${requestId}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ status })
            }
        );

        const ketQua = await response.json();

        if (!response.ok) {
            alert(ketQua.message || "Không thể xử lý yêu cầu!");
            return;
        }

        alert(ketQua.message);
        await hienThiYeuCau();

    } catch (error) {
        console.error(error);
        alert("Không thể kết nối đến máy chủ!");
    }
}

function dinhDangNgay(ngay) {
    if (!ngay) return "";

    const date = new Date(ngay);

    return Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleDateString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh"
        });
}


function capNhatThongKe(danhSach) {
    const tongYeuCau = danhSach.length;

    const choDuyet = danhSach.filter(
        item => item.status === "pending"
    ).length;

    const daDuyet = danhSach.filter(
        item => item.status === "approved"
    ).length;

    const tuChoi = danhSach.filter(
        item => item.status === "rejected"
    ).length;

    const dangMuon = danhSach.filter(
        item => item.status === "borrowed"
    ).length;

    const daTra = danhSach.filter(
        item => item.status === "returned"
    ).length;

    document.getElementById("tongYeuCau").textContent = tongYeuCau;
    document.getElementById("choDuyet").textContent = choDuyet;
    document.getElementById("daDuyet").textContent = daDuyet;
    document.getElementById("tuChoi").textContent = tuChoi;
    document.getElementById("dangMuon").textContent = dangMuon;
    document.getElementById("daTra").textContent = daTra;
}


function taoNut(text, className, requestId, status) {
    const nut = document.createElement("button");

    nut.textContent = text;
    nut.type = "button";
    nut.className = className;

    nut.addEventListener("click", () => {
        xuLyYeuCau(requestId, status);
    });

    return nut;
}

async function hienThiYeuCau() {
    const danhSach = document.getElementById("danhSachYeuCau");
    const nutLamMoi = document.getElementById("lamMoiDanhSach");

    nutLamMoi.disabled = true;
    nutLamMoi.textContent = "Đang tải...";

    try {
        const response = await fetch("/api/borrow-requests", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("Không thể tải danh sách yêu cầu");
        }

        const yeuCau = await response.json();

        capNhatThongKe(yeuCau);
        danhSach.innerHTML = "";

        if (yeuCau.length === 0) {
            const hang = document.createElement("tr");
            const o = document.createElement("td");

            o.colSpan = 8;
            o.textContent = "Chưa có yêu cầu mượn nào.";

            hang.appendChild(o);
            danhSach.appendChild(hang);
            return;
        }

        const trangThai = {
            pending: "Chờ duyệt",
            approved: "Đã duyệt",
            rejected: "Từ chối",
            borrowed: "Đang mượn",
            returned: "Đã trả",
            cancelled: "Đã hủy"
        };

        const cacTrangThai = Object.keys(trangThai);

        yeuCau.forEach(item => {
            const hang = document.createElement("tr");

            const giaTri = [
                item.request_id,
                item.student_name,
                item.equipment_name,
                item.quantity,
                dinhDangNgay(item.borrow_date),
                dinhDangNgay(item.return_date),
                trangThai[item.status] || item.status
            ];

            giaTri.forEach((value, index) => {
                const o = document.createElement("td");

                if (index === 6) {
                    const nhan = document.createElement("span");

                    nhan.textContent = value;
                    nhan.className = "status-badge";

                    if (cacTrangThai.includes(item.status)) {
                        nhan.classList.add(`status-${item.status}`);
                    }

                    o.appendChild(nhan);
                } else {
                    o.textContent = value;
                }

                hang.appendChild(o);
            });

            const oThaoTac = document.createElement("td");
            oThaoTac.className = "admin-actions";

            if (item.status === "pending") {
                oThaoTac.appendChild(
                    taoNut(
                        "Duyệt",
                        "btn-approve",
                        item.request_id,
                        "approved"
                    )
                );

                oThaoTac.appendChild(
                    taoNut(
                        "Từ chối",
                        "btn-reject",
                        item.request_id,
                        "rejected"
                    )
                );

            } else if (item.status === "approved") {
                oThaoTac.appendChild(
                    taoNut(
                        "Bàn giao",
                        "btn-handover",
                        item.request_id,
                        "borrowed"
                    )
                );

            } else if (item.status === "borrowed") {
                oThaoTac.appendChild(
                    taoNut(
                        "Xác nhận trả",
                        "btn-return",
                        item.request_id,
                        "returned"
                    )
                );

            } else if (item.status === "returned") {
                oThaoTac.textContent = "Đã hoàn thành";

            } else {
                oThaoTac.textContent = "Đã xử lý";
            }

            hang.appendChild(oThaoTac);
            danhSach.appendChild(hang);
        });

    } catch (error) {
        console.error(error);
        danhSach.innerHTML = "";

        const hang = document.createElement("tr");
        const o = document.createElement("td");

        o.colSpan = 8;
        o.textContent = "Không thể tải danh sách yêu cầu.";

        hang.appendChild(o);
        danhSach.appendChild(hang);

    } finally {
        nutLamMoi.disabled = false;
        nutLamMoi.textContent = "Làm mới";
    }
}

document.getElementById("lamMoiDanhSach").addEventListener(
    "click",
    hienThiYeuCau
);

hienThiYeuCau();

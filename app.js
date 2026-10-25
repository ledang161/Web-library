
const express = require("express");
const path = require("path");
const db = require("./database");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "index.html"));
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "admin.html"));
});

// Lấy danh sách thiết bị
app.get("/api/equipment", async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT * FROM equipment"
        );

        res.json(rows);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Không thể lấy danh sách thiết bị"
        });
    }
});

// Sinh viên gửi yêu cầu mượn
app.post("/api/borrow", async (req, res) => {
    const {
        equipmentId,
        quantity,
        borrowDate,
        returnDate,
        note
    } = req.body || {};

    const soLuong = Number(quantity);
    const idThietBi = Number(equipmentId);

    if (
        !Number.isInteger(idThietBi) ||
        idThietBi <= 0 ||
        !Number.isInteger(soLuong) ||
        soLuong <= 0 ||
        typeof borrowDate !== "string" ||
        typeof returnDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(borrowDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(returnDate) ||
        returnDate < borrowDate ||
        typeof note !== "string" ||
        note.length > 2000
    ) {
        return res.status(400).json({
            message: "Thông tin mượn thiết bị không hợp lệ"
        });
    }

    let connection;

    try {
        connection = await db.getConnection();

        const [users] = await connection.query(
            `SELECT id FROM users
             WHERE email = ? AND role = 'student'`,
            ["demo@uniborrow.local"]
        );

        if (users.length === 0) {
            return res.status(400).json({
                message: "Chưa có tài khoản sinh viên demo"
            });
        }

        const [equipment] = await connection.query(
            `SELECT id, quantity, status
             FROM equipment WHERE id = ?`,
            [idThietBi]
        );

        if (
            equipment.length === 0 ||
            equipment[0].status !== "available" ||
            equipment[0].quantity < soLuong
        ) {
            return res.status(400).json({
                message: "Thiết bị không có sẵn hoặc số lượng không đủ"
            });
        }

        await connection.beginTransaction();

        const [requestResult] = await connection.query(
            `INSERT INTO borrow_requests
             (user_id, borrow_date, return_date, status, note)
             VALUES (?, ?, ?, 'pending', ?)`,
            [
                users[0].id,
                borrowDate,
                returnDate,
                note
            ]
        );

        await connection.query(
            `INSERT INTO borrow_details
             (request_id, equipment_id, quantity)
             VALUES (?, ?, ?)`,
            [
                requestResult.insertId,
                idThietBi,
                soLuong
            ]
        );

        await connection.commit();

        res.status(201).json({
            message: "Gửi yêu cầu mượn thành công!",
            requestId: requestResult.insertId
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error(error);

        res.status(500).json({
            message: "Không thể lưu yêu cầu mượn"
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Lấy danh sách yêu cầu
app.get("/api/borrow-requests", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                br.id AS request_id,
                u.name AS student_name,
                u.email AS student_email,
                e.name AS equipment_name,
                bd.quantity,
                br.borrow_date,
                br.return_date,
                br.status,
                br.note
            FROM borrow_requests br
            JOIN users u ON br.user_id = u.id
            JOIN borrow_details bd
                ON br.id = bd.request_id
            JOIN equipment e
                ON bd.equipment_id = e.id
            ORDER BY br.id DESC
        `);

        res.json(rows);

    } catch (error) {
        console.error("Lỗi lấy yêu cầu:", error);

        res.status(500).json({
            message: "Không thể lấy danh sách yêu cầu mượn"
        });
    }
});

// Quản trị viên xử lý trạng thái yêu cầu
app.patch("/api/borrow-requests/:id/status", async (req, res) => {
    const requestId = Number(req.params.id);
    const { status } = req.body || {};

    const trangThaiChoPhep = [
        "approved",
        "rejected",
        "borrowed",
        "returned"
    ];

    if (
        !Number.isInteger(requestId) ||
        requestId <= 0 ||
        !trangThaiChoPhep.includes(status)
    ) {
        return res.status(400).json({
            message: "Thông tin xử lý yêu cầu không hợp lệ"
        });
    }

    const trangThaiTruoc = {
        approved: "pending",
        rejected: "pending",
        borrowed: "approved",
        returned: "borrowed"
    };

    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Khóa yêu cầu để tránh xử lý đồng thời
        const [requests] = await connection.query(
            `SELECT id, status
             FROM borrow_requests
             WHERE id = ?
             FOR UPDATE`,
            [requestId]
        );

        if (
            requests.length === 0 ||
            requests[0].status !== trangThaiTruoc[status]
        ) {
            await connection.rollback();

            return res.status(409).json({
                message: "Yêu cầu không tồn tại hoặc trạng thái không phù hợp"
            });
        }

        // Bàn giao hoặc nhận trả thiết bị
        if (status === "borrowed" || status === "returned") {
            const [details] = await connection.query(
                `SELECT equipment_id, quantity
                 FROM borrow_details
                 WHERE request_id = ?
                 ORDER BY equipment_id`,
                [requestId]
            );

            if (details.length === 0) {
                await connection.rollback();

                return res.status(400).json({
                    message: "Yêu cầu chưa có thông tin thiết bị"
                });
            }

            for (const item of details) {
                let result;

                if (status === "borrowed") {
                    [result] = await connection.query(
                        `UPDATE equipment
                         SET quantity = quantity - ?
                         WHERE id = ?
                           AND status = 'available'
                           AND quantity >= ?`,
                        [
                            item.quantity,
                            item.equipment_id,
                            item.quantity
                        ]
                    );
                } else {
                    [result] = await connection.query(
                        `UPDATE equipment
                         SET quantity = quantity + ?
                         WHERE id = ?`,
                        [
                            item.quantity,
                            item.equipment_id
                        ]
                    );
                }

                if (result.affectedRows !== 1) {
                    await connection.rollback();

                    return res.status(409).json({
                        message: status === "borrowed"
                            ? "Không đủ thiết bị trong kho để bàn giao"
                            : "Không thể cập nhật số lượng thiết bị"
                    });
                }
            }
        }

        // Cập nhật trạng thái yêu cầu
        await connection.query(
            `UPDATE borrow_requests
             SET status = ?
             WHERE id = ?`,
            [status, requestId]
        );

        await connection.commit();

        const thongBao = {
            approved: "Đã duyệt yêu cầu mượn!",
            rejected: "Đã từ chối yêu cầu mượn!",
            borrowed: "Đã bàn giao thiết bị thành công!",
            returned: "Đã xác nhận trả thiết bị thành công!"
        };

        res.json({
            message: thongBao[status],
            requestId,
            status
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error("Lỗi xử lý yêu cầu:", error);

        res.status(500).json({
            message: "Không thể cập nhật trạng thái yêu cầu"
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.listen(PORT, () => {
    console.log(`UniBorrow đang chạy tại http://localhost:${PORT}`);
});

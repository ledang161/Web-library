"use strict";
const UB = {
  session: null,
  statuses: {
    pending: "Chờ duyệt",
    approved: "Đã duyệt",
    borrowed: "Đang mượn",
    returned: "Đã trả",
    rejected: "Từ chối",
    cancelled: "Đã hủy",
  },
  el(tag, text, className) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (className) n.className = className;
    return n;
  },
  async api(url, method = "GET", data) {
    const headers = {};
    if (data !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET") headers["X-CSRF-Token"] = UB.session?.csrfToken || "";
    let r;
    let body;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      r = await fetch(url, {
        method,
        headers,
        signal: controller.signal,
        credentials: "same-origin",
        cache: "no-store",
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      try {
        body = await r.json();
      } catch (error) {
        if (error.name === "AbortError") throw error;
        body = { message: "Máy chủ trả kết quả không hợp lệ." };
        if (r.ok) throw new Error(body.message);
      }
    } catch (error) {
      throw new Error(
        error.name === "AbortError"
          ? "Máy chủ phản hồi quá lâu. Vui lòng thử lại."
          : "Không thể kết nối máy chủ. Vui lòng thử lại.",
      );
    } finally {
      clearTimeout(timeout);
    }
    if (!r.ok) {
      if (r.status === 401 && UB.session?.user) {
        UB.session.user = null;
        window.location.replace("/?session=expired");
      }
      const e = new Error(body.message || "Không thể thực hiện thao tác.");
      e.status = r.status;
      throw e;
    }
    if (body.csrfToken && UB.session) UB.session.csrfToken = body.csrfToken;
    return body;
  },
  message(text, error = false) {
    const box = document.getElementById("message");
    box.textContent = text;
    box.hidden = false;
    box.classList.toggle("error", error);
    box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  },
  async busy(button, action) {
    const text = button.textContent;
    button.disabled = true;
    button.textContent = "Đang xử lý...";
    try {
      return await action();
    } catch (e) {
      UB.message(e.message, true);
      return null;
    } finally {
      button.disabled = false;
      button.textContent = text;
    }
  },
  confirm(text) {
    return new Promise((resolve) => {
      const d = document.getElementById("confirmDialog");
      document.getElementById("confirmText").textContent = text;
      const finish = (value) => {
        d.close();
        resolve(value);
      };
      document.getElementById("confirmYes").onclick = () => finish(true);
      document.getElementById("confirmNo").onclick = () => finish(false);
      d.oncancel = (e) => {
        e.preventDefault();
        finish(false);
      };
      d.showModal();
      document.getElementById("confirmNo").focus();
    });
  },
  badge(status) {
    return UB.el(
      "span",
      UB.statuses[status] || status,
      "status-badge status-" +
        (Object.hasOwn(UB.statuses, status) ? status : "unknown"),
    );
  },
  date(value) {
    if (!value) return "";
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
  },
  requestCard(request, admin = false) {
    const card = UB.el("article", undefined, "request-card");
    card.dataset.requestId = request.id;
    const head = UB.el("div", undefined, "section-heading");
    head.append(
      UB.el("h3", `Yêu cầu #${request.id}`),
      UB.badge(request.status),
    );
    card.append(head);
    if (admin)
      card.append(
        UB.el("p", `${request.student_name} · ${request.student_email}`),
      );
    card.append(
      UB.el(
        "p",
        `Ngày mượn: ${UB.date(request.borrow_date)} · Ngày trả: ${UB.date(request.return_date)}`,
      ),
    );
    const list = UB.el("ul");
    for (const item of request.details || [])
      list.append(
        UB.el("li", `${item.equipment_name} — Số lượng: ${item.quantity}`),
      );
    card.append(list);
    card.append(UB.el("p", `Ghi chú: ${request.note || "Không có"}`, "note"));
    if (request.status === "approved")
      card.append(
        UB.el(
          "p",
          "Đã duyệt chưa giữ thiết bị; tồn kho được kiểm tra khi bàn giao.",
          "muted",
        ),
      );
    return card;
  },
  button(text, handler, className = "") {
    const b = UB.el("button", text, className);
    b.type = "button";
    b.addEventListener("click", () => UB.busy(b, () => handler(b)));
    return b;
  },
  async init() {
    UB.session = await UB.api("/api/auth/me");
    const user = UB.session.user;
    document.getElementById("currentUser").textContent = user
      ? `${user.name} · ${user.role === "admin" ? "Admin" : "Sinh viên"}`
      : "";
    const logout = document.getElementById("logout");
    logout.hidden = !user;
    logout.onclick = () =>
      UB.busy(logout, async () => {
        await UB.api("/api/auth/logout", "POST", {});
        window.location.href = "/";
      });
    return user;
  },
};

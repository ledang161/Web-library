"use strict";
let allEquipment = [];
let registering = false;
function renderEquipment() {
  const q = document
    .getElementById("searchEquipment")
    .value.trim()
    .toLocaleLowerCase("vi");
  const category = document.getElementById("categoryFilter").value;
  const status = document.getElementById("availabilityFilter").value;
  const items = allEquipment.filter(
    (x) =>
      (!q || x.name.toLocaleLowerCase("vi").includes(q)) &&
      (!category || x.category === category) &&
      (!status || x.status === status),
  );
  const root = document.getElementById("danhSachThietBi");
  root.replaceChildren();
  if (!items.length) {
    root.textContent = "Không có thiết bị phù hợp.";
    return;
  }
  for (const item of items) {
    const card = UB.el("article", undefined, "card");
    card.dataset.equipmentId = item.id;
    card.append(
      UB.el("p", item.category, "eyebrow"),
      UB.el("h3", item.name),
      UB.el("p", `Số lượng hiện có: ${item.quantity}`),
      UB.el(
        "p",
        item.status === "available" ? "Cho phép mượn" : "Ngừng cho mượn",
        "muted",
      ),
    );
    const actions = UB.el("div", undefined, "actions");
    actions.append(
      UB.button("Xem chi tiết", () => showDetail(item.id), "secondary"),
    );
    if (UB.session?.user?.role !== "admin") {
      const b = UB.button("Mượn thiết bị", () => openBorrow(item));
      b.disabled = item.quantity < 1 || item.status !== "available";
      actions.append(b);
    }
    card.append(actions);
    root.append(card);
  }
}
async function loadEquipment() {
  const root = document.getElementById("danhSachThietBi");
  root.textContent = "Đang tải thiết bị...";
  try {
    allEquipment = await UB.api("/api/equipment");
    const filter = document.getElementById("categoryFilter");
    const selected = filter.value;
    filter.replaceChildren(new Option("Tất cả loại", ""));
    for (const c of [...new Set(allEquipment.map((x) => x.category))].sort())
      filter.add(new Option(c, c));
    filter.value = selected;
    renderEquipment();
  } catch (e) {
    root.textContent = e.message;
    throw e;
  }
}
async function showDetail(id) {
  const item = await UB.api(`/api/equipment/${id}`);
  const content = document.getElementById("detailContent");
  content.replaceChildren(
    UB.el("h3", item.name),
    UB.el("p", `Loại: ${item.category}`),
    UB.el("p", `Số lượng hiện có: ${item.quantity}`),
    UB.el(
      "p",
      item.status === "available" && item.quantity > 0
        ? "Có thể gửi yêu cầu mượn"
        : "Hiện không thể mượn",
    ),
    UB.el("p", item.description || "Chưa có mô tả.", "description"),
  );
  document.getElementById("detailDialog").showModal();
}
function openBorrow(item) {
  if (!UB.session.user) {
    UB.message("Vui lòng đăng nhập trước khi mượn thiết bị.", true);
    document.getElementById("authEmail").focus();
    return;
  }
  const panel = document.getElementById("form-muon");
  document.getElementById("formMuon").reset();
  document.getElementById("equipmentId").value = item.id;
  document.getElementById("tenThietBi").value = item.name;
  const qty = document.getElementById("soLuongMuon");
  qty.value = 1;
  qty.max = item.quantity;
  document.getElementById("ngayMuon").min = UB.session.today;
  document.getElementById("ngayTra").min = UB.session.today;
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth" });
  document.getElementById("soLuongMuon").focus();
}
async function loadHistory() {
  const root = document.getElementById("historyList");
  root.textContent = "Đang tải lịch sử...";
  try {
    const requests = await UB.api("/api/my/borrow-requests");
    root.replaceChildren();
    if (!requests.length) root.textContent = "Bạn chưa có yêu cầu mượn nào.";
    for (const r of requests) {
      const card = UB.requestCard(r);
      if (r.status === "pending")
        card.append(
          UB.button(
            "Hủy yêu cầu",
            async () => {
              if (
                !(await UB.confirm(
                  `Hủy yêu cầu #${r.id}? Chỉ yêu cầu chờ duyệt có thể hủy.`,
                ))
              )
                return;
              const result = await UB.api(
                `/api/my/borrow-requests/${r.id}/cancel`,
                "PATCH",
                {},
              );
              UB.message(result.message || "Đã hủy yêu cầu.");
              await loadHistory();
            },
            "danger",
          ),
        );
      root.append(card);
    }
  } catch (e) {
    root.textContent = e.message;
    throw e;
  }
}
async function refreshUser() {
  const user = await UB.init();
  document.getElementById("tai-khoan").hidden = !!user;
  document.getElementById("adminLink").hidden = user?.role !== "admin";
  document.getElementById("historyLink").hidden = user?.role !== "student";
  document.getElementById("lich-su").hidden = user?.role !== "student";
  if (user?.role === "student") await loadHistory();
  renderEquipment();
}
document.getElementById("authSwitch").onclick = () => {
  registering = !registering;
  document.getElementById("authTitle").textContent = registering
    ? "Đăng ký sinh viên"
    : "Đăng nhập";
  document.getElementById("nameLabel").hidden = !registering;
  document.getElementById("authName").required = registering;
  document.getElementById("authPassword").minLength = registering ? 8 : 1;
  document.getElementById("authPassword").autocomplete = registering
    ? "new-password"
    : "current-password";
  document.getElementById("authSubmit").textContent = registering
    ? "Đăng ký"
    : "Đăng nhập";
  document.getElementById("authSwitch").textContent = registering
    ? "Đã có tài khoản"
    : "Tạo tài khoản";
  document.getElementById("authHint").textContent = registering
    ? "Mật khẩu từ 8 đến 128 ký tự. Tài khoản mới có vai trò sinh viên."
    : "Chưa có tài khoản? Chọn Tạo tài khoản để đăng ký sinh viên.";
};
document.getElementById("authForm").onsubmit = (e) => {
  e.preventDefault();
  UB.busy(document.getElementById("authSubmit"), async () => {
    const data = {
      email: document.getElementById("authEmail").value,
      password: document.getElementById("authPassword").value,
    };
    if (registering) data.name = document.getElementById("authName").value;
    await UB.api(
      registering ? "/api/auth/register" : "/api/auth/login",
      "POST",
      data,
    );
    document.getElementById("authForm").reset();
    await refreshUser();
    UB.message(
      registering
        ? "Đăng ký thành công. Bạn đã đăng nhập."
        : "Đăng nhập thành công.",
    );
  });
};
document.getElementById("formMuon").onsubmit = (e) => {
  e.preventDefault();
  UB.busy(e.target.querySelector("[type=submit]"), async () => {
    const start = document.getElementById("ngayMuon").value,
      end = document.getElementById("ngayTra").value;
    if (start < UB.session.today)
      throw Error("Ngày mượn không được trước ngày hiện tại tại Việt Nam.");
    if (end < start) throw Error("Ngày trả không được trước ngày mượn.");
    const result = await UB.api("/api/borrow", "POST", {
      equipmentId: Number(document.getElementById("equipmentId").value),
      quantity: Number(document.getElementById("soLuongMuon").value),
      borrowDate: start,
      returnDate: end,
      note: document.getElementById("ghiChu").value,
    });
    document.getElementById("form-muon").hidden = true;
    UB.message(
      `Gửi yêu cầu thành công! Mã yêu cầu: #${result.requestId}. Trạng thái: Chờ duyệt.`,
    );
    await loadHistory();
  });
};
document.getElementById("ngayMuon").onchange = (e) => {
  document.getElementById("ngayTra").min = e.target.value || UB.session.today;
};
document.getElementById("equipmentFilters").onsubmit = (e) => {
  e.preventDefault();
  renderEquipment();
};
document.getElementById("dongForm").onclick = () =>
  (document.getElementById("form-muon").hidden = true);
document.getElementById("closeDetail").onclick = () =>
  document.getElementById("detailDialog").close();
document.getElementById("refreshEquipment").onclick = (e) =>
  UB.busy(e.target, loadEquipment);
document.getElementById("refreshHistory").onclick = (e) =>
  UB.busy(e.target, loadHistory);
(async () => {
  try {
    await UB.init();
    await loadEquipment();
    await refreshUser();
    if (
      new URLSearchParams(window.location.search).get("session") === "expired"
    ) {
      UB.message("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", true);
      window.history.replaceState(null, "", "/");
    }
  } catch (e) {
    UB.message(e.message, true);
  } finally {
    document.getElementById("authSubmit").disabled = !UB.session;
  }
})();

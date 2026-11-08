"use strict";
let requests = [];
let equipment = [];
let editingOriginal = null;
function renderRequests() {
  const root = document.getElementById("requestList");
  const q = document
    .getElementById("requestSearch")
    .value.trim()
    .toLocaleLowerCase("vi");
  const status = document.getElementById("requestStatus").value;
  const filtered = requests.filter(
    (r) =>
      (!status || r.status === status) &&
      (!q ||
        [
          r.id,
          r.student_name,
          r.student_email,
          r.note,
          ...(r.details || []).map((d) => d.equipment_name),
        ]
          .join(" ")
          .toLocaleLowerCase("vi")
          .includes(q)),
  );
  root.replaceChildren();
  if (!filtered.length) {
    root.textContent = "Không có yêu cầu phù hợp.";
    return;
  }
  const next = {
    pending: [
      ["Duyệt", "approved"],
      ["Từ chối", "rejected"],
    ],
    approved: [["Bàn giao", "borrowed"]],
    borrowed: [["Xác nhận trả", "returned"]],
  };
  for (const r of filtered) {
    const card = UB.requestCard(r, true);
    const actions = UB.el("div", undefined, "actions");
    for (const [label, status] of next[r.status] || []) {
      actions.append(
        UB.button(
          label,
          async () => {
            if (
              !(await UB.confirm(
                `${label} yêu cầu #${r.id}?${status === "approved" ? " Duyệt không giữ kho thiết bị." : ""}`,
              ))
            )
              return;
            const result = await UB.api(
              `/api/borrow-requests/${r.id}/status`,
              "PATCH",
              { status },
            );
            UB.message(result.message || "Đã cập nhật yêu cầu.");
            await loadRequests();
            await loadEquipment();
          },
          status === "rejected" ? "danger" : "",
        ),
      );
    }
    card.append(actions);
    root.append(card);
  }
}
async function loadRequests() {
  const root = document.getElementById("requestList");
  root.textContent = "Đang tải yêu cầu...";
  try {
    const [list, stats] = await Promise.all([
      UB.api("/api/borrow-requests"),
      UB.api("/api/stats"),
    ]);
    requests = list;
    const box = document.getElementById("stats");
    box.replaceChildren();
    for (const [key, label] of [
      ["total", "Tổng yêu cầu"],
      ...Object.entries(UB.statuses),
    ]) {
      const card = UB.el("div", undefined, "stat-card");
      card.append(UB.el("h3", label), UB.el("p", String(stats[key] || 0)));
      box.append(card);
    }
    renderRequests();
  } catch (e) {
    root.textContent = e.message;
    document.getElementById("stats").textContent = "Không tải được thống kê.";
    throw e;
  }
}
function renderEquipment() {
  const root = document.getElementById("equipmentList");
  const q = document
    .getElementById("equipmentSearch")
    .value.trim()
    .toLocaleLowerCase("vi");
  const category = document.getElementById("equipmentCategory").value;
  const status = document.getElementById("equipmentStatus").value;
  const items = equipment.filter(
    (x) =>
      (!q || x.name.toLocaleLowerCase("vi").includes(q)) &&
      (!category || x.category === category) &&
      (!status || x.status === status),
  );
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
      ),
      UB.el("p", item.description || "Chưa có mô tả.", "description"),
    );
    const actions = UB.el("div", undefined, "actions");
    actions.append(
      UB.button("Sửa thiết bị", () => openEditor(item), "secondary"),
      UB.button(
        "Xóa thiết bị",
        async () => {
          if (
            !(await UB.confirm(
              `Xóa thiết bị “${item.name}”? Nếu đã có lịch sử, hệ thống sẽ ngừng cho mượn và giữ lại lịch sử.`,
            ))
          )
            return;
          const result = await UB.api(`/api/equipment/${item.id}`, "DELETE");
          UB.message(result.message || "Đã xử lý thiết bị.");
          await loadEquipment();
        },
        "danger",
      ),
    );
    card.append(actions);
    root.append(card);
  }
}
async function loadEquipment() {
  const root = document.getElementById("equipmentList");
  root.textContent = "Đang tải thiết bị...";
  try {
    equipment = await UB.api("/api/equipment");
    const filter = document.getElementById("equipmentCategory");
    const selected = filter.value;
    filter.replaceChildren(new Option("Tất cả loại", ""));
    for (const c of [...new Set(equipment.map((x) => x.category))].sort())
      filter.add(new Option(c, c));
    filter.value = selected;
    renderEquipment();
  } catch (e) {
    root.textContent = e.message;
    throw e;
  }
}
function openEditor(item) {
  editingOriginal = item
    ? { ...item, description: item.description || "" }
    : null;
  document.getElementById("reloadEquipment").hidden = !item;
  document.getElementById("equipmentForm").reset();
  document.getElementById("editId").value = item?.id || "";
  document.getElementById("editorTitle").textContent = item
    ? "Sửa thiết bị"
    : "Thêm thiết bị";
  document.getElementById("editName").value = item?.name || "";
  document.getElementById("editCategory").value = item?.category || "";
  document.getElementById("editQuantity").value = item?.quantity ?? 0;
  document.getElementById("editDescription").value = item?.description || "";
  document.getElementById("editStatus").value = item?.status || "available";
  const editor = document.getElementById("equipmentEditor");
  editor.hidden = false;
  editor.scrollIntoView({ behavior: "smooth" });
  document.getElementById("editName").focus();
}
document.getElementById("equipmentForm").onsubmit = (e) => {
  e.preventDefault();
  UB.busy(e.target.querySelector("[type=submit]"), async () => {
    const id = document.getElementById("editId").value;
    const values = {
      name: document.getElementById("editName").value.trim(),
      category: document.getElementById("editCategory").value.trim(),
      quantity: Number(document.getElementById("editQuantity").value),
      description: document.getElementById("editDescription").value,
      status: document.getElementById("editStatus").value,
    };
    const data = id
      ? Object.fromEntries(
          Object.entries(values).filter(
            ([key, value]) => value !== editingOriginal[key],
          ),
        )
      : values;
    if (id && !Object.keys(data).length) {
      UB.message("Chưa có thay đổi.");
      return;
    }
    if (id && Object.hasOwn(data, "quantity"))
      data.expectedQuantity = editingOriginal.quantity;
    let result;
    try {
      result = await UB.api(
        id ? `/api/equipment/${id}` : "/api/equipment",
        id ? "PATCH" : "POST",
        data,
      );
    } catch (error) {
      if (error.status === 409)
        error.message +=
          " Chọn Tải lại thiết bị (bỏ thay đổi) để xem tồn kho mới trước khi sửa lại.";
      throw error;
    }
    document.getElementById("equipmentEditor").hidden = true;
    UB.message(result.message || "Đã lưu thiết bị.");
    await loadEquipment();
  });
};
document.getElementById("newEquipment").onclick = () => openEditor();
document.getElementById("reloadEquipment").onclick = (e) =>
  UB.busy(e.target, async () => {
    const id = document.getElementById("editId").value;
    const item = await UB.api(`/api/equipment/${id}`);
    await loadEquipment();
    openEditor(item);
    UB.message("Đã tải lại thiết bị. Các thay đổi chưa lưu đã được bỏ.");
  });
document.getElementById("closeEditor").onclick = () =>
  (document.getElementById("equipmentEditor").hidden = true);
document.getElementById("requestFilters").onsubmit = (e) => {
  e.preventDefault();
  renderRequests();
};
document.getElementById("adminEquipmentFilters").onsubmit = (e) => {
  e.preventDefault();
  renderEquipment();
};
document.getElementById("refreshRequests").onclick = (e) =>
  UB.busy(e.target, loadRequests);
(async () => {
  try {
    const user = await UB.init();
    if (user?.role !== "admin") {
      UB.message("Bạn không có quyền truy cập trang quản trị.", true);
      window.location.replace("/");
      return;
    }
    await Promise.all([loadRequests(), loadEquipment()]);
  } catch (e) {
    UB.message(e.message, true);
  }
})();

"use strict";

// Shared DOM, formatting and UI helpers.

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

const uniq = (a) => [...new Set(a.filter(Boolean))];

const newID = () =>
  String(Date.now()) + "-" + Math.random().toString(36).slice(2, 10);

function statusTag(txt) {
  let k =
    txt === "Đã xem xét" ||
    txt === "Đã gặp" ||
    txt === "OK" ||
    txt === "Đạt"
      ? "ok"
      : txt === "LỖI" || txt === "Còn lỗi" || txt === "Cần bổ sung"
        ? "bad"
        : txt === "CHÚ Ý" ||
            txt === "Hẹn lại" ||
            txt === "Chờ khối trưởng"
          ? "warn"
          : "info";
  return `<span class="status ${k}">${esc(txt)}</span>`;
}

function stageName(s) {
  return (
    {
      draft: "Nháp",
      submitted: "Chờ khối trưởng",
      reviewed: "Chờ BGH",
      approved: "Đã xem xét",
      returned: "Cần bổ sung",
    }[s] || "Nháp"
  );
}

function toast(s) {
  let t = $("toast");
  t.textContent = s;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

function nfmt(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

function percent(n) {
  return String(n).replace(".", ",") + "%";
}

function downloadFile(blob, name) {
  let a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

function kpis(arr) {
  return (
    '<div class="kpis">' +
    arr
      .map(
        (x) =>
          `<div class="kpi"><small>${esc(x[0])}</small><strong>${esc(x[1])}</strong><span>${esc(x[2] || "")}</span></div>`,
      )
      .join("") +
    "</div>"
  );
}

function btn(label, call, variant = "") {
  return `<button type="button" class="btn ${variant}" onclick="${call}">${label}</button>`;
}

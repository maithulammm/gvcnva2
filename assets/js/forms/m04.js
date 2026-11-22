"use strict";

// M04: previous results and support plans.

function setSupportReview(value){
  if(!editable()||!['pending','none','needed'].includes(value))return;
  const m=mdata();
  if(value!=='needed'&&m.plans.length){appAlert('Đã có kế hoạch hỗ trợ trong tháng. Hãy kiểm tra các kế hoạch trước khi đổi trạng thái.');return;}
  const previous={...m.notes};m.notes.supportReview=value;
  if(!save()){m.notes=previous;return;}
  render();
}

function renderM04() {
  let c = cls(),
    m = mdata();
  const state=supportReviewState(m);
  let out = `<section class="card support-review"><h2>Rà soát hỗ trợ · ${esc(ui.month)}</h2><div class="support-review-choices" role="group" aria-label="Trạng thái rà soát hỗ trợ">${[['pending','Chưa rà soát'],['none','Không phát sinh hỗ trợ trong tháng'],['needed','Có phát sinh hỗ trợ']].map(([value,label])=>`<button type="button" class="btn ${state===value?'primary':''}" aria-pressed="${state===value}" ${editable()?'':'disabled'} onclick="setSupportReview('${value}')">${label}</button>`).join('')}</div></section>`;
  for (let [key, title, desc, columns] of [
    [
      "previous",
      "I. Kết quả hỗ trợ tháng trước",
      "Ghi biện pháp đã thực hiện và kết quả quan sát, không chép kế hoạch cũ.",
      [
        "Học sinh",
        "Biện pháp đã thực hiện",
        "Kết quả quan sát",
        "Nội dung cần tiếp tục",
      ],
    ],
    [
      "plans",
      "II. Kế hoạch hỗ trợ tháng này",
      "Mục tiêu cụ thể, biện pháp, thời hạn, phối hợp và cách đánh giá.",
      [
        "Học sinh",
        "Nhu cầu / điểm mạnh",
        "Mục tiêu cụ thể",
        "Biện pháp / hoạt động",
        "Thời hạn",
        "Người phối hợp",
        "Cách đánh giá",
        "Kết quả",
      ],
    ],
  ]) {
    let list = m[key];
    out += `<div class="section-head"><h2>${title}</h2>${editable() ? btn("＋ Thêm nội dung", `openModal('${key}')`, "primary") : ""}</div><p class="help">${desc}</p><div class="card no-pad"><div class="table-wrap"><table><thead><tr>${columns.map((h) => `<th>${h}</th>`).join("")}<th></th></tr></thead><tbody>${list.map((r) => `<tr data-compact-status="${esc(key==='previous'?'Đã ghi nhận':r.result||'Đang hỗ trợ')}"><td><b>${esc(studentName(c, r.studentId))}</b></td>${(key === "previous" ? [r.action, r.observation, r.next] : [r.need, r.goal, r.action, r.deadline, r.cooperation, r.assessment, r.result || "Chưa chốt"]).map((v) => `<td class="long">${esc(displayDateText(v || "—"))}</td>`).join("")}<td>${rowAction(key, r.id)}</td></tr>`).join("") || `<tr><td colspan="${columns.length + 1}"><div class="empty">${key==='plans'?state==='none'?'Không phát sinh hỗ trợ trong tháng.':state==='needed'?'Chưa ghi kế hoạch hỗ trợ.':'Chưa rà soát hỗ trợ trong tháng.':'Chưa ghi kết quả hỗ trợ tháng trước.'}</div></td></tr>`}</tbody></table></div></div>`;
  }
  return (
    out +
    `<div class="card marg-top"><h2>III. Xác nhận / theo dõi</h2><p class="help">Phần này được quản lý trong mục Kiểm tra & xác nhận. Chỉ ghi nhận sau khi có hành động thực tế của người phụ trách.</p>${btn("Đi tới xác nhận", "navTo('check')")}</div>`
  );
}

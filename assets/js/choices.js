"use strict";

// Button choices share the original field value, validation and change handlers.
function refreshButtonChoices(root=document) {
  if(!root.querySelectorAll)return;
  for(const select of root.querySelectorAll('select')) {
    if(select.dataset.choiceMode==='dropdown')continue;
    let host=select.buttonChoices;
    if(!host?.isConnected) {
      host=document.createElement('div');host.className='button-choices';
      select.insertAdjacentElement('afterend',host);select.buttonChoices=host;
      select.classList.add('choice-source');select.tabIndex=-1;
      select.setAttribute('aria-hidden','true');
      select.addEventListener('invalid',event=>{
        event.preventDefault();
        const group=select.buttonChoices;
        group.classList.add('choice-invalid');
        group.querySelector('.choice-error').hidden=false;
        group.querySelector('button:not(:disabled)')?.focus();
      });
    }
    host.classList.toggle('choice-row-five',select.dataset.choiceLayout==='row-five');
    host.classList.toggle('choice-months-row',select.dataset.choiceLayout==='months-row');
    const label=select.getAttribute('aria-label')||select.closest('.field')?.querySelector('label')?.textContent||
      [...(select.closest('label')?.childNodes||[])].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()||'Chọn giá trị';
    const options=[...select.options].filter(option=>!option.hidden);
    const query=host.querySelector('input')?.value||'';
    host.replaceChildren();
    if(options.length>12&&!select.disabled) {
      const search=document.createElement('input');search.type='search';
      search.className='choice-search';search.placeholder='Tìm nhanh…';
      search.setAttribute('aria-label','Tìm trong '+label);search.value=query;
      search.addEventListener('input',()=>filterButtonChoices(host,search.value));host.append(search);
    }
    const group=document.createElement('div');group.className='choice-buttons';
    group.setAttribute('role','group');group.setAttribute('aria-label',label);
    for(const option of options) {
      if(select.disabled&&!option.selected)continue;
      // Required placeholders are replaced by the field label and inline validation.
      if(!option.value&&(select.required||select.dataset.choiceLayout==='row-five'))continue;
      const button=document.createElement('button');button.type='button';
      button.textContent=option.textContent;button.dataset.value=option.value;
      button.disabled=select.disabled||option.disabled||!!option.parentElement?.disabled;
      button.setAttribute('aria-pressed',String(option.selected));
      button.addEventListener('click',()=>{
        if(select.disabled||button.disabled)return;
        select.value=option.value;
        select.dispatchEvent(new Event('input',{bubbles:true}));
        select.dispatchEvent(new Event('change',{bubbles:true}));
        if(select.isConnected) {
          refreshButtonChoices(select.parentElement);
          [...select.buttonChoices.querySelectorAll('button')].find(b=>b.dataset.value===select.value)?.focus({preventScroll:true});
        }
      });
      group.append(button);
    }
    host.append(group);
    const error=document.createElement('p');error.className='choice-error';error.hidden=true;
    error.textContent='Vui lòng chọn một giá trị.';error.setAttribute('role','alert');host.append(error);
    host.classList.toggle('choice-invalid',false);
    filterButtonChoices(host,query);
  }
}

function filterButtonChoices(host,query) {
  const text=query.trim().toLocaleLowerCase('vi');
  for(const button of host.querySelectorAll('.choice-buttons button'))
    button.hidden=!button.textContent.toLocaleLowerCase('vi').includes(text);
}

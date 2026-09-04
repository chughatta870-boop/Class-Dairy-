(() => {
  'use strict';

  const STORAGE_DRAFT = 'classDiary.draft.v1';
  const STORAGE_ENTRIES = 'classDiary.entries.v1';
  const PERIOD_COUNT = 8;
  const DAY_NAMES = ['اتوار','پیر','منگل','بدھ','جمعرات','جمعہ','ہفتہ'];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const classSelect = $('#classSelect');
  const dateInput = $('#dateInput');
  const dayChip = $('#dayChip');
  const periodsList = $('#periodsList');
  const periodTemplate = $('#periodTemplate');
  const toastEl = $('#toast');
  const exportHost = $('#exportCanvasHost');

  let editingId = null;   // id of the saved entry currently loaded for editing (null = new/draft)
  let saveTimer = null;

  // ---------- helpers ----------
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  function todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function updateDayChip() {
    if (!dateInput.value) { dayChip.textContent = '—'; return; }
    const d = new Date(dateInput.value + 'T00:00:00');
    dayChip.textContent = DAY_NAMES[d.getDay()];
  }

  function loadEntries() {
    try { return JSON.parse(localStorage.getItem(STORAGE_ENTRIES)) || []; }
    catch { return []; }
  }
  function saveEntries(list) {
    localStorage.setItem(STORAGE_ENTRIES, JSON.stringify(list));
  }

  // ---------- build period cards ----------
  function buildPeriods(data) {
    periodsList.innerHTML = '';
    for (let i = 0; i < PERIOD_COUNT; i++) {
      const node = periodTemplate.content.cloneNode(true);
      const card = node.querySelector('.period-card');
      card.dataset.index = i;
      card.querySelector('.period-badge').textContent = i + 1;
      card.querySelector('.period-title').textContent = `پیریڈ ${i + 1}`;

      const subject = card.querySelector('.subject');
      const teacher = card.querySelector('.teacher');
      const lesson = card.querySelector('.lesson');
      const homework = card.querySelector('.homework');
      const signature = card.querySelector('.signature');
      const dot = card.querySelector('.autosave-dot');

      const p = (data && data.periods && data.periods[i]) || {};
      subject.value = p.subject || '';
      teacher.value = p.teacher || '';
      lesson.value = p.lesson || '';
      homework.value = p.homework || '';
      signature.value = p.signature || '';
      // signature is considered "auto" unless the saved data shows it was manually typed
      // differently from the teacher name at time of save.
      card.dataset.sigManual = (p.signature && p.signature !== p.teacher) ? '1' : '0';

      teacher.addEventListener('input', () => {
        if (card.dataset.sigManual !== '1') signature.value = teacher.value;
        flashDot(dot);
        scheduleAutosave();
      });
      signature.addEventListener('input', () => {
        card.dataset.sigManual = (signature.value !== teacher.value) ? '1' : '0';
        scheduleAutosave();
      });
      [subject, lesson, homework].forEach(el => {
        el.addEventListener('input', () => { flashDot(dot); scheduleAutosave(); });
      });

      periodsList.appendChild(node);
    }
  }

  function flashDot(dot) {
    dot.classList.add('active');
    clearTimeout(dot._t);
    dot._t = setTimeout(() => dot.classList.remove('active'), 700);
  }

  // ---------- gather / apply form state ----------
  function gatherForm() {
    const periods = $$('.period-card').map(card => ({
      subject: card.querySelector('.subject').value.trim(),
      teacher: card.querySelector('.teacher').value.trim(),
      lesson: card.querySelector('.lesson').value.trim(),
      homework: card.querySelector('.homework').value.trim(),
      signature: card.querySelector('.signature').value.trim(),
    }));
    return {
      class: classSelect.value,
      date: dateInput.value,
      periods,
    };
  }

  function hasAnyContent(data) {
    return data.periods.some(p => p.subject || p.teacher || p.lesson || p.homework || p.signature);
  }

  // ---------- autosave draft ----------
  function scheduleAutosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const data = gatherForm();
      localStorage.setItem(STORAGE_DRAFT, JSON.stringify({ editingId, data }));
    }, 500);
  }

  function restoreDraft() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_DRAFT));
      if (raw && raw.data) {
        editingId = raw.editingId || null;
        classSelect.value = raw.data.class || classSelect.value;
        dateInput.value = raw.data.date || todayISO();
        buildPeriods(raw.data);
        return;
      }
    } catch {}
    dateInput.value = todayISO();
    buildPeriods(null);
  }

  // ---------- new / save ----------
  function clearForm(confirmIfDirty = true) {
    const data = gatherForm();
    if (confirmIfDirty && hasAnyContent(data)) {
      if (!confirm('نئی ڈائری شروع کریں؟ غیر محفوظ شدہ اندراج ضائع ہو جائے گا۔')) return;
    }
    editingId = null;
    dateInput.value = todayISO();
    updateDayChip();
    buildPeriods(null);
    localStorage.removeItem(STORAGE_DRAFT);
    toast('نئی ڈائری تیار ہے');
  }

  function saveEntry() {
    const data = gatherForm();
    if (!data.date) { toast('براہ کرم تاریخ منتخب کریں'); return; }
    if (!hasAnyContent(data)) { toast('کچھ بھی درج نہیں کیا گیا'); return; }

    const entries = loadEntries();
    const day = DAY_NAMES[new Date(data.date + 'T00:00:00').getDay()];

    if (editingId) {
      const idx = entries.findIndex(e => e.id === editingId);
      if (idx !== -1) {
        entries[idx] = { ...entries[idx], ...data, day, updatedAt: Date.now() };
      } else {
        entries.push({ id: editingId, ...data, day, createdAt: Date.now(), updatedAt: Date.now() });
      }
    } else {
      const id = 'd' + Date.now();
      editingId = id;
      entries.push({ id, ...data, day, createdAt: Date.now(), updatedAt: Date.now() });
    }
    saveEntries(entries);
    localStorage.removeItem(STORAGE_DRAFT);
    toast('ڈائری محفوظ ہو گئی');
  }

  function loadEntryIntoForm(entry) {
    editingId = entry.id;
    classSelect.value = entry.class;
    dateInput.value = entry.date;
    updateDayChip();
    buildPeriods(entry);
    localStorage.removeItem(STORAGE_DRAFT);
  }

  // ---------- history sheet ----------
  const sheet = $('#historySheet');
  const backdrop = $('#sheetBackdrop');
  const historyList = $('#historyList');
  const sheetEmpty = $('#sheetEmpty');
  const historyItemTemplate = $('#historyItemTemplate');

  function openSheet() {
    renderHistory();
    sheet.classList.add('open');
    backdrop.classList.add('show');
  }
  function closeSheet() {
    sheet.classList.remove('open');
    backdrop.classList.remove('show');
  }

  function renderHistory() {
    historyList.innerHTML = '';
    const entries = loadEntries().sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
    sheetEmpty.style.display = entries.length ? 'none' : 'block';
    entries.forEach(entry => {
      const node = historyItemTemplate.content.cloneNode(true);
      node.querySelector('.history-class').textContent = `کلاس ${entry.class}`;
      node.querySelector('.history-date').textContent = `${entry.date} · ${entry.day || ''}`;
      node.querySelector('.edit-entry').addEventListener('click', () => {
        loadEntryIntoForm(entry);
        closeSheet();
        toast('ترمیم کے لیے کھول دیا گیا');
      });
      node.querySelector('.share-entry').addEventListener('click', () => exportEntry(entry, 'share'));
      node.querySelector('.delete-entry').addEventListener('click', () => {
        if (!confirm('یہ ڈائری حذف کر دی جائے؟')) return;
        const rest = loadEntries().filter(e => e.id !== entry.id);
        saveEntries(rest);
        if (editingId === entry.id) editingId = null;
        renderHistory();
        toast('ڈائری حذف کر دی گئی');
      });
      historyList.appendChild(node);
    });
  }

  // ---------- export (download / share) ----------
  function escapeHTML(str) {
    return (str || '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }

  function buildExportMarkup(data) {
    const day = data.day || (data.date ? DAY_NAMES[new Date(data.date + 'T00:00:00').getDay()] : '');
    const rows = data.periods.map((p, i) => `
      <tr>
        <td class="ex-num">${i + 1}</td>
        <td>${escapeHTML(p.subject)}</td>
        <td>${escapeHTML(p.teacher)}</td>
        <td>${escapeHTML(p.lesson)}</td>
        <td>${escapeHTML(p.homework)}</td>
        <td class="ex-sig">${escapeHTML(p.signature)}</td>
      </tr>`).join('');

    return `
    <div class="ex-wrap" dir="rtl">
      <div class="ex-head">
        <div class="ex-title">کلاس ڈائری</div>
        <div class="ex-meta">کلاس: ${escapeHTML(data.class)} &nbsp;|&nbsp; تاریخ: ${escapeHTML(data.date)} ${day ? '(' + day + ')' : ''}</div>
      </div>
      <table class="ex-table">
        <thead><tr>
          <th>پیریڈ</th><th>مضمون</th><th>استاد</th><th>سبق</th><th>گھر کا کام</th><th>دستخط</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="ex-watermark">M Ijaz · GHS 124/NB</div>
    </div>`;
  }

  function injectExportStyles() {
    if ($('#exportStyles')) return;
    const style = document.createElement('style');
    style.id = 'exportStyles';
    style.textContent = `
      .ex-wrap{font-family:'Noto Sans Urdu',sans-serif;background:#F6EFDC;color:#20293A;padding:20px;width:480px;}
      .ex-head{text-align:center;margin-bottom:12px;}
      .ex-title{font-family:'Noto Nastaliq Urdu',serif;font-size:1.6rem;color:#54151F;}
      .ex-meta{font-size:.8rem;color:#5A5240;margin-top:2px;}
      .ex-table{width:100%;border-collapse:collapse;font-size:.68rem;table-layout:fixed;}
      .ex-table th,.ex-table td{border:1px solid #C9BFA6;padding:5px 4px;text-align:center;vertical-align:top;word-wrap:break-word;}
      .ex-table thead th{background:#7A2331;color:#E7CD8B;font-weight:700;}
      .ex-num{font-weight:700;color:#7A2331;width:26px;}
      .ex-sig{font-family:'Noto Nastaliq Urdu',serif;color:#54151F;}
      .ex-watermark{margin-top:10px;text-align:center;font-size:.6rem;letter-spacing:.4px;color:#8B8368;direction:ltr;}
    `;
    document.head.appendChild(style);
  }

  async function renderExportCanvas(data) {
    injectExportStyles();
    exportHost.innerHTML = buildExportMarkup(data);
    // allow web fonts / layout to settle
    await new Promise(r => setTimeout(r, 60));
    const canvas = await html2canvas(exportHost.firstElementChild, {
      backgroundColor: '#F6EFDC',
      scale: 2,
    });
    exportHost.innerHTML = '';
    return canvas;
  }

  function fileNameFor(data) {
    return `class-diary_${data.class}_${data.date}.png`.replace(/\s+/g, '-');
  }

  async function exportEntry(entryOrData, mode) {
    try {
      const canvas = await renderExportCanvas(entryOrData);
      const fileName = fileNameFor(entryOrData);
      canvas.toBlob(async (blob) => {
        if (!blob) { toast('ایکسپورٹ ناکام ہوا'); return; }
        if (mode === 'share' && navigator.canShare && navigator.canShare({ files: [new File([blob], fileName, { type: 'image/png' })] })) {
          try {
            await navigator.share({
              files: [new File([blob], fileName, { type: 'image/png' })],
              title: 'کلاس ڈائری',
              text: `کلاس ${entryOrData.class} — ${entryOrData.date}`,
            });
            return;
          } catch (err) {
            if (err && err.name === 'AbortError') return;
            // fall through to download if share fails
          }
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        if (mode === 'share') toast('شیئرنگ دستیاب نہیں، تصویر ڈاؤن لوڈ کر دی گئی');
        else toast('تصویر ڈاؤن لوڈ ہو گئی');
      }, 'image/png');
    } catch (err) {
      console.error(err);
      toast('کچھ غلط ہو گیا');
    }
  }

  // ---------- events ----------
  classSelect.addEventListener('change', scheduleAutosave);
  dateInput.addEventListener('change', () => { updateDayChip(); scheduleAutosave(); });

  $('#btnNew').addEventListener('click', () => clearForm(true));
  $('#btnSave').addEventListener('click', saveEntry);
  $('#btnDownload').addEventListener('click', () => {
    const data = gatherForm();
    if (!hasAnyContent(data)) { toast('کچھ بھی درج نہیں کیا گیا'); return; }
    exportEntry(data, 'download');
  });
  $('#btnShare').addEventListener('click', () => {
    const data = gatherForm();
    if (!hasAnyContent(data)) { toast('کچھ بھی درج نہیں کیا گیا'); return; }
    exportEntry(data, 'share');
  });
  $('#btnHistory').addEventListener('click', openSheet);
  $('#sheetClose').addEventListener('click', closeSheet);
  backdrop.addEventListener('click', closeSheet);

  // ---------- PWA shortcuts (?action=) ----------
  function handleAction() {
    const action = new URLSearchParams(location.search).get('action');
    if (action === 'new') clearForm(false);
    else if (action === 'history') openSheet();
  }

  // ---------- service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  // ---------- init ----------
  restoreDraft();
  updateDayChip();
  handleAction();
})();

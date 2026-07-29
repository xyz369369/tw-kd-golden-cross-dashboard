(function () {
  // State
  let matches = [];
  let newCodes = new Set();
  let sortKey = 'close';
  let sortDir = 1;
  let marketFilter = 'ALL';
  let searchTerm = '';
  let newOnly = false;

  const tbody = document.getElementById('table-body');
  const emptyState = document.getElementById('empty-state');

  function fmtNum(n) {
    if (n === null || n === undefined) return '–';
    return Number(n).toLocaleString('zh-Hant-TW');
  }

  function render() {
    let rows = matches.filter(m => {
      if (marketFilter !== 'ALL' && m.market !== marketFilter) return false;
      if (newOnly && !newCodes.has(m.code)) return false;
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        if (!m.code.toLowerCase().includes(t) && !m.name.toLowerCase().includes(t)) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'string') return av.localeCompare(bv) * sortDir;
      return (av - bv) * sortDir;
    });

    tbody.innerHTML = '';
    if (rows.length === 0) {
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
      for (const m of rows) {
        const tr = document.createElement('tr');
        if (newCodes.has(m.code)) tr.classList.add('is-new');
        tr.innerHTML = `
          <td>${m.code}</td>
          <td class="name-cell">${m.name}${newCodes.has(m.code) ? '<span class="badge-new">新</span>' : ''}</td>
          <td><span class="market-tag">${m.market === 'TWSE' ? '上市' : '上櫃'}</span></td>
          <td>${m.close.toFixed(2)}</td>
          <td>${m.ma20_close.toFixed(2)}</td>
          <td>${fmtNum(m.volume)}</td>
          <td>${fmtNum(m.ma20_volume)}</td>
          <td class="kd-cross">${m.K.toFixed(1)}</td>
          <td>${m.D.toFixed(1)}</td>
        `;
        tbody.appendChild(tr);
      }
    }
  }

  document.querySelectorAll('#stocks-table thead th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (sortKey === key) { sortDir *= -1; } else { sortKey = key; sortDir = 1; }
      document.querySelectorAll('#stocks-table thead th .arrow').forEach(a => a.textContent = '');
      th.querySelector('.arrow').textContent = sortDir === 1 ? '▲' : '▼';
      render();
    });
  });

  document.getElementById('search-input').addEventListener('input', (e) => {
    searchTerm = e.target.value.trim();
    render();
  });

  document.getElementById('new-only-toggle').addEventListener('change', (e) => {
    newOnly = e.target.checked;
    render();
  });

  document.querySelectorAll('#market-filter .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#market-filter .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      marketFilter = btn.dataset.market;
      render();
    });
  });

  function renderHistory(history) {
    const container = document.getElementById('history-bars');
    container.innerHTML = '';
    const recent = history.slice(-14);
    const max = Math.max(1, ...recent.map(h => h.match_count));
    for (const h of recent) {
      const col = document.createElement('div');
      col.className = 'bar-col';
      const pct = Math.max(4, (h.match_count / max) * 100);
      col.innerHTML = `
        <div class="bar-value">${h.match_count}</div>
        <div class="bar" style="height:${pct}%"></div>
        <div class="bar-date">${h.date.slice(5)}</div>
      `;
      container.appendChild(col);
    }
  }

  Promise.all([
    fetch('data.json').then(r => r.json()),
    fetch('history.json').then(r => r.json()).catch(() => [])
  ]).then(([data, history]) => {
    matches = data.matches || [];
    newCodes = new Set(data.new_matches_today || []);
    document.getElementById('kpi-match-count').textContent = data.match_count ?? matches.length;
    document.getElementById('kpi-new-count').textContent = (data.new_matches_today || []).length;
    document.getElementById('kpi-data-date').textContent = data.data_date || '–';
    const updated = data.generated_at ? new Date(data.generated_at) : null;
    document.getElementById('kpi-updated-at').textContent = updated
      ? updated.toLocaleString('zh-Hant-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '–';
    document.getElementById('status-text').textContent = '資料已更新';
    if (Array.isArray(history) && history.length) renderHistory(history);
    render();
  }).catch(err => {
    document.getElementById('status-text').textContent = '資料載入失敗';
    emptyState.textContent = '資料載入失敗，請稍後重新整理。';
    emptyState.style.display = 'block';
    console.error(err);
  });
})();

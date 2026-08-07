(function () {
  if (location.protocol === 'file:') {
    document.getElementById('status-text').textContent = '請使用 HTTP 伺服器開啟';
    document.getElementById('empty-state').textContent =
      '無法載入資料：請在 docs 資料夾執行「python -m http.server 8765」，再開啟 http://localhost:8765/';
    document.getElementById('empty-state').style.display = 'block';
    return;
  }

  // State
  let matches = [];
  let newCodes = new Set();
  let sortKey = 'close';
  let sortDir = 1;
  let marketFilter = 'ALL';
  let searchTerm = '';
  let newOnly = false;
  let watchlist = JSON.parse(localStorage.getItem('watchlist') || '[]');

  const tbody = document.getElementById('table-body');
  const emptyState = document.getElementById('empty-state');

  function fmtNum(n) {
    if (n === null || n === undefined) return '–';
    return Number(n).toLocaleString('zh-Hant-TW');
  }

  function fmtNet(shares) {
    if (shares === null || shares === undefined) return '–';
    const lots = Math.round(shares / 1000);
    if (lots === 0) return '0';
    if (lots > 0) return `<span class="val-up">+${lots.toLocaleString('zh-Hant-TW')}</span>`;
    return `<span class="val-down">${lots.toLocaleString('zh-Hant-TW')}</span>`;
  }

  function toggleWatchlist(code, name) {
    const idx = watchlist.indexOf(code);
    if (idx > -1) {
      watchlist.splice(idx, 1);
    } else {
      watchlist.push(code);
    }
    localStorage.setItem('watchlist', JSON.stringify(watchlist));
    render();
  }

  function isInWatchlist(code) {
    return watchlist.includes(code);
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
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === 'total_net') {
        av = (a.foreign_net || 0) + (a.trust_net || 0) + (a.dealer_net || 0);
        bv = (b.foreign_net || 0) + (b.trust_net || 0) + (b.dealer_net || 0);
      }
      if (av === null || av === undefined) av = -Infinity;
      if (bv === null || bv === undefined) bv = -Infinity;
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
        const fNet = m.foreign_net ?? 0;
        const tNet = m.trust_net ?? 0;
        const dNet = m.dealer_net ?? 0;
        const totalNet = fNet + tNet + dNet;
        tr.innerHTML = `
          <td><a class="stock-link" href="stock.html?code=${m.code}">${m.code}</a></td>
          <td class="name-cell"><a class="stock-link" href="stock.html?code=${m.code}">${m.name}</a>${newCodes.has(m.code) ? '<span class="badge-new">新</span>' : ''}</td>
          <td><button class="watchlist-btn" data-code="${m.code}" data-name="${m.name}" title="${isInWatchlist(m.code) ? '從自選清單移除' : '加入自選清單'}">${isInWatchlist(m.code) ? '−' : '+'}</button></td>
          <td><span class="market-tag">${m.market === 'TWSE' ? '上市' : '上櫃'}</span></td>
          <td>${m.close.toFixed(2)}</td>
          <td>${m.ma20_close.toFixed(2)}</td>
          <td>${fmtNum(Math.round(m.volume / 1000))}</td>
          <td>${fmtNum(Math.round(m.ma20_volume / 1000))}</td>
          <td>${m.turnover_rate != null ? m.turnover_rate.toFixed(2) + '%' : '–'}</td>
          <td>${fmtNet(fNet)}</td>
          <td>${fmtNet(tNet)}</td>
          <td>${fmtNet(dNet)}</td>
          <td>${fmtNet(totalNet)}</td>
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

  // Watchlist button event delegation
  tbody.addEventListener('click', (e) => {
    if (e.target.classList.contains('watchlist-btn')) {
      const code = e.target.dataset.code;
      const name = e.target.dataset.name;
      toggleWatchlist(code, name);
    }
  });

  // Manual refresh functionality
  const refreshBtn = document.getElementById('manual-refresh-btn');
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin" aria-hidden="true">
        <path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/>
      </svg>
      更新中...
    `;
    document.getElementById('status-text').textContent = '資料更新中…';

    try {
      const [data, history] = await Promise.all([
        fetch('data.json?v=' + Date.now()).then(r => r.json()),
        fetch('history.json?v=' + Date.now()).then(r => r.json()).catch(() => [])
      ]);
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
    } catch (err) {
      document.getElementById('status-text').textContent = '資料更新失敗';
      console.error(err);
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        手動更新
      `;
    }
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

(function () {
  // State
  let watchlist = JSON.parse(localStorage.getItem('watchlist') || '[]');
  let allStocks = {};
  let stockList = [];
  let sortKey = 'close';
  let sortDir = 1;
  let marketFilter = 'ALL';
  let searchTerm = '';
  let addStockInput = document.getElementById('add-stock-input');
  let addStockSuggestions = document.getElementById('add-stock-suggestions');

  const tbody = document.getElementById('table-body');
  const emptyState = document.getElementById('empty-state');

  function fmtNum(n) {
    if (n === null || n === undefined) return '–';
    return Number(n).toLocaleString('zh-Hant-TW');
  }

  function toFixed(num, decimals) {
    if (num === null || num === undefined) return '–';
    const n = Number(num);
    if (isNaN(n)) return '–';
    return n.toFixed(decimals);
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
    updateKPI();
  }

  function isInWatchlist(code) {
    return watchlist.includes(code);
  }

  function render() {
    let rows = watchlist.map(code => {
      const stockData = allStocks[code];
      if (!stockData || !stockData.dates || !stockData.dates.length) return null;
      const n = stockData.dates.length - 1;
      return {
        code: code,
        name: stockData.name,
        market: stockData.market,
        close: stockData.close[n],
        ma20_close: stockData.ma20_close[n],
        volume: stockData.volume[n],
        ma20_volume: stockData.ma20_volume[n],
        turnover_rate: stockData.turnover_rate ? stockData.turnover_rate[n] : null,
        foreign_net: stockData.foreign_net ? stockData.foreign_net[n] : 0,
        trust_net: stockData.trust_net ? stockData.trust_net[n] : 0,
        dealer_net: stockData.dealer_net ? stockData.dealer_net[n] : 0,
        K: stockData.K[n],
        D: stockData.D[n]
      };
    }).filter(s => s !== null);
    
    rows = rows.filter(m => {
      if (marketFilter !== 'ALL' && m.market !== marketFilter) return false;
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
        const fNet = m.foreign_net ?? 0;
        const tNet = m.trust_net ?? 0;
        const dNet = m.dealer_net ?? 0;
        const totalNet = fNet + tNet + dNet;
        tr.innerHTML = `
          <td><a class="stock-link" href="stock.html?code=${m.code}">${m.code}</a></td>
          <td class="name-cell"><a class="stock-link" href="stock.html?code=${m.code}">${m.name}</a></td>
          <td><button class="watchlist-btn" data-code="${m.code}" data-name="${m.name}" title="從自選清單移除">−</button></td>
          <td><span class="market-tag">${m.market === 'TWSE' ? '上市' : '上櫃'}</span></td>
          <td>${toFixed(m.close, 2)}</td>
          <td>${toFixed(m.ma20_close, 2)}</td>
          <td>${fmtNum(Math.round(m.volume / 1000))}</td>
          <td>${fmtNum(Math.round(m.ma20_volume / 1000))}</td>
          <td>${m.turnover_rate != null ? toFixed(m.turnover_rate, 2) + '%' : '–'}</td>
          <td>${fmtNet(fNet)}</td>
          <td>${fmtNet(tNet)}</td>
          <td>${fmtNet(dNet)}</td>
          <td>${fmtNet(totalNet)}</td>
          <td class="kd-cross">${toFixed(m.K, 1)}</td>
          <td>${toFixed(m.D, 1)}</td>
        `;
        tbody.appendChild(tr);
      }
    }
  }

  function renderAddStockSuggestions(query) {
    if (!query || query.length < 1) {
      addStockSuggestions.innerHTML = '';
      addStockSuggestions.classList.remove('open');
      return;
    }
    
    const q = query.toLowerCase();
    const matches = stockList.filter(s => 
      s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    ).slice(0, 10);
    
    if (matches.length === 0) {
      addStockSuggestions.innerHTML = '';
      addStockSuggestions.classList.remove('open');
      return;
    }
    
    addStockSuggestions.innerHTML = matches.map(s => {
      const inWatchlist = isInWatchlist(s.code);
      return `
        <div class="suggestion-item" data-code="${s.code}" data-name="${s.name}">
          <span class="suggestion-code">${s.code}</span>
          <span class="suggestion-name">${s.name}</span>
          <span class="suggestion-market">${s.market === 'TWSE' ? '上市' : '上櫃'}</span>
          <button class="suggestion-add-btn" ${inWatchlist ? 'disabled' : ''}>${inWatchlist ? '已加入' : '+'}</button>
        </div>
      `;
    }).join('');
    addStockSuggestions.classList.add('open');
  }

  function updateKPI() {
    document.getElementById('kpi-watchlist-count').textContent = watchlist.length;
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

  // Add stock input event listeners
  addStockInput.addEventListener('input', (e) => {
    renderAddStockSuggestions(e.target.value.trim());
  });

  addStockInput.addEventListener('focus', () => {
    if (addStockInput.value.trim()) {
      renderAddStockSuggestions(addStockInput.value.trim());
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.add-stock-wrap')) {
      addStockSuggestions.innerHTML = '';
      addStockSuggestions.classList.remove('open');
    }
  });

  addStockSuggestions.addEventListener('click', (e) => {
    const item = e.target.closest('.suggestion-item');
    const btn = e.target.closest('.suggestion-add-btn');
    if (item && btn && !btn.disabled) {
      const code = item.dataset.code;
      const name = item.dataset.name;
      toggleWatchlist(code, name);
      addStockInput.value = '';
      addStockSuggestions.innerHTML = '';
      addStockSuggestions.classList.remove('open');
    }
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

  // Load data
  Promise.all([
    fetch('stocks_history.json?v=stock-v4').then(r => {
      if (!r.ok) throw new Error('stocks_history.json fetch failed: ' + r.status);
      return r.json();
    }),
    fetch('data.json').then(r => {
      if (!r.ok) throw new Error('data.json fetch failed: ' + r.status);
      return r.json();
    }).catch(() => ({ matches: [], data_date: '', generated_at: '' }))
  ]).then(([historyData, radarData]) => {
    allStocks = historyData.stocks || {};
    stockList = historyData.list || [];
    
    // Get data date from radar data
    if (radarData.data_date) {
      document.getElementById('kpi-data-date').textContent = radarData.data_date;
    }
    
    const updated = radarData.generated_at ? new Date(radarData.generated_at) : null;
    document.getElementById('kpi-updated-at').textContent = updated
      ? updated.toLocaleString('zh-Hant-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '–';
    
    document.getElementById('status-text').textContent = '資料已更新';
    updateKPI();
    render();
  }).catch(err => {
    console.error('Watchlist data load error:', err);
    document.getElementById('status-text').textContent = '資料載入失敗';
    emptyState.textContent = '資料載入失敗: ' + err.message + '，請稍後重新整理。';
    emptyState.style.display = 'block';
  });
})();

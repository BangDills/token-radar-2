// app.js - Token Radar Client Logic
(function () {
  'use strict';

  const data = window.RADAR || {
    as_of: '2026-11-14',
    source: 'DefiLlama',
    floor_usd: 50000000,
    board: [],
    live: [],
    watchlist_count: 40,
  };

  // State
  let currentTab = 'pre-token'; // 'pre-token', 'watchlist', 'live', 'model'
  let searchQuery = '';
  let selectedCategory = 'ALL';
  let selectedChain = 'ALL';
  let sortBy = 'rank-asc';
  let activeQuickFilter = 'all';

  // Elements
  const asOfEl = document.getElementById('as-of-val');
  const statPreEl = document.getElementById('stat-total-pre');
  const statWatchEl = document.getElementById('stat-watchlist');
  const statTvlEl = document.getElementById('stat-total-tvl');
  const statImpliedEl = document.getElementById('stat-total-implied');

  const countPreEl = document.getElementById('count-pre');
  const countWatchEl = document.getElementById('count-watch');
  const countLiveEl = document.getElementById('count-live');

  const tabBtns = document.querySelectorAll('.tab-btn');
  const viewRadar = document.getElementById('view-radar');
  const viewLive = document.getElementById('view-live');
  const viewModel = document.getElementById('view-model');
  const filtersSection = document.getElementById('filters-section');

  const searchInput = document.getElementById('search-input');
  const categoryFilter = document.getElementById('category-filter');
  const chainFilter = document.getElementById('chain-filter');
  const sortSelect = document.getElementById('sort-select');

  const tbodyPre = document.getElementById('tbody-pre');
  const tbodyLive = document.getElementById('tbody-live');

  // Modal elements
  const modalOverlay = document.getElementById('modal-overlay');
  const modalClose = document.getElementById('modal-close');
  const mRank = document.getElementById('m-rank');
  const mName = document.getElementById('m-name');
  const mCategory = document.getElementById('m-category');
  const mSlug = document.getElementById('m-slug');
  const mWatchlistTag = document.getElementById('m-watchlist-tag');
  const mTvl = document.getElementById('m-tvl');
  const mGrowth = document.getElementById('m-growth');
  const mAge = document.getElementById('m-age');
  const mImplied = document.getElementById('m-implied');
  const mValSector = document.getElementById('m-val-sector');
  const mValGrowth = document.getElementById('m-val-growth');
  const mValMaturity = document.getElementById('m-val-maturity');
  const mValChain = document.getElementById('m-val-chain');
  const mChainsList = document.getElementById('m-chains-list');
  const mFarmSteps = document.getElementById('m-farm-steps');

  // Formatters
  function formatDollars(val) {
    if (val === null || val === undefined || isNaN(val)) return '$0';
    if (val >= 1_000_000_000) return '$' + (val / 1_000_000_000).toFixed(2) + 'B';
    if (val >= 1_000_000) return '$' + (val / 1_000_000).toFixed(2) + 'M';
    if (val >= 1_000) return '$' + (val / 1_000).toFixed(1) + 'K';
    return '$' + val.toLocaleString();
  }

  function formatExactDollars(val) {
    if (val === null || val === undefined || isNaN(val)) return '$0';
    return '$' + Number(val).toLocaleString();
  }

  function formatPercent(val) {
    if (val === null || val === undefined || isNaN(val)) return '--';
    const num = Number(val);
    const sign = num > 0 ? '+' : '';
    return sign + num.toFixed(2) + '%';
  }

  function getStageInfo(ageDays) {
    if (ageDays <= 90) return { label: 'Bootstrap (' + ageDays + 'd)', cls: 'stage-bootstrap' };
    if (ageDays <= 240) return { label: 'Growth (' + ageDays + 'd)', cls: 'stage-growth' };
    if (ageDays <= 540) return { label: 'Prime TGE (' + ageDays + 'd)', cls: 'stage-prime' };
    if (ageDays <= 900) return { label: 'Late (' + ageDays + 'd)', cls: 'stage-late' };
    return { label: 'Dormant (' + ageDays + 'd)', cls: 'stage-dormant' };
  }

  // Initialize
  function init() {
    if (asOfEl) asOfEl.textContent = data.as_of;

    const board = data.board || [];
    const live = data.live || [];
    const watchlistRows = board.filter(function (r) { return r.is_watchlist; });

    let totalTvl = 0;
    let totalImplied = 0;
    const categoriesSet = new Set();
    const chainsMap = {};

    board.forEach(function (r) {
      totalTvl += r.tvl_usd || 0;
      totalImplied += r.implied_value_usd || 0;
      if (r.category) categoriesSet.add(r.category);
      if (Array.isArray(r.chains)) {
        r.chains.forEach(function (c) {
          chainsMap[c] = (chainsMap[c] || 0) + 1;
        });
      }
    });

    if (statPreEl) statPreEl.textContent = board.length;
    if (statWatchEl) statWatchEl.textContent = watchlistRows.length;
    if (statTvlEl) statTvlEl.textContent = formatDollars(totalTvl);
    if (statImpliedEl) statImpliedEl.textContent = formatDollars(totalImplied);

    if (countPreEl) countPreEl.textContent = board.length;
    if (countWatchEl) countWatchEl.textContent = watchlistRows.length;
    if (countLiveEl) countLiveEl.textContent = live.length;

    // Populate Category filter
    const sortedCats = Array.from(categoriesSet).sort();
    sortedCats.forEach(function (cat) {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      categoryFilter.appendChild(opt);
    });

    // Populate Chain filter (sorted by frequency)
    const sortedChains = Object.keys(chainsMap).sort(function (a, b) {
      return chainsMap[b] - chainsMap[a];
    });
    sortedChains.forEach(function (chain) {
      const opt = document.createElement('option');
      opt.value = chain;
      opt.textContent = chain + ' (' + chainsMap[chain] + ')';
      chainFilter.appendChild(opt);
    });

    attachEvents();
    render();
  }

  function attachEvents() {
    // Tabs
    tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const tab = btn.getAttribute('data-tab');
        switchTab(tab);
      });
    });

    const btnMethodology = document.getElementById('btn-show-methodology');
    if (btnMethodology) {
      btnMethodology.addEventListener('click', function () {
        switchTab('model');
      });
    }

    // Quick Filters
    const chipFilters = document.querySelectorAll('.chip-filter');
    chipFilters.forEach(function (chip) {
      chip.addEventListener('click', function () {
        chipFilters.forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');
        activeQuickFilter = chip.getAttribute('data-qfilter') || 'all';
        render();
      });
    });

    // Search and Filters
    searchInput.addEventListener('input', function (e) {
      searchQuery = e.target.value.trim().toLowerCase();
      render();
    });

    categoryFilter.addEventListener('change', function (e) {
      selectedCategory = e.target.value;
      render();
    });

    chainFilter.addEventListener('change', function (e) {
      selectedChain = e.target.value;
      render();
    });

    sortSelect.addEventListener('change', function (e) {
      sortBy = e.target.value;
      render();
    });

    // Modal
    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', function (e) {
      if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  function switchTab(tab) {
    currentTab = tab;
    tabBtns.forEach(function (btn) {
      if (btn.getAttribute('data-tab') === tab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (tab === 'pre-token' || tab === 'watchlist') {
      viewRadar.classList.remove('hidden');
      viewLive.classList.add('hidden');
      viewModel.classList.add('hidden');
      filtersSection.classList.remove('hidden');
    } else if (tab === 'live') {
      viewRadar.classList.add('hidden');
      viewLive.classList.remove('hidden');
      viewModel.classList.add('hidden');
      filtersSection.classList.remove('hidden');
    } else if (tab === 'model') {
      viewRadar.classList.add('hidden');
      viewLive.classList.add('hidden');
      viewModel.classList.remove('hidden');
      filtersSection.classList.add('hidden');
    }

    render();
  }

  function filterAndSortPreToken() {
    let rows = (data.board || []).slice();

    if (currentTab === 'watchlist') {
      rows = rows.filter(function (r) { return r.is_watchlist; });
    }

    if (activeQuickFilter === 'prime') {
      rows = rows.filter(function (r) {
        const age = r.age_days || 365;
        return age >= 240 && age <= 540;
      });
    } else if (activeQuickFilter === 'tvl100') {
      rows = rows.filter(function (r) { return (r.tvl_usd || 0) >= 100_000_000; });
    } else if (activeQuickFilter === 'multichain') {
      rows = rows.filter(function (r) { return Array.isArray(r.chains) && r.chains.length > 1; });
    }

    if (selectedCategory !== 'ALL') {
      rows = rows.filter(function (r) { return r.category === selectedCategory; });
    }

    if (selectedChain !== 'ALL') {
      rows = rows.filter(function (r) {
        return Array.isArray(r.chains) && r.chains.includes(selectedChain);
      });
    }

    if (searchQuery) {
      rows = rows.filter(function (r) {
        const nameMatch = r.name && r.name.toLowerCase().includes(searchQuery);
        const slugMatch = r.slug && r.slug.toLowerCase().includes(searchQuery);
        const catMatch = r.category && r.category.toLowerCase().includes(searchQuery);
        const chainMatch = Array.isArray(r.chains) && r.chains.some(function (c) {
          return c.toLowerCase().includes(searchQuery);
        });
        return nameMatch || slugMatch || catMatch || chainMatch;
      });
    }

    // Sort
    rows.sort(function (a, b) {
      if (sortBy === 'rank-asc') return a.rank - b.rank;
      if (sortBy === 'val-desc') return b.implied_value_usd - a.implied_value_usd;
      if (sortBy === 'tvl-desc') return b.tvl_usd - a.tvl_usd;
      if (sortBy === 'growth-desc') return (b.change_7d || 0) - (a.change_7d || 0);
      if (sortBy === 'age-desc') return (b.age_days || 0) - (a.age_days || 0);
      return a.rank - b.rank;
    });

    return rows;
  }

  function filterAndSortLive() {
    let rows = (data.live || []).slice();

    if (selectedCategory !== 'ALL') {
      rows = rows.filter(function (r) { return r.category === selectedCategory; });
    }

    if (selectedChain !== 'ALL') {
      rows = rows.filter(function (r) {
        return Array.isArray(r.chains) && r.chains.includes(selectedChain);
      });
    }

    if (searchQuery) {
      rows = rows.filter(function (r) {
        const nameMatch = r.name && r.name.toLowerCase().includes(searchQuery);
        const symMatch = r.symbol && r.symbol.toLowerCase().includes(searchQuery);
        const catMatch = r.category && r.category.toLowerCase().includes(searchQuery);
        return nameMatch || symMatch || catMatch;
      });
    }

    rows.sort(function (a, b) {
      return (b.mcap_usd || 0) - (a.mcap_usd || 0);
    });

    return rows;
  }

  function render() {
    if (currentTab === 'pre-token' || currentTab === 'watchlist') {
      renderPreTokenTable();
    } else if (currentTab === 'live') {
      renderLiveTable();
    }
  }

  function renderPreTokenTable() {
    tbodyPre.innerHTML = '';
    const rows = filterAndSortPreToken();

    if (rows.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="9" style="text-align:center; padding:32px; color:var(--text-muted);">' +
        'No pre-token protocols match your filter criteria.</td>';
      tbodyPre.appendChild(tr);
      return;
    }

    rows.forEach(function (r) {
      const tr = document.createElement('tr');

      // Rank pill
      let rankCls = 'rank-pill';
      if (r.rank === 1) rankCls += ' rank-top1';
      else if (r.rank <= 3) rankCls += ' rank-top3';

      // Growth
      const gVal = r.change_7d;
      let gCls = 'growth-pill growth-flat';
      if (gVal > 0) gCls = 'growth-pill growth-up';
      else if (gVal < 0) gCls = 'growth-pill growth-down';

      // Stage
      const stage = getStageInfo(r.age_days || 365);

      // Chains
      let chainHtml = '';
      if (Array.isArray(r.chains) && r.chains.length > 0) {
        chainHtml = '<span class="chain-badge">' + escapeHtml(r.chains[0]) + '</span>';
        if (r.chains.length > 1) {
          chainHtml += ' <span class="chain-more">+' + (r.chains.length - 1) + '</span>';
        }
      } else {
        chainHtml = '<span class="chain-badge">Multi</span>';
      }

      tr.innerHTML =
        '<td class="col-rank"><span class="' + rankCls + '">#' + r.rank + '</span></td>' +
        '<td class="col-name">' +
          '<div class="proto-cell">' +
            '<span class="proto-name">' + escapeHtml(r.name) + '</span>' +
            (r.is_watchlist ? '<span class="proto-watchlist-tag">WATCHLIST</span>' : '') +
          '</div>' +
        '</td>' +
        '<td class="col-category"><span class="pill-category">' + escapeHtml(r.category || 'DeFi') + '</span></td>' +
        '<td class="col-chains"><div class="chain-badges">' + chainHtml + '</div></td>' +
        '<td class="col-tvl num">' + formatDollars(r.tvl_usd) + '</td>' +
        '<td class="col-growth num"><span class="' + gCls + '">' + formatPercent(r.change_7d) + '</span></td>' +
        '<td class="col-age"><span class="stage-pill ' + stage.cls + '">' + stage.label + '</span></td>' +
        '<td class="col-value num"><span class="val-cell">' + formatDollars(r.implied_value_usd) + '</span></td>' +
        '<td class="col-action"><button class="btn-detail" data-slug="' + escapeHtml(r.slug) + '">Farm Plan &rarr;</button></td>';

      // Event listener for opening detail
      const btn = tr.querySelector('.btn-detail');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openModal(r);
      });

      tr.addEventListener('click', function () {
        openModal(r);
      });

      tbodyPre.appendChild(tr);
    });
  }

  function renderLiveTable() {
    tbodyLive.innerHTML = '';
    const rows = filterAndSortLive();

    if (rows.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="8" style="text-align:center; padding:32px; color:var(--text-muted);">' +
        'No trading reference protocols match your filter criteria.</td>';
      tbodyLive.appendChild(tr);
      return;
    }

    rows.forEach(function (r, idx) {
      const tr = document.createElement('tr');

      const gVal = r.change_7d;
      let gCls = 'growth-pill growth-flat';
      if (gVal > 0) gCls = 'growth-pill growth-up';
      else if (gVal < 0) gCls = 'growth-pill growth-down';

      const ratio = (r.mcap_usd && r.tvl_usd && r.tvl_usd > 0)
        ? (r.mcap_usd / r.tvl_usd).toFixed(2) + 'x'
        : '--';

      let chainHtml = '';
      if (Array.isArray(r.chains) && r.chains.length > 0) {
        chainHtml = '<span class="chain-badge">' + escapeHtml(r.chains[0]) + '</span>';
        if (r.chains.length > 1) {
          chainHtml += ' <span class="chain-more">+' + (r.chains.length - 1) + '</span>';
        }
      }

      tr.innerHTML =
        '<td class="col-rank"><span class="rank-pill">' + (idx + 1) + '</span></td>' +
        '<td class="col-name">' +
          '<div class="proto-cell">' +
            '<span class="proto-name">' + escapeHtml(r.name) + '</span>' +
            (r.symbol ? '<span class="pill-slug">$' + escapeHtml(r.symbol) + '</span>' : '') +
          '</div>' +
        '</td>' +
        '<td class="col-category"><span class="pill-category">' + escapeHtml(r.category || 'DeFi') + '</span></td>' +
        '<td class="col-chains"><div class="chain-badges">' + chainHtml + '</div></td>' +
        '<td class="col-tvl num">' + formatDollars(r.tvl_usd) + '</td>' +
        '<td class="col-growth num"><span class="' + gCls + '">' + formatPercent(r.change_7d) + '</span></td>' +
        '<td class="col-mcap num">' + formatDollars(r.mcap_usd) + '</td>' +
        '<td class="col-ratio num"><strong style="color:var(--accent-cyan);">' + ratio + '</strong></td>';

      tbodyLive.appendChild(tr);
    });
  }

  function openModal(protocol) {
    mRank.textContent = '#' + protocol.rank;
    mName.textContent = protocol.name;
    mCategory.textContent = protocol.category || 'DeFi';
    mSlug.textContent = protocol.slug;

    if (protocol.is_watchlist) {
      mWatchlistTag.classList.remove('hidden');
    } else {
      mWatchlistTag.classList.add('hidden');
    }

    mTvl.textContent = formatExactDollars(protocol.tvl_usd);
    mGrowth.textContent = formatPercent(protocol.change_7d);
    const stage = getStageInfo(protocol.age_days || 365);
    mAge.textContent = stage.label;
    mImplied.textContent = formatExactDollars(protocol.implied_value_usd);

    mValSector.textContent = (protocol.sector_multiple || 0.22).toFixed(2) + 'x';
    mValGrowth.textContent = (protocol.growth_factor || 1.0).toFixed(2) + 'x';
    mValMaturity.textContent = (protocol.maturity_factor || 1.0).toFixed(2) + 'x';
    mValChain.textContent = (protocol.chain_factor || 1.0).toFixed(2) + 'x';

    mChainsList.textContent = Array.isArray(protocol.chains) ? protocol.chains.join(', ') : 'Ethereum';

    // Populate Farm steps
    mFarmSteps.innerHTML = '';
    const steps = protocol.farm_steps || [];
    steps.forEach(function (step) {
      const li = document.createElement('li');
      li.textContent = step;
      mFarmSteps.appendChild(li);
    });

    modalOverlay.classList.remove('hidden');
  }

  function closeModal() {
    modalOverlay.classList.add('hidden');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

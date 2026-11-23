import './styles.css';
import {
  FEATURED_COUNTRIES,
  GENRE_PRESETS,
  countryCodeToFlag,
  getCountryLabel,
  stationDialMetrics,
} from './data/presets.js';
import {
  discoverMirrors,
  fetchCountries,
  fetchGlobalStats,
  fetchRandomStation,
  searchStations,
} from './services/radioApi.js';
import { RadioAudioEngine } from './services/audioEngine.js';
import {
  clearRecent,
  getFavorites,
  getPrefs,
  getRecent,
  isFavorite,
  pushRecent,
  replaceFavorites,
  savePrefs,
  toggleFavorite,
} from './services/storage.js';

// ==================== STATE ====================
const prefs = getPrefs();

const state = {
  view: 'explore', // 'explore' | 'favorites' | 'recent'
  country: '',
  genreTag: '',
  genreId: '',
  query: '',
  order: 'votes',
  httpsOnly: prefs.httpsOnly,
  stations: [],
  offset: 0,
  hasMore: false,
  isLoading: false,
  allCountries: [],
  currentStation: null,
  playerStatus: 'idle',
  tunerInView: true,
  sleepStepIdx: 0,
  searchAbort: null,
};

const SLEEP_STEPS = [0, 15, 30, 60];

// ==================== DOM REFS ====================
const el = {
  globalStats: document.getElementById('global-stats'),
  favCount: document.getElementById('fav-count'),
  navTabs: document.querySelectorAll('.nav-tab'),
  btnInstall: document.getElementById('btn-install'),
  btnRandom: document.getElementById('btn-random'),

  tunerDeck: document.getElementById('tuner-deck'),
  signalLabel: document.getElementById('signal-label'),
  tunerTechPills: document.getElementById('tuner-tech-pills'),
  btnSleep: document.getElementById('btn-sleep'),
  sleepLabel: document.getElementById('sleep-label'),
  dialFreq: document.getElementById('dial-freq'),
  dialNeedle: document.getElementById('dial-needle'),
  vuMeter: document.getElementById('vu-meter'),
  activeArt: document.getElementById('active-art'),
  activeName: document.getElementById('active-name'),
  activeSub: document.getElementById('active-sub'),
  btnPrev: document.getElementById('btn-prev'),
  btnPlayMain: document.getElementById('btn-play-main'),
  btnNext: document.getElementById('btn-next'),
  btnActiveFav: document.getElementById('btn-active-fav'),
  btnMute: document.getElementById('btn-mute'),
  volumeSlider: document.getElementById('volume-slider'),
  volPct: document.getElementById('vol-pct'),
  tunerError: document.getElementById('tuner-error'),
  tunerErrorMsg: document.getElementById('tuner-error-msg'),
  btnTryNext: document.getElementById('btn-try-next'),

  controlsPanel: document.getElementById('controls-panel'),
  searchInput: document.getElementById('search-input'),
  btnClearSearch: document.getElementById('btn-clear-search'),
  sortSelect: document.getElementById('sort-select'),
  httpsToggle: document.getElementById('https-toggle'),
  countryRibbon: document.getElementById('country-ribbon'),
  genreRack: document.getElementById('genre-rack'),
  btnAllCountries: document.getElementById('btn-all-countries'),
  btnResetFilters: document.getElementById('btn-reset-filters'),

  collectionBar: document.getElementById('collection-bar'),
  collectionTitle: document.getElementById('collection-title'),
  collectionSub: document.getElementById('collection-sub'),
  btnExportFavs: document.getElementById('btn-export-favs'),
  importFavsInput: document.getElementById('import-favs-input'),
  btnClearRecent: document.getElementById('btn-clear-recent'),

  resultsSummary: document.getElementById('results-summary'),
  filterBadge: document.getElementById('filter-badge'),
  stationsGrid: document.getElementById('stations-grid'),
  loadMoreWrap: document.getElementById('load-more-wrap'),
  btnLoadMore: document.getElementById('btn-load-more'),

  miniPlayer: document.getElementById('mini-player'),
  miniScrollTop: document.getElementById('mini-scroll-top'),
  miniName: document.getElementById('mini-name'),
  miniSub: document.getElementById('mini-sub'),
  miniFav: document.getElementById('mini-fav'),
  miniPlay: document.getElementById('mini-play'),
  miniNext: document.getElementById('mini-next'),

  countryModal: document.getElementById('country-modal'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  countrySearchInput: document.getElementById('country-search-input'),
  countryModalList: document.getElementById('country-modal-list'),
  toast: document.getElementById('toast'),
};

// ==================== AUDIO ENGINE ====================
const engine = new RadioAudioEngine({
  onStateChange: ({ status, station, volume, muted }) => {
    state.playerStatus = status;
    state.currentStation = station;
    renderTunerState(status, station, volume, muted);
    syncActiveCards();
  },
  onError: (msg) => {
    el.tunerErrorMsg.textContent = msg;
    el.tunerError.hidden = false;
  },
  onTimerTick: (remainingSec) => {
    if (remainingSec <= 0) {
      state.sleepStepIdx = 0;
      el.sleepLabel.textContent = 'Sleep';
      el.btnSleep.classList.remove('is-active');
      return;
    }
    const mm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
    const ss = String(remainingSec % 60).padStart(2, '0');
    el.sleepLabel.textContent = `${mm}:${ss}`;
    el.btnSleep.classList.add('is-active');
  },
});

engine.setVolume(prefs.volume);
el.volumeSlider.value = String(Math.round(prefs.volume * 100));
el.volPct.textContent = `${Math.round(prefs.volume * 100)}%`;
el.httpsToggle.checked = state.httpsOnly;

engine.setMediaSessionHandlers({
  onNext: () => stepStation(1),
  onPrev: () => stepStation(-1),
});

// ==================== TOAST ====================
let toastTimer = null;
function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, 2600);
}

// ==================== VU METER INIT ====================
function buildVuMeter() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 20; i++) {
    const bar = document.createElement('span');
    bar.className = 'vu-bar';
    const minH = 4 + (i % 3) * 2;
    const maxH = 12 + Math.round(((Math.sin(i * 0.9) + 1) / 2) * 18);
    const dur = (0.42 + (i % 5) * 0.12).toFixed(2);
    const delay = (i * 0.045).toFixed(2);
    bar.style.setProperty('--min-h', `${minH}px`);
    bar.style.setProperty('--max-h', `${maxH}px`);
    bar.style.setProperty('--dur', `${dur}s`);
    bar.style.setProperty('--delay', `${delay}s`);
    frag.appendChild(bar);
  }
  el.vuMeter.appendChild(frag);
}

// ==================== RENDER FILTERS ====================
function renderCountryRibbon() {
  const frag = document.createDocumentFragment();
  const list = [...FEATURED_COUNTRIES];

  // If user chose a non-featured country from modal, prepend it into the ribbon
  if (state.country && !list.some((c) => c.code === state.country)) {
    const found = state.allCountries.find((c) => c.code === state.country);
    list.splice(1, 0, {
      code: state.country,
      name: getCountryLabel(state.country, found?.name || state.country),
      flag: countryCodeToFlag(state.country),
    });
  }

  for (const c of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `country-pill${state.country === c.code ? ' is-active' : ''}`;
    btn.setAttribute('aria-pressed', String(state.country === c.code));
    btn.innerHTML = `<span aria-hidden="true">${c.flag}</span><span>${escapeHtml(c.name)}</span>`;
    btn.addEventListener('click', () => {
      state.country = c.code;
      renderCountryRibbon();
      loadExploreStations(true);
    });
    frag.appendChild(btn);
  }
  el.countryRibbon.replaceChildren(frag);
}

function renderGenreRack() {
  const frag = document.createDocumentFragment();
  for (const g of GENRE_PRESETS) {
    const active = state.genreId === g.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `genre-pad${active ? ' is-active' : ''}`;
    btn.dataset.accent = g.accent;
    btn.setAttribute('aria-pressed', String(active));
    btn.innerHTML = `<span class="pad-dot" aria-hidden="true"></span><span>${escapeHtml(g.label)}</span>`;
    btn.addEventListener('click', () => {
      if (state.genreId === g.id && g.id !== '') {
        state.genreId = '';
        state.genreTag = '';
      } else {
        state.genreId = g.id;
        state.genreTag = g.tag;
      }
      renderGenreRack();
      loadExploreStations(true);
    });
    frag.appendChild(btn);
  }
  el.genreRack.replaceChildren(frag);
}

// ==================== RENDER TUNER ====================
function renderTunerState(status, station, volume, muted) {
  el.tunerDeck.dataset.status = status;
  el.miniPlayer.dataset.status = status;

  const statusLabels = {
    idle: 'EN ESPERA',
    loading: 'SINTONIZANDO...',
    playing: 'EN VIVO · ON AIR',
    paused: 'EN PAUSA',
    error: 'SEÑAL INTERRUMPIDA',
  };
  el.signalLabel.textContent = statusLabels[status] || 'EN ESPERA';

  if (status !== 'error') {
    el.tunerError.hidden = true;
  }

  const pct = Math.round((muted ? 0 : volume) * 100);
  el.volPct.textContent = muted ? 'MUTE' : `${pct}%`;
  el.btnMute.classList.toggle('is-muted', muted);

  if (!station) {
    el.btnPlayMain.disabled = true;
    el.btnPrev.disabled = true;
    el.btnNext.disabled = true;
    el.btnActiveFav.disabled = true;
    el.miniPlayer.hidden = true;
    return;
  }

  const dial = stationDialMetrics(station);
  el.dialFreq.textContent = dial.freq;
  el.dialNeedle.style.left = `${dial.percent.toFixed(1)}%`;

  const flag = countryCodeToFlag(station.countrycode);
  const countryName = getCountryLabel(station.countrycode, station.country);
  const tags = parseTags(station.tags).slice(0, 3).join(' · ');

  el.activeName.textContent = station.name;
  el.activeSub.textContent = [
    `${flag} ${countryName}${station.state ? `, ${station.state}` : ''}`,
    tags,
  ]
    .filter(Boolean)
    .join('  —  ');

  renderArtwork(el.activeArt, station, flag);

  // Tech pills
  const pills = [];
  if (station.codec) pills.push(`<span class="tech-chip">${escapeHtml(station.codec)}</span>`);
  if (station.bitrate) pills.push(`<span class="tech-chip">${station.bitrate} KBPS</span>`);
  if (station.hls || (station.url_resolved || '').includes('.m3u8')) {
    pills.push(`<span class="tech-chip is-amber">HLS</span>`);
  }
  pills.push(
    station.isHttps
      ? `<span class="tech-chip is-mint">HTTPS</span>`
      : `<span class="tech-chip">HTTP</span>`
  );
  el.tunerTechPills.innerHTML = pills.join('');

  el.btnPlayMain.disabled = false;
  el.btnPrev.disabled = false;
  el.btnNext.disabled = false;
  el.btnActiveFav.disabled = false;

  const fav = isFavorite(station.stationuuid);
  el.btnActiveFav.classList.toggle('is-favorited', fav);
  el.miniFav.classList.toggle('is-favorited', fav);

  // Update mini player (show only when main tuner deck is scrolled out of view)
  el.miniPlayer.hidden = state.tunerInView;
  el.miniName.textContent = station.name;
  el.miniSub.textContent = `${flag} ${countryName}${station.bitrate ? ` · ${station.bitrate}k` : ''}`;
  el.miniPlay.textContent = status === 'playing' || status === 'loading' ? '❚❚' : '▶';
}

function renderArtwork(container, station, fallbackEmoji) {
  const safeFavicon =
    station.favicon &&
    (station.favicon.startsWith('https://') ||
      (window.location.protocol !== 'https:' && station.favicon.startsWith('http://')));

  if (!safeFavicon) {
    container.innerHTML = `<span class="art-fallback" aria-hidden="true">${fallbackEmoji}</span>`;
    return;
  }

  const img = document.createElement('img');
  img.src = station.favicon;
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => {
    container.innerHTML = `<span class="art-fallback" aria-hidden="true">${fallbackEmoji}</span>`;
  });
  container.replaceChildren(img);
}

// ==================== RENDER STATIONS GRID ====================
function renderSkeletons(count = 12) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const div = document.createElement('div');
    div.className = 'skeleton-card';
    frag.appendChild(div);
  }
  el.stationsGrid.replaceChildren(frag);
}

function createStationCard(station, idx) {
  const card = document.createElement('div');
  card.className = 'station-card';
  card.dataset.uuid = station.stationuuid;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.style.animationDelay = `${Math.min(idx * 22, 260)}ms`;

  const isCurr = state.currentStation?.stationuuid === station.stationuuid;
  if (isCurr) {
    card.classList.add('is-current');
    if (state.playerStatus === 'playing') card.classList.add('is-playing');
  }

  const flag = countryCodeToFlag(station.countrycode);
  const countryLabel = getCountryLabel(station.countrycode, station.country);
  const tags = parseTags(station.tags).slice(0, 2);
  const fav = isFavorite(station.stationuuid);

  const artDiv = document.createElement('div');
  artDiv.className = 'card-art';
  renderArtwork(artDiv, station, flag);
  const eq = document.createElement('span');
  eq.className = 'card-eq';
  eq.setAttribute('aria-hidden', 'true');
  eq.innerHTML = '<i></i><i></i><i></i>';
  artDiv.appendChild(eq);

  const body = document.createElement('div');
  body.className = 'card-body';

  const metaPills = [];
  if (station.codec || station.bitrate) {
    metaPills.push(
      `<span class="meta-pill">${escapeHtml(station.codec || 'STREAM')}${station.bitrate ? ` ${station.bitrate}k` : ''}</span>`
    );
  }
  for (const t of tags) {
    metaPills.push(`<span class="meta-pill is-tag">#${escapeHtml(t)}</span>`);
  }

  body.innerHTML = `
    <div class="card-title">${escapeHtml(station.name)}</div>
    <div class="card-location">${flag} ${escapeHtml(countryLabel)}${station.state ? ` · ${escapeHtml(station.state)}` : ''}</div>
    <div class="card-meta-row">${metaPills.join('')}</div>
  `;

  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = `card-fav-btn${fav ? ' is-favorited' : ''}`;
  favBtn.setAttribute('aria-label', fav ? 'Quitar de favoritas' : 'Guardar en favoritas');
  favBtn.setAttribute('aria-pressed', String(fav));
  favBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
    </svg>
  `;

  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleToggleFavorite(station);
  });

  const onSelect = () => playStation(station);
  card.addEventListener('click', onSelect);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  });

  card.append(artDiv, body, favBtn);
  return card;
}

function renderStationList(stations, append = false) {
  if (!append && stations.length === 0) {
    const emptyTitle =
      state.view === 'favorites'
        ? 'Todavía no guardaste favoritas'
        : state.view === 'recent'
          ? 'Tu historial está vacío'
          : 'No encontramos emisoras con ese filtro';
    const emptySub =
      state.view === 'favorites'
        ? 'Tocá el corazón ♥ en cualquier radio para tenerla siempre a mano.'
        : state.view === 'recent'
          ? 'Las radios que sintonices van a aparecer acá automáticamente.'
          : 'Probá limpiando la búsqueda, eligiendo otro género o desactivando el filtro HTTPS.';

    const hasCountryAndGenre = Boolean(state.view === 'explore' && state.country && state.genreTag);
    const countryTitle = hasCountryAndGenre ? getCountryLabel(state.country) : '';

    el.stationsGrid.innerHTML = `
      <div class="empty-state">
        <div style="font-size:2rem" aria-hidden="true">📻</div>
        <h3>${emptyTitle}</h3>
        <p>${emptySub}</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          ${
            hasCountryAndGenre
              ? `<button type="button" class="btn-load-more" id="btn-empty-clear-genre">Ver todas las radios de ${escapeHtml(countryTitle)}</button>`
              : ''
          }
          ${
            state.view === 'explore'
              ? '<button type="button" class="btn-load-more" id="btn-empty-reset">Ver emisoras destacadas</button>'
              : '<button type="button" class="btn-load-more" id="btn-empty-explore">Ir a Explorar</button>'
          }
        </div>
      </div>
    `;
    const btnCG = document.getElementById('btn-empty-clear-genre');
    if (btnCG) {
      btnCG.addEventListener('click', () => {
        state.genreId = '';
        state.genreTag = '';
        renderGenreRack();
        loadExploreStations(true);
      });
    }
    const btnR = document.getElementById('btn-empty-reset');
    if (btnR) btnR.addEventListener('click', resetFilters);
    const btnE = document.getElementById('btn-empty-explore');
    if (btnE) btnE.addEventListener('click', () => switchView('explore'));
    el.loadMoreWrap.hidden = true;
    return;
  }

  const frag = document.createDocumentFragment();
  const baseIndex = append ? el.stationsGrid.children.length : 0;
  stations.forEach((s, i) => frag.appendChild(createStationCard(s, append ? i : baseIndex + i)));
  if (append) {
    el.stationsGrid.appendChild(frag);
  } else {
    el.stationsGrid.replaceChildren(frag);
  }

  el.loadMoreWrap.hidden = state.view !== 'explore' || !state.hasMore;
}

function syncActiveCards() {
  const currId = state.currentStation?.stationuuid;
  const favSet = new Set(getFavorites().map((f) => f.stationuuid));

  el.stationsGrid.querySelectorAll('.station-card').forEach((card) => {
    const id = card.dataset.uuid;
    const isCurr = Boolean(currId && id === currId);
    card.classList.toggle('is-current', isCurr);
    card.classList.toggle('is-playing', isCurr && state.playerStatus === 'playing');

    const favBtn = card.querySelector('.card-fav-btn');
    if (favBtn) {
      const isFav = favSet.has(id);
      favBtn.classList.toggle('is-favorited', isFav);
      favBtn.setAttribute('aria-pressed', String(isFav));
    }
  });
}

function updateFavoritesBadge() {
  const favs = getFavorites();
  el.favCount.textContent = String(favs.length);
  if (state.currentStation) {
    const fav = favs.some((f) => f.stationuuid === state.currentStation.stationuuid);
    el.btnActiveFav.classList.toggle('is-favorited', fav);
    el.miniFav.classList.toggle('is-favorited', fav);
  }
}

// ==================== PLAYBACK ACTIONS ====================
function playStation(station) {
  if (!station) return;
  pushRecent(station);
  engine.play(station);
}

function handleToggleFavorite(station) {
  if (!station) return;
  const { added } = toggleFavorite(station);
  updateFavoritesBadge();
  syncActiveCards();
  showToast(added ? `Guardada en favoritas: ${station.name}` : `Quitada de favoritas`);
  if (state.view === 'favorites') {
    renderFavoritesView();
  }
}

function getActivePlaylist() {
  if (state.view === 'favorites') return getFavorites();
  if (state.view === 'recent') return getRecent();
  return state.stations;
}

function stepStation(delta) {
  const list = getActivePlaylist();
  if (!list.length) return;
  const idx = list.findIndex((s) => s.stationuuid === state.currentStation?.stationuuid);
  const nextIdx = idx < 0 ? 0 : (idx + delta + list.length) % list.length;
  playStation(list[nextIdx]);
}

async function tuneRandomStation() {
  el.btnRandom.disabled = true;
  showToast('Buscando señal aleatoria en el dial...');
  try {
    const pick = await fetchRandomStation({
      countrycode: state.view === 'explore' ? state.country : '',
      tag: state.view === 'explore' ? state.genreTag : '',
      httpsOnly: state.httpsOnly,
    });
    if (pick) {
      playStation(pick);
    } else {
      showToast('No encontramos señal con esos filtros. Probá global.');
    }
  } catch {
    showToast('Error de red al buscar una emisora aleatoria.');
  } finally {
    el.btnRandom.disabled = false;
  }
}

// ==================== DATA LOADING ====================
function updateFilterIndicators() {
  const hasFilters = Boolean(state.country || state.genreTag || state.query);
  el.btnResetFilters.hidden = !hasFilters;
  el.btnClearSearch.hidden = !state.query;

  const parts = [];
  if (state.country) {
    parts.push(`${countryCodeToFlag(state.country)} ${getCountryLabel(state.country)}`);
  }
  if (state.genreId) {
    const g = GENRE_PRESETS.find((x) => x.id === state.genreId);
    if (g) parts.push(g.label);
  }
  if (state.query) parts.push(`«${state.query}»`);

  el.filterBadge.textContent = parts.length ? parts.join(' · ') : 'GLOBAL · TOP';
}

async function loadExploreStations(reset = true) {
  if (state.searchAbort) {
    state.searchAbort.abort();
  }
  const controller = new AbortController();
  state.searchAbort = controller;

  state.isLoading = true;
  updateFilterIndicators();

  if (reset) {
    state.offset = 0;
    state.stations = [];
    el.resultsSummary.textContent = 'Escaneando frecuencias...';
    el.loadMoreWrap.hidden = true;
    renderSkeletons(12);
  } else {
    el.btnLoadMore.disabled = true;
    el.btnLoadMore.textContent = 'Cargando...';
  }

  try {
    const res = await searchStations({
      countrycode: state.country,
      tag: state.genreTag,
      name: state.query,
      order: state.order,
      offset: state.offset,
      limit: 30,
      httpsOnly: state.httpsOnly,
      signal: controller.signal,
    });

    if (controller.signal.aborted) return;

    state.offset = res.nextOffset;
    state.hasMore = res.hasMore;

    if (reset) {
      state.stations = res.stations;
      renderStationList(res.stations, false);
    } else {
      // Avoid duplicates across pages
      const existing = new Set(state.stations.map((s) => s.stationuuid));
      const fresh = res.stations.filter((s) => !existing.has(s.stationuuid));
      state.stations.push(...fresh);
      renderStationList(fresh, true);
    }

    el.resultsSummary.textContent = `${state.stations.length} emisoras listas${state.httpsOnly ? ' (HTTPS verificadas)' : ''}`;
  } catch (err) {
    if (err?.name === 'AbortError') return;
    el.resultsSummary.textContent = 'No se pudo consultar el directorio';
    if (reset) {
      el.stationsGrid.innerHTML = `
        <div class="empty-state">
          <div style="font-size:2rem" aria-hidden="true">⚡</div>
          <h3>Sin conexión con el directorio</h3>
          <p>El servidor de Radio Browser tardó demasiado. Tocá reintentar.</p>
          <button type="button" class="btn-load-more" id="btn-retry-fetch">Reintentar</button>
        </div>
      `;
      document.getElementById('btn-retry-fetch')?.addEventListener('click', () => loadExploreStations(true));
    }
  } finally {
    state.isLoading = false;
    el.btnLoadMore.disabled = false;
    el.btnLoadMore.textContent = 'Cargar más emisoras';
  }
}

function resetFilters() {
  state.country = '';
  state.genreId = '';
  state.genreTag = '';
  state.query = '';
  el.searchInput.value = '';
  renderCountryRibbon();
  renderGenreRack();
  loadExploreStations(true);
}

// ==================== VIEWS ====================
function renderFavoritesView() {
  const favs = getFavorites();
  el.collectionTitle.textContent = 'Tus emisoras favoritas';
  el.collectionSub.textContent = `${favs.length} guardadas localmente en este dispositivo`;
  el.btnExportFavs.hidden = false;
  el.importFavsInput.parentElement.hidden = false;
  el.btnClearRecent.hidden = true;
  el.resultsSummary.textContent = `${favs.length} favoritas`;
  el.filterBadge.textContent = 'LOCAL STORAGE';
  renderStationList(favs, false);
}

function renderRecentView() {
  const recent = getRecent();
  el.collectionTitle.textContent = 'Escuchadas recientemente';
  el.collectionSub.textContent = 'Últimas emisoras sintonizadas';
  el.btnExportFavs.hidden = true;
  el.importFavsInput.parentElement.hidden = true;
  el.btnClearRecent.hidden = recent.length === 0;
  el.resultsSummary.textContent = `${recent.length} en el historial`;
  el.filterBadge.textContent = 'HISTORIAL';
  renderStationList(recent, false);
}

function switchView(view) {
  state.view = view;
  el.navTabs.forEach((t) => {
    const active = t.dataset.view === view;
    t.classList.toggle('is-active', active);
    t.setAttribute('aria-pressed', String(active));
  });

  el.controlsPanel.hidden = view !== 'explore';
  el.collectionBar.hidden = view === 'explore';

  if (view === 'explore') {
    if (state.stations.length === 0) {
      loadExploreStations(true);
    } else {
      updateFilterIndicators();
      el.resultsSummary.textContent = `${state.stations.length} emisoras listas${state.httpsOnly ? ' (HTTPS verificadas)' : ''}`;
      renderStationList(state.stations, false);
    }
  } else if (view === 'favorites') {
    renderFavoritesView();
  } else {
    renderRecentView();
  }
}

// ==================== COUNTRY DIRECTORY MODAL ====================
async function openCountryModal() {
  el.countryModal.hidden = false;
  el.countrySearchInput.value = '';
  el.countrySearchInput.focus();

  if (state.allCountries.length === 0) {
    el.countryModalList.innerHTML = '<p style="grid-column:1/-1;color:var(--text-secondary);padding:12px">Cargando 224 países...</p>';
    try {
      state.allCountries = await fetchCountries();
    } catch {
      el.countryModalList.innerHTML = '<p style="grid-column:1/-1;color:#ff8e99;padding:12px">No se pudo cargar la lista de países.</p>';
      return;
    }
  }
  renderCountryModalList('');
}

function closeCountryModal() {
  el.countryModal.hidden = true;
}

function renderCountryModalList(filterText) {
  const q = filterText.trim().toLowerCase();
  const frag = document.createDocumentFragment();

  const items = [
    { code: '', name: 'Todo el mundo', stationcount: null },
    ...state.allCountries,
  ].filter((c) => {
    if (!q) return true;
    const esName = getCountryLabel(c.code, c.name).toLowerCase();
    return esName.includes(q) || (c.name || '').toLowerCase().includes(q) || c.code.toLowerCase() === q;
  });

  for (const c of items.slice(0, 120)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `country-modal-item${state.country === c.code ? ' is-active' : ''}`;
    const label = c.code ? getCountryLabel(c.code, c.name) : 'Todo el mundo';
    const flag = c.code ? countryCodeToFlag(c.code) : '🌐';
    btn.innerHTML = `
      <span>${flag} ${escapeHtml(label)}</span>
      ${c.stationcount ? `<span class="country-modal-count">${c.stationcount.toLocaleString('es-AR')}</span>` : ''}
    `;
    btn.addEventListener('click', () => {
      state.country = c.code;
      closeCountryModal();
      renderCountryRibbon();
      loadExploreStations(true);
    });
    frag.appendChild(btn);
  }

  el.countryModalList.replaceChildren(frag);
}

// ==================== EXPORT / IMPORT FAVORITES ====================
function exportFavoritesJson() {
  const favs = getFavorites();
  if (!favs.length) {
    showToast('No tenés favoritas para exportar todavía.');
    return;
  }
  const blob = new Blob([JSON.stringify(favs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `worldradio-favoritas-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exportadas ${favs.length} emisoras favoritas.`);
}

async function importFavoritesJson(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const merged = replaceFavorites([...parsed, ...getFavorites()].filter(
      (s, i, arr) => s && s.stationuuid && arr.findIndex((x) => x?.stationuuid === s.stationuuid) === i
    ));
    updateFavoritesBadge();
    renderFavoritesView();
    showToast(`Importación lista: ${merged.length} favoritas guardadas.`);
  } catch {
    showToast('El archivo JSON no tiene un formato válido.');
  }
}

// ==================== HELPERS ====================
function parseTags(tagStr) {
  if (!tagStr) return [];
  return tagStr
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && t.length <= 24);
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ==================== EVENT WIRING ====================
function bindEvents() {
  el.navTabs.forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  el.btnRandom.addEventListener('click', tuneRandomStation);
  el.btnPlayMain.addEventListener('click', () => engine.togglePlayPause());
  el.btnPrev.addEventListener('click', () => stepStation(-1));
  el.btnNext.addEventListener('click', () => stepStation(1));
  el.btnActiveFav.addEventListener('click', () => handleToggleFavorite(state.currentStation));
  el.btnTryNext.addEventListener('click', () => stepStation(1));

  el.btnMute.addEventListener('click', () => engine.toggleMute());
  el.volumeSlider.addEventListener('input', (e) => {
    const v = Number(e.target.value) / 100;
    engine.setVolume(v);
    savePrefs({ volume: v });
  });

  el.btnSleep.addEventListener('click', () => {
    state.sleepStepIdx = (state.sleepStepIdx + 1) % SLEEP_STEPS.length;
    const mins = SLEEP_STEPS[state.sleepStepIdx];
    engine.setSleepTimer(mins);
    showToast(mins ? `Apagado automático en ${mins} minutos` : 'Temporizador desactivado');
  });

  // Search with clean debounce
  let searchTimer = null;
  el.searchInput.addEventListener('input', (e) => {
    state.query = e.target.value.trim();
    el.btnClearSearch.hidden = !state.query;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadExploreStations(true), 360);
  });

  el.btnClearSearch.addEventListener('click', () => {
    state.query = '';
    el.searchInput.value = '';
    el.btnClearSearch.hidden = true;
    loadExploreStations(true);
    el.searchInput.focus();
  });

  el.sortSelect.addEventListener('change', (e) => {
    state.order = e.target.value;
    loadExploreStations(true);
  });

  el.httpsToggle.addEventListener('change', (e) => {
    state.httpsOnly = e.target.checked;
    savePrefs({ httpsOnly: state.httpsOnly });
    loadExploreStations(true);
  });

  el.btnResetFilters.addEventListener('click', resetFilters);
  el.btnLoadMore.addEventListener('click', () => loadExploreStations(false));

  // Mini player
  el.miniScrollTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  el.miniPlay.addEventListener('click', () => engine.togglePlayPause());
  el.miniNext.addEventListener('click', () => stepStation(1));
  el.miniFav.addEventListener('click', () => handleToggleFavorite(state.currentStation));

  // Favorites & Recent
  el.btnExportFavs.addEventListener('click', exportFavoritesJson);
  el.importFavsInput.addEventListener('change', (e) => {
    importFavoritesJson(e.target.files?.[0]);
    e.target.value = '';
  });
  el.btnClearRecent.addEventListener('click', () => {
    clearRecent();
    renderRecentView();
    showToast('Historial borrado');
  });

  // Country modal
  el.btnAllCountries.addEventListener('click', openCountryModal);
  el.btnCloseModal.addEventListener('click', closeCountryModal);
  el.countryModal.addEventListener('click', (e) => {
    if (e.target === el.countryModal) closeCountryModal();
  });
  el.countrySearchInput.addEventListener('input', (e) => {
    renderCountryModalList(e.target.value);
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.countryModal.hidden) {
      closeCountryModal();
      return;
    }
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Space' && state.currentStation) {
      e.preventDefault();
      engine.togglePlayPause();
    } else if (e.key === '/' && state.view === 'explore') {
      e.preventDefault();
      el.searchInput.focus();
    }
  });
}

// ==================== PWA INSTALL & SERVICE WORKER ====================
let deferredInstallPrompt = null;

function setupPwa() {
  if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    el.btnInstall.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    el.btnInstall.hidden = true;
    showToast('WorldRadio instalada en tu pantalla principal');
  });

  el.btnInstall.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    try {
      await deferredInstallPrompt.userChoice;
    } finally {
      deferredInstallPrompt = null;
      el.btnInstall.hidden = true;
    }
  });
}

// ==================== BOOT ====================
async function init() {
  buildVuMeter();
  renderCountryRibbon();
  renderGenreRack();
  updateFavoritesBadge();
  bindEvents();
  setupPwa();

  // Observe main tuner deck visibility so mini-player only appears while scrolling the list
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver(
      ([entry]) => {
        state.tunerInView = entry.isIntersecting;
        el.miniPlayer.hidden = !state.currentStation || state.tunerInView;
      },
      { threshold: 0.15 }
    );
    obs.observe(el.tunerDeck);
  } else {
    state.tunerInView = false;
  }

  // Start loading stations immediately while fetching global stats & extra mirrors in parallel
  loadExploreStations(true);
  discoverMirrors();

  try {
    const stats = await fetchGlobalStats();
    const stCount = Number(stats.stations || 45000).toLocaleString('es-AR');
    const cCount = Number(stats.countries || 220).toLocaleString('es-AR');
    el.globalStats.textContent = `${stCount} EMISORAS · ${cCount} PAÍSES EN VIVO`;
    el.btnAllCountries.textContent = `Todos los países (${cCount}) →`;
  } catch {
    el.globalStats.textContent = '+45.000 EMISORAS · DIRECTORIO MUNDIAL';
  }
}

init();

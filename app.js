/**
 * Australian Spectrum Visualiser
 * --------------------------------------------------
 * This file is intentionally organised into clear sections:
 * 1. Reference data
 * 2. App state
 * 3. DOM helpers
 * 4. Map + geolocation lifecycle
 * 5. Precise ASMG grid selection
 * 6. Band analysis + raw data rendering
 * 7. Spectrum chart rendering
 * 8. Utilities
 *
 * The important selection rule is:
 * - Find every holding whose polygon truly contains the clicked point
 * - Pick the smallest containing polygon as the primary ASMG grid
 * - Use that primary grid for HCIS + highlight
 * - Use all containing holdings for band analysis
 */

// ============================================
// 1) REFERENCE DATA
// ============================================

const DEFAULT_MAP_CENTER = [133.8753, -25.2744];
const DEFAULT_MAP_ZOOM = 3;
const SEARCH_SEED_ZOOM = 3;
const AUSTRALIA_BOUNDS = [
  [112.5, -44.5],
  [154.5, -9.0]
];
const FOLLOW_ZOOM = 12;
const MAP_LAYER_ID = 'spectrum-fill';
const MAP_LINE_LAYER_ID = 'spectrum-lines';
const MAP_SOURCE_ID = 'spectrum';
const MAP_SOURCE_LAYER = 'mobile_spectrum';
const HIGHLIGHT_SOURCE_ID = 'asmg-grid-highlight';
const HIGHLIGHT_FILL_LAYER_ID = 'asmg-grid-highlight-fill';
const HIGHLIGHT_OUTLINE_LAYER_ID = 'asmg-grid-highlight-outline';
const COMPARE_HIGHLIGHT_SOURCE_ID = 'compare-grid-highlight';
const COMPARE_HIGHLIGHT_FILL_LAYER_ID = 'compare-grid-highlight-fill';
const COMPARE_HIGHLIGHT_OUTLINE_LAYER_ID = 'compare-grid-highlight-outline';
const LICENCE_HIGHLIGHT_SOURCE_ID = 'licence-grid-highlight';
const LICENCE_HIGHLIGHT_OUTLINE_SOURCE_ID = 'licence-grid-highlight-outline';
const LICENCE_HIGHLIGHT_FILL_LAYER_ID = 'licence-grid-highlight-fill';
const LICENCE_HIGHLIGHT_STRIPE_LAYER_ID = 'licence-grid-highlight-stripe';
const LICENCE_HIGHLIGHT_OUTLINE_LAYER_ID = 'licence-grid-highlight-outline';
const MEASURE_SOURCE_ID = 'measure-overlay';
const MEASURE_LINE_LAYER_ID = 'measure-overlay-line';
const MEASURE_POINT_LAYER_ID = 'measure-overlay-point';
const CARRIER_FILTER_OPTIONS = [
  { id: 'all', label: 'All Carriers' },
  { id: 'Telstra', label: 'Telstra' },
  { id: 'Optus', label: 'Optus' },
  { id: 'Vodafone', label: 'Vodafone' },
  { id: 'NBN', label: 'NBN' },
  { id: 'selected-licence', label: 'Selected Licence' }
];
const BAND_GROUP_OPTIONS = [
  { id: 'all', label: 'All Ranges' },
  { id: 'low', label: 'Low-band' },
  { id: 'mid', label: 'Mid-band' },
  { id: 'mmwave', label: 'mmWave' }
];
const OVERLAY_PALETTES = {
  green: { fillStart: 'rgba(21, 163, 74, 0.10)', fillEnd: 'rgba(21, 163, 74, 0.42)', fillColor: '#15a34a', outlineColor: '#15803d' },
  blue: { fillStart: 'rgba(14, 165, 233, 0.10)', fillEnd: 'rgba(14, 165, 233, 0.42)', fillColor: '#0ea5e9', outlineColor: '#0284c7' },
  amber: { fillStart: 'rgba(245, 158, 11, 0.10)', fillEnd: 'rgba(245, 158, 11, 0.42)', fillColor: '#f59e0b', outlineColor: '#d97706' }
};

const BANDS = [
  { id: 28, name: 'Band 28', freq: '700 MHz', type: 'FDD', ulStart: 703, ulEnd: 748, dlStart: 758, dlEnd: 803 },
  { id: 5, name: 'Band 5 (26)', freq: '850 MHz / 800 MHz', type: 'FDD', ulStart: 824, ulEnd: 849, dlStart: 869, dlEnd: 894, b26ulStart: 814, b26ulEnd: 849, b26dlStart: 859, b26dlEnd: 894 },
  { id: 8, name: 'Band 8', freq: '900 MHz', type: 'FDD', ulStart: 880, ulEnd: 915, dlStart: 925, dlEnd: 960 },
  { id: 3, name: 'Band 3', freq: '1.8 GHz', type: 'FDD', ulStart: 1710, ulEnd: 1785, dlStart: 1805, dlEnd: 1880 },
  { id: 1, name: 'Band 1', freq: '2.1 GHz', type: 'FDD', ulStart: 1920, ulEnd: 1980, dlStart: 2110, dlEnd: 2170 },
  { id: 40, name: 'Band 40', freq: '2.3 GHz', type: 'TDD', tddStart: 2302, tddEnd: 2400 },
  { id: 7, name: 'Band 7', freq: '2.6 GHz', type: 'FDD', ulStart: 2500, ulEnd: 2570, dlStart: 2620, dlEnd: 2690 },
  { id: 78, name: 'Band 78', freq: '3.5 GHz', type: 'TDD', tddStart: 3400, tddEnd: 3800 },
  { id: 258, name: 'Band 258', freq: '26 GHz', type: 'TDD', tddStart: 24250, tddEnd: 27500 }
];

const CARRIERS = {
  Telstra: ['TELSTRA LIMITED', 'Telstra 3G', 'DELTA NETWORKS'],
  Optus: ['Optus Mobile', 'OPTUS MOBILE', 'Optitel', 'Singtel'],
  Vodafone: ['Vodafone', 'TPG', 'MOBILE JV', 'Dense Air'],
  NBN: ['NBN CO LIMITED', 'NBN']
};

// ============================================
// 2) APP STATE
// ============================================

const State = {
  map: null,
  searchSeedMap: null,
  currentBasemap: 'light',
  currentFeatures: [],
  currentPrimaryFeature: null,
  currentSelection: null,
  compareSelection: null,
  pendingRestoredSelection: null,
  pendingRestoredCompareSelection: null,
  compareModeArmed: false,
  activeLicenceHighlightNo: null,
  activeAreaSearch: null,
  activeAreaStats: null,
  searchDirty: false,
  loadedSourceFeatures: [],
  loadedHolderNames: [],
  loadedSubServiceNames: [],
  searchSeedFeatures: [],
  searchSeedHolderNames: [],
  searchSeedSubServiceNames: [],
  searchSeedRevision: 0,
  searchBaseCacheKey: '',
  searchBaseCacheFeatures: [],
  searchAnnotatedCarrierCacheKey: '',
  searchAnnotatedCarrierCacheFeatures: [],
  searchBandRangeCacheKey: '',
  searchBandRangeCacheEntries: [],
  bandMhzFilters: {},
  openBandMhzPanelId: null,
  overlayPalette: 'green',
  overlayOpacityMultiplier: 0.5,
  carrierFilters: new Set(),
  bandGroupFilters: new Set(),
  specificBandFilters: new Set(),
  licenceTypeFilters: new Set(),
  extraCarrierOptions: [],
  bandData: {},
  measurementActive: false,
  measurementPoints: [],
  locationMarker: null,
  geoTracking: false,
  geoWatchId: null,
  autoFollow: true,
  hasCenteredOnce: false,
  isFlying: false,
  lastFollowTime: 0,
  minFollowIntervalMs: 1500,
  pendingSelectionToken: 0,
  locateBtnBound: false,
  autoFollowHandlersAttached: false
};

// ============================================
// 3) DOM HELPERS
// ============================================

function byId(id) {
  return document.getElementById(id);
}

function resolveCarrier(name) {
  if (!name) return 'Other';
  const upper = name.toUpperCase();

  for (const [parent, variants] of Object.entries(CARRIERS)) {
    if (variants.some((variant) => upper.includes(variant.toUpperCase()))) {
      return parent;
    }
  }

  return 'Other';
}

function getCarrierClass(name) {
  const map = {
    Telstra: 'telstra',
    Optus: 'optus',
    Vodafone: 'vodafone',
    NBN: 'nbn'
  };

  return map[name] || 'other';
}

function setLocateButtonState(isOn) {
  const btn = byId('locateBtn');
  if (!btn) return;

  btn.classList.toggle('on', isOn);
  btn.classList.toggle('off', !isOn);

  const label = btn.querySelector('.geo-label');
  if (label) {
    label.textContent = isOn ? 'Live Location On' : 'Live Location Off';
  }
}

function clearSidePanel() {
  const coverageBtn = byId('coverageBtn');
  const rawDataBtn = byId('rawDataBtn');
  const rawDataContent = byId('rawDataContent');
  const bandModules = byId('bandModules');
  const comparePanel = byId('comparePanel');
  const analysisToolbarLabel = byId('analysisToolbarLabel');
  const analysisToolbarTitle = byId('analysisToolbarTitle');
  const analysisToolbarNote = byId('analysisToolbarNote');
  const locationName = byId('locationName');
  const locationDetails = byId('locationDetails');
  const hcisIdDisplay = byId('hcisIdDisplay');

  if (locationName) locationName.textContent = 'Click on map';
  if (locationDetails) locationDetails.textContent = '';
  if (hcisIdDisplay) {
    hcisIdDisplay.textContent = '';
    hcisIdDisplay.style.display = 'none';
  }
  if (coverageBtn) coverageBtn.style.display = 'none';
  if (rawDataBtn) rawDataBtn.style.display = 'none';
  if (rawDataContent) rawDataContent.innerHTML = '';
  if (bandModules) bandModules.innerHTML = '';
  if (comparePanel) {
    comparePanel.innerHTML = '';
    comparePanel.classList.add('hidden');
  }
  if (analysisToolbarLabel) analysisToolbarLabel.textContent = 'Search';
  if (analysisToolbarTitle) analysisToolbarTitle.textContent = 'Select carrier holders to show licence areas on the map';
  if (analysisToolbarNote) analysisToolbarNote.textContent = 'Choose one or more holders to start searching the loaded map.';
  closePickerPanels();
}

// ============================================
// 4) APP BOOTSTRAP
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initializeFilterControls();
  initializeMap();
});

function setupEventListeners() {
  bindLocateButton();
  bindAnalysisToolbar();

  document.addEventListener('click', (event) => {
    const container = byId('resetMenuContainer');
    if (!container || container.contains(event.target)) return;
    closeResetMenu();
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('.picker-row')) return;
    closePickerPanels();
    if (!event.target.closest('.band-chip')) {
      closeBandMhzDropdowns();
    }
  });

  byId('holderSearchBtn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    togglePickerPanel('holderSearchPanel');
    renderHolderSearchOptions();
  });
  byId('licenceTypeBtn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    togglePickerPanel('licenceTypePanel');
    renderLicenceTypeOptions();
  });
  byId('holderSearchInput')?.addEventListener('input', renderHolderSearchOptions);
  byId('overlayPaletteSelect')?.addEventListener('change', (event) => {
    State.overlayPalette = event.target.value;
    applyOverlayStyle();
    renderOverlayVisualSection();
  });
  byId('overlayOpacitySlider')?.addEventListener('input', (event) => {
    State.overlayOpacityMultiplier = Number(event.target.value) / 100;
    byId('overlayOpacityValue').textContent = `${event.target.value}%`;
    applyOverlayStyle();
  });

  byId('settingsBtn')?.addEventListener('click', toggleMapSettings);
  document.querySelector('.settings-close')?.addEventListener('click', toggleMapSettings);
  byId('basemapSelect')?.addEventListener('change', handleBasemapChange);
  byId('opacitySlider')?.addEventListener('input', handleOpacityChange);
  byId('linesOpacitySlider')?.addEventListener('input', handleLinesOpacityChange);
  byId('rawDataBtn')?.addEventListener('click', () => byId('rawDataModal')?.classList.remove('hidden'));
  byId('coverageBtn')?.addEventListener('click', () => byId('coverageModal')?.classList.remove('hidden'));

  const holdingModal = byId('holdingModal');
  const rawDataModal = byId('rawDataModal');
  const coverageModal = byId('coverageModal');

  holdingModal?.querySelector('.modal-close')?.addEventListener('click', () => holdingModal.classList.add('hidden'));
  rawDataModal?.querySelector('.modal-close')?.addEventListener('click', () => rawDataModal.classList.add('hidden'));
  coverageModal?.querySelector('.modal-close')?.addEventListener('click', () => coverageModal.classList.add('hidden'));

  holdingModal?.addEventListener('click', (event) => {
    if (event.target === holdingModal) holdingModal.classList.add('hidden');
  });

  rawDataModal?.addEventListener('click', (event) => {
    if (event.target === rawDataModal) rawDataModal.classList.add('hidden');
  });
  coverageModal?.addEventListener('click', (event) => {
    if (event.target === coverageModal) coverageModal.classList.add('hidden');
  });

  byId('mapContainer')?.addEventListener('click', (event) => {
    const panel = byId('mapSettingsPanel');
    const button = byId('settingsBtn');

    if (!panel || !button) return;
    if (panel.classList.contains('hidden')) return;
    if (panel.contains(event.target) || button.contains(event.target)) return;

    panel.classList.add('hidden');
  });
}

function bindAnalysisToolbar() {
  const backBtn = byId('analysisBackBtn');
  const runSearchBtn = byId('runSearchBtn');
  const compareBtn = byId('compareModeBtn');
  const shareBtn = byId('shareViewBtn');
  const exportBtn = byId('exportPdfBtn');

  backBtn?.addEventListener('click', handleAnalysisBackAction);
  compareBtn?.addEventListener('click', toggleCompareMode);
  shareBtn?.addEventListener('click', shareCurrentView);
  exportBtn?.addEventListener('click', exportCurrentSelectionToPdf);

  if (runSearchBtn) {
    runSearchBtn.onclick = executeSearchFromFilters;
  }
}

function initializeFilterControls() {
  State.carrierFilters.clear();
  State.bandGroupFilters.clear();
  State.specificBandFilters.clear();
  State.licenceTypeFilters.clear();
  State.bandMhzFilters = {};
  State.searchDirty = false;
  renderCarrierFilterChips();
  renderBandGroupFilterChips();
  renderSpecificBandFilterChips();
  syncFilterControls();
}

function updateAnalysisToolbarVisibility() {
  const toolbar = byId('analysisToolbar');
  const label = byId('analysisToolbarLabel');
  const title = byId('analysisToolbarTitle');
  const note = byId('analysisToolbarNote');
  const backBtn = byId('analysisBackBtn');
  const runSearchBtn = byId('runSearchBtn');
  const compareBtn = byId('compareModeBtn');
  const exportBtn = byId('exportPdfBtn');
  if (!toolbar) return;
  toolbar.classList.remove('hidden');

  const goal = getCurrentGoalMode();
  const toolbarState = getAnalysisToolbarState(goal);

  if (label) label.textContent = toolbarState.label;
  if (title) title.textContent = toolbarState.title;
  if (note) note.textContent = toolbarState.note;
  if (backBtn) backBtn.classList.toggle('hidden', !toolbarState.showBack);
  if (runSearchBtn) {
    runSearchBtn.style.display = toolbarState.showSearch ? 'inline-flex' : 'none';
    runSearchBtn.classList.toggle('active', State.searchDirty);
    runSearchBtn.textContent = State.searchDirty ? 'Search' : 'Search';
  }
  if (compareBtn) {
    compareBtn.style.display = toolbarState.showCompare ? 'inline-flex' : 'none';
    compareBtn.classList.toggle('active', State.compareModeArmed);
    compareBtn.textContent = State.compareModeArmed ? 'Select Main Grid' : 'Compare Selected Grid';
  }
  if (exportBtn) {
    exportBtn.style.display = State.currentSelection ? 'inline-flex' : 'none';
  }
}

function getCurrentGoalMode() {
  if (State.compareModeArmed || (State.currentSelection && State.compareSelection) || (State.compareSelection && !State.currentSelection)) {
    return 'compare';
  }
  if (State.currentSelection) {
    return 'inspect';
  }
  return 'search';
}

function getAnalysisToolbarState(goal) {
  const selectionHcis = State.currentSelection?.primaryFeature?.properties?.hcis_id || '';
  const compareHcis = State.compareSelection?.primaryFeature?.properties?.hcis_id || '';
  const activeSearchLabel = State.activeAreaSearch?.label || '';
  const activeLicence = State.activeLicenceHighlightNo || '';
  const overlayNote = activeLicence
    ? `Licence area ${activeLicence} is active. Tap back to return to your previous goal.`
    : (activeSearchLabel ? `Showing licence area search for ${activeSearchLabel}.` : '');

  if (goal === 'compare') {
    if (State.compareModeArmed && State.compareSelection && !State.currentSelection) {
      return {
        label: 'Compare',
        title: 'Choose the main grid to compare against the saved grid',
        note: overlayNote || `Purple grid ${compareHcis || ''} is locked in. Tap another grid to compare side by side.`,
        showBack: true,
        showSearch: false,
        showCompare: false
      };
    }

    return {
      label: 'Compare',
      title: 'Comparing two selected grids side by side',
      note: overlayNote || `Orange is the main grid${selectionHcis ? ` (${selectionHcis})` : ''}. Purple is the comparison grid${compareHcis ? ` (${compareHcis})` : ''}.`,
      showBack: true,
      showSearch: false,
      showCompare: false
    };
  }

  if (goal === 'inspect') {
    return {
      label: 'Inspect',
      title: 'Viewing holdings and band information for the selected grid',
      note: overlayNote || `HCIS ${selectionHcis || 'selected grid'} is active. Use Compare to choose a second grid, or tap back to return to search.`,
      showBack: true,
      showSearch: false,
      showCompare: true
    };
  }

    return {
      label: 'Search',
      title: activeSearchLabel
      ? 'Search carrier holders, spectrum and sub services'
      : 'Select carrier holders to show licence areas on the map',
      note: overlayNote || 'Choose one or more holders to start searching the loaded map.',
      showBack: Boolean(activeLicence),
      showSearch: true,
      showCompare: false
    };
  }

function handleAnalysisBackAction() {
  if (State.activeLicenceHighlightNo) {
    clearLicenceHighlight();
    showToast('Returned to the previous view', 'info');
    return;
  }

  if (State.compareModeArmed || State.compareSelection) {
    exitCompareGoal();
    return;
  }

  if (State.currentSelection) {
    exitInspectGoal();
  }
}

function exitInspectGoal() {
  State.currentSelection = null;
  State.currentFeatures = [];
  State.currentPrimaryFeature = null;
  clearHighlight();
  closeDetailModals();
  rerenderAnalysisPanels();
  syncUrlState();
  updateResetViewControlVisibility();
}

function exitCompareGoal() {
  if (State.compareSelection && !State.currentSelection) {
    State.currentSelection = State.compareSelection;
    State.currentFeatures = State.compareSelection.allFeatures;
    State.currentPrimaryFeature = State.compareSelection.primaryFeature;
    State.compareSelection = null;
    State.compareModeArmed = false;
    clearCompareHighlight();
    if (State.currentSelection) {
      highlightASMGGrid([State.currentSelection.highlightFeature || State.currentSelection.primaryFeature]);
    }
  } else {
    State.compareSelection = null;
    State.compareModeArmed = false;
    clearCompareHighlight();
  }

  rerenderAnalysisPanels();
  syncUrlState();
  updateResetViewControlVisibility();
}

function closeDetailModals() {
  byId('holdingModal')?.classList.add('hidden');
  byId('rawDataModal')?.classList.add('hidden');
  byId('coverageModal')?.classList.add('hidden');
}

function togglePickerPanel(panelId) {
  const panel = byId(panelId);
  if (!panel) return;

  const isHidden = panel.classList.contains('hidden');
  closePickerPanels();
  panel.classList.toggle('hidden', !isHidden);
}

function closePickerPanels() {
  byId('holderSearchPanel')?.classList.add('hidden');
  byId('licenceTypePanel')?.classList.add('hidden');
}

function renderChipGroup(containerId, options, onClick, activeId) {
  const container = byId(containerId);
  if (!container) return;

  container.innerHTML = '';
  options.forEach((option) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `filter-chip${option.id === activeId ? ' active' : ''}`;
    chip.dataset.filterId = option.id;
    chip.textContent = option.label;
    chip.addEventListener('click', () => onClick(option.id));
    container.appendChild(chip);
  });
}

function renderCarrierFilterChips() {
  renderChipGroup('carrierFilterChips', getCarrierFilterOptions(), handleCarrierFilterClick, 'all');
}

function renderBandGroupFilterChips() {
  const availableIds = getAvailableBandGroupIds();
  const options = BAND_GROUP_OPTIONS.filter((option) => availableIds.includes(option.id));
  renderChipGroup('bandGroupFilterChips', options, handleBandGroupFilterClick, 'all');
}

function getCarrierFilterOptions() {
  const baseOptions = CARRIER_FILTER_OPTIONS.filter((option) => option.id !== 'selected-licence');
  const extraOptions = State.extraCarrierOptions.map((name) => ({
    id: encodeHolderFilterId(name),
    label: name
  }));

  if (State.activeLicenceHighlightNo) {
    baseOptions.push({ id: 'selected-licence', label: 'Selected Licence' });
  }

  return [...baseOptions, ...extraOptions];
}

function encodeHolderFilterId(name) {
  return `holder:${name}`;
}

function decodeHolderFilterId(id) {
  return id.startsWith('holder:') ? id.slice(7) : '';
}

function renderSpecificBandFilterChips() {
  const container = byId('specificBandFilterChips');
  if (!container) return;

  container.innerHTML = '';
  const availableBands = getAvailableSpecificBands();

  if (!availableBands.length) {
    return;
  }

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = 'filter-chip';
  allChip.dataset.bandId = 'all';
  allChip.textContent = 'All Bands';
  allChip.addEventListener('click', () => toggleAllSpecificBandFilters());
  container.appendChild(allChip);

  availableBands.forEach((band) => {
    const bandId = String(band.id);
    const wrapper = document.createElement('div');
    wrapper.className = 'band-chip';
    wrapper.dataset.bandId = bandId;

    const mainBtn = document.createElement('button');
    mainBtn.type = 'button';
    mainBtn.className = 'band-chip-main';
    mainBtn.dataset.bandId = bandId;
    mainBtn.textContent = band.name.replace('Band ', 'B');
    mainBtn.addEventListener('click', () => toggleSpecificBandFilter(bandId));

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'band-chip-menu-btn';
    menuBtn.dataset.bandId = bandId;
    menuBtn.setAttribute('aria-label', `Adjust total MHz held for ${band.name}`);
    menuBtn.textContent = '▾';
    menuBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleBandMhzDropdown(bandId);
    });

    wrapper.appendChild(mainBtn);
    wrapper.appendChild(menuBtn);
    container.appendChild(wrapper);
  });

  if (State.openBandMhzPanelId) {
    window.setTimeout(() => {
      reopenBandMhzDropdownIfAvailable();
    }, 0);
  }
}

function toggleBandMhzDropdown(bandId) {
  const wrapper = getBandChipWrapper(bandId);
  if (!wrapper) return;

  const isOpen = State.openBandMhzPanelId === String(bandId);
  closeBandMhzDropdowns();

  if (isOpen) return;

  const entry = getSearchBandRangeEntries().find((item) => String(item.band.id) === String(bandId));
  if (!entry) return;

  const menuBtn = wrapper.querySelector('.band-chip-menu-btn');
  if (!menuBtn) return;

  const panel = document.createElement('div');
  const rect = menuBtn.getBoundingClientRect();
  panel.className = 'band-chip-panel';
  panel.innerHTML = buildBandMhzPanelMarkup(entry);
  panel.addEventListener('click', (event) => event.stopPropagation());
  panel.style.top = `${Math.min(window.innerHeight - 20, rect.bottom + 8)}px`;
  panel.style.left = `${Math.max(16, Math.min(rect.left - 220 + rect.width, window.innerWidth - 296))}px`;
  document.body.appendChild(panel);
  wrapper.classList.add('is-open');
  State.openBandMhzPanelId = String(bandId);

  panel.querySelectorAll('input[type="range"][data-band-id]').forEach((input) => {
    input.addEventListener('input', handleBandMhzRangeInput);
    input.addEventListener('pointerdown', handleBandMhzRangePointerDown);
  });
}

function closeBandMhzDropdowns() {
  byId('specificBandFilterChips')?.querySelectorAll('.band-chip.is-open').forEach((wrapper) => {
    wrapper.classList.remove('is-open');
  });
  document.querySelectorAll('.band-chip-panel').forEach((panel) => panel.remove());
  State.openBandMhzPanelId = null;
}

function getBandChipWrapper(bandId) {
  return byId('specificBandFilterChips')?.querySelector(`.band-chip[data-band-id="${bandId}"]`) || null;
}

function reopenBandMhzDropdownIfAvailable() {
  const bandId = State.openBandMhzPanelId;
  if (!bandId) return;
  const wrapper = getBandChipWrapper(bandId);
  if (!wrapper) {
    State.openBandMhzPanelId = null;
    return;
  }

  const entry = getSearchBandRangeEntries().find((item) => String(item.band.id) === String(bandId));
  if (!entry) {
    State.openBandMhzPanelId = null;
    return;
  }

  const menuBtn = wrapper.querySelector('.band-chip-menu-btn');
  if (!menuBtn) return;

  closeBandMhzDropdowns();
  State.openBandMhzPanelId = String(bandId);
  const panel = document.createElement('div');
  const rect = menuBtn.getBoundingClientRect();
  panel.className = 'band-chip-panel';
  panel.innerHTML = buildBandMhzPanelMarkup(entry);
  panel.addEventListener('click', (event) => event.stopPropagation());
  panel.style.top = `${Math.min(window.innerHeight - 20, rect.bottom + 8)}px`;
  panel.style.left = `${Math.max(16, Math.min(rect.left - 220 + rect.width, window.innerWidth - 296))}px`;
  document.body.appendChild(panel);
  wrapper.classList.add('is-open');
  panel.querySelectorAll('input[type="range"][data-band-id]').forEach((input) => {
    input.addEventListener('input', handleBandMhzRangeInput);
    input.addEventListener('pointerdown', handleBandMhzRangePointerDown);
  });
}

function buildBandMhzPanelMarkup(entry) {
  const filterState = State.bandMhzFilters[String(entry.band.id)] || { min: entry.minMhz, max: entry.maxMhz };
  const rangeSpan = Math.max(entry.maxMhz - entry.minMhz, 0.0001);
  const fillLeft = ((filterState.min - entry.minMhz) / rangeSpan) * 100;
  const fillRight = ((entry.maxMhz - filterState.max) / rangeSpan) * 100;
  const step = 5;
  return `
    <div class="band-chip-panel-head">
      <div class="band-chip-panel-title">${entry.band.name}</div>
      <div class="band-chip-panel-meta">Min ${entry.minMhz.toFixed(1)} • Max ${entry.maxMhz.toFixed(1)} MHz</div>
    </div>
    <div class="legend-band-labels">
      <span>Available ${entry.minMhz.toFixed(1)} MHz</span>
      <span>${entry.maxMhz.toFixed(1)} MHz</span>
    </div>
    <div class="legend-band-controls">
      <label class="legend-band-control">
        <div class="legend-band-control-top">
          <span>Total MHz held</span>
          <span data-role="range-value">${filterState.min.toFixed(1)} to ${filterState.max.toFixed(1)} MHz</span>
        </div>
        <div class="dual-range">
          <div class="dual-range-track">
            <div class="dual-range-fill" data-role="range-fill" style="left:${fillLeft}%; right:${fillRight}%;"></div>
          </div>
          <input type="range" min="${entry.minMhz}" max="${entry.maxMhz}" step="${step}" value="${filterState.min}" data-band-id="${entry.band.id}" data-bound="min" />
          <input type="range" min="${entry.minMhz}" max="${entry.maxMhz}" step="${step}" value="${filterState.max}" data-band-id="${entry.band.id}" data-bound="max" />
        </div>
      </label>
    </div>
  `;
}

function handleCarrierFilterClick(filterId) {
  if (filterId === 'all') {
    toggleAllCarrierFilters();
    return;
  }
  toggleMultiSelectFilter(State.carrierFilters, filterId, getAvailableCarrierFilterIds());
  syncSearchBandsToCarrierAvailability();
  markSearchDirty();
  syncFilterControls({ skipAreaRefresh: true });
  syncUrlState();
}

function handleBandGroupFilterClick(filterId) {
  if (filterId === 'all') {
    toggleAllBandGroupFilters();
    return;
  }
  toggleMultiSelectFilter(State.bandGroupFilters, filterId, getAvailableBandGroupIds());
  renderSpecificBandFilterChips();
  syncSpecificBandFiltersToRanges();
  markSearchDirty();
  syncFilterControls({ skipAreaRefresh: true });
  syncUrlState();
}

function toggleSpecificBandFilter(bandId) {
  if (bandId === 'all') {
    toggleAllSpecificBandFilters();
    return;
  }
  toggleMultiSelectFilter(State.specificBandFilters, bandId, getAvailableSpecificBandIds());
  markSearchDirty();
  syncFilterControls({ skipAreaRefresh: true });
  syncUrlState();
}

function clearSpecificBandFilters() {
  State.specificBandFilters.clear();
  renderSpecificBandFilterChips();
  markSearchDirty();
  syncFilterControls({ skipAreaRefresh: true });
  syncUrlState();
}

function toggleAllCarrierFilters() {
  toggleAllFilterSet(State.carrierFilters, getAvailableCarrierFilterIds());
  syncSearchBandsToCarrierAvailability();
  markSearchDirty();
  syncFilterControls({ skipAreaRefresh: true });
  syncUrlState();
}

function toggleAllBandGroupFilters() {
  toggleAllFilterSet(State.bandGroupFilters, getAvailableBandGroupIds());
  renderSpecificBandFilterChips();
  syncSpecificBandFiltersToRanges();
  markSearchDirty();
  syncFilterControls({ skipAreaRefresh: true });
  syncUrlState();
}

function toggleAllSpecificBandFilters() {
  toggleAllFilterSet(State.specificBandFilters, getAvailableSpecificBandIds(), false);
  renderSpecificBandFilterChips();
  markSearchDirty();
  syncFilterControls({ skipAreaRefresh: true });
  syncUrlState();
}

function syncFilterControls(options = {}) {
  const { skipAreaRefresh = true } = options;
  normalizeFilterState();
  updateAnalysisToolbarVisibility();
  if (!skipAreaRefresh) {
    updateAreaSearchHighlightFromFilters();
  }
  renderCarrierFilterChips();
  renderBandGroupFilterChips();
  renderSpecificBandFilterChips();

  const availableCarrierIds = getAvailableCarrierFilterIds();
  const activeCarrierIds = getEffectiveSelectedIds(State.carrierFilters, availableCarrierIds);
  const hasCarrierSelection = hasCarrierSearchSelection();
  const availableBandGroupIds = getAvailableBandGroupIds();
  const availableBandIds = getAvailableSpecificBandIds();

  byId('carrierFilterChips')?.querySelectorAll('.filter-chip').forEach((chip) => {
    if (chip.dataset.filterId === 'all') {
      chip.classList.toggle('active', areAllFiltersSelected(State.carrierFilters, availableCarrierIds));
      chip.textContent = `All Carriers (${activeCarrierIds.size})`;
    } else {
      chip.classList.toggle('active', activeCarrierIds.has(chip.dataset.filterId));
    }
    if (chip.dataset.filterId === 'selected-licence') {
      chip.disabled = !State.activeLicenceHighlightNo;
    }
  });

  const activeBandGroupIds = getEffectiveSelectedIds(State.bandGroupFilters, availableBandGroupIds);
  byId('bandGroupFilterChips')?.querySelectorAll('.filter-chip').forEach((chip) => {
    const shouldDisable = !hasCarrierSelection;
    if (chip.dataset.filterId === 'all') {
      chip.classList.toggle('active', areAllFiltersSelected(State.bandGroupFilters, availableBandGroupIds));
      chip.textContent = `All Ranges (${activeBandGroupIds.size})`;
    } else {
      chip.classList.toggle('active', activeBandGroupIds.has(chip.dataset.filterId));
    }
    chip.disabled = shouldDisable;
  });

  const specificContainer = byId('specificBandFilterChips');
  if (specificContainer) {
    const activeSpecificBandIds = getEffectiveSelectedIds(State.specificBandFilters, availableBandIds);
    specificContainer.querySelectorAll('.filter-chip').forEach((chip) => {
      const shouldDisable = !hasCarrierSelection;
      if (chip.dataset.bandId === 'all') {
        chip.classList.toggle('active', areAllFiltersSelected(State.specificBandFilters, availableBandIds));
        chip.textContent = `All Bands (${activeSpecificBandIds.size})`;
        chip.disabled = shouldDisable;
        return;
      }
    });
    specificContainer.querySelectorAll('.band-chip').forEach((chip) => {
      const bandId = chip.dataset.bandId;
      const shouldDisable = !hasCarrierSelection || !availableBandIds.includes(bandId);
      chip.classList.toggle('active', activeSpecificBandIds.has(bandId));
      chip.querySelectorAll('button').forEach((button) => {
        button.disabled = shouldDisable;
      });
    });
  }

  updateSearchSectionVisibility(hasCarrierSelection);
  syncHolderSearchButton();
  syncLicenceTypeButton();
  if (!byId('licenceTypePanel')?.classList.contains('hidden')) {
    renderLicenceTypeOptions();
  }
  if (!byId('holderSearchPanel')?.classList.contains('hidden')) {
    renderHolderSearchOptions();
  }
  renderOverlayVisualSection();
}

function toggleMultiSelectFilter(targetSet, itemId, availableIds) {
  const validIds = availableIds.filter((id) => id !== 'all');
  if (!validIds.includes(itemId)) return;

  if (targetSet.has(itemId)) {
    targetSet.delete(itemId);
  } else {
    targetSet.add(itemId);
  }
}

function setFilterSetToAll(targetSet, availableIds, includeAllToken = true) {
  targetSet.clear();
  availableIds.forEach((id) => {
    if (!includeAllToken && id === 'all') return;
    if (id !== 'all') targetSet.add(id);
  });
}

function toggleAllFilterSet(targetSet, availableIds, includeAllToken = true) {
  if (areAllFiltersSelected(targetSet, availableIds)) {
    targetSet.clear();
    return;
  }

  setFilterSetToAll(targetSet, availableIds, includeAllToken);
}

function getEffectiveSelectedIds(targetSet, availableIds) {
  const validIds = new Set(availableIds.filter((id) => id !== 'all'));
  return new Set(Array.from(targetSet).filter((id) => validIds.has(id)));
}

function areAllFiltersSelected(targetSet, availableIds) {
  const validIds = availableIds.filter((id) => id !== 'all');
  return validIds.length > 0 && targetSet.size === validIds.length && validIds.every((id) => targetSet.has(id));
}

function normalizeFilterState() {
  normalizeCarrierFilters();
  normalizeBandGroupFilters();
  normalizeSpecificBandFilters();
  normalizeLicenceTypeFilters();
  syncBandMhzFilters();
}

function normalizeCarrierFilters() {
  const availableIds = getAvailableCarrierFilterIds().filter((id) => id !== 'all');
  if (!State.currentSelection?.allFeatures?.length && !hasCarrierSearchSelection()) {
    State.licenceTypeFilters.clear();
    State.extraCarrierOptions = [];
  }

  const invalid = Array.from(State.carrierFilters).filter((id) => !availableIds.includes(id));
  invalid.forEach((id) => State.carrierFilters.delete(id));
}

function normalizeBandGroupFilters() {
  const availableIds = getAvailableBandGroupIds().filter((id) => id !== 'all');
  Array.from(State.bandGroupFilters).forEach((id) => {
    if (!availableIds.includes(id)) State.bandGroupFilters.delete(id);
  });
}

function normalizeSpecificBandFilters() {
  const availableIds = getAvailableSpecificBandIds();
  Array.from(State.specificBandFilters).forEach((id) => {
    if (!availableIds.includes(id)) State.specificBandFilters.delete(id);
  });

  if (!availableIds.length) {
    State.specificBandFilters.clear();
    return;
  }
}

function syncBandMhzFilters() {
  const availableEntries = getSearchBandRangeEntries();
  const nextFilters = {};

  availableEntries.forEach((entry) => {
    const existing = State.bandMhzFilters[String(entry.band.id)] || {};
    const min = Number.isFinite(existing.min) ? clampValue(existing.min, entry.minMhz, entry.maxMhz) : entry.minMhz;
    const max = Number.isFinite(existing.max) ? clampValue(existing.max, entry.minMhz, entry.maxMhz) : entry.maxMhz;
    nextFilters[String(entry.band.id)] = {
      min: Math.min(min, max),
      max: Math.max(min, max)
    };
  });

  State.bandMhzFilters = nextFilters;
}

function normalizeLicenceTypeFilters() {
  const { values } = getLicenceTypeConfig();
  const available = new Set(values);
  Array.from(State.licenceTypeFilters).forEach((value) => {
    if (!available.has(value)) State.licenceTypeFilters.delete(value);
  });
}

function syncSpecificBandFiltersToRanges() {
  const availableIds = getAvailableSpecificBandIds();

  if (!availableIds.length) {
    State.specificBandFilters.clear();
    return;
  }

  setFilterSetToAll(State.specificBandFilters, availableIds, false);
}

function getAvailableCarrierFilterIds() {
  const ids = ['Telstra', 'Optus', 'Vodafone', 'NBN'];
  ids.push(...State.extraCarrierOptions.map((name) => encodeHolderFilterId(name)));
  if (State.activeLicenceHighlightNo) ids.push('selected-licence');
  return ['all', ...ids];
}

function getAvailableBandGroupIds() {
  const features = getBandAvailabilityContextFeatures();
  if (!features.length) return ['all'];

  const ids = new Set();
  features.forEach((feature) => {
    const band = resolveBandForFeature(feature);
    if (!band) return;
    if (matchesBandGroupId(band, 'low')) ids.add('low');
    if (matchesBandGroupId(band, 'mid')) ids.add('mid');
    if (matchesBandGroupId(band, 'mmwave')) ids.add('mmwave');
  });

  return ['all', ...BAND_GROUP_OPTIONS.filter((option) => option.id !== 'all' && ids.has(option.id)).map((option) => option.id)];
}

function getAvailableSpecificBands() {
  const contextFeatures = getBandAvailabilityContextFeatures();
  if (!contextFeatures.length) return [];
  const activeRangeIds = getEffectiveSelectedIds(State.bandGroupFilters, getAvailableBandGroupIds());
  const useAllRanges = State.bandGroupFilters.size === 0 || activeRangeIds.size === 0;

  const visibleBands = BANDS.filter((band) => useAllRanges || Array.from(activeRangeIds).some((rangeId) => matchesBandGroupId(band, rangeId)));
  if (!contextFeatures.length) return visibleBands;

  const visibleIds = new Set(
    contextFeatures
      .map((feature) => resolveBandForFeature(feature)?.id)
      .filter((id) => id != null)
      .map(String)
  );

  return visibleBands.filter((band) => visibleIds.has(String(band.id)));
}

function getAvailableSpecificBandIds() {
  return getAvailableSpecificBands().map((band) => String(band.id));
}

function getLoadedSourceFeatures() {
  return State.loadedSourceFeatures || [];
}

function getSearchCatalogFeatures() {
  return State.searchSeedFeatures?.length ? State.searchSeedFeatures : getLoadedSourceFeatures();
}

function invalidateSearchDerivedCaches() {
  State.searchBaseCacheKey = '';
  State.searchBaseCacheFeatures = [];
  State.searchAnnotatedCarrierCacheKey = '';
  State.searchAnnotatedCarrierCacheFeatures = [];
  State.searchBandRangeCacheKey = '';
  State.searchBandRangeCacheEntries = [];
}

function refreshLoadedSourceFeatureCache() {
  if (!State.map) return [];

  try {
    State.loadedSourceFeatures = State.map.querySourceFeatures(MAP_SOURCE_ID, {
      sourceLayer: MAP_SOURCE_LAYER
    });
  } catch (error) {
    State.loadedSourceFeatures = [];
  }

  const holderNames = new Set();
  const subServiceNames = new Set();
  State.loadedSourceFeatures.forEach((feature) => {
    const holderName = String(feature?.properties?.carrier_name || '').trim();
    if (holderName && resolveCarrier(holderName) === 'Other') {
      holderNames.add(holderName);
    }

    const subServiceName = String(feature?.properties?.sub_service_name || '').trim();
    if (subServiceName) {
      subServiceNames.add(subServiceName);
    }
  });

  State.loadedHolderNames = Array.from(holderNames).sort((a, b) => a.localeCompare(b));
  State.loadedSubServiceNames = Array.from(subServiceNames).sort((a, b) => a.localeCompare(b));

  return State.loadedSourceFeatures;
}

function refreshSearchSeedCache() {
  if (!State.searchSeedMap) return [];

  try {
    State.searchSeedFeatures = State.searchSeedMap.querySourceFeatures(MAP_SOURCE_ID, {
      sourceLayer: MAP_SOURCE_LAYER
    });
  } catch (error) {
    State.searchSeedFeatures = [];
  }

  const holderNames = new Set();
  const subServiceNames = new Set();
  State.searchSeedFeatures.forEach((feature) => {
    const holderName = String(feature?.properties?.carrier_name || '').trim();
    if (holderName && resolveCarrier(holderName) === 'Other') {
      holderNames.add(holderName);
    }

    const subServiceName = String(feature?.properties?.sub_service_name || '').trim();
    if (subServiceName) {
      subServiceNames.add(subServiceName);
    }
  });

  State.searchSeedHolderNames = Array.from(holderNames).sort((a, b) => a.localeCompare(b));
  State.searchSeedSubServiceNames = Array.from(subServiceNames).sort((a, b) => a.localeCompare(b));
  State.searchSeedRevision += 1;
  invalidateSearchDerivedCaches();
  return State.searchSeedFeatures;
}

function getLoadedHolderNames() {
  return State.searchSeedHolderNames?.length ? State.searchSeedHolderNames : (State.loadedHolderNames || []);
}

function getSelectedOtherHolderCount() {
  return Array.from(State.carrierFilters).filter((id) => id.startsWith('holder:')).length;
}

function syncHolderSearchButton() {
  const button = byId('holderSearchBtn');
  if (!button) return;

  const count = getSelectedOtherHolderCount();
  button.textContent = count > 0 ? `Other Holders (${count})` : 'Other Holders';
}

function renderHolderSearchOptions() {
  const container = byId('holderSearchOptions');
  if (!container) return;

  const query = (byId('holderSearchInput')?.value || '').trim().toLowerCase();
  const names = getLoadedHolderNames().filter((name) => !query || name.toLowerCase().includes(query));

  if (!names.length) {
    container.innerHTML = '<div class="picker-empty">No additional loaded holders found.</div>';
    return;
  }

  container.innerHTML = '';
  names.forEach((name) => {
    const id = encodeHolderFilterId(name);
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `picker-option${State.carrierFilters.has(id) ? ' active' : ''}`;
    option.textContent = name;
    option.addEventListener('click', () => {
      if (!State.extraCarrierOptions.includes(name)) {
        State.extraCarrierOptions.push(name);
      }
      toggleMultiSelectFilter(State.carrierFilters, id, getAvailableCarrierFilterIds());
      syncSearchBandsToCarrierAvailability();
      markSearchDirty();
      syncFilterControls({ skipAreaRefresh: true });
      syncUrlState();
    });
    container.appendChild(option);
  });
}

function getLicenceTypeConfig() {
  const key = 'sub_service_name';
  const values = State.searchSeedSubServiceNames?.length ? State.searchSeedSubServiceNames : (State.loadedSubServiceNames || []);
  return { key, values };
}

function renderLicenceTypeOptions() {
  const container = byId('licenceTypeOptions');
  if (!container) return;

  const { values } = getLicenceTypeConfig();
  if (!values.length) {
    container.innerHTML = '<div class="picker-empty">No loaded sub-service names found.</div>';
    return;
  }

  container.innerHTML = '';
  values.forEach((value) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `picker-option${State.licenceTypeFilters.has(value) ? ' active' : ''}`;
    option.textContent = value;
    option.addEventListener('click', () => {
      toggleMultiSelectFilter(State.licenceTypeFilters, value, values);
      syncSearchBandsToCarrierAvailability();
      markSearchDirty();
      syncFilterControls({ skipAreaRefresh: true });
      syncUrlState();
    });
    container.appendChild(option);
  });
}

function syncLicenceTypeButton() {
  const button = byId('licenceTypeBtn');
  if (!button) return;

  const { values } = getLicenceTypeConfig();
  button.disabled = !values.length;
  button.textContent = values.length
    ? (State.licenceTypeFilters.size ? `Sub-service Names (${State.licenceTypeFilters.size})` : 'All Sub-service Names')
    : 'No Sub-service Names';
}

function updateSearchSectionVisibility(hasCarrierSelection = hasCarrierSearchSelection()) {
  const goal = getCurrentGoalMode();
  const hideSearchSections = goal === 'inspect';

  byId('carrierFilterSection')?.classList.toggle('hidden', hideSearchSections);
  byId('bandGroupFilterSection')?.classList.toggle('hidden', hideSearchSections || !hasCarrierSelection);
  byId('specificBandFilterSection')?.classList.toggle('hidden', hideSearchSections || !hasCarrierSelection);
  byId('licenceTypeFilterSection')?.classList.toggle('hidden', hideSearchSections || !hasCarrierSelection);
  byId('overlayVisualSection')?.classList.toggle('hidden', hideSearchSections || (!State.activeLicenceHighlightNo && !State.activeAreaSearch && !hasCarrierSelection));
}

function syncSearchBandsToCarrierAvailability() {
  if (!hasCarrierSearchSelection()) {
    State.bandGroupFilters.clear();
    State.specificBandFilters.clear();
    State.bandMhzFilters = {};
    return;
  }

  setFilterSetToAll(State.bandGroupFilters, getAvailableBandGroupIds());
  setFilterSetToAll(State.specificBandFilters, getAvailableSpecificBandIds(), false);
  syncBandMhzFilters();
}

function hasCarrierSearchSelection() {
  const ids = getEffectiveSelectedIds(State.carrierFilters, getAvailableCarrierFilterIds());
  return Array.from(ids).some((id) => id !== 'selected-licence');
}

function markSearchDirty() {
  State.searchDirty = true;
}

function executeSearchFromFilters() {
  if (!State.searchSeedFeatures?.length) {
    refreshSearchSeedCache();
  }
  updateAreaSearchHighlightFromFilters();
  State.searchDirty = false;
  syncFilterControls({ skipAreaRefresh: true });
  rerenderAnalysisPanels();
  syncUrlState();
}

function buildSearchBaseCacheKey() {
  return [
    State.searchSeedRevision,
    Array.from(State.carrierFilters).sort().join('|'),
    Array.from(State.licenceTypeFilters).sort().join('|')
  ].join('::');
}

function buildSearchCriteria() {
  const availableCarrierIds = getAvailableCarrierFilterIds();
  const activeCarrierIds = getEffectiveSelectedIds(State.carrierFilters, availableCarrierIds);
  const licenceTypeConfig = getLicenceTypeConfig();

  return {
    activeCarrierIds,
    useAllCarriers: activeCarrierIds.size === 0 || areAllFiltersSelected(State.carrierFilters, availableCarrierIds),
    activeBandGroupIds: new Set(State.bandGroupFilters),
    useAllBandGroups: State.bandGroupFilters.size === 0,
    activeSpecificBandIds: new Set(State.specificBandFilters),
    useAllSpecificBands: State.specificBandFilters.size === 0,
    licenceTypeConfig,
    useAllLicenceTypes: State.licenceTypeFilters.size === 0
  };
}

function getSearchScopedBaseFeatures() {
  const cacheKey = buildSearchBaseCacheKey();
  if (State.searchBaseCacheKey === cacheKey) {
    return State.searchBaseCacheFeatures;
  }

  const criteria = buildSearchCriteria();
  State.searchBaseCacheKey = cacheKey;
  State.searchBaseCacheFeatures = getSearchCatalogFeatures().filter((feature) => featureMatchesSearchBase(feature, criteria));
  return State.searchBaseCacheFeatures;
}

function getCarrierScopedSearchFeatures() {
  return getSearchScopedBaseFeatures();
}

function getAnnotatedCarrierScopedSearchFeatures() {
  const cacheKey = buildSearchBaseCacheKey();
  if (State.searchAnnotatedCarrierCacheKey === cacheKey) {
    return State.searchAnnotatedCarrierCacheFeatures;
  }

  State.searchAnnotatedCarrierCacheKey = cacheKey;
  State.searchAnnotatedCarrierCacheFeatures = annotateOverlayCarrierGroups(getCarrierScopedSearchFeatures());
  return State.searchAnnotatedCarrierCacheFeatures;
}

function annotateOverlayCarrierGroups(features) {
  const groups = new Map();

  features.forEach((feature) => {
    const band = resolveBandForFeature(feature);
    if (!band) return;

    const groupKey = getOverlayCarrierBandAreaKey(feature, band);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        segments: [],
        rawTotals: []
      });
    }

    const group = groups.get(groupKey);
    const mhz = parseFloat(feature.properties?.total_mhz_held) || 0;
    if (mhz > 0) {
      group.rawTotals.push(mhz);
    }
    group.segments.push({
      start: parseFloat(feature.properties?.lw_start_mhz) || 0,
      end: parseFloat(feature.properties?.lw_end_mhz) || 0
    });
  });

  return features.map((feature) => {
    const band = resolveBandForFeature(feature);
    if (!band) return feature;

    const groupKey = getOverlayCarrierBandAreaKey(feature, band);
    const group = groups.get(groupKey);
    if (!group) return feature;
    const mergedSegmentTotalMhz = calculateMergedSegmentTotalMhz(group.segments);
    const fallbackTotalMhz = group.rawTotals.length ? Math.max(...group.rawTotals) : 0;
    const overlayTotalMhz = mergedSegmentTotalMhz > 0 ? mergedSegmentTotalMhz : fallbackTotalMhz;

    return {
      type: 'Feature',
      geometry: feature.geometry,
      properties: {
        ...(feature.properties || {}),
        overlay_group_key: groupKey,
        overlay_total_mhz: Number(overlayTotalMhz.toFixed(3)),
        overlay_striped: hasNonContiguousSegments(group.segments)
      }
    };
  });
}

function getOverlayCarrierBandAreaKey(feature, band = resolveBandForFeature(feature)) {
  const entityKey = getCarrierEntityKey(feature);
  const hcisId = String(feature?.properties?.hcis_id || '').trim();
  const areaKey = hcisId || geometryKey(feature.geometry || {});
  return `${entityKey}|${band?.id || 'unknown'}|${areaKey}`;
}

function hasNonContiguousSegments(segments) {
  const sorted = [...segments]
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end))
    .sort((a, b) => a.start - b.start);

  if (sorted.length <= 1) return false;

  for (let idx = 1; idx < sorted.length; idx += 1) {
    if (Math.abs(sorted[idx - 1].end - sorted[idx].start) > 0.01) {
      return true;
    }
  }

  return false;
}

function calculateMergedSegmentTotalMhz(segments) {
  const sorted = [...segments]
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start)
    .sort((a, b) => a.start - b.start);

  if (!sorted.length) return 0;

  const merged = [sorted[0]];

  for (let idx = 1; idx < sorted.length; idx += 1) {
    const current = sorted[idx];
    const last = merged[merged.length - 1];

    if (current.start <= last.end + 0.01) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
}

function getBandAvailabilityContextFeatures() {
  if (hasCarrierSearchSelection()) {
    return getSearchScopedBaseFeatures();
  }
  if (State.currentSelection?.allFeatures?.length) {
    return State.currentSelection.allFeatures;
  }
  return [];
}

function featureMatchesSearchBase(feature, criteria = buildSearchCriteria()) {
  const carrier = resolveCarrier(feature.properties?.carrier_name);
  const rawCarrier = String(feature.properties?.carrier_name || '').trim();
  const licenceTypeValue = criteria.licenceTypeConfig.key
    ? String(feature.properties?.[criteria.licenceTypeConfig.key] || '').trim()
    : '';

  if (!criteria.useAllCarriers && !criteria.activeCarrierIds.has(carrier) && !criteria.activeCarrierIds.has(encodeHolderFilterId(rawCarrier))) {
    return false;
  }

  if (!criteria.useAllLicenceTypes && !State.licenceTypeFilters.has(licenceTypeValue)) {
    return false;
  }

  return true;
}

function parseStateFromUrl() {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(hash);
  const centerParam = params.get('center');
  let center = null;

  if (centerParam) {
    const [lng, lat] = centerParam.split(',').map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      center = [lng, lat];
    }
  }

  return {
    center,
    zoom: params.get('zoom') && Number.isFinite(Number(params.get('zoom'))) ? Number(params.get('zoom')) : null,
    hcis: params.get('hcis') || null,
    compareHcis: params.get('compare_hcis') || null,
    licence: params.get('licence') || null,
    carrier: params.get('carrier') ? params.get('carrier').split(',').filter(Boolean) : [],
    bandGroup: params.get('band_group') ? params.get('band_group').split(',').filter(Boolean) : [],
    bands: params.get('bands') ? params.get('bands').split(',').filter(Boolean) : []
  };
}

function applyRestoredUiState(restoredState) {
  if (!restoredState) return;

  if (restoredState.carrier?.length) State.carrierFilters = new Set(restoredState.carrier);
  if (restoredState.bandGroup?.length) State.bandGroupFilters = new Set(restoredState.bandGroup);
  if (restoredState.licence) State.activeLicenceHighlightNo = restoredState.licence;
  if (restoredState.bands?.length) State.specificBandFilters = new Set(restoredState.bands);
  if (restoredState.hcis) State.pendingRestoredSelection = restoredState.hcis;
  if (restoredState.compareHcis) State.pendingRestoredCompareSelection = restoredState.compareHcis;

  syncFilterControls();
}

function syncUrlState() {
  if (!State.map) return;

  const params = new URLSearchParams();
  const center = State.map.getCenter();
  params.set('center', `${center.lng.toFixed(5)},${center.lat.toFixed(5)}`);
  params.set('zoom', State.map.getZoom().toFixed(2));

  if (State.currentSelection?.primaryFeature?.properties?.hcis_id) {
    params.set('hcis', String(State.currentSelection.primaryFeature.properties.hcis_id));
  }
  if (State.compareSelection?.primaryFeature?.properties?.hcis_id) {
    params.set('compare_hcis', String(State.compareSelection.primaryFeature.properties.hcis_id));
  }
  if (State.activeLicenceHighlightNo) {
    params.set('licence', String(State.activeLicenceHighlightNo));
  }
  if (State.carrierFilters.size) {
    params.set('carrier', Array.from(State.carrierFilters).join(','));
  }
  if (State.bandGroupFilters.size) {
    params.set('band_group', Array.from(State.bandGroupFilters).join(','));
  }
  if (State.specificBandFilters.size) {
    params.set('bands', Array.from(State.specificBandFilters).join(','));
  }

  const nextHash = params.toString();
  if (window.location.hash.slice(1) !== nextHash) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${nextHash}`);
  }
}

function bindLocateButton() {
  const btn = byId('locateBtn');
  if (!btn || State.locateBtnBound) return;

  State.locateBtnBound = true;
  btn.addEventListener('click', toggleGeolocation);
}

function restoreSelectionsFromUrl() {
  if (!State.map) return;

  const attemptRestore = (attempt = 0) => {
    if (State.pendingRestoredSelection) {
      const selection = findSelectionByHcis(State.pendingRestoredSelection);
      if (selection) {
        applySelection(selection);
        State.pendingRestoredSelection = null;
      }
    }

    if (State.pendingRestoredCompareSelection) {
      const compareSelection = findSelectionByHcis(State.pendingRestoredCompareSelection);
      if (compareSelection) {
        applyCompareSelection(compareSelection);
        State.pendingRestoredCompareSelection = null;
      }
    }

    if (State.activeLicenceHighlightNo) {
      refreshActiveLicenceHighlight();
    }

    if ((!State.pendingRestoredSelection && !State.pendingRestoredCompareSelection) || attempt >= 3) {
      syncUrlState();
      return;
    }

    window.setTimeout(() => attemptRestore(attempt + 1), 300);
  };

  attemptRestore();
}

function findSelectionByHcis(hcisId) {
  if (!State.map || !hcisId) return null;

  let sourceFeatures = [];
  try {
    sourceFeatures = State.map.querySourceFeatures(MAP_SOURCE_ID, {
      sourceLayer: MAP_SOURCE_LAYER
    });
  } catch (error) {
    return null;
  }

  const matching = sourceFeatures.filter((feature) => String(feature?.properties?.hcis_id || '') === String(hcisId));
  if (!matching.length) return null;

  const normalized = normalizeRenderedHoldings(matching);
  if (!normalized.length) return null;

  const ranked = rankContainingFeatures(normalized, safeFeatureCenter(normalized[0]));
  const primaryFeature = ranked[0];

  return {
    primaryFeature,
    highlightFeature: primaryFeature,
    allFeatures: ranked
  };
}

function safeFeatureCenter(feature) {
  try {
    const [lng, lat] = turf.centroid(feature).geometry.coordinates;
    return { lng, lat };
  } catch (error) {
    return { lng: DEFAULT_MAP_CENTER[0], lat: DEFAULT_MAP_CENTER[1] };
  }
}

// ============================================
// 5) MAP INITIALISATION
// ============================================

function initializeMap() {
  const restoredState = parseStateFromUrl();

  State.map = new maplibregl.Map({
    container: 'map',
    style: buildMapStyle(State.currentBasemap),
    center: restoredState.center || DEFAULT_MAP_CENTER,
    zoom: restoredState.zoom ?? DEFAULT_MAP_ZOOM
  });

  State.map.on('load', () => {
    lockMapToNorth(State.map);
    refreshLoadedSourceFeatureCache();
    initializeSearchSeedMap();
    applyRestoredUiState(restoredState);
    addHighlightLayers();
    addLicenceHighlightControl();
    addMapActionToolbar();
    addResetViewControl();
    addMeasurementControl();
    addZoomLevelControl();
    attachAutoFollowDisableHandlers();
    attachMapInteractionHandlers();
    State.map.on('moveend', syncUrlState);
    State.map.on('zoomend', syncUrlState);

    State.map.addControl(new maplibregl.ScaleControl({ maxWidth: 100 }), 'bottom-left');

    showToast('Click spectrum area to analyze', 'info');
    restoreSelectionsFromUrl();
  });
}

function initializeSearchSeedMap() {
  const host = byId('searchSeedMapHost');
  if (!host || State.searchSeedMap) return;

  State.searchSeedMap = new maplibregl.Map({
    container: host,
    style: buildMapStyle(State.currentBasemap),
    center: DEFAULT_MAP_CENTER,
    zoom: SEARCH_SEED_ZOOM,
    interactive: false,
    attributionControl: false
  });

  State.searchSeedMap.on('load', () => {
    // The hidden search map is only here to load a stable national catalogue for search.
    // Fit Australia explicitly so metro holdings are not missed by a tiny default viewport.
    State.searchSeedMap.fitBounds(AUSTRALIA_BOUNDS, {
      padding: 24,
      duration: 0
    });
    refreshSearchSeedCache();
  });
  State.searchSeedMap.on('idle', () => {
    refreshSearchSeedCache();
    syncFilterControls({ skipAreaRefresh: true });
  });
}

function lockMapToNorth(map) {
  if (!map) return;

  try {
    map.dragRotate?.disable();
    map.touchZoomRotate?.disableRotation();
    map.keyboard?.disableRotation();
    map.setBearing(0);
    map.setPitch(0);
  } catch (error) {
    console.warn('Unable to fully lock map orientation', error);
  }
}

function buildMapStyle(basemap) {
  const baseMapUrl = basemap === 'dark'
    ? 'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png'
    : 'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png';

  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: [baseMapUrl],
        tileSize: 256,
        attribution: '© CartoDB'
      },
      [MAP_SOURCE_ID]: {
        type: 'vector',
        tiles: ['https://robingill1.github.io/mobilespectrummap/mobile_spectrum_layer_VT/output_pbf_folder/{z}/{x}/{y}.pbf'],
        minzoom: 0,
        maxzoom: 14
      }
    },
    layers: [
      { id: 'basemap', type: 'raster', source: 'basemap' },
      {
        id: MAP_LAYER_ID,
        type: 'fill',
        source: MAP_SOURCE_ID,
        'source-layer': MAP_SOURCE_LAYER,
        paint: {
          'fill-color': '#0052cc',
          'fill-opacity': 0.01
        },
        minzoom: 3
      },
      {
        id: MAP_LINE_LAYER_ID,
        type: 'line',
        source: MAP_SOURCE_ID,
        'source-layer': MAP_SOURCE_LAYER,
        paint: {
          'line-color': '#ffffff',
          'line-width': 0.5,
          'line-opacity': 0.03
        },
        minzoom: 3
      }
    ]
  };
}

function addHighlightLayers() {
  if (!State.map) return;
  ensureOverlayPatternImages();

  if (!State.map.getSource(HIGHLIGHT_SOURCE_ID)) {
    State.map.addSource(HIGHLIGHT_SOURCE_ID, {
      type: 'geojson',
      data: emptyFeatureCollection()
    });
  }

  if (!State.map.getLayer(HIGHLIGHT_FILL_LAYER_ID)) {
    State.map.addLayer({
      id: HIGHLIGHT_FILL_LAYER_ID,
      type: 'fill',
      source: HIGHLIGHT_SOURCE_ID,
      paint: {
        'fill-color': '#ffcc00',
        'fill-opacity': 0.08
      }
    });
  }

  if (!State.map.getLayer(HIGHLIGHT_OUTLINE_LAYER_ID)) {
    State.map.addLayer({
      id: HIGHLIGHT_OUTLINE_LAYER_ID,
      type: 'line',
      source: HIGHLIGHT_SOURCE_ID,
      paint: {
        'line-color': '#ff9900',
        'line-width': 3,
        'line-opacity': 1
      }
    });
  }

  if (!State.map.getSource(COMPARE_HIGHLIGHT_SOURCE_ID)) {
    State.map.addSource(COMPARE_HIGHLIGHT_SOURCE_ID, {
      type: 'geojson',
      data: emptyFeatureCollection()
    });
  }

  if (!State.map.getLayer(COMPARE_HIGHLIGHT_FILL_LAYER_ID)) {
    State.map.addLayer({
      id: COMPARE_HIGHLIGHT_FILL_LAYER_ID,
      type: 'fill',
      source: COMPARE_HIGHLIGHT_SOURCE_ID,
      paint: {
        'fill-color': '#a855f7',
        'fill-opacity': 0.12
      }
    });
  }

  if (!State.map.getLayer(COMPARE_HIGHLIGHT_OUTLINE_LAYER_ID)) {
    State.map.addLayer({
      id: COMPARE_HIGHLIGHT_OUTLINE_LAYER_ID,
      type: 'line',
      source: COMPARE_HIGHLIGHT_SOURCE_ID,
      paint: {
        'line-color': '#9333ea',
        'line-width': 3,
        'line-opacity': 1
      }
    });
  }

  if (!State.map.getSource(LICENCE_HIGHLIGHT_SOURCE_ID)) {
    State.map.addSource(LICENCE_HIGHLIGHT_SOURCE_ID, {
      type: 'geojson',
      data: emptyFeatureCollection()
    });
  }

  if (!State.map.getSource(LICENCE_HIGHLIGHT_OUTLINE_SOURCE_ID)) {
    State.map.addSource(LICENCE_HIGHLIGHT_OUTLINE_SOURCE_ID, {
      type: 'geojson',
      data: emptyFeatureCollection()
    });
  }

  if (!State.map.getLayer(LICENCE_HIGHLIGHT_FILL_LAYER_ID)) {
    State.map.addLayer({
      id: LICENCE_HIGHLIGHT_FILL_LAYER_ID,
      type: 'fill',
      source: LICENCE_HIGHLIGHT_SOURCE_ID,
      paint: {
        'fill-color': '#15a34a',
        'fill-opacity': ['coalesce', ['get', 'highlight_opacity'], 0.18]
      }
    });
  }

  if (!State.map.getLayer(LICENCE_HIGHLIGHT_STRIPE_LAYER_ID)) {
    State.map.addLayer({
      id: LICENCE_HIGHLIGHT_STRIPE_LAYER_ID,
      type: 'fill',
      source: LICENCE_HIGHLIGHT_SOURCE_ID,
      filter: ['==', ['coalesce', ['get', 'overlay_striped'], false], true],
      paint: {
        'fill-pattern': 'overlay-stripe-green',
        'fill-opacity': ['*', State.overlayOpacityMultiplier, 0.45]
      }
    });
  }

  if (!State.map.getLayer(LICENCE_HIGHLIGHT_OUTLINE_LAYER_ID)) {
    State.map.addLayer({
      id: LICENCE_HIGHLIGHT_OUTLINE_LAYER_ID,
      type: 'line',
      source: LICENCE_HIGHLIGHT_OUTLINE_SOURCE_ID,
      paint: {
        'line-color': '#15803d',
        'line-width': 2,
        'line-opacity': 0.95
      }
    });
  }

  if (!State.map.getSource(MEASURE_SOURCE_ID)) {
    State.map.addSource(MEASURE_SOURCE_ID, {
      type: 'geojson',
      data: emptyFeatureCollection()
    });
  }

  if (!State.map.getLayer(MEASURE_LINE_LAYER_ID)) {
    State.map.addLayer({
      id: MEASURE_LINE_LAYER_ID,
      type: 'line',
      source: MEASURE_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': '#f97316',
        'line-width': 3,
        'line-dasharray': [2, 2]
      }
    });
  }

  if (!State.map.getLayer(MEASURE_POINT_LAYER_ID)) {
    State.map.addLayer({
      id: MEASURE_POINT_LAYER_ID,
      type: 'circle',
      source: MEASURE_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 5,
        'circle-color': '#f97316',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
      }
    });
  }

  // Keep the highlight above the spectrum lines so the selected boundary stays crisp.
  try {
    State.map.moveLayer(MEASURE_LINE_LAYER_ID);
    State.map.moveLayer(MEASURE_POINT_LAYER_ID);
    State.map.moveLayer(LICENCE_HIGHLIGHT_FILL_LAYER_ID);
    State.map.moveLayer(LICENCE_HIGHLIGHT_STRIPE_LAYER_ID);
    State.map.moveLayer(LICENCE_HIGHLIGHT_OUTLINE_LAYER_ID);
    State.map.moveLayer(COMPARE_HIGHLIGHT_FILL_LAYER_ID);
    State.map.moveLayer(COMPARE_HIGHLIGHT_OUTLINE_LAYER_ID);
    State.map.moveLayer(HIGHLIGHT_FILL_LAYER_ID);
    State.map.moveLayer(HIGHLIGHT_OUTLINE_LAYER_ID);
  } catch (error) {
    console.warn('Unable to reorder highlight layers', error);
  }

  applyOverlayStyle();
}

function attachMapInteractionHandlers() {
  if (!State.map) return;

  State.map.on('click', handleMapClick);
  State.map.on('zoom', updateZoomLevelControl);
  State.map.on('idle', () => {
    refreshLoadedSourceFeatureCache();
    refreshActiveLicenceHighlight();
  });

  State.map.on('mouseenter', MAP_LAYER_ID, () => {
    State.map.getCanvas().style.cursor = 'pointer';
  });

  State.map.on('mouseleave', MAP_LAYER_ID, () => {
    State.map.getCanvas().style.cursor = '';
  });
}

function addMapActionToolbar() {
  const mapContainer = State.map?.getContainer();
  if (!mapContainer || byId('mapActionToolbar')) return;

  const toolbar = document.createElement('div');
  toolbar.id = 'mapActionToolbar';
  toolbar.className = 'map-action-toolbar';
  mapContainer.appendChild(toolbar);
}

function addMeasurementControl() {
  const toolbar = byId('mapActionToolbar');
  if (!toolbar || byId('measureToolBtn')) return;

  const button = document.createElement('button');
  button.id = 'measureToolBtn';
  button.type = 'button';
  button.className = 'map-overlay-button';
  button.innerHTML = '<span class="button-icon" aria-hidden="true">📏</span><span class="button-label">Measure</span>';
  button.setAttribute('aria-label', 'Measure');
  button.addEventListener('click', toggleMeasurementMode);

  const readout = document.createElement('div');
  readout.id = 'measureReadout';
  readout.className = 'measure-readout hidden';

  toolbar.appendChild(button);
  State.map?.getContainer()?.appendChild(readout);
  updateMeasurementUi();
}

function addResetViewControl() {
  const toolbar = byId('mapActionToolbar');
  if (!toolbar || byId('resetViewBtn')) return;

  const container = document.createElement('div');
  container.id = 'resetMenuContainer';
  container.className = 'reset-menu-container hidden';

  const button = document.createElement('button');
  button.id = 'resetViewBtn';
  button.type = 'button';
  button.className = 'map-overlay-button';
  button.innerHTML = '<span class="button-icon" aria-hidden="true">↺</span><span class="button-label">Reset</span>';
  button.setAttribute('aria-label', 'Reset view');
  button.addEventListener('click', toggleResetMenu);

  const menu = document.createElement('div');
  menu.id = 'resetMenu';
  menu.className = 'reset-menu hidden';

  container.appendChild(menu);
  container.appendChild(button);
  toolbar.appendChild(container);
  updateResetViewControlVisibility();
}

function hasResettableMapState() {
  return Boolean(
    State.currentSelection
    || State.compareSelection
    || State.activeLicenceHighlightNo
    || State.activeAreaSearch
    || State.measurementActive
    || State.measurementPoints.length
    || State.geoTracking
  );
}

function updateResetViewControlVisibility() {
  const container = byId('resetMenuContainer');
  if (!container) return;

  const isVisible = hasResettableMapState();
  container.classList.toggle('hidden', !isVisible);
  updateResetMenuOptions();

  if (!isVisible) {
    closeResetMenu();
  }
}

function updateResetMenuOptions() {
  const menu = byId('resetMenu');
  if (!menu) return;

  const actions = [];
  if (State.compareSelection) {
    actions.push({ label: 'Reset Compare', action: clearCompareSelection });
  }
  if (State.activeLicenceHighlightNo || State.activeAreaSearch) {
    actions.push({ label: 'Reset Licence Area', action: clearLicenceHighlight });
  }
  if (hasResettableMapState()) {
    actions.push({ label: 'Reset All', action: resetMapViewAndOverlays });
  }

  menu.innerHTML = '';
  actions.forEach(({ label, action }) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'reset-menu-item';
    item.textContent = label;
    item.addEventListener('click', () => {
      action();
      closeResetMenu();
    });
    menu.appendChild(item);
  });
}

function toggleResetMenu(event) {
  event?.stopPropagation();
  const menu = byId('resetMenu');
  if (!menu) return;

  updateResetMenuOptions();
  menu.classList.toggle('hidden');
}

function closeResetMenu() {
  byId('resetMenu')?.classList.add('hidden');
}

function resetMapViewAndOverlays() {
  closeResetMenu();
  closePickerPanels();
  if (State.geoTracking) {
    stopGeolocation();
  } else {
    clearMapSelection();
  }

  State.extraCarrierOptions = [];
  State.licenceTypeFilters.clear();
  State.carrierFilters.clear();
  State.bandGroupFilters.clear();
  State.specificBandFilters.clear();
  State.bandMhzFilters = {};
  State.searchDirty = false;
  clearLicenceHighlight();
  State.compareModeArmed = false;
  State.measurementActive = false;
  State.measurementPoints = [];
  updateMeasurementOverlay();
  updateMeasurementUi();
  refreshLoadedSourceFeatureCache();

  State.map?.flyTo({
    center: DEFAULT_MAP_CENTER,
    zoom: DEFAULT_MAP_ZOOM,
    duration: 900
  });

  syncFilterControls();
  syncUrlState();
  updateResetViewControlVisibility();
}

function addZoomLevelControl() {
  const toolbar = byId('mapActionToolbar');
  if (!toolbar || byId('zoomLevelControl')) return;

  const control = document.createElement('div');
  control.id = 'zoomLevelControl';
  control.className = 'map-zoom-control';
  control.innerHTML = `
    <button type="button" class="map-zoom-button" data-zoom-step="-1" aria-label="Zoom out">−</button>
    <div class="map-zoom-value" aria-live="polite">4</div>
    <button type="button" class="map-zoom-button" data-zoom-step="1" aria-label="Zoom in">+</button>
  `;

  control.querySelectorAll('.map-zoom-button').forEach((button) => {
    button.addEventListener('click', () => {
      stepMapZoom(Number(button.dataset.zoomStep || '0'));
    });
  });

  toolbar.appendChild(control);
  updateZoomLevelControl();
}

function stepMapZoom(delta) {
  if (!State.map || !delta) return;

  const currentZoom = State.map.getZoom();
  const roundedZoom = Math.round(currentZoom);
  const targetZoom = delta > 0
    ? Math.min(Math.ceil(currentZoom), roundedZoom) + 1
    : Math.max(Math.floor(currentZoom), roundedZoom) - 1;

  State.map.easeTo({
    zoom: Math.max(0, Math.min(22, targetZoom)),
    duration: 180
  });
}

function addLicenceHighlightControl() {
  updateLicenceHighlightControlVisibility();
}

function ensureOverlayPatternImages() {
  if (!State.map) return;

  Object.entries(OVERLAY_PALETTES).forEach(([name, palette]) => {
    const imageId = `overlay-stripe-${name}`;
    if (State.map.hasImage(imageId)) return;
    State.map.addImage(imageId, buildStripePatternImage(palette.outlineColor), { pixelRatio: 2 });
  });
}

function buildStripePatternImage(color) {
  const size = 20;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.55;

  ctx.beginPath();
  ctx.moveTo(-4, size);
  ctx.lineTo(size, -4);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-4, size * 0.25);
  ctx.lineTo(size * 0.25, -4);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(size * 0.75, size + 4);
  ctx.lineTo(size + 4, size * 0.75);
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

function applyOverlayStyle() {
  if (!State.map) return;
  const palette = OVERLAY_PALETTES[State.overlayPalette] || OVERLAY_PALETTES.green;

  if (State.map.getLayer(LICENCE_HIGHLIGHT_FILL_LAYER_ID)) {
    State.map.setPaintProperty(LICENCE_HIGHLIGHT_FILL_LAYER_ID, 'fill-color', palette.fillColor);
    State.map.setPaintProperty(
      LICENCE_HIGHLIGHT_FILL_LAYER_ID,
      'fill-opacity',
      ['*', State.overlayOpacityMultiplier, ['coalesce', ['get', 'highlight_opacity'], 0.18]]
    );
  }

  if (State.map.getLayer(LICENCE_HIGHLIGHT_OUTLINE_LAYER_ID)) {
    State.map.setPaintProperty(LICENCE_HIGHLIGHT_OUTLINE_LAYER_ID, 'line-color', palette.outlineColor);
  }

  if (State.map.getLayer(LICENCE_HIGHLIGHT_STRIPE_LAYER_ID)) {
    State.map.setPaintProperty(LICENCE_HIGHLIGHT_STRIPE_LAYER_ID, 'fill-pattern', `overlay-stripe-${State.overlayPalette}`);
    State.map.setPaintProperty(LICENCE_HIGHLIGHT_STRIPE_LAYER_ID, 'fill-opacity', Math.max(0.14, State.overlayOpacityMultiplier * 0.45));
  }
}

function updateLicenceHighlightControlVisibility() {
  updateResetViewControlVisibility();
}

function updateZoomLevelControl() {
  const control = byId('zoomLevelControl');
  if (!control || !State.map) return;

  const value = control.querySelector('.map-zoom-value');
  if (value) {
    value.textContent = String(Math.round(State.map.getZoom()));
  }
}

// ============================================
// 6) GEOLOCATION
// ============================================

function toggleGeolocation() {
  if (State.geoTracking) {
    stopGeolocation();
  } else {
    startGeolocation();
  }
}

function startGeolocation() {
  if (!navigator.geolocation) {
    showToast('Geolocation not supported', 'error');
    return;
  }

  State.geoTracking = true;
  State.autoFollow = true;
  State.hasCenteredOnce = false;
  setLocateButtonState(true);
  updateResetViewControlVisibility();

  State.geoWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const lng = position.coords.longitude;
      const lat = position.coords.latitude;

      updateLocationMarker(lng, lat);
      updateLocationGridInfo(lng, lat, { waitForMapIdle: State.isFlying || !State.hasCenteredOnce });
    },
    (error) => {
      console.error('geolocation error', error);
      showToast('Unable to get location', 'error');
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
  );

  showToast('Live location tracking enabled', 'success');
}

function stopGeolocation() {
  State.geoTracking = false;
  State.autoFollow = false;
  State.hasCenteredOnce = false;
  State.isFlying = false;
  State.pendingSelectionToken += 1;

  if (State.geoWatchId !== null) {
    try {
      navigator.geolocation.clearWatch(State.geoWatchId);
    } catch (error) {
      console.warn('clearWatch failed', error);
    }
    State.geoWatchId = null;
  }

  if (State.locationMarker) {
    try {
      State.locationMarker.remove();
    } catch (error) {
      console.warn('marker removal failed', error);
    }
    State.locationMarker = null;
  }

  setLocateButtonState(false);
  clearMapSelection();
  showToast('Live location tracking disabled', 'info');
}

function updateLocationMarker(lng, lat) {
  if (!State.map) return;

  if (!State.locationMarker) {
    const el = document.createElement('div');
    el.className = 'pulse-marker';

    State.locationMarker = new maplibregl.Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(State.map);
  } else {
    State.locationMarker.setLngLat([lng, lat]);
  }

  if (State.autoFollow && !State.hasCenteredOnce) {
    centerMapOnLocation(lng, lat);
    return;
  }

  if (!State.autoFollow || State.isFlying) return;
  if (Date.now() - State.lastFollowTime < State.minFollowIntervalMs) return;

  State.lastFollowTime = Date.now();
  State.map.easeTo({ center: [lng, lat], duration: 800 });
}

function centerMapOnLocation(lng, lat) {
  if (!State.map || State.isFlying) return;

  State.isFlying = true;

  const handleMoveEnd = () => {
    State.hasCenteredOnce = true;
    State.isFlying = false;
    State.map.off('moveend', handleMoveEnd);
    queueSelectionWhenMapSettles({ lng, lat });
  };

  State.map.once('moveend', handleMoveEnd);
  State.map.flyTo({
    center: [lng, lat],
    zoom: FOLLOW_ZOOM,
    speed: 1.2,
    curve: 1.4,
    essential: true,
    duration: 1000
  });
}

function recenterToLocation() {
  if (!State.locationMarker || !State.map) return;

  const lngLat = State.locationMarker.getLngLat();
  State.autoFollow = true;
  State.pendingSelectionToken += 1;
  State.map.once('moveend', () => {
    queueSelectionWhenMapSettles({ lng: lngLat.lng, lat: lngLat.lat });
  });
  State.map.flyTo({
    center: [lngLat.lng, lngLat.lat],
    zoom: FOLLOW_ZOOM,
    duration: 800
  });
}

function attachAutoFollowDisableHandlers() {
  if (!State.map || State.autoFollowHandlersAttached) return;

  State.autoFollowHandlersAttached = true;

  const disableAutoFollow = () => {
    if (!State.autoFollow) return;
    State.autoFollow = false;
    showToast('Auto follow disabled', 'info');
  };

  State.map.on('dragstart', disableAutoFollow);
  State.map.on('wheel', disableAutoFollow);
  State.map.on('pitchstart', disableAutoFollow);
}

function updateLocationGridInfo(lng, lat, options = {}) {
  if (options.waitForMapIdle) {
    queueSelectionWhenMapSettles({ lng, lat });
    return;
  }

  const selection = selectSpectrumAtLngLat({ lng, lat });
  if (!selection) return;

  applySelection(selection);
}

function queueSelectionWhenMapSettles(lngLat) {
  if (!State.map) return;

  const token = ++State.pendingSelectionToken;
  const runSelection = (attempt = 0) => {
    if (token !== State.pendingSelectionToken) return;
    const selection = selectSpectrumAtLngLat(lngLat);
    if (!selection) {
      if (attempt < 3) {
        window.setTimeout(() => runSelection(attempt + 1), 250);
      }
      return;
    }
    applySelection(selection);
  };

  if (!State.map.isMoving() && State.map.areTilesLoaded()) {
    runSelection();
    return;
  }

  const handleIdle = () => {
    State.map.off('idle', handleIdle);
    runSelection();
  };

  State.map.on('idle', handleIdle);
}

// ============================================
// 7) PRECISE ASMG GRID SELECTION
// ============================================

function handleMapClick(event) {
  if (State.measurementActive) {
    handleMeasurementClick(event.lngLat);
    return;
  }

  const selection = selectSpectrumAtLngLat(event.lngLat);

  if (!selection) {
    if (!State.compareModeArmed) {
      clearMapSelection();
    }
    return;
  }

  if (State.compareModeArmed && State.compareSelection && !State.currentSelection) {
    State.compareModeArmed = false;
    applySelection(selection);
    showToast('Comparison ready', 'success');
    return;
  }

  if (State.compareModeArmed && State.currentSelection) {
    applyCompareSelection(selection);
    return;
  }

  applySelection(selection);
}

function applySelection(selection) {
  State.currentSelection = selection;
  State.currentFeatures = selection.allFeatures;
  State.currentPrimaryFeature = selection.primaryFeature;

  highlightASMGGrid([selection.highlightFeature || selection.primaryFeature]);
  if (State.compareSelection) {
    highlightCompareGrid([State.compareSelection.highlightFeature || State.compareSelection.primaryFeature]);
  } else {
    clearCompareHighlight();
  }
  rerenderAnalysisPanels();
  syncUrlState();
  updateResetViewControlVisibility();
}

function applyCompareSelection(selection) {
  State.compareSelection = selection;
  State.compareModeArmed = false;
  highlightCompareGrid([selection.highlightFeature || selection.primaryFeature]);
  syncFilterControls();
  rerenderAnalysisPanels();
  syncUrlState();
  updateResetViewControlVisibility();
}

function clearMapSelection() {
  State.currentSelection = null;
  State.compareSelection = null;
  State.compareModeArmed = false;
  State.currentFeatures = [];
  State.currentPrimaryFeature = null;
  clearHighlight();
  clearCompareHighlight();
  clearSidePanel();
  syncFilterControls();
  syncUrlState();
  updateResetViewControlVisibility();
}

function toggleMeasurementMode() {
  State.measurementActive = !State.measurementActive;
  if (!State.measurementActive) {
    State.measurementPoints = [];
    updateMeasurementOverlay();
  }
  updateMeasurementUi();
  updateResetViewControlVisibility();
}

function handleMeasurementClick(lngLat) {
  if (State.measurementPoints.length >= 2) {
    State.measurementPoints = [];
  }

  State.measurementPoints.push([lngLat.lng, lngLat.lat]);
  updateMeasurementOverlay();
  updateMeasurementUi();
  updateResetViewControlVisibility();
}

function updateMeasurementOverlay() {
  const features = State.measurementPoints.map((coordinates) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties: {}
  }));

  if (State.measurementPoints.length === 2) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: State.measurementPoints
      },
      properties: {}
    });
  }

  setGeoJsonSourceData(MEASURE_SOURCE_ID, features);
}

function updateMeasurementUi() {
  const button = byId('measureToolBtn');
  const readout = byId('measureReadout');
  if (button) {
    button.classList.toggle('active', State.measurementActive);
    const label = button.querySelector('.button-label');
    if (label) {
      label.textContent = State.measurementActive ? 'Exit' : 'Measure';
    }
    button.setAttribute('aria-label', State.measurementActive ? 'Exit measure tool' : 'Measure');
  }

  if (!readout) return;
  if (!State.measurementActive) {
    readout.classList.add('hidden');
    readout.textContent = '';
    return;
  }

  readout.classList.remove('hidden');

  if (State.measurementPoints.length < 2) {
    readout.textContent = State.measurementPoints.length === 1
      ? 'Tap a second point to measure distance.'
      : 'Tap two points on the map to measure distance.';
    return;
  }

  const distanceKm = turf.distance(
    turf.point(State.measurementPoints[0]),
    turf.point(State.measurementPoints[1]),
    { units: 'kilometers' }
  );
  const distanceM = distanceKm * 1000;
  readout.innerHTML = `
    <strong>Distance</strong><br />
    ${distanceKm.toFixed(2)} km<br />
    ${distanceM.toFixed(0)} m
  `;
}

function selectSpectrumAtLngLat(lngLat) {
  if (!State.map) return null;

  const candidates = queryContainingFeatures(lngLat);
  if (!candidates.length) return null;

  const sorted = rankContainingFeatures(candidates, lngLat);
  const primaryFeature = sorted[0];
  const highlightFeature = buildStableHighlightFeature(primaryFeature, lngLat);

  return {
    primaryFeature,
    highlightFeature,
    allFeatures: sorted
  };
}

function queryContainingFeatures(lngLat) {
  const seedFeatures = querySeedFeaturesAtLngLat(lngLat);
  if (!seedFeatures.length) return [];

  const renderedHoldings = normalizeRenderedHoldings(seedFeatures);
  if (!renderedHoldings.length) return [];

  return renderedHoldings.filter((feature) => pointIsInsideFeature(lngLat, feature));
}

function querySeedFeaturesAtLngLat(lngLat) {
  const exactPointHits = State.map.queryRenderedFeatures(State.map.project(lngLat), {
    layers: [MAP_LAYER_ID]
  });

  if (exactPointHits.length) {
    return exactPointHits;
  }

  const seedFeatures = [];
  for (const bbox of buildHitTestBBoxes(lngLat)) {
    seedFeatures.push(...State.map.queryRenderedFeatures(bbox, { layers: [MAP_LAYER_ID] }));
  }

  return seedFeatures;
}

function buildHitTestBBoxes(lngLat) {
  const point = State.map.project(lngLat);
  const dpr = window.devicePixelRatio || 1;
  const zoom = State.map.getZoom();

  // Keep high zoom hit testing tighter, because overzoomed vector tile fragments
  // start to create false positives once the search radius gets too large.
  const radiiByZoom = zoom >= 12
    ? [0.5, 1, 1.5]
    : [1, 2, 3];
  const radii = radiiByZoom
    .map((radius) => Math.max(1, Math.round(radius * dpr)));

  return radii.map((radius) => ([
    [point.x - radius, point.y - radius],
    [point.x + radius, point.y + radius]
  ]));
}

function normalizeRenderedHoldings(features) {
  if (!Array.isArray(features) || !features.length) return [];

  const seen = new Set();
  const normalized = [];

  for (const feature of features) {
    if (!feature || !feature.geometry || !feature.properties) continue;

    const holdingKey = `${getHoldingKey(feature.properties)}|${geometryKey(feature.geometry)}`;
    if (seen.has(holdingKey)) continue;

    seen.add(holdingKey);
    normalized.push({
      type: 'Feature',
      geometry: feature.geometry,
      properties: { ...feature.properties }
    });
  }

  return normalized;
}

function getHoldingKey(properties) {
  return [
    properties.hcis_id || '',
    properties.licence_no || '',
    properties.carrier_name || '',
    properties.lw_start_mhz || '',
    properties.lw_end_mhz || '',
    properties.up_start_mhz || '',
    properties.up_end_mhz || ''
  ].join('|');
}

function geometryKey(geometry) {
  return JSON.stringify(geometry);
}

function pointIsInsideFeature(lngLat, feature) {
  try {
    return turf.booleanPointInPolygon(
      turf.point([lngLat.lng, lngLat.lat]),
      feature,
      { ignoreBoundary: false }
    );
  } catch (error) {
    return false;
  }
}

function isolateHighlightFeatureAtLngLat(feature, lngLat) {
  try {
    const flattened = turf.flatten(feature);
    const parts = flattened?.features || [];

    if (!parts.length) return feature;
    if (parts.length === 1) return parts[0];

    const containingParts = parts.filter((part) => pointIsInsideFeature(lngLat, part));
    if (!containingParts.length) return feature;

    return containingParts.sort((a, b) => safeArea(a) - safeArea(b))[0];
  } catch (error) {
    return feature;
  }
}

function buildStableHighlightFeature(primaryFeature, lngLat) {
  const fallback = isolateHighlightFeatureAtLngLat(primaryFeature, lngLat);
  const hcisId = primaryFeature?.properties?.hcis_id;

  if (!State.map || !hcisId) return fallback;

  let sourceFeatures = [];
  try {
    sourceFeatures = State.map.querySourceFeatures(MAP_SOURCE_ID, {
      sourceLayer: MAP_SOURCE_LAYER
    });
  } catch (error) {
    return fallback;
  }

  const matches = sourceFeatures.filter((feature) => feature?.properties?.hcis_id === hcisId);
  if (!matches.length) return fallback;

  const containingByGeometry = new Map();

  matches.forEach((feature) => {
    const flattened = turf.flatten(feature);
    const parts = flattened?.features || [];

    parts.forEach((part) => {
      if (!pointIsInsideFeature(lngLat, part)) return;

      const key = geometryKey(part.geometry);
      const existing = containingByGeometry.get(key);
      if (existing) {
        existing.count += 1;
        return;
      }

      containingByGeometry.set(key, {
        feature: part,
        count: 1
      });
    });
  });

  if (!containingByGeometry.size) return fallback;

  const rankedParts = Array.from(containingByGeometry.values()).sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;

    const areaDiff = safeArea(a.feature) - safeArea(b.feature);
    if (Math.abs(areaDiff) > 0.0001) return areaDiff;

    return safeDistanceFromCentroid(a.feature, lngLat) - safeDistanceFromCentroid(b.feature, lngLat);
  });

  const baseFeature = rankedParts[0]?.feature || fallback;
  return subtractChildGridAreas(baseFeature, hcisId, sourceFeatures, lngLat);
}

function subtractChildGridAreas(baseFeature, parentHcisId, sourceFeatures, lngLat) {
  const childParts = collectChildGridParts(parentHcisId, sourceFeatures, baseFeature);
  if (!childParts.length) return baseFeature;

  let workingFeature = baseFeature;

  childParts.forEach((childPart) => {
    workingFeature = subtractFeatureSafely(workingFeature, childPart) || workingFeature;
  });

  return pickContainingPiece(workingFeature, lngLat) || baseFeature;
}

function collectChildGridParts(parentHcisId, sourceFeatures, baseFeature) {
  const parts = [];

  sourceFeatures.forEach((feature) => {
    const childHcisId = feature?.properties?.hcis_id;
    if (!isChildHcis(parentHcisId, childHcisId)) return;

    const flattened = turf.flatten(feature);
    const childPolygons = flattened?.features || [];

    childPolygons.forEach((childPolygon) => {
      if (!childPolygon?.geometry) return;
      if (!isFeatureWithinParentArea(childPolygon, baseFeature)) return;
      parts.push(childPolygon);
    });
  });

  return dedupeFeaturesByGeometry(parts);
}

function isChildHcis(parentHcisId, childHcisId) {
  if (!parentHcisId || !childHcisId) return false;

  const parent = String(parentHcisId).trim().toUpperCase();
  const child = String(childHcisId).trim().toUpperCase();

  return child !== parent && child.startsWith(parent);
}

function isFeatureWithinParentArea(childFeature, parentFeature) {
  try {
    const childCentroid = turf.centroid(childFeature);
    return turf.booleanPointInPolygon(childCentroid, parentFeature, { ignoreBoundary: false });
  } catch (error) {
    return false;
  }
}

function subtractFeatureSafely(baseFeature, subtractFeature) {
  try {
    const differenceFeature = turf.difference(baseFeature, subtractFeature);
    return differenceFeature || baseFeature;
  } catch (error) {
    return baseFeature;
  }
}

function pickContainingPiece(feature, lngLat) {
  try {
    const flattened = turf.flatten(feature);
    const parts = flattened?.features || [];
    if (!parts.length) return feature;

    const containingParts = parts.filter((part) => pointIsInsideFeature(lngLat, part));
    if (!containingParts.length) return null;

    return containingParts.sort((a, b) => safeArea(a) - safeArea(b))[0];
  } catch (error) {
    return feature;
  }
}

function dedupeFeaturesByGeometry(features) {
  const seen = new Set();
  const unique = [];

  features.forEach((feature) => {
    if (!feature?.geometry) return;
    const key = geometryKey(feature.geometry);
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(feature);
  });

  return unique;
}

function rankContainingFeatures(features, lngLat) {
  return [...features].sort((a, b) => {
    const specificityDiff = compareHcisSpecificity(a.properties?.hcis_id, b.properties?.hcis_id);
    if (specificityDiff !== 0) return specificityDiff;

    const areaDiff = safeArea(a) - safeArea(b);
    if (Math.abs(areaDiff) > 0.0001) return areaDiff;

    const bboxAreaDiff = safeBBoxArea(a) - safeBBoxArea(b);
    if (Math.abs(bboxAreaDiff) > 0.0001) return bboxAreaDiff;

    const hcisDiff = compareNullableStrings(a.properties?.hcis_id, b.properties?.hcis_id);
    if (hcisDiff !== 0) return hcisDiff;

    return safeDistanceFromCentroid(a, lngLat) - safeDistanceFromCentroid(b, lngLat);
  });
}

function compareHcisSpecificity(hcisA, hcisB) {
  const scoreA = getHcisSpecificityScore(hcisA);
  const scoreB = getHcisSpecificityScore(hcisB);

  if (scoreA !== scoreB) return scoreB - scoreA;
  return 0;
}

function getHcisSpecificityScore(hcis) {
  if (!hcis) return 0;

  const value = String(hcis).trim().toUpperCase();
  if (!value) return 0;

  const alphaCount = (value.match(/[A-Z]/g) || []).length;
  const digitCount = (value.match(/[0-9]/g) || []).length;

  // Longer IDs with extra suffix characters tend to represent more specific sub-grids.
  return (value.length * 100) + (alphaCount * 10) + digitCount;
}

function safeArea(feature) {
  try {
    return turf.area(feature);
  } catch (error) {
    return Number.POSITIVE_INFINITY;
  }
}

function safeDistanceFromCentroid(feature, lngLat) {
  try {
    const centroid = turf.centroid(feature);
    return turf.distance(
      centroid,
      turf.point([lngLat.lng, lngLat.lat]),
      { units: 'meters' }
    );
  } catch (error) {
    return Number.POSITIVE_INFINITY;
  }
}

function safeBBoxArea(feature) {
  try {
    const [minX, minY, maxX, maxY] = turf.bbox(feature);
    return Math.abs((maxX - minX) * (maxY - minY));
  } catch (error) {
    return Number.POSITIVE_INFINITY;
  }
}

function compareNullableStrings(a, b) {
  const valueA = a == null ? '' : String(a);
  const valueB = b == null ? '' : String(b);
  return valueA.localeCompare(valueB);
}

function clampValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function snapToStep(value, step, min, max) {
  const snapped = min + (Math.round((value - min) / step) * step);
  return clampValue(snapped, min, max);
}

function highlightASMGGrid(features) {
  setSelectionHighlight(HIGHLIGHT_SOURCE_ID, features);
}

function clearHighlight() {
  setGeoJsonSourceData(HIGHLIGHT_SOURCE_ID, []);
}

function highlightCompareGrid(features) {
  setSelectionHighlight(COMPARE_HIGHLIGHT_SOURCE_ID, features);
}

function clearCompareHighlight() {
  setGeoJsonSourceData(COMPARE_HIGHLIGHT_SOURCE_ID, []);
}

function setSelectionHighlight(sourceId, features) {
  if (!State.map) return;

  const normalized = Array.isArray(features) ? features : [];
  const uniqueGeometries = [];
  const seen = new Set();

  for (const feature of normalized) {
    if (!feature?.geometry) continue;
    const dissolvedFeature = dissolveFeatureForHighlight(feature);
    const key = geometryKey(dissolvedFeature.geometry);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueGeometries.push({
      type: 'Feature',
      geometry: dissolvedFeature.geometry,
      properties: {}
    });
  }

  setGeoJsonSourceData(sourceId, uniqueGeometries);
}

function clearLicenceHighlight() {
  State.activeLicenceHighlightNo = null;
  State.activeAreaSearch = null;
  State.activeAreaStats = null;
  State.searchDirty = false;
  if (!State.map) return;
  setGeoJsonSourceData(LICENCE_HIGHLIGHT_SOURCE_ID, []);
  setGeoJsonSourceData(LICENCE_HIGHLIGHT_OUTLINE_SOURCE_ID, []);
  updateLicenceHighlightControlVisibility();
  updateResetViewControlVisibility();
  syncFilterControls();
  rerenderAnalysisPanels();
}

function emptyFeatureCollection() {
  return { type: 'FeatureCollection', features: [] };
}

function dissolveFeatureForHighlight(feature) {
  try {
    const flattened = turf.flatten(feature);
    const parts = flattened?.features || [];

    if (!parts.length) return feature;
    if (parts.length === 1) return parts[0];

    let dissolved = parts[0];

    for (let idx = 1; idx < parts.length; idx += 1) {
      dissolved = turf.union(dissolved, parts[idx]) || dissolved;
    }

    return dissolved || feature;
  } catch (error) {
    console.warn('Highlight dissolve failed, using raw geometry', error);
    return feature;
  }
}

// ============================================
// 8) MAP CONTROLS
// ============================================

function toggleMapSettings() {
  byId('mapSettingsPanel')?.classList.toggle('hidden');
}

function handleBasemapChange(event) {
  State.currentBasemap = event.target.value;

  const source = State.map?.getSource('basemap');
  if (source) {
    source.tiles = [
      State.currentBasemap === 'dark'
        ? 'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png'
        : 'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png'
    ];
  }

  const searchSeedSource = State.searchSeedMap?.getSource('basemap');
  if (searchSeedSource) {
    searchSeedSource.tiles = [
      State.currentBasemap === 'dark'
        ? 'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png'
        : 'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png'
    ];
  }

  showToast(`Basemap changed to ${State.currentBasemap}`, 'success');
}

function handleOpacityChange(event) {
  if (!State.map) return;

  const opacity = Number(event.target.value) / 100;
  State.map.setPaintProperty(MAP_LAYER_ID, 'fill-opacity', opacity);
  byId('opacityValue').textContent = `${event.target.value}%`;
}

function handleLinesOpacityChange(event) {
  if (!State.map) return;

  const opacity = Number(event.target.value) / 100;
  State.map.setPaintProperty(MAP_LINE_LAYER_ID, 'line-opacity', opacity);
  byId('linesOpacityValue').textContent = `${event.target.value}%`;
}

// ============================================
// 9) BAND ANALYSIS + RAW DATA
// ============================================

function displayBandAnalysis(features, primaryFeature = features[0]) {
  const selection = features?.length
    ? { allFeatures: features, primaryFeature }
    : null;
  State.currentSelection = selection;
  rerenderAnalysisPanels();
}

function rerenderAnalysisPanels() {
  if (!State.currentSelection?.allFeatures?.length) {
    if (!State.compareSelection && !State.compareModeArmed) {
      clearSidePanel();
      updateAnalysisToolbarVisibility();
      renderOverlayVisualSection();
    } else {
      updateAnalysisToolbarVisibility();
      renderOverlayVisualSection();
      renderCompareSelectionPanel();
    }
    return;
  }

  updateAnalysisToolbarVisibility();
  renderPrimarySelectionPanel(State.currentSelection);
  renderOverlayVisualSection();
  renderCompareSelectionPanel();
}

function renderOverlayVisualSection() {
  const section = byId('overlayVisualSection');
  const note = byId('overlayLegendNote');
  const bandsContainer = byId('overlayBandLegend');
  const paletteSelect = byId('overlayPaletteSelect');
  const opacitySlider = byId('overlayOpacitySlider');
  const opacityValue = byId('overlayOpacityValue');

  if (!section || !note || !bandsContainer || !paletteSelect || !opacitySlider || !opacityValue) return;

  const isSearchConfigured = hasCarrierSearchSelection();
  const isOverlayActive = Boolean(State.activeLicenceHighlightNo || State.activeAreaSearch || isSearchConfigured);
  section.classList.toggle('hidden', !isOverlayActive);
  if (!isOverlayActive) {
    bandsContainer.innerHTML = '';
    note.textContent = '';
    return;
  }

  paletteSelect.value = State.overlayPalette;
  opacitySlider.value = String(Math.round(State.overlayOpacityMultiplier * 100));
  opacityValue.textContent = `${Math.round(State.overlayOpacityMultiplier * 100)}%`;

  const stats = getActiveOverlayStats();
  note.textContent = State.activeLicenceHighlightNo
    ? `Temporary licence area overlay for ${State.activeLicenceHighlightNo}. Loaded map areas are tinted from ${stats.minMhz.toFixed(1)} MHz to ${stats.maxMhz.toFixed(1)} MHz.`
    : State.activeAreaSearch
      ? `Search overlay for ${State.activeAreaSearch?.label || 'selected holders'}. Search data is sourced from the national zoom ${SEARCH_SEED_ZOOM} layer, while the visible map only draws the current area. Use the band dropdowns above to adjust total MHz held, then press Search again.`
      : `Search setup uses the national zoom ${SEARCH_SEED_ZOOM} layer. Use the band dropdowns above to adjust total MHz held, then press Search.`;

  bandsContainer.innerHTML = '';
}

function getActiveOverlayStats() {
  const entries = getActiveOverlayLegendEntries();
  if (!entries.length) {
    return { minMhz: 0, maxMhz: 0 };
  }

  return {
    minMhz: Math.min(...entries.map((entry) => entry.minMhz)),
    maxMhz: Math.max(...entries.map((entry) => entry.maxMhz))
  };
}

function getActiveOverlayLegendEntries() {
  const features = State.activeLicenceHighlightNo
    ? getLoadedSourceFeatures().filter((feature) => String(feature?.properties?.licence_no || '') === String(State.activeLicenceHighlightNo))
    : getAnnotatedCarrierScopedSearchFeatures().filter((feature) => featureMatchesAreaSearch(feature, buildSearchCriteria()));

  return buildOverlayLegendEntries(features, State.activeAreaSearch);
}

function buildOverlayLegendEntries(features, allowBandFilterToggles = false) {
  const activeRangeIds = getEffectiveSelectedIds(State.bandGroupFilters, getAvailableBandGroupIds());
  const useAllRanges = activeRangeIds.size === 0 || areAllFiltersSelected(State.bandGroupFilters, getAvailableBandGroupIds());
  const activeSpecificBandIds = getEffectiveSelectedIds(State.specificBandFilters, getAvailableSpecificBandIds());
  const useAllSpecificBands = activeSpecificBandIds.size === 0 || areAllFiltersSelected(State.specificBandFilters, getAvailableSpecificBandIds());
  const byBand = new Map();

  features.forEach((feature) => {
    const band = resolveBandForFeature(feature);
    if (!band) return;
    if (allowBandFilterToggles && !passesBandFilters(band, activeRangeIds, useAllRanges, activeSpecificBandIds, useAllSpecificBands)) {
      return;
    }

    const key = String(band.id);
    if (!byBand.has(key)) {
      byBand.set(key, {
        band,
        holdings: 0,
        totalMhz: 0,
        minMhz: Number.POSITIVE_INFINITY,
        maxMhz: 0,
        seenGroups: new Set()
      });
    }

    const entry = byBand.get(key);
    const groupKey = String(feature.properties?.overlay_group_key || getOverlayCarrierBandAreaKey(feature, band));
    const mhz = parseFloat(feature.properties?.overlay_total_mhz ?? feature.properties?.total_mhz_held) || 0;
    if (!entry.seenGroups.has(groupKey)) {
      entry.seenGroups.add(groupKey);
      entry.holdings += 1;
      entry.totalMhz += mhz;
      entry.minMhz = Math.min(entry.minMhz, mhz);
      entry.maxMhz = Math.max(entry.maxMhz, mhz);
    }
  });

  return Array.from(byBand.values())
    .map((entry) => ({
      ...entry,
      minMhz: Number.isFinite(entry.minMhz) ? entry.minMhz : 0,
      maxMhz: Number.isFinite(entry.maxMhz) ? entry.maxMhz : 0
    }))
    .sort((a, b) => getBandCenterMhz(a.band) - getBandCenterMhz(b.band));
}

function getCarrierEntityKey(feature) {
  const rawCarrier = String(feature?.properties?.carrier_name || '').trim();
  const resolved = resolveCarrier(rawCarrier);
  return resolved === 'Other' ? rawCarrier : resolved;
}

function getSearchBandRangeEntries() {
  const cacheKey = [
    buildSearchBaseCacheKey(),
    Array.from(State.bandGroupFilters).sort().join('|'),
    Array.from(State.specificBandFilters).sort().join('|')
  ].join('::');
  if (State.searchBandRangeCacheKey === cacheKey) {
    return State.searchBandRangeCacheEntries;
  }

  const carrierScopedFeatures = getAnnotatedCarrierScopedSearchFeatures();
  const activeRangeIds = getEffectiveSelectedIds(State.bandGroupFilters, getAvailableBandGroupIds());
  const useAllRanges = activeRangeIds.size === 0 || areAllFiltersSelected(State.bandGroupFilters, getAvailableBandGroupIds());
  const activeSpecificBandIds = getEffectiveSelectedIds(State.specificBandFilters, getAvailableSpecificBandIds());
  const useAllSpecificBands = activeSpecificBandIds.size === 0 || areAllFiltersSelected(State.specificBandFilters, getAvailableSpecificBandIds());

  State.searchBandRangeCacheKey = cacheKey;
  State.searchBandRangeCacheEntries = buildOverlayLegendEntries(carrierScopedFeatures, false).filter((entry) => {
    const band = entry.band;
    if (!band) return false;
    if (!useAllRanges && !Array.from(activeRangeIds).some((rangeId) => matchesBandGroupId(band, rangeId))) {
      return false;
    }
    if (!useAllSpecificBands && !activeSpecificBandIds.has(String(band.id))) {
      return false;
    }
    return true;
  });
  return State.searchBandRangeCacheEntries;
}

function handleBandMhzRangeInput(event) {
  const input = event.target;
  const panel = input.closest('.band-chip-panel');
  const bandId = String(input.dataset.bandId || '');
  const bound = input.dataset.bound;
  const entry = getSearchBandRangeEntries().find((item) => String(item.band.id) === bandId);
  if (!entry || !bound) return;

  const existing = State.bandMhzFilters[bandId] || { min: entry.minMhz, max: entry.maxMhz };
  const nextValue = snapToStep(clampValue(Number(input.value), entry.minMhz, entry.maxMhz), 5, entry.minMhz, entry.maxMhz);
  const nextMin = bound === 'min' ? Math.min(nextValue, existing.max) : existing.min;
  const nextMax = bound === 'max' ? Math.max(nextValue, existing.min) : existing.max;

  State.bandMhzFilters[bandId] = { min: nextMin, max: nextMax };
  input.value = String(bound === 'min' ? nextMin : nextMax);
  markSearchDirty();
  updateBandMhzPanelUi(panel, entry, State.bandMhzFilters[bandId]);
  updateAnalysisToolbarVisibility();
  renderOverlayVisualSection();
}

function handleBandMhzRangePointerDown(event) {
  const input = event.target;
  const panel = input.closest('.band-chip-panel');
  if (!panel) return;

  panel.querySelectorAll('input[type="range"][data-band-id]').forEach((rangeInput) => {
    rangeInput.classList.toggle('is-active-handle', rangeInput === input);
  });
}

function updateBandMhzPanelUi(panel, entry, filterState) {
  if (!panel || !entry || !filterState) return;

  const rangeSpan = Math.max(entry.maxMhz - entry.minMhz, 0.0001);
  const fillLeft = ((filterState.min - entry.minMhz) / rangeSpan) * 100;
  const fillRight = ((entry.maxMhz - filterState.max) / rangeSpan) * 100;
  const label = panel.querySelector('[data-role="range-value"]');
  const fill = panel.querySelector('[data-role="range-fill"]');
  const minInput = panel.querySelector('input[data-bound="min"]');
  const maxInput = panel.querySelector('input[data-bound="max"]');

  if (label) {
    label.textContent = `${filterState.min.toFixed(1)} to ${filterState.max.toFixed(1)} MHz`;
  }
  if (fill) {
    fill.style.left = `${fillLeft}%`;
    fill.style.right = `${fillRight}%`;
  }
  if (minInput) minInput.value = String(filterState.min);
  if (maxInput) maxInput.value = String(filterState.max);
  if (minInput && maxInput) {
    const minAtRightEdge = filterState.min >= filterState.max;
    minInput.classList.toggle('is-front-handle', minAtRightEdge);
    maxInput.classList.toggle('is-front-handle', !minAtRightEdge);
  }
}

function renderPrimarySelectionPanel(selection) {
  const features = selection.allFeatures || [];
  const fullFeatures = selection.allFeatures || [];
  const totalFeatures = selection.allFeatures?.length || 0;
  const primaryFeature = selection.primaryFeature;

  const rawDataBtn = byId('rawDataBtn');
  const coverageBtn = byId('coverageBtn');
  const locationName = byId('locationName');
  const locationDetails = byId('locationDetails');
  const hcisIdDisplay = byId('hcisIdDisplay');
  const bandModules = byId('bandModules');

  if (rawDataBtn) rawDataBtn.style.display = 'block';
  if (coverageBtn) coverageBtn.style.display = 'block';

  if (locationName) {
    locationName.textContent = primaryFeature?.properties?.area_name || 'Selected location';
  }

  if (locationDetails) {
    const baseText = `${totalFeatures} holding${totalFeatures === 1 ? '' : 's'}`;
    locationDetails.textContent = State.compareSelection
      ? `${baseText} • compare mode ready`
      : baseText;
  }

  if (hcisIdDisplay) {
    const hcisId = primaryFeature?.properties?.hcis_id;
    if (hcisId) {
      hcisIdDisplay.textContent = `HCIS: ${hcisId}`;
      hcisIdDisplay.style.display = 'block';
    } else {
      hcisIdDisplay.textContent = '';
      hcisIdDisplay.style.display = 'none';
    }
  }

  const bandMap = buildBandMap(features);
  State.bandData = bandMap;
  if (State.compareSelection) {
    if (bandModules) bandModules.innerHTML = '';
  } else {
    renderBandCharts(bandMap);
  }
  displayRawData(fullFeatures);
  renderCoverageScorecards(fullFeatures);
}

function renderCompareSelectionPanel() {
  const panel = byId('comparePanel');
  if (!panel) return;

  if (State.compareModeArmed && State.compareSelection && !State.currentSelection) {
    panel.classList.remove('hidden');
    panel.innerHTML = `
      <div class="compare-prompt-card">
        <div class="card-label">Compare Mode</div>
        <div class="compare-prompt-title">Secondary grid selected</div>
        <div class="compare-prompt-copy">The purple grid is locked in. Tap the main grid to compare against it.</div>
      </div>
    `;
    return;
  }

  if (!State.compareSelection || !State.currentSelection) {
    panel.innerHTML = '';
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  panel.innerHTML = '';
  panel.appendChild(buildCompareCard(State.currentSelection, 'Main Grid', 'is-primary'));
  panel.appendChild(buildCompareCard(State.compareSelection, 'Secondary Grid', 'is-secondary'));
}

function buildCompareCard(selection, label, cardClass) {
  const features = selection?.allFeatures || [];
  const totalFeatures = selection.allFeatures?.length || 0;
  const primaryFeature = selection.primaryFeature;
  const bandMap = buildBandMap(features);

  const card = document.createElement('div');
  card.className = `compare-card ${cardClass}`;

  const header = document.createElement('div');
  header.className = 'compare-card-header';
  header.innerHTML = `
    <div>
      <div class="card-label">${label}</div>
      <div class="compare-card-title">${primaryFeature?.properties?.hcis_id || 'No HCIS'}</div>
    </div>
    <div class="compare-card-meta">${totalFeatures} holding${totalFeatures === 1 ? '' : 's'}</div>
  `;
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'compare-bands';

  const bandIds = Object.keys(bandMap);
  if (!bandIds.length) {
    body.innerHTML = '<div class="compare-empty">No holdings match the current filters for this selection.</div>';
    card.appendChild(body);
    return card;
  }

  BANDS.forEach((band) => {
    if (!bandMap[band.id]) return;

    const module = document.createElement('div');
    module.className = 'band-module';

    const headerEl = document.createElement('div');
    headerEl.className = 'band-header';
    headerEl.innerHTML = `
      <div class="band-name">${band.name}</div>
      <div class="band-freq">${band.freq}</div>
      <div class="band-meta">${bandMap[band.id].holdings.length} holding${bandMap[band.id].holdings.length === 1 ? '' : 's'}</div>
    `;
    module.appendChild(headerEl);

    if (band.type === 'FDD') {
      module.appendChild(renderFDDChart(band, bandMap[band.id].holdings));
    } else {
      module.appendChild(renderTDDChart(band, bandMap[band.id].holdings));
    }

    body.appendChild(module);
  });

  card.appendChild(body);
  return card;
}

function getFilteredSelectionFeatures(selection) {
  const features = selection?.allFeatures || [];
  const availableCarrierIds = getAvailableCarrierFilterIds();
  const activeCarrierIds = getEffectiveSelectedIds(State.carrierFilters, availableCarrierIds);
  const useAllCarriers = activeCarrierIds.size === 0 || areAllFiltersSelected(State.carrierFilters, availableCarrierIds);
  const availableBandGroupIds = getAvailableBandGroupIds();
  const activeBandGroupIds = getEffectiveSelectedIds(State.bandGroupFilters, availableBandGroupIds);
  const useAllBandGroups = activeBandGroupIds.size === 0 || areAllFiltersSelected(State.bandGroupFilters, availableBandGroupIds);
  const availableSpecificBandIds = getAvailableSpecificBandIds();
  const activeSpecificBandIds = getEffectiveSelectedIds(State.specificBandFilters, availableSpecificBandIds);
  const useAllSpecificBands = activeSpecificBandIds.size === 0 || areAllFiltersSelected(State.specificBandFilters, availableSpecificBandIds);
  const licenceTypeConfig = getLicenceTypeConfig();
  const useAllLicenceTypes = State.licenceTypeFilters.size === 0;

  return features.filter((feature) => {
    const carrier = resolveCarrier(feature.properties?.carrier_name);
    const rawCarrier = String(feature.properties?.carrier_name || '').trim();
    const band = resolveBandForFeature(feature);
    const licenceTypeValue = licenceTypeConfig.key
      ? String(feature.properties?.[licenceTypeConfig.key] || '').trim()
      : '';

    if (!useAllCarriers) {
      if (activeCarrierIds.has('selected-licence')) {
        if (!State.activeLicenceHighlightNo) return false;
        if (String(feature.properties?.licence_no || '') === String(State.activeLicenceHighlightNo)) {
          return passesBandFilters(band, activeBandGroupIds, useAllBandGroups, activeSpecificBandIds, useAllSpecificBands);
        }
      }

      if (!activeCarrierIds.has(carrier) && !activeCarrierIds.has(encodeHolderFilterId(rawCarrier))) {
        return false;
      }
    }

    if (!useAllLicenceTypes && !State.licenceTypeFilters.has(licenceTypeValue)) {
      return false;
    }

    return passesBandFilters(band, activeBandGroupIds, useAllBandGroups, activeSpecificBandIds, useAllSpecificBands);
  });
}

function passesBandFilters(band, activeBandGroupIds, useAllBandGroups, activeSpecificBandIds, useAllSpecificBands) {
  if (!useAllBandGroups) {
    if (!band || !Array.from(activeBandGroupIds).some((rangeId) => matchesBandGroupId(band, rangeId))) {
      return false;
    }
  }

  if (!useAllSpecificBands) {
    if (!band || !activeSpecificBandIds.has(String(band.id))) {
      return false;
    }
  }

  return true;
}

function buildBandMap(features) {
  const bandMap = {};

  features.forEach((feature) => {
    const properties = feature.properties || {};
    const band = resolveBandForFeature(feature);
    if (!band) return;

    if (!bandMap[band.id]) {
      bandMap[band.id] = { band, holdings: [] };
    }

    const carrier = resolveCarrier(properties.carrier_name);

    bandMap[band.id].holdings.push({
      carrier,
      carrierClass: getCarrierClass(carrier),
      rawName: properties.carrier_name,
      licenceNo: properties.licence_no || 'N/A',
      lwStart: parseFloat(properties.lw_start_mhz),
      lwEnd: parseFloat(properties.lw_end_mhz),
      upStart: parseFloat(properties.up_start_mhz),
      upEnd: parseFloat(properties.up_end_mhz),
      totalMhz: parseFloat(properties.total_mhz_held),
      effectiveDate: properties.date_of_effect,
      expiryDate: properties.date_of_expiry,
      areaName: properties.area_name
    });
  });

  return bandMap;
}

function renderCoverageScorecards(features) {
  const container = byId('coverageContent');
  if (!container) return;

  if (!features?.length) {
    container.innerHTML = '<div class="compare-empty">No holdings available for the current selection.</div>';
    return;
  }

  const carrierSummaries = buildCarrierCoverageSummary(features);
  if (!carrierSummaries.length) {
    container.innerHTML = '<div class="compare-empty">No carrier coverage summary is available for the current selection.</div>';
    return;
  }

  container.innerHTML = `
    <div class="coverage-grid">
      ${carrierSummaries.map((summary) => `
        <div class="coverage-card">
          <div class="coverage-title">${summary.carrier}</div>
          <div class="coverage-metric"><span>Total MHz</span><strong>${summary.total.toFixed(1)}</strong></div>
          <div class="coverage-metric"><span>Low-band</span><strong>${summary.low.toFixed(1)}</strong></div>
          <div class="coverage-metric"><span>Mid-band</span><strong>${summary.mid.toFixed(1)}</strong></div>
          <div class="coverage-metric"><span>High-band</span><strong>${summary.high.toFixed(1)}</strong></div>
          <div class="coverage-metric"><span>mmWave</span><strong>${summary.mmwave.toFixed(1)}</strong></div>
        </div>
      `).join('')}
    </div>
  `;
}

function buildCarrierCoverageSummary(features) {
  const byCarrier = new Map();

  features.forEach((feature) => {
    const carrier = resolveCarrier(feature.properties?.carrier_name);
    const band = resolveBandForFeature(feature);
    const mhz = parseFloat(feature.properties?.total_mhz_held) || 0;

    if (!byCarrier.has(carrier)) {
      byCarrier.set(carrier, {
        carrier,
        total: 0,
        low: 0,
        mid: 0,
        high: 0,
        mmwave: 0
      });
    }

    const summary = byCarrier.get(carrier);
    summary.total += mhz;

    if (band) {
      if (matchesBandGroupId(band, 'low')) summary.low += mhz;
      else if (matchesBandGroupId(band, 'mid')) summary.mid += mhz;
      else if (matchesBandGroupId(band, 'mmwave')) summary.mmwave += mhz;
      else summary.high += mhz;
    }
  });

  return Array.from(byCarrier.values()).sort((a, b) => b.total - a.total);
}

function resolveBandForFeature(feature) {
  const properties = feature.properties || {};
  const freq = parseFloat(properties.lw_start_mhz) || 0;

  let band = BANDS.find((candidate) => {
    if (candidate.type === 'FDD') {
      if (candidate.id === 5 && candidate.b26ulStart) {
        return freq >= candidate.b26ulStart && freq < candidate.b26ulEnd;
      }
      return freq >= candidate.ulStart && freq < candidate.ulEnd;
    }

    return freq >= candidate.tddStart && freq < candidate.tddEnd;
  });

  if (!band) {
    band = BANDS.find((candidate) => {
      if (candidate.type !== 'FDD') return false;
      if (candidate.id === 5 && candidate.b26dlStart) {
        return freq >= candidate.b26dlStart && freq < candidate.b26dlEnd;
      }
      return freq >= candidate.dlStart && freq < candidate.dlEnd;
    });
  }

  return band || null;
}

function matchesBandGroupId(band, bandGroupId) {
  if (!band) return false;

  switch (bandGroupId) {
    case 'low':
      return band.type === 'FDD' && getBandCenterMhz(band) < 1000;
    case 'mid':
      return getBandCenterMhz(band) >= 1000 && getBandCenterMhz(band) < 6000;
    case 'mmwave':
      return getBandCenterMhz(band) >= 24000;
    default:
      return true;
  }
}

function getBandCenterMhz(band) {
  if (band.type === 'TDD') {
    return (band.tddStart + band.tddEnd) / 2;
  }

  return ((band.ulStart || 0) + (band.dlEnd || band.dlStart || 0)) / 2;
}

function toggleCompareMode() {
  if (!State.currentSelection) {
    showToast('Select a first HCIS area before starting compare mode', 'info');
    return;
  }

  if (State.compareModeArmed) {
    if (State.compareSelection && !State.currentSelection) {
      State.currentSelection = State.compareSelection;
      State.currentFeatures = State.compareSelection.allFeatures;
      State.currentPrimaryFeature = State.compareSelection.primaryFeature;
      State.compareSelection = null;
      clearCompareHighlight();
      highlightASMGGrid([State.currentSelection.highlightFeature || State.currentSelection.primaryFeature]);
      rerenderAnalysisPanels();
    }

    State.compareModeArmed = false;
    syncFilterControls();
    syncUrlState();
    showToast('Compare mode cancelled', 'info');
    return;
  }

  State.compareSelection = State.currentSelection;
  State.currentSelection = null;
  State.currentFeatures = [];
  State.currentPrimaryFeature = null;
  State.compareModeArmed = true;
  clearHighlight();
  highlightCompareGrid([State.compareSelection.highlightFeature || State.compareSelection.primaryFeature]);
  clearSidePanel();
  syncFilterControls();
  syncUrlState();
  updateResetViewControlVisibility();
  renderCompareSelectionPanel();
  showToast('Secondary grid selected. Tap the main grid to compare.', 'info');
}

function clearCompareSelection() {
  State.compareSelection = null;
  State.compareModeArmed = false;
  clearCompareHighlight();
  syncFilterControls();
  rerenderAnalysisPanels();
  syncUrlState();
  updateResetViewControlVisibility();
}

function shareCurrentView() {
  syncUrlState();
  const shareUrl = window.location.href;

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(shareUrl)
      .then(() => showToast('Shareable view link copied to clipboard', 'success'))
      .catch(() => showToast(shareUrl, 'info'));
    return;
  }

  showToast(shareUrl, 'info');
}

function exportCurrentSelectionToPdf() {
  if (!State.currentSelection?.allFeatures?.length) {
    showToast('Select a grid before exporting to PDF', 'info');
    return;
  }

  const primary = State.currentSelection.primaryFeature;
  const filteredFeatures = getFilteredSelectionFeatures(State.currentSelection);
  const filteredBandMap = buildBandMap(filteredFeatures);
  const compareSummary = State.compareSelection
    ? buildExportCompareHtml(State.compareSelection, 'Compare Selection')
    : '';

  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=900');
  if (!printWindow) {
    showToast('Popup blocked. Please allow popups to export PDF.', 'error');
    return;
  }

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Spectrum Selection Export</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
          h1, h2 { margin-bottom: 8px; }
          .meta, .section { margin-bottom: 18px; }
          .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
          .row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid #e2e8f0; }
          .row:last-child { border-bottom: none; }
          .muted { color: #475569; }
          .band-list { display: grid; gap: 10px; }
        </style>
      </head>
      <body>
        <h1>Mobile Spectrum Australia Export</h1>
        <div class="meta muted">Generated ${new Date().toLocaleString()}</div>
        <div class="card">
          <h2>Primary Selection</h2>
          <div class="row"><span>HCIS</span><strong>${primary?.properties?.hcis_id || 'N/A'}</strong></div>
          <div class="row"><span>Area</span><strong>${primary?.properties?.area_name || 'Unknown area'}</strong></div>
          <div class="row"><span>Filtered holdings</span><strong>${filteredFeatures.length}</strong></div>
          <div class="row"><span>Active carrier filter</span><strong>${State.carrierFilters.size ? Array.from(State.carrierFilters).join(', ') : 'All carriers'}</strong></div>
          <div class="row"><span>Active band range</span><strong>${State.bandGroupFilters.size ? Array.from(State.bandGroupFilters).join(', ') : 'All ranges'}</strong></div>
          <div class="row"><span>Specific bands</span><strong>${State.specificBandFilters.size ? Array.from(State.specificBandFilters).join(', ') : 'All bands'}</strong></div>
        </div>
        <div class="card">
          <h2>Band Summary</h2>
          ${buildExportBandMapHtml(filteredBandMap)}
        </div>
        ${compareSummary}
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function buildExportBandMapHtml(bandMap) {
  const bandIds = Object.keys(bandMap);
  if (!bandIds.length) {
    return '<div class="muted">No holdings matched the active filters.</div>';
  }

  return `
    <div class="band-list">
      ${BANDS.filter((band) => bandMap[band.id]).map((band) => `
        <div class="card">
          <div class="row"><span>${band.name}</span><strong>${band.freq}</strong></div>
          <div class="row"><span>Holdings</span><strong>${bandMap[band.id].holdings.length}</strong></div>
          <div class="row"><span>Carriers</span><strong>${Array.from(new Set(bandMap[band.id].holdings.map((holding) => holding.carrier))).join(', ')}</strong></div>
        </div>
      `).join('')}
    </div>
  `;
}

function buildExportCompareHtml(selection, label) {
  const features = getFilteredSelectionFeatures(selection);
  const bandMap = buildBandMap(features);

  return `
    <div class="card">
      <h2>${label}</h2>
      <div class="row"><span>HCIS</span><strong>${selection.primaryFeature?.properties?.hcis_id || 'N/A'}</strong></div>
      <div class="row"><span>Area</span><strong>${selection.primaryFeature?.properties?.area_name || 'Unknown area'}</strong></div>
      <div class="row"><span>Filtered holdings</span><strong>${features.length}</strong></div>
      ${buildExportBandMapHtml(bandMap)}
    </div>
  `;
}

function displayRawData(features) {
  const rawDataBtn = byId('rawDataBtn');
  const rawDataContent = byId('rawDataContent');

  if (!rawDataBtn || !rawDataContent) return;

  if (!features?.length) {
    rawDataBtn.style.display = 'none';
    rawDataContent.innerHTML = '';
    return;
  }

  rawDataBtn.style.display = 'inline-block';

  const sorted = [...features].sort((a, b) => {
    const freqA = parseFloat(a.properties?.lw_start_mhz) || 0;
    const freqB = parseFloat(b.properties?.lw_start_mhz) || 0;
    return freqA - freqB;
  });

  const allKeys = new Set();
  sorted.forEach((feature) => {
    Object.keys(feature.properties || {}).forEach((key) => allKeys.add(key));
  });

  const columns = Array.from(allKeys).sort();

  let html = `
    <div style="overflow-x: auto;">
      <table id="rawDataTable" style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="background: var(--bg-tertiary);">
  `;

  columns.forEach((column) => {
    const displayColumn = column.replace(/_/g, ' ').toUpperCase();
    html += `
            <th style="padding: 4px; border: 1px solid var(--border); text-align: left; font-weight: 700; color: var(--text-primary); cursor: pointer; user-select: none;" onclick="sortTable(this, '${column}')">${displayColumn} ▼</th>
    `;
  });

  html += `
          </tr>
          <tr style="background: var(--bg-secondary);">
  `;

  columns.forEach(() => {
    html += `
            <td style="padding: 2px; border: 1px solid var(--border);"><input type="text" placeholder="Filter..." onkeyup="filterTable()" style="width: 100%; padding: 2px; font-size: 10px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 2px;" /></td>
    `;
  });

  html += `
          </tr>
        </thead>
        <tbody>
  `;

  sorted.forEach((feature) => {
    html += '<tr>';
    columns.forEach((column) => {
      const value = feature.properties?.[column] || '';
      const cellContent = column === 'licence_no'
        ? renderLicenceCell(value)
        : value;
      html += `<td style="padding: 4px; border: 1px solid var(--border); color: var(--text-secondary);">${cellContent}</td>`;
    });
    html += '</tr>';
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  rawDataContent.innerHTML = html;
}

function renderLicenceCell(licenceNo) {
  const safeLicence = licenceNo || 'N/A';
  if (!licenceNo || licenceNo === 'N/A') return safeLicence;

  const licenceLiteral = JSON.stringify(String(licenceNo));
  return `
    <span>${safeLicence}</span>
    <button
      type="button"
      onclick='highlightLicenceOnMap(${licenceLiteral})'
      title="Highlight this licence on the map"
      style="margin-left: 6px; padding: 2px 6px; font-size: 10px; line-height: 1.2; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary); cursor: pointer;"
    >🗺 Map</button>
  `;
}

function sortTable(header) {
  const table = byId('rawDataTable');
  if (!table) return;

  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const isAsc = header.classList.contains('sort-asc');

  table.querySelectorAll('th').forEach((cell) => {
    cell.classList.remove('sort-asc', 'sort-desc');
  });

  header.classList.add(isAsc ? 'sort-desc' : 'sort-asc');

  const colIndex = Array.from(header.parentElement.children).indexOf(header);

  rows.sort((a, b) => {
    const aVal = a.children[colIndex].textContent.trim();
    const bVal = b.children[colIndex].textContent.trim();
    const aNum = parseFloat(aVal);
    const bNum = parseFloat(bVal);

    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
      return isAsc ? bNum - aNum : aNum - bNum;
    }

    return isAsc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
  });

  rows.forEach((row) => tbody.appendChild(row));
}

function filterTable() {
  const table = byId('rawDataTable');
  if (!table) return;

  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  const filterInputs = thead.querySelectorAll('tr:nth-child(2) input');
  const rows = tbody.querySelectorAll('tr');

  rows.forEach((row) => {
    let show = true;

    row.querySelectorAll('td').forEach((cell, idx) => {
      const filterValue = filterInputs[idx].value.toLowerCase();
      const cellValue = cell.textContent.toLowerCase();
      if (filterValue && !cellValue.includes(filterValue)) show = false;
    });

    row.style.display = show ? '' : 'none';
  });
}

// ============================================
// 10) BAND CHART RENDERING
// ============================================

function consolidateCarriers(holdings) {
  const sorted = [...holdings].sort((a, b) => a.lwStart - b.lwStart);
  const consolidated = [];
  let currentGroup = null;

  sorted.forEach((holding) => {
    const lastSegment = currentGroup?.segments[currentGroup.segments.length - 1];
    const isContiguous = lastSegment
      && currentGroup.carrier === holding.carrier
      && Math.abs(lastSegment.lwEnd - holding.lwStart) <= 0.01;

    if (!currentGroup || !isContiguous) {
      if (currentGroup) consolidated.push(currentGroup);
      currentGroup = {
        carrier: holding.carrier,
        carrierClass: holding.carrierClass,
        rawName: holding.rawName,
        segments: [holding]
      };
      return;
    }

    currentGroup.segments.push(holding);
  });

  if (currentGroup) consolidated.push(currentGroup);
  return consolidated;
}

function renderBandCharts(bandMap) {
  const container = byId('bandModules');
  if (!container) return;

  container.innerHTML = '';

  BANDS.forEach((band) => {
    if (!bandMap[band.id]) return;

    const { holdings } = bandMap[band.id];
    const module = document.createElement('div');
    module.className = 'band-module';

    const header = document.createElement('div');
    header.className = 'band-header';
    header.innerHTML = `
      <div class="band-name">${band.name}</div>
      <div class="band-freq">${band.freq}</div>
      <div class="band-meta">${holdings.length} holding${holdings.length === 1 ? '' : 's'}</div>
    `;
    module.appendChild(header);

    if (band.type === 'FDD') {
      module.appendChild(renderFDDChart(band, holdings));
    } else {
      module.appendChild(renderTDDChart(band, holdings));
    }

    container.appendChild(module);
  });
}

function renderFDDChart(band, holdings) {
  const wrapper = document.createElement('div');
  wrapper.className = 'band-container';

  const consolidated = consolidateCarriers(holdings);
  const ulStart = band.id === 5 && band.b26ulStart ? band.b26ulStart : band.ulStart;
  const ulEnd = band.id === 5 && band.b26ulEnd ? band.b26ulEnd : band.ulEnd;
  const dlStart = band.id === 5 && band.b26dlStart ? band.b26dlStart : band.dlStart;
  const dlEnd = band.id === 5 && band.b26dlEnd ? band.b26dlEnd : band.dlEnd;

  const freqPointsUL = new Set([ulStart, ulEnd]);
  const freqPointsDL = new Set([dlStart, dlEnd]);

  holdings.forEach((holding) => {
    freqPointsUL.add(holding.lwStart);
    freqPointsUL.add(holding.lwEnd);
    freqPointsDL.add(holding.upStart);
    freqPointsDL.add(holding.upEnd);
  });

  const ulTrack = document.createElement('div');
  ulTrack.className = 'spectrum-track ul-track';

  const ulLabel = document.createElement('div');
  ulLabel.className = 'track-label';
  ulLabel.textContent = 'UL';
  ulTrack.appendChild(ulLabel);

  consolidated.forEach((group) => {
    const totalBw = group.segments.reduce((sum, segment) => sum + (segment.lwEnd - segment.lwStart), 0);
    const minFreq = Math.min(...group.segments.map((segment) => segment.lwStart));
    const maxFreq = Math.max(...group.segments.map((segment) => segment.lwEnd));

    ulTrack.appendChild(
      createSpectrumBlock(group, totalBw, minFreq, maxFreq, ulStart, ulEnd, group.segments)
    );
  });

  const dlTrack = document.createElement('div');
  dlTrack.className = 'spectrum-track dl-track';

  const dlLabel = document.createElement('div');
  dlLabel.className = 'track-label';
  dlLabel.textContent = 'DL';
  dlTrack.appendChild(dlLabel);

  consolidated.forEach((group) => {
    const totalBw = group.segments.reduce((sum, segment) => sum + (segment.upEnd - segment.upStart), 0);
    const minFreq = Math.min(...group.segments.map((segment) => segment.upStart));
    const maxFreq = Math.max(...group.segments.map((segment) => segment.upEnd));

    dlTrack.appendChild(
      createSpectrumBlock(group, totalBw, minFreq, maxFreq, dlStart, dlEnd, group.segments, true)
    );
  });

  wrapper.appendChild(ulTrack);
  wrapper.appendChild(createFrequencyAxis(Array.from(freqPointsUL).sort((a, b) => a - b), ulStart, ulEnd, '4px'));
  wrapper.appendChild(dlTrack);
  wrapper.appendChild(createFrequencyAxis(Array.from(freqPointsDL).sort((a, b) => a - b), dlStart, dlEnd, '-2px'));

  return wrapper;
}

function renderTDDChart(band, holdings) {
  const wrapper = document.createElement('div');
  wrapper.className = 'band-container';

  const consolidated = consolidateCarriers(holdings);
  const freqPoints = new Set([band.tddStart, band.tddEnd]);

  holdings.forEach((holding) => {
    freqPoints.add(holding.lwStart);
    freqPoints.add(holding.lwEnd);
  });

  const track = document.createElement('div');
  track.className = 'spectrum-track tdd-track';

  const label = document.createElement('div');
  label.className = 'track-label';
  label.textContent = 'TDD';
  track.appendChild(label);

  consolidated.forEach((group) => {
    const totalBw = group.segments.reduce((sum, segment) => sum + (segment.lwEnd - segment.lwStart), 0);
    const minFreq = Math.min(...group.segments.map((segment) => segment.lwStart));
    const maxFreq = Math.max(...group.segments.map((segment) => segment.lwEnd));

    track.appendChild(
      createSpectrumBlock(group, totalBw, minFreq, maxFreq, band.tddStart, band.tddEnd, group.segments)
    );
  });

  wrapper.appendChild(track);
  wrapper.appendChild(createFrequencyAxis(Array.from(freqPoints).sort((a, b) => a - b), band.tddStart, band.tddEnd, '4px'));

  return wrapper;
}

function createFrequencyAxis(points, start, end, marginTop) {
  const axis = document.createElement('div');
  axis.className = 'frequency-axis';
  axis.style.marginTop = marginTop;

  points.forEach((mhz) => {
    const label = document.createElement('div');
    label.className = 'freq-label';
    label.style.left = `${((mhz - start) / (end - start)) * 100}%`;
    label.textContent = mhz.toFixed(0);
    axis.appendChild(label);
  });

  return axis;
}

function createSpectrumBlock(group, totalBw, freqStart, freqEnd, bandStart, bandEnd, segments, isDL = false) {
  const block = document.createElement('div');
  block.className = `spectrum-block ${group.carrierClass}`;

  const bandwidth = freqEnd - freqStart;
  const bandRange = bandEnd - bandStart;
  const leftPct = ((freqStart - bandStart) / bandRange) * 100;
  const widthPct = (bandwidth / bandRange) * 100;

  block.style.left = `${leftPct}%`;
  block.style.width = `${Math.max(1.5, widthPct)}%`;

  const displayName = group.carrier === 'Other' ? group.rawName : group.carrier;
  const text = document.createElement('div');
  text.className = 'block-text';
  text.textContent = `${displayName} ${totalBw.toFixed(0)}MHz`;
  block.appendChild(text);

  block.addEventListener('click', (event) => {
    event.stopPropagation();
    showHoldingDetails(group, segments, isDL);
  });

  return block;
}

function showHoldingDetails(group, segments, isDL = false) {
  const modal = byId('holdingModal');
  const content = byId('holdingContent');
  if (!modal || !content) return;

  let html = `
    <div class="detail-row">
      <span class="detail-label">Carrier</span>
      <span class="detail-value"><strong>${group.carrier}</strong></span>
    </div>
  `;

  segments.forEach((segment, idx) => {
    html += `
      <div style="border-top: 1px solid var(--border); padding-top: 8px; margin-top: 8px;">
        <div class="detail-row">
          <span class="detail-label">Holding ${idx + 1}</span>
          <span class="detail-value">
            ${segment.licenceNo}
            ${segment.licenceNo && segment.licenceNo !== 'N/A' ? `
              &nbsp;<a href="https://web.acma.gov.au/rrl/licence_search.licence_lookup?pLICENCE_NO=${encodeURIComponent(segment.licenceNo)}"
                target="_blank" rel="noopener noreferrer" style="color: var(--link-color); text-decoration: underline;">ACMA LINK</a>
              &nbsp;<button
                type="button"
                onclick='highlightLicenceOnMap(${JSON.stringify(String(segment.licenceNo))})'
                title="Highlight this licence on the map"
                style="padding: 2px 6px; font-size: 11px; line-height: 1.2; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary); cursor: pointer;"
              >🗺 Map</button>
            ` : ''}
          </span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Range</span>
          <span class="detail-value">${isDL && segment.upStart ? `${segment.upStart.toFixed(2)}–${segment.upEnd.toFixed(2)}` : `${segment.lwStart.toFixed(2)}–${segment.lwEnd.toFixed(2)}`} MHz</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Bandwidth</span>
          <span class="detail-value">${segment.totalMhz.toFixed(1)} MHz</span>
        </div>
        ${segment.upStart ? `
          <div class="detail-row">
            <span class="detail-label">Duplex Spacing</span>
            <span class="detail-value">${(segment.upStart - segment.lwStart).toFixed(2)} MHz</span>
          </div>
        ` : ''}
        <div class="detail-row">
          <span class="detail-label">Effective</span>
          <span class="detail-value" style="font-size: 11px;">${segment.effectiveDate || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Expires</span>
          <span class="detail-value" style="font-size: 11px;">${segment.expiryDate || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Area</span>
          <span class="detail-value">${segment.areaName}</span>
        </div>
      </div>
    `;
  });

  content.innerHTML = html;
  modal.classList.remove('hidden');
}

// ============================================
// 11) UTILITIES
// ============================================

function showToast(msg, type = 'info') {
  const container = byId('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

function refreshActiveLicenceHighlight() {
  const licenceNo = State.activeLicenceHighlightNo;
  if (State.activeAreaSearch) {
    refreshAreaSearchHighlight();
    return;
  }

  if (!licenceNo) {
    setGeoJsonSourceData(LICENCE_HIGHLIGHT_SOURCE_ID, []);
    setGeoJsonSourceData(LICENCE_HIGHLIGHT_OUTLINE_SOURCE_ID, []);
    updateLicenceHighlightControlVisibility();
    return;
  }
  if (!State.map) return;

  let sourceFeatures = [];
  try {
    sourceFeatures = State.map.querySourceFeatures(MAP_SOURCE_ID, {
      sourceLayer: MAP_SOURCE_LAYER
    });
  } catch (error) {
    showToast('Unable to query loaded vector tiles for this licence', 'error');
    return;
  }

  const matchingFeatures = normalizeLicenceHighlightFeatures(
    sourceFeatures.filter(
      (feature) => String(feature?.properties?.licence_no || '') === licenceNo
    )
  );

  if (!matchingFeatures.length) {
    setGeoJsonSourceData(LICENCE_HIGHLIGHT_SOURCE_ID, []);
    setGeoJsonSourceData(LICENCE_HIGHLIGHT_OUTLINE_SOURCE_ID, []);
    updateLicenceHighlightControlVisibility();
    return;
  }

  const styledFeatures = buildLicenceFillFeatures(matchingFeatures);
  const dissolvedFeatures = dissolveFeaturesForLicenceHighlight(matchingFeatures);
  setGeoJsonSourceData(LICENCE_HIGHLIGHT_SOURCE_ID, styledFeatures);
  setGeoJsonSourceData(LICENCE_HIGHLIGHT_OUTLINE_SOURCE_ID, dissolvedFeatures);
  updateLicenceHighlightControlVisibility();
}

function highlightLicenceOnMap(licenceNo) {
  if (!licenceNo || licenceNo === 'N/A') {
    showToast('No licence number available to highlight', 'info');
    return;
  }

  State.activeLicenceHighlightNo = String(licenceNo);
  State.activeAreaSearch = null;
  refreshActiveLicenceHighlight();
  updateLicenceHighlightControlVisibility();
  updateResetViewControlVisibility();
  syncFilterControls();
  rerenderAnalysisPanels();
  showToast(`Tracking loaded grid areas for licence ${licenceNo}`, 'success');
}

function updateAreaSearchHighlightFromFilters() {
  const availableCarrierIds = getAvailableCarrierFilterIds();
  const activeCarrierIds = getEffectiveSelectedIds(State.carrierFilters, availableCarrierIds);
  const hasCarrierSearch = Array.from(activeCarrierIds).some((id) => id !== 'selected-licence');

  if (!hasCarrierSearch) {
    if (!State.activeLicenceHighlightNo) {
      State.activeAreaSearch = null;
      setGeoJsonSourceData(LICENCE_HIGHLIGHT_SOURCE_ID, []);
      setGeoJsonSourceData(LICENCE_HIGHLIGHT_OUTLINE_SOURCE_ID, []);
    }
    return;
  }

  State.activeLicenceHighlightNo = null;
  State.activeAreaSearch = {
    label: buildAreaSearchLabel(activeCarrierIds),
    stats: { minMhz: 0, maxMhz: 0 }
  };
  refreshAreaSearchHighlight();
}

function buildAreaSearchLabel(activeCarrierIds) {
  const labels = Array.from(activeCarrierIds)
    .filter((id) => id !== 'selected-licence')
    .map((id) => id.startsWith('holder:') ? decodeHolderFilterId(id) : id);
  return labels.join(', ') || 'Filtered carriers';
}

function refreshAreaSearchHighlight() {
  if (!State.map || !State.activeAreaSearch) return;

  const criteria = buildSearchCriteria();
  const catalogFeatures = getAnnotatedCarrierScopedSearchFeatures().filter((feature) => featureMatchesAreaSearch(feature, criteria));

  const mhzValues = catalogFeatures
    .map((feature) => parseFloat(feature?.properties?.overlay_total_mhz ?? feature?.properties?.total_mhz_held) || 0)
    .filter(Number.isFinite);
  State.activeAreaSearch.stats = {
    minMhz: mhzValues.length ? Math.min(...mhzValues) : 0,
    maxMhz: mhzValues.length ? Math.max(...mhzValues) : 0
  };

  if (!catalogFeatures.length) {
    setGeoJsonSourceData(LICENCE_HIGHLIGHT_SOURCE_ID, []);
    setGeoJsonSourceData(LICENCE_HIGHLIGHT_OUTLINE_SOURCE_ID, []);
    return;
  }

  // Search overlays can span a national set of tiles, so avoid the expensive
  // dissolve/union path here. Drawing normalized grouped parts directly keeps
  // the overlay visible and much more reliable than trying to union all
  // matching search geometries into a few nationwide shapes.
  const normalizedFeatures = normalizeLicenceHighlightFeatures(catalogFeatures);
  const styledFeatures = applyLicenceHighlightOpacity(normalizedFeatures);
  setGeoJsonSourceData(LICENCE_HIGHLIGHT_SOURCE_ID, styledFeatures);
  setGeoJsonSourceData(LICENCE_HIGHLIGHT_OUTLINE_SOURCE_ID, []);
}

function featureMatchesAreaSearch(feature, criteria = buildSearchCriteria()) {
  const band = resolveBandForFeature(feature);
  if (!featureMatchesSearchBase(feature, criteria)) {
    return false;
  }

  const passesBandMatch = passesBandFilters(
    band,
    criteria.activeBandGroupIds,
    criteria.useAllBandGroups,
    criteria.activeSpecificBandIds,
    criteria.useAllSpecificBands
  );

  if (!passesBandMatch) {
    return false;
  }

  if (!band) return false;

  const range = State.bandMhzFilters[String(band.id)];
  if (!range) return true;

  const totalMhzHeld = parseFloat(feature.properties?.overlay_total_mhz ?? feature.properties?.total_mhz_held) || 0;
  return totalMhzHeld >= range.min && totalMhzHeld <= range.max;
}

function normalizeLicenceHighlightFeatures(features) {
  if (!Array.isArray(features) || !features.length) return [];

  const normalized = [];
  const seen = new Set();

  features.forEach((feature) => {
    if (!feature?.geometry || !feature?.properties) return;

    const baseFeature = {
      type: 'Feature',
      geometry: feature.geometry,
      properties: { ...feature.properties }
    };

    try {
      const flattened = turf.flatten(baseFeature);
      const parts = flattened?.features?.length ? flattened.features : [baseFeature];

      parts.forEach((part) => {
        if (!part?.geometry) return;
        const key = `${getHoldingKey(baseFeature.properties)}|${geometryKey(part.geometry)}`;
        if (seen.has(key)) return;
        seen.add(key);
        normalized.push({
          type: 'Feature',
          geometry: part.geometry,
          properties: { ...baseFeature.properties }
        });
      });
    } catch (error) {
      const key = `${getHoldingKey(baseFeature.properties)}|${geometryKey(baseFeature.geometry)}`;
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push(baseFeature);
    }
  });

  return normalized;
}

function applyLicenceHighlightOpacity(features) {
  if (!features.length) return [];

  const mhzValues = features.map((feature) => parseFloat(feature.properties?.overlay_total_mhz ?? feature.properties?.total_mhz_held) || 0);
  const maxMhz = Math.max(...mhzValues, 0);
  const minOpacity = 0.10;
  const maxOpacity = 0.42;

  return features.map((feature) => {
    const mhzHeld = parseFloat(feature.properties?.overlay_total_mhz ?? feature.properties?.total_mhz_held) || 0;
    const ratio = maxMhz > 0 ? (mhzHeld / maxMhz) : 0;
    const opacity = minOpacity + ((maxOpacity - minOpacity) * ratio);

    return {
      ...feature,
      properties: {
        ...(feature.properties || {}),
        highlight_opacity: Number(opacity.toFixed(3)),
        overlay_striped: Boolean(feature.properties?.overlay_striped)
      }
    };
  });
}

function buildLicenceFillFeatures(features) {
  const styledFeatures = applyLicenceHighlightOpacity(features);
  const grouped = new Map();

  styledFeatures.forEach((feature) => {
    const mhzHeld = parseFloat(feature.properties?.overlay_total_mhz ?? feature.properties?.total_mhz_held) || 0;
    const opacity = feature.properties?.highlight_opacity ?? 0.18;
    const striped = feature.properties?.overlay_striped ? 'striped' : 'solid';
    const key = `${mhzHeld}|${opacity}|${striped}`;

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    grouped.get(key).push(feature);
  });

  const dissolvedGroups = [];

  grouped.forEach((groupFeatures) => {
    const dissolved = dissolveFeaturesForLicenceHighlight(groupFeatures);
    dissolved.forEach((feature) => {
      dissolvedGroups.push({
        ...feature,
        properties: {
          ...(feature.properties || {}),
          highlight_opacity: groupFeatures[0]?.properties?.highlight_opacity ?? 0.18,
          total_mhz_held: groupFeatures[0]?.properties?.total_mhz_held ?? null,
          overlay_total_mhz: groupFeatures[0]?.properties?.overlay_total_mhz ?? null,
          overlay_striped: Boolean(groupFeatures[0]?.properties?.overlay_striped)
        }
      });
    });
  });

  return dissolvedGroups;
}

function dissolveFeaturesForLicenceHighlight(features) {
  const flattenedParts = [];

  features.forEach((feature) => {
    const flattened = turf.flatten(feature);
    const parts = flattened?.features || [];
    parts.forEach((part) => {
      if (part?.geometry) flattenedParts.push(part);
    });
  });

  if (!flattenedParts.length) return [];

  let dissolved = flattenedParts[0];

  for (let idx = 1; idx < flattenedParts.length; idx += 1) {
    try {
      dissolved = turf.union(dissolved, flattenedParts[idx]) || dissolved;
    } catch (error) {
      // Keep the accumulated geometry if a union operation fails on one part.
    }
  }

  return dissolved ? [dissolved] : [];
}

function setGeoJsonSourceData(sourceId, features) {
  if (!State.map) return;
  const source = State.map.getSource(sourceId);
  if (!source) return;

  source.setData({
    type: 'FeatureCollection',
    features
  });
}

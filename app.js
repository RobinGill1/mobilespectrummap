/**
 * Spectrum Visualiser - Mastdatabase-style with Advanced Features
 * - Band 26 paired with Band 5
 * - Carrier consolidation
 * - Bandwidth display
 * - Map controls (basemap, opacity)
 */

// ============================================
// 3GPP BAND DEFINITIONS
// ============================================

const BANDS = [
  { id: 28, name: 'Band 28', freq: '700 MHz', type: 'FDD', ulStart: 703, ulEnd: 748, dlStart: 758, dlEnd: 803 },
  { id: 5, name: 'Band 5 (26)', freq: '850 MHz / 800 MHz', type: 'FDD', ulStart: 824, ulEnd: 849, dlStart: 869, dlEnd: 894, b26ulStart: 814, b26ulEnd: 849, b26dlStart: 859, b26dlEnd: 894 },
  { id: 8, name: 'Band 8', freq: '900 MHz', type: 'FDD', ulStart: 880, ulEnd: 915, dlStart: 925, dlEnd: 960 },
  { id: 3, name: 'Band 3', freq: '1.8 GHz', type: 'FDD', ulStart: 1710, ulEnd: 1785, dlStart: 1805, dlEnd: 1880 },
  { id: 1, name: 'Band 1', freq: '2.1 GHz', type: 'FDD', ulStart: 1920, ulEnd: 1980, dlStart: 2110, dlEnd: 2170 },
  { id: 40, name: 'Band 40', freq: '2.3 GHz', type: 'TDD', tddStart: 2302, tddEnd: 2400 },
  { id: 7, name: 'Band 7', freq: '2.6 GHz', type: 'FDD', ulStart: 2500, ulEnd: 2570, dlStart: 2620, dlEnd: 2690 },
  { id: 78, name: 'Band n78', freq: '3.5 GHz', type: 'TDD', tddStart: 3400, tddEnd: 3800 },
  { id: 258, name: 'Band n258', freq: '26 GHz', type: 'TDD', tddStart: 24250, tddEnd: 27500 }
];

// ============================================
// ENTITY RESOLUTION
// ============================================

const CARRIERS = {
  'Telstra': ['TELSTRA LIMITED', 'Telstra 3G', 'DELTA NETWORKS'],
  'Optus': ['Optus Mobile', 'OPTUS MOBILE', 'Optitel', 'Singtel'],
  'Vodafone': ['Vodafone', 'TPG', 'MOBILE JV', 'Dense Air'],
  'NBN': ['NBN CO LIMITED', 'NBN']
};

function resolveCarrier(name) {
  if (!name) return 'Other';
  const upper = name.toUpperCase();
  for (const [parent, variants] of Object.entries(CARRIERS)) {
    if (variants.some(v => upper.includes(v.toUpperCase()))) return parent;
  }
  return 'Other';
}

function getCarrierClass(name) {
  const map = { 'Telstra': 'telstra', 'Optus': 'optus', 'Vodafone': 'vodafone', 'NBN': 'nbn' };
  return map[name] || 'other';
}

// ============================================
// STATE
// ============================================

const State = {
  map: null,
  currentFeatures: [],
  bandData: {},
  currentBasemap: 'light'
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initializeMap();
});

function setupEventListeners() {
  document.getElementById('locateBtn')?.addEventListener('click', handleGeolocation);
  document.getElementById('settingsBtn')?.addEventListener('click', toggleMapSettings);
  document.querySelector('.settings-close')?.addEventListener('click', toggleMapSettings);
  document.getElementById('basemapSelect')?.addEventListener('change', handleBasemapChange);
  document.getElementById('opacitySlider')?.addEventListener('input', handleOpacityChange);
  document.getElementById('linesOpacitySlider')?.addEventListener('input', handleLinesOpacityChange);
  
  // Holding Details Modal
  const modal = document.getElementById('holdingModal');
  document.querySelector('.modal-close')?.addEventListener('click', () => modal.classList.add('hidden'));
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
  
  // Raw Data Modal
  const rawDataModal = document.getElementById('rawDataModal');
  document.getElementById('rawDataBtn')?.addEventListener('click', () => {
    rawDataModal.classList.remove('hidden');
  });
  rawDataModal?.querySelector('.modal-close')?.addEventListener('click', () => {
    rawDataModal.classList.add('hidden');
  });
  rawDataModal?.addEventListener('click', (e) => {
    if (e.target === rawDataModal) rawDataModal.classList.add('hidden');
  });
  
  // Close settings when clicking outside
  document.getElementById('mapContainer')?.addEventListener('click', (e) => {
    const panel = document.getElementById('mapSettingsPanel');
    const btn = document.getElementById('settingsBtn');
    if (!panel.contains(e.target) && !btn.contains(e.target) && !panel.classList.contains('hidden')) {
      panel.classList.add('hidden');
    }
  });
}

// ============================================
// MAP INITIALIZATION
// ============================================

function initializeMap() {
  const baseMapUrl = State.currentBasemap === 'dark' 
    ? 'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png'
    : 'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png';
  
  State.map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        'basemap': {
          type: 'raster',
          tiles: [baseMapUrl],
          tileSize: 256,
          attribution: '© CartoDB'
        },
        'spectrum': {
          type: 'vector',
          tiles: ['https://robingill1.github.io/mobilespectrummap/mobile_spectrum_layer_VT/output_pbf_folder/{z}/{x}/{y}.pbf'],
          minzoom: 0,
          maxzoom: 14
        }
      },
      layers: [
        { id: 'basemap', type: 'raster', source: 'basemap' },
        {
          id: 'spectrum-fill',
          type: 'fill',
          source: 'spectrum',
          'source-layer': 'mobile_spectrum',
          paint: { 'fill-color': '#0052cc', 'fill-opacity': 0.01 },
          minzoom: 3
        },
        {
          id: 'spectrum-lines',
          type: 'line',
          source: 'spectrum',
          'source-layer': 'mobile_spectrum',
          paint: { 'line-color': '#fff', 'line-width': 0.5, 'line-opacity': 0.05 },
          minzoom: 3
        }
      ]
    },
    center: [133.8753, -25.2744],
    zoom: 4
  });
  
  State.map.on('load', () => {
    // Add ASMG grid highlight source and layer
    State.map.addSource('asmg-grid-highlight', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    
    State.map.addControl(new maplibregl.NavigationControl(), 'top-right');
    State.map.addControl(new maplibregl.ScaleControl({ maxWidth: 100 }), 'bottom-left');
    
    State.map.on('click', 'spectrum-fill', (e) => {
      if (e.features?.length > 0) {
        State.currentFeatures = e.features;
        displayBandAnalysis(e.features);
      }
    });
    
    State.map.on('mouseenter', 'spectrum-fill', () => {
      State.map.getCanvas().style.cursor = 'pointer';
    });
    State.map.on('mouseleave', 'spectrum-fill', () => {
      State.map.getCanvas().style.cursor = '';
    });
    
    showToast('Click spectrum area to analyze', 'info');
  });
}

// ============================================
// MAP CONTROLS
// ============================================

function toggleMapSettings() {
  const panel = document.getElementById('mapSettingsPanel');
  panel.classList.toggle('hidden');
}

function handleBasemapChange(e) {
  State.currentBasemap = e.target.value;
  const baseMapUrl = State.currentBasemap === 'dark'
    ? 'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png'
    : 'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png';
  
  State.map.getSource('basemap').tiles = [baseMapUrl];
  showToast(`Basemap changed to ${State.currentBasemap}`, 'success');
}

function handleOpacityChange(e) {
  if (!State.map) return;
  const opacity = e.target.value / 100;
  State.map.setPaintProperty('spectrum-fill', 'fill-opacity', opacity);
  document.getElementById('opacityValue').textContent = e.target.value + '%';
}

function handleLinesOpacityChange(e) {
  if (!State.map) return;
  const opacity = e.target.value / 100;
  State.map.setPaintProperty('spectrum-lines', 'line-opacity', opacity);
  document.getElementById('linesOpacityValue').textContent = e.target.value + '%';
}

// ============================================
// BAND ANALYSIS
// ============================================

function displayBandAnalysis(features) {
  // Show raw data button
  document.getElementById('rawDataBtn').style.display = 'block';
  
  // Update location
  if (features[0]?.properties?.area_name) {
    document.getElementById('locationName').textContent = features[0].properties.area_name;
    document.getElementById('locationDetails').textContent = `${features.length} holding${features.length > 1 ? 's' : ''}`;
    
    // Display HCIS ID and highlight ASMG grid
    const hcisId = features[0].properties.hcis_id;
    const hcisDisplay = document.getElementById('hcisIdDisplay');
    if (hcisId) {
      hcisDisplay.textContent = `HCIS: ${hcisId}`;
      hcisDisplay.style.display = 'block';
      highlightASMGGrid(features[0]);
    } else {
      hcisDisplay.style.display = 'none';
    }
  }
  
  // Group by band
  const bandMap = {};
  features.forEach(f => {
    const p = f.properties;
    const freq = parseFloat(p.lw_start_mhz) || 0;
    
    // First try to match UL range for FDD (uplink uses lower frequencies)
    let band = BANDS.find(b => {
      if (b.type === 'FDD') {
        // For Band 5, also check B26 extended range
        if (b.id === 5 && b.b26ulStart) {
          return freq >= b.b26ulStart && freq < b.b26ulEnd;
        }
        return freq >= b.ulStart && freq < b.ulEnd;
      }
      return freq >= b.tddStart && freq < b.tddEnd;
    });
    
    // If no UL match, try DL range for FDD (downlink uses higher frequencies)
    if (!band) {
      band = BANDS.find(b => {
        if (b.type === 'FDD') {
          // For Band 5, also check B26 extended range
          if (b.id === 5 && b.b26dlStart) {
            return freq >= b.b26dlStart && freq < b.b26dlEnd;
          }
          return freq >= b.dlStart && freq < b.dlEnd;
        }
        return false;
      });
    }
    
    if (!band) return;
    
    if (!bandMap[band.id]) {
      bandMap[band.id] = { band, holdings: [] };
    }
    
    bandMap[band.id].holdings.push({
      carrier: resolveCarrier(p.carrier_name),
      carrierClass: getCarrierClass(resolveCarrier(p.carrier_name)),
      rawName: p.carrier_name,
      licenceNo: p.licence_no || 'N/A',
      lwStart: parseFloat(p.lw_start_mhz),
      lwEnd: parseFloat(p.lw_end_mhz),
      upStart: parseFloat(p.up_start_mhz),
      upEnd: parseFloat(p.up_end_mhz),
      totalMhz: parseFloat(p.total_mhz_held),
      effectiveDate: p.date_of_effect,
      expiryDate: p.date_of_expiry,
      areaName: p.area_name
    });
  });
  
  State.bandData = bandMap;
  renderBandCharts(bandMap);
  displayRawData(features);
}

/**
 * Display raw data in filterable/sortable table format
 */
function displayRawData(features) {
  const rawDataBtn = document.getElementById('rawDataBtn');
  const rawDataContent = document.getElementById('rawDataContent');
  
  if (!features || features.length === 0) {
    rawDataBtn.style.display = 'none';
    return;
  }
  
  // Show the button
  rawDataBtn.style.display = 'inline-block';
  
  // Sort by lowest frequency to highest
  const sorted = [...features].sort((a, b) => {
    const freqA = parseFloat(a.properties.lw_start_mhz) || 0;
    const freqB = parseFloat(b.properties.lw_start_mhz) || 0;
    return freqA - freqB;
  });
  
  // Get all unique property keys
  const allKeys = new Set();
  sorted.forEach(f => {
    Object.keys(f.properties).forEach(k => allKeys.add(k));
  });
  const columns = Array.from(allKeys).sort();
  
  // Create table with filter row and headers
  let html = `
    <div style="overflow-x: auto;">
      <table id="rawDataTable" style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="background: var(--bg-tertiary);">
  `;
  
  // Add filter inputs in header
  columns.forEach(col => {
    const displayCol = col.replace(/_/g, ' ').toUpperCase();
    html += `
            <th style="padding: 4px; border: 1px solid var(--border); text-align: left; font-weight: 700; color: var(--text-primary); cursor: pointer; user-select: none;" onclick="sortTable(this, '${col}')">${displayCol} ▼</th>
    `;
  });
  
  html += `
          </tr>
          <tr style="background: var(--bg-secondary);">
  `;
  
  // Add filter row
  columns.forEach(col => {
    html += `
            <td style="padding: 2px; border: 1px solid var(--border);"><input type="text" placeholder="Filter..." onkeyup="filterTable()" style="width: 100%; padding: 2px; font-size: 10px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 2px;" /></td>
    `;
  });
  
  html += `
          </tr>
        </thead>
        <tbody>
  `;
  
  // Add data rows
  sorted.forEach((f, idx) => {
    const p = f.properties;
    html += `<tr>`;
    columns.forEach(col => {
      const value = p[col] || '';
      html += `<td style="padding: 4px; border: 1px solid var(--border); color: var(--text-secondary);">${value}</td>`;
    });
    html += `</tr>`;
  });
  
  html += `
        </tbody>
      </table>
    </div>
  `;
  
  rawDataContent.innerHTML = html;
}

/**
 * Sort table by column
 */
function sortTable(header, column) {
  const table = document.getElementById('rawDataTable');
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  
  // Determine sort direction
  const isAsc = header.classList.contains('sort-asc');
  
  // Remove sort indicators from all headers
  table.querySelectorAll('th').forEach(h => {
    h.classList.remove('sort-asc', 'sort-desc');
  });
  
  // Add sort indicator to current header
  if (isAsc) {
    header.classList.add('sort-desc');
  } else {
    header.classList.add('sort-asc');
  }
  
  // Get column index
  const colIndex = Array.from(header.parentElement.children).indexOf(header);
  
  // Sort rows
  rows.sort((a, b) => {
    const aVal = a.children[colIndex].textContent.trim();
    const bVal = b.children[colIndex].textContent.trim();
    
    // Try numeric sort
    const aNum = parseFloat(aVal);
    const bNum = parseFloat(bVal);
    
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return isAsc ? bNum - aNum : aNum - bNum;
    }
    
    // String sort
    return isAsc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
  });
  
  // Re-append sorted rows
  rows.forEach(row => tbody.appendChild(row));
}

/**
 * Filter table by column values
 */
function filterTable() {
  const table = document.getElementById('rawDataTable');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  const filterInputs = thead.querySelectorAll('tr:nth-child(2) input');
  const rows = tbody.querySelectorAll('tr');
  
  rows.forEach(row => {
    let show = true;
    row.querySelectorAll('td').forEach((td, idx) => {
      const filterValue = filterInputs[idx].value.toLowerCase();
      const cellValue = td.textContent.toLowerCase();
      
      if (filterValue && !cellValue.includes(filterValue)) {
        show = false;
      }
    });
    
    row.style.display = show ? '' : 'none';
  });
}

/**
 * Group and consolidate carrier holdings - only merge if contiguous
 */
function consolidateCarriers(holdings) {
  // Sort by frequency start
  const sorted = [...holdings].sort((a, b) => a.lwStart - b.lwStart);
  
  const consolidated = [];
  let currentGroup = null;
  
  sorted.forEach(h => {
    if (!currentGroup || 
        currentGroup.carrier !== h.carrier || 
        Math.abs((currentGroup.segments[currentGroup.segments.length - 1].lwEnd) - h.lwStart) > 0.01) {
      // Start new group if different carrier or not contiguous
      if (currentGroup) {
        consolidated.push(currentGroup);
      }
      currentGroup = {
        carrier: h.carrier,
        carrierClass: h.carrierClass,
        rawName: h.rawName,
        segments: [h]
      };
    } else {
      // Merge contiguous holding
      currentGroup.segments.push(h);
    }
  });
  
  if (currentGroup) {
    consolidated.push(currentGroup);
  }
  
  return consolidated;
}

/**
 * Render all band charts
 */
function renderBandCharts(bandMap) {
  const container = document.getElementById('bandModules');
  container.innerHTML = '';
  
  BANDS.forEach(band => {
    if (!bandMap[band.id]) return;
    
    const { holdings } = bandMap[band.id];
    const module = document.createElement('div');
    module.className = 'band-module';
    
    // Band header
    const header = document.createElement('div');
    header.className = 'band-header';
    header.innerHTML = `
      <div class="band-name">${band.name}</div>
      <div class="band-freq">${band.freq}</div>
      <div class="band-meta">${holdings.length} holding${holdings.length !== 1 ? 's' : ''}</div>
    `;
    module.appendChild(header);
    
    // Render spectrum tracks
    if (band.type === 'FDD') {
      module.appendChild(renderFDDChart(band, holdings));
    } else {
      module.appendChild(renderTDDChart(band, holdings));
    }
    
    container.appendChild(module);
  });
}

/**
 * Highlight ASMG grid cell on map
 */
function highlightASMGGrid(feature) {
  if (!State.map || !feature.geometry) return;
  
  // Create a GeoJSON feature from the query result
  const geoJsonFeature = {
    type: 'Feature',
    geometry: feature.geometry,
    properties: {}
  };
  
  // Update the asmg-grid-highlight source with the feature geometry
  const source = State.map.getSource('asmg-grid-highlight');
  if (source) {
    source.setData({
      type: 'FeatureCollection',
      features: [geoJsonFeature]
    });
  }
}

/**
 * Render FDD (UL/DL) chart with synchronized positioning
 */
function renderFDDChart(band, holdings) {
  const wrapper = document.createElement('div');
  wrapper.className = 'band-container';
  
  // Consolidate by carrier (only contiguous)
  const consolidated = consolidateCarriers(holdings);
  
  // For Band 5, use B26 extended ranges
  const ulStart = (band.id === 5 && band.b26ulStart) ? band.b26ulStart : band.ulStart;
  const ulEnd = (band.id === 5 && band.b26ulEnd) ? band.b26ulEnd : band.ulEnd;
  const dlStart = (band.id === 5 && band.b26dlStart) ? band.b26dlStart : band.dlStart;
  const dlEnd = (band.id === 5 && band.b26dlEnd) ? band.b26dlEnd : band.dlEnd;
  
  // Collect frequency boundaries from holdings (UL)
  const freqPointsUL = new Set();
  freqPointsUL.add(ulStart);
  freqPointsUL.add(ulEnd);
  holdings.forEach(h => {
    freqPointsUL.add(h.lwStart);
    freqPointsUL.add(h.lwEnd);
  });
  
  // Collect frequency boundaries from holdings (DL)
  const freqPointsDL = new Set();
  freqPointsDL.add(dlStart);
  freqPointsDL.add(dlEnd);
  holdings.forEach(h => {
    freqPointsDL.add(h.upStart);
    freqPointsDL.add(h.upEnd);
  });
  
  // UL TRACK
  const ulTrack = document.createElement('div');
  ulTrack.className = 'spectrum-track ul-track';
  
  const ulLabel = document.createElement('div');
  ulLabel.className = 'track-label';
  ulLabel.textContent = 'UL';
  ulTrack.appendChild(ulLabel);
  
  consolidated.forEach(group => {
    const totalBw = group.segments.reduce((sum, s) => sum + (s.lwEnd - s.lwStart), 0);
    const minFreq = Math.min(...group.segments.map(s => s.lwStart));
    const maxFreq = Math.max(...group.segments.map(s => s.lwEnd));
    
    const block = createSpectrumBlock(
      group,
      totalBw,
      minFreq,
      maxFreq,
      ulStart,
      ulEnd,
      group.segments
    );
    ulTrack.appendChild(block);
  });
  
  // DL TRACK
  const dlTrack = document.createElement('div');
  dlTrack.className = 'spectrum-track dl-track';
  
  const dlLabel = document.createElement('div');
  dlLabel.className = 'track-label';
  dlLabel.textContent = 'DL';
  dlTrack.appendChild(dlLabel);
  
  consolidated.forEach(group => {
    const totalBw = group.segments.reduce((sum, s) => sum + (s.upEnd - s.upStart), 0);
    const minFreq = Math.min(...group.segments.map(s => s.upStart));
    const maxFreq = Math.max(...group.segments.map(s => s.upEnd));
    
    const block = createSpectrumBlock(
      group,
      totalBw,
      minFreq,
      maxFreq,
      dlStart,
      dlEnd,
      group.segments,
      true // isDL
    );
    dlTrack.appendChild(block);
  });
  
  // Frequency axis (UL boundaries)
  const axisUL = document.createElement('div');
  axisUL.className = 'frequency-axis';
  axisUL.style.marginTop = '4px';
  
  const pointsUL = Array.from(freqPointsUL).sort((a, b) => a - b);
  pointsUL.forEach(mhz => {
    const label = document.createElement('div');
    label.className = 'freq-label';
    
    const pct = ((mhz - ulStart) / (ulEnd - ulStart)) * 100;
    label.style.left = pct + '%';
    label.textContent = mhz.toFixed(0);
    
    axisUL.appendChild(label);
  });
  
  // Frequency axis (DL boundaries)
  const axisDL = document.createElement('div');
  axisDL.className = 'frequency-axis';
  axisDL.style.marginTop = '-2px';
  
  const pointsDL = Array.from(freqPointsDL).sort((a, b) => a - b);
  pointsDL.forEach(mhz => {
    const label = document.createElement('div');
    label.className = 'freq-label';
    
    const pct = ((mhz - dlStart) / (dlEnd - dlStart)) * 100;
    label.style.left = pct + '%';
    label.textContent = mhz.toFixed(0);
    
    axisDL.appendChild(label);
  });
  
  wrapper.appendChild(ulTrack);
  wrapper.appendChild(axisUL);
  wrapper.appendChild(dlTrack);
  wrapper.appendChild(axisDL);
  
  return wrapper;
}

/**
 * Render TDD chart (single track)
 */
function renderTDDChart(band, holdings) {
  const wrapper = document.createElement('div');
  wrapper.className = 'band-container';
  
  // Consolidate by carrier (only contiguous)
  const consolidated = consolidateCarriers(holdings);
  
  // Collect frequency boundaries from holdings
  const freqPoints = new Set();
  freqPoints.add(band.tddStart);
  freqPoints.add(band.tddEnd);
  holdings.forEach(h => {
    freqPoints.add(h.lwStart);
    freqPoints.add(h.lwEnd);
  });
  
  const track = document.createElement('div');
  track.className = 'spectrum-track tdd-track';
  
  const label = document.createElement('div');
  label.className = 'track-label';
  label.textContent = 'TDD';
  track.appendChild(label);
  
  consolidated.forEach(group => {
    const totalBw = group.segments.reduce((sum, s) => sum + (s.lwEnd - s.lwStart), 0);
    const minFreq = Math.min(...group.segments.map(s => s.lwStart));
    const maxFreq = Math.max(...group.segments.map(s => s.lwEnd));
    
    const block = createSpectrumBlock(
      group,
      totalBw,
      minFreq,
      maxFreq,
      band.tddStart,
      band.tddEnd,
      group.segments
    );
    track.appendChild(block);
  });
  
  // Frequency axis
  const axis = document.createElement('div');
  axis.className = 'frequency-axis';
  axis.style.marginTop = '4px';
  
  const points = Array.from(freqPoints).sort((a, b) => a - b);
  points.forEach(mhz => {
    const label = document.createElement('div');
    label.className = 'freq-label';
    
    const pct = ((mhz - band.tddStart) / (band.tddEnd - band.tddStart)) * 100;
    label.style.left = pct + '%';
    label.textContent = mhz.toFixed(0);
    
    axis.appendChild(label);
  });
  
  wrapper.appendChild(track);
  wrapper.appendChild(axis);
  
  return wrapper;
}

/**
 * Create spectrum block with frequency-based positioning
 */
function createSpectrumBlock(group, totalBw, freqStart, freqEnd, bandStart, bandEnd, segments, isDL = false) {
  const block = document.createElement('div');
  block.className = `spectrum-block ${group.carrierClass}`;
  
  const bandwidth = freqEnd - freqStart;
  const bandRange = bandEnd - bandStart;
  
  // Percentage-based positioning (EXACT)
  const leftPct = ((freqStart - bandStart) / bandRange) * 100;
  const widthPct = (bandwidth / bandRange) * 100;
  
  block.style.left = leftPct + '%';
  block.style.width = Math.max(1.5, widthPct) + '%';
  
  // Display text: Carrier Name + Bandwidth
  const displayName = group.carrier === 'Other' ? group.rawName : group.carrier;
  const text = document.createElement('div');
  text.className = 'block-text';
  text.textContent = `${displayName} ${totalBw.toFixed(0)}MHz`;
  block.appendChild(text);
  
  // Click to show details
  block.addEventListener('click', (e) => {
    e.stopPropagation();
    showHoldingDetails(group, segments, freqStart, freqEnd, isDL);
  });
  
  return block;
}

/**
 * Show holding details modal
 */
function showHoldingDetails(group, segments, freqStart, freqEnd, isDL = false) {
  const modal = document.getElementById('holdingModal');
  const content = document.getElementById('holdingContent');
  
  let html = `
    <div class="detail-row">
      <span class="detail-label">Carrier</span>
      <span class="detail-value"><strong>${group.carrier}</strong></span>
    </div>
  `;
  
  segments.forEach((seg, idx) => {
    html += `
      <div style="border-top: 1px solid var(--border); padding-top: 8px; margin-top: 8px;">
        <div class="detail-row">
          <span class="detail-label">Holding ${idx + 1}</span>
          <span class="detail-value">${seg.licenceNo}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Range</span>
          <span class="detail-value">${isDL && seg.upStart ? `${seg.upStart.toFixed(2)}–${seg.upEnd.toFixed(2)}` : `${seg.lwStart.toFixed(2)}–${seg.lwEnd.toFixed(2)}`} MHz</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Bandwidth</span>
          <span class="detail-value">${seg.totalMhz.toFixed(1)} MHz</span>
        </div>
        ${seg.upStart ? `
        <div class="detail-row">
          <span class="detail-label">Duplex Spacing</span>
          <span class="detail-value">${(seg.upStart - seg.lwStart).toFixed(2)} MHz</span>
        </div>
        ` : ''}
        <div class="detail-row">
          <span class="detail-label">Effective</span>
          <span class="detail-value" style="font-size: 11px;">${seg.effectiveDate || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Expires</span>
          <span class="detail-value" style="font-size: 11px;">${seg.expiryDate || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Area</span>
          <span class="detail-value">${seg.areaName}</span>
        </div>
      </div>
    `;
  });
  
  content.innerHTML = html;
  modal.classList.remove('hidden');
}

// ============================================
// GEOLOCATION
// ============================================

function handleGeolocation() {
  if (!navigator.geolocation) {
    showToast('Geolocation not supported', 'error');
    return;
  }
  
  showToast('Finding location...', 'info');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      State.map.flyTo({
        center: [pos.coords.longitude, pos.coords.latitude],
        zoom: 10
      });
      showToast('Location found', 'success');
    },
    () => showToast('Could not get location', 'error')
  );
}

// ============================================
// UTILITIES
// ============================================

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

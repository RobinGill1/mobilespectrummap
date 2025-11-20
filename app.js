// Initialize map
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      cartoLight: {
        type: 'raster',
        tiles: ['https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors © CARTO'
      },
      mobileSpectrum: {
        type: 'vector',
        // Replace with your actual server path
        tiles: ['http://localhost:3000/mobile_spectrum_layer_VT/output_pbf_folder/{z}/{x}/{y}.pbf'],
        minzoom: 0,
        maxzoom: 12
      }
    },
    layers: [
      { id:'cartoLight', type:'raster', source:'cartoLight' }
    ],
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
  },
  center: [138.2,-34.48], // from metadata center
  zoom: 5
});

// Add navigation controls
map.addControl(new maplibregl.NavigationControl());

// Add spectrum layers once map loads
map.on('load', () => {
  map.addLayer({
    id: 'spectrum-fill',
    type: 'fill',
    source: 'mobileSpectrum',
    'source-layer': 'mobile_spectrum', // must match metadata.json
    paint: {
      'fill-color': [
        'interpolate', ['linear'], ['get','total_mhz_held'],
        0, '#22c55e',
        20, '#f59e0b',
        60, '#ef4444'
      ],
      'fill-opacity': 0.4
    }
  });
  map.addLayer({
    id: 'spectrum-line',
    type: 'line',
    source: 'mobileSpectrum',
    'source-layer': 'mobile_spectrum',
    paint: { 'line-color':'#1f2937','line-width':1 }
  });
});

// Draggable pin marker
let pinMarker = null;

// Click handler: drop/move pin and show feature details
map.on('click', (e) => {
  const features = map.queryRenderedFeatures(e.point, { layers:['spectrum-fill'] });
  if (!features || features.length === 0) return;

  // Drop or move pin
  if (!pinMarker) {
    pinMarker = new maplibregl.Marker({ draggable:true, color:'#3b82f6' })
      .setLngLat(e.lngLat)
      .addTo(map);
    pinMarker.on('dragend', () => {
      const pos = pinMarker.getLngLat();
      const screen = map.project(pos);
      const feats = map.queryRenderedFeatures(screen, { layers:['spectrum-fill'] });
      showDetails(feats);
    });
  } else {
    pinMarker.setLngLat(e.lngLat);
  }

  // Pass the whole array of features
  showDetails(features);
});

// Show feature details in side panel (multiple features)
function showDetails(features){
  if (!features || features.length === 0) {
    document.getElementById('featureDetails').innerHTML = 'Click the map to see details.';
    return;
  }

  // Build HTML for each feature
  const html = features.map((f, idx) => {
    const p = f.properties || {};
    const rows = [
      ['Carrier', p.carrier_name],
      ['Area', p.area_name],
      ['Licence', p.licence_no],
      ['Total MHz held', p.total_mhz_held],
      ['LW start MHz', p.lw_start_mhz],
      ['LW end MHz', p.lw_end_mhz],
      ['UP start MHz', p.up_start_mhz],
      ['UP end MHz', p.up_end_mhz],
      ['Effective', p.date_of_effect],
      ['Expiry', p.date_of_expiry]
    ];
    const details = rows.filter(([k,v])=>v!==undefined && v!=='')
      .map(([k,v])=>`<div class="stat"><strong>${k}:</strong> ${v}</div>`)
      .join('');
    return `<div style="margin-bottom:1em; border-bottom:1px solid #444;">
              <h3>Feature ${idx+1}</h3>
              ${details}
            </div>`;
  }).join('');

  document.getElementById('featureDetails').innerHTML = html;
}


// Build filter expression from inputs
function buildFilter(){
  const clauses = ['all'];
  const selectedCarriers = Array.from(document.querySelectorAll('#carrierName option:checked')).map(o=>o.value);
  if (selectedCarriers.length>0){
    clauses.push(['in',['get','carrier_name'],['literal',selectedCarriers]]);
  }
  function rangeClause(prop,min,max){
    const c=['all'];
    if(!isNaN(min)) c.push(['>=',['get',prop],min]);
    if(!isNaN(max)) c.push(['<=',['get',prop],max]);
    return c.length>1?c:null;
  }
  const lwStartClause=rangeClause('lw_start_mhz',parseFloat(document.getElementById('lwStartMin').value),parseFloat(document.getElementById('lwStartMax').value));
  const lwEndClause=rangeClause('lw_end_mhz',parseFloat(document.getElementById('lwEndMin').value),parseFloat(document.getElementById('lwEndMax').value));
  const totalClause=rangeClause('total_mhz_held',parseFloat(document.getElementById('totalMin').value),parseFloat(document.getElementById('totalMax').value));
  [lwStartClause,lwEndClause,totalClause].forEach(c=>{if(c)clauses.push(c);});
  return clauses.length>1?clauses:true;
}

// Apply filter to layers
function applyMapFilter(){
  const filter = buildFilter(); // buildFilter() returns a MapLibre filter expression

  // Apply the filter to both fill and line layers
  ['spectrum-fill','spectrum-line'].forEach(id => {
    if (map.getLayer(id)) {
      map.setFilter(id, filter);
    }
  });
}

// Event listeners for filter buttons
document.getElementById('applyFiltersBtn').addEventListener('click', () => {
  applyMapFilter();
});

document.getElementById('clearFiltersBtn').addEventListener('click', () => {
  // Reset all inputs
  ['lwStartMin','lwStartMax','lwEndMin','lwEndMax','totalMin','totalMax'].forEach(id => {
    document.getElementById(id).value = '';
  });
  Array.from(document.querySelectorAll('#carrierName option')).forEach(o => o.selected = false);

  // Clear filters (setFilter with null removes filter)
  ['spectrum-fill','spectrum-line'].forEach(id => {
    if (map.getLayer(id)) {
      map.setFilter(id, null);
    }
  });

  // Reset feature details panel
  document.getElementById('featureDetails').innerHTML = 'Click the map to see details.';
});

// OPTIONAL: populate carrier list dynamically from features in view
map.on('data', e => {
  if (e.sourceId === 'mobileSpectrum' && e.isSourceLoaded) {
    const feats = map.querySourceFeatures('mobileSpectrum', { sourceLayer: 'mobile_spectrum' }) || [];
    const carrierSet = new Set();
    feats.forEach(f => {
      const name = f.properties && f.properties.carrier_name;
      if (name) carrierSet.add(name);
    });
    const select = document.getElementById('carrierName');
    select.innerHTML = '';
    Array.from(carrierSet).sort().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
  }
});

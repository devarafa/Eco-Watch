import { useEffect, useRef } from 'react';
import L from 'leaflet';

const CAPTIONS = {
  before: 'Before - true colour',
  after: 'After - true colour',
  ndvi: 'NDVI preview',
  change: 'Detected pixel change'
};

export default function MapCanvas({ onReady, onPick, bbox, clickPoints = [], layers, showOsm, activeLayer, overlay, hint }) {
  const holder = useRef(null);
  const mapRef = useRef(null);
  const osmRef = useRef(null);
  const rectangleRef = useRef(null);
  const markersRef = useRef([]);
  const tileLayersRef = useRef({});
  const overlayRef = useRef(null);
  const callbacks = useRef({ onReady, onPick });
  callbacks.current = { onReady, onPick };

  useEffect(() => {
    if (!holder.current || mapRef.current) {
      return undefined;
    }

    const map = L.map(holder.current, {
      scrollWheelZoom: true,
      touchZoom: true,
      zoomControl: true,
      bounceAtZoomLimits: false
    }).setView([24, 15], 2);

    osmRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
    map.on('click', (event) => callbacks.current.onPick && callbacks.current.onPick(event.latlng));

    const invalidate = () => map.invalidateSize();
    window.addEventListener('resize', invalidate);
    window.addEventListener('eco-watch-chat-resize', invalidate);
    mapRef.current = map;
    if (callbacks.current.onReady) {
      callbacks.current.onReady(map);
    }

    return () => {
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('eco-watch-chat-resize', invalidate);
      map.remove();
      mapRef.current = null;
      osmRef.current = null;
      rectangleRef.current = null;
      markersRef.current = [];
      tileLayersRef.current = {};
      overlayRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (rectangleRef.current) {
      map.removeLayer(rectangleRef.current);
      rectangleRef.current = null;
    }
    markersRef.current.forEach((marker) => map.removeLayer(marker));
    markersRef.current = [];

    if (bbox && bbox.length === 4) {
      const [west, south, east, north] = bbox;
      rectangleRef.current = L.rectangle([[south, west], [north, east]], {
        color: '#1f7a4d',
        weight: 2,
        dashArray: '6 5',
        fillOpacity: 0.05
      }).addTo(map);
      map.fitBounds([[south, west], [north, east]], { padding: [35, 35], maxZoom: 12 });
    }

    clickPoints.forEach((point, index) => {
      const icon = L.divIcon({
        className: 'corner-marker',
        html: '<span>' + (index + 1) + '</span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });
      markersRef.current.push(L.marker([point.lat, point.lng], { icon }).addTo(map));
    });
  }, [bbox, clickPoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layers) {
      return;
    }

    const next = {};
    Object.entries(layers).forEach(([key, config]) => {
      if (!config || !config.url) {
        return;
      }
      let layer = tileLayersRef.current[key];
      if (!layer || layer._ecoUrl !== config.url) {
        if (layer) {
          map.removeLayer(layer);
        }
        layer = L.tileLayer(config.url, {
          opacity: 0,
          maxZoom: 18,
          bounds: config.bounds || undefined,
          attribution: 'Sentinel-2 / Planetary Computer'
        });
        layer._ecoUrl = config.url;
        next[key] = layer;
      } else {
        next[key] = layer;
      }
    });

    Object.keys(tileLayersRef.current).forEach((key) => {
      if (!next[key]) {
        map.removeLayer(tileLayersRef.current[key]);
      }
    });
    tileLayersRef.current = next;
  }, [layers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !osmRef.current) {
      return;
    }
    if (showOsm && !map.hasLayer(osmRef.current)) {
      map.addLayer(osmRef.current);
      osmRef.current.bringToBack();
    } else if (!showOsm && map.hasLayer(osmRef.current)) {
      map.removeLayer(osmRef.current);
    }
  }, [showOsm, layers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    Object.entries(tileLayersRef.current).forEach(([key, layer]) => {
      if (!map.hasLayer(layer)) {
        layer.addTo(map);
      }
      const isActive = key === activeLayer;
      layer.setOpacity(isActive ? 0.88 : 0);
      if (isActive) {
        layer.bringToFront();
      }
    });
    if (osmRef.current && map.hasLayer(osmRef.current)) {
      osmRef.current.bringToBack();
    }
    if (overlayRef.current) {
      overlayRef.current.bringToFront();
    }
  }, [activeLayer, layers, showOsm]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    if (overlayRef.current) {
      map.removeLayer(overlayRef.current);
      overlayRef.current = null;
    }
    if (overlay && overlay.url) {
      overlayRef.current = L.imageOverlay(overlay.url, overlay.bounds, { opacity: 0.78 }).addTo(map);
      overlayRef.current.bringToFront();
    }
  }, [overlay]);

  return (
    <div className="map-stack">
      <div className="real-map" ref={holder} aria-label="Satellite analysis map" />
      {!activeLayer && hint ? <div className="map-hint">{hint}</div> : null}
      {activeLayer ? <div className="map-caption">{CAPTIONS[activeLayer] || activeLayer}</div> : null}
      {activeLayer === 'change' ? (
        <div className="map-legend">
          <span><i style={{ background: '#2fae6a' }} /> New vegetation</span>
          <span><i style={{ background: '#ce762e' }} /> Vegetation loss</span>
          <span><i style={{ background: '#2f7fc7' }} /> Water change</span>
          <span><i style={{ background: '#e24e42' }} /> New hard surface</span>
        </div>
      ) : null}
    </div>
  );
}

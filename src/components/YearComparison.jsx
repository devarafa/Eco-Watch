import { useEffect, useRef } from 'react';
import L from 'leaflet';

export default function YearComparison({ items, bbox }) {
  const holders = useRef([]);

  useEffect(() => {
    const maps = [];

    items.forEach((item, index) => {
      const holder = holders.current[index];
      if (!holder || !item.layer || !item.layer.url) {
        return;
      }
      const bounds = item.layer.bounds || [[bbox[1], bbox[0]], [bbox[3], bbox[2]]];
      const map = L.map(holder, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        touchZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false
      }).fitBounds(bounds, { padding: [4, 4] });

      L.tileLayer(item.layer.url, {
        bounds: item.layer.bounds || undefined,
        maxZoom: 18,
        attribution: 'Sentinel-2 / Planetary Computer'
      }).addTo(map);

      maps.push(map);
    });

    const invalidate = () => maps.forEach((map) => map.invalidateSize());
    const frame = requestAnimationFrame(invalidate);
    window.addEventListener('resize', invalidate);
    window.addEventListener('eco-watch-chat-resize', invalidate);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('eco-watch-chat-resize', invalidate);
      maps.forEach((map) => map.remove());
    };
  }, [items, bbox]);

  return (
    <div className="year-compare-grid">
      {items.map((item, index) => (
        <article className="year-card" key={item.year + '-' + index}>
          <div className="year-card-head">
            <b>{item.year}</b>
            <span>{item.date}</span>
          </div>
          <div
            className="year-map"
            ref={(node) => { holders.current[index] = node; }}
            aria-label={'Satellite scene for ' + item.year}
          />
          <div className="year-card-foot">
            <span>Vegetation <strong>{Number.isFinite(Number(item.vegetation)) ? Number(item.vegetation).toFixed(1) + '%' : '-'}</strong></span>
            <span>Masked <strong>{item.masked}</strong></span>
            <span>Cloud <strong>{Number(item.cloud).toFixed(1)}%</strong></span>
          </div>
        </article>
      ))}
    </div>
  );
}

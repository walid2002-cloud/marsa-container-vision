import React from 'react';
import './TerminalMap.css';

/**
 * Normalise une chaîne (minuscule, sans accents).
 */
function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Retrouve l'id de zone à partir d'une chaîne libre (zone ou caméra), via les aliases.
 * @param {Array} zones
 * @param {string} zoneOrCamera
 * @returns {string|null}
 */
export function resolveZoneIdFromZones(zones, zoneOrCamera) {
  const z = normalize(zoneOrCamera);
  if (!z || !Array.isArray(zones)) return null;
  for (const zone of zones) {
    if (normalize(zone.id) === z) return zone.id;
    if (normalize(zone.camera_id) === z) return zone.id;
    if (Array.isArray(zone.aliases) && zone.aliases.some((a) => z.includes(normalize(a)))) {
      return zone.id;
    }
  }
  return null;
}

/**
 * Carte schématique du terminal (Phase 2).
 */
function TerminalMap({ zones = [], cameras = [], activeZoneId = null, activeCameraId = null, onZoneClick }) {
  const grid = { columns: 4 };
  const camByZone = {};
  cameras.forEach((c) => {
    if (!camByZone[c.zone_id]) camByZone[c.zone_id] = [];
    camByZone[c.zone_id].push(c);
  });

  return (
    <div className="tmap">
      <div
        className="tmap-grid"
        style={{ gridTemplateColumns: `repeat(${grid.columns}, 1fr)` }}
      >
        {zones.map((zone) => {
          const isActive = activeZoneId && zone.id === activeZoneId;
          const zoneCams = camByZone[zone.id] || (zone.camera_id ? [{ id: zone.camera_id, status: 'active' }] : []);
          const g = zone.grid || { col: 1, row: 1, colSpan: 1, rowSpan: 1 };
          const style = {
            gridColumn: `${g.col} / span ${g.colSpan || 1}`,
            gridRow: `${g.row} / span ${g.rowSpan || 1}`,
            '--tmap-accent': zone.accent || '#2563eb',
          };
          return (
            <button
              type="button"
              key={zone.id}
              className={`tmap-zone ${isActive ? 'tmap-zone--active' : ''}`}
              style={style}
              onClick={() => onZoneClick && onZoneClick(zone.id)}
              title={`${zone.name}${zone.camera_id ? ` — ${zone.camera_id}` : ''}`}
            >
              <span className="tmap-zone-name">{zone.name}</span>

              <span className="tmap-zone-cams">
                {zoneCams.length === 0 && <span className="tmap-nocam">Aucune caméra</span>}
                {zoneCams.map((cam) => {
                  const camActive = activeCameraId && normalize(cam.id) === normalize(activeCameraId);
                  const inactive = cam.status && cam.status !== 'active';
                  return (
                    <span
                      key={cam.id}
                      className={`tmap-cam ${camActive ? 'tmap-cam--active' : ''} ${inactive ? 'tmap-cam--off' : ''}`}
                    >
                      <span className="tmap-cam-dot" aria-hidden="true" />
                      {cam.id}
                    </span>
                  );
                })}
              </span>

              {typeof zone.containers_count === 'number' && zone.containers_count > 0 && (
                <span className="tmap-zone-count">
                  {zone.containers_count} conteneur{zone.containers_count > 1 ? 's' : ''}
                </span>
              )}

              {zone.active_alerts_count > 0 && (
                <span className="tmap-zone-alerts" title={`${zone.active_alerts_count} alerte(s) active(s)`}>
                  &#128680; {zone.active_alerts_count} alerte{zone.active_alerts_count > 1 ? 's' : ''}
                </span>
              )}

              {zone.last_container && (
                <span className="tmap-zone-last">
                  <span className="tmap-zone-last-code">{zone.last_container.container_code}</span>
                  {zone.last_container.needs_verification ? (
                    <span className="tmap-pill tmap-pill--verify">à vérifier</span>
                  ) : (
                    <span className="tmap-pill tmap-pill--fresh">récent</span>
                  )}
                </span>
              )}

              {isActive && <span className="tmap-zone-marker" aria-hidden="true">&#128205;</span>}
            </button>
          );
        })}
      </div>

      <div className="tmap-legend">
        <span className="tmap-legend-item"><span className="tmap-legend-swatch tmap-legend-active" /> Zone active</span>
        <span className="tmap-legend-item"><span className="tmap-cam-dot tmap-cam-dot--legend" /> Caméra active</span>
        <span className="tmap-legend-item"><span className="tmap-cam-dot tmap-cam-dot--legend tmap-cam-dot--off" /> Caméra inactive</span>
        <span className="tmap-legend-item"><span className="tmap-pill tmap-pill--verify" /> Position à vérifier</span>
      </div>
    </div>
  );
}

export default TerminalMap;

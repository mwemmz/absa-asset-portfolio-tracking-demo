import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Polygon,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import { GEOFENCE_TYPE, VEHICLE_STATUS } from '../lib/constants.js';

const ZAMBIA_CENTRE = [-15.4, 28.2];

const STATUS_COLOUR = {
  moving: '#0f9d58',
  stopped: '#d97706',
  offline: '#6b7280',
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Leaflet throws hard if a single coordinate is missing, which takes the whole
 * map down. Everything drawn is filtered through these first, so one malformed
 * row can only cost us one marker instead of the page.
 */
const isCoord = (n) => typeof n === 'number' && Number.isFinite(n);
const isValidCoord = (p) => Array.isArray(p) && isCoord(p[0]) && isCoord(p[1]);

/** Accepts [lat, lng] pairs or { lat, lng } objects and returns clean pairs. */
function cleanLine(points) {
  if (!Array.isArray(points)) return [];
  return points
    .map((p) => (Array.isArray(p) ? p : [p?.lat, p?.lng]))
    .filter(isValidCoord);
}

/** A directional vehicle marker built from plain HTML so it inherits the CSS tokens. */
function vehicleIcon(vehicle, selected) {
  const colour = STATUS_COLOUR[vehicle.status] ?? STATUS_COLOUR.offline;
  const tampered = vehicle.deviceStatus === 'tampered';
  const ring = tampered ? '#c8102e' : colour;
  const arrow = vehicle.status === 'moving' ? vehicle.heading ?? 0 : null;
  const rotation = arrow == null ? 0 : arrow;

  const classes = [
    'vehicle-marker',
    selected ? 'vehicle-marker-selected' : '',
    vehicle.status === 'offline' ? 'opacity-60' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const html = `
    <div class="${classes}" style="background:${colour};border-color:#fff;width:26px;height:26px">
      ${
        tampered
          ? `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">
               <svg viewBox="0 0 24 24" width="13" height="13" fill="#fff" aria-hidden="true">
                 <path d="M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-7h-2v5h2V9z"/>
               </svg>
             </span>`
          : arrow == null
            ? `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">
                 <span style="width:7px;height:7px;border-radius:9999px;background:#fff"></span>
               </span>`
            : `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;
                              transform:rotate(${rotation}deg)">
                 <svg viewBox="0 0 24 24" width="14" height="14" fill="#fff" aria-hidden="true">
                   <path d="M12 3 19 20l-7-4-7 4z"/>
                 </svg>
               </span>`
      }
    </div>
    ${tampered ? `<span style="position:absolute;inset:-6px;border:2px solid ${ring};border-radius:9999px;opacity:.6"></span>` : ''}
  `;

  return L.divIcon({
    html,
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

/** Imperative helpers that need the Leaflet map instance. */
function MapController({ vehicles, geofences, fitKey }) {
  const map = useMap();

  useEffect(() => {
    const key = fitKey ?? 'initial';
    if (key === 'initial') {
      map.setView(ZAMBIA_CENTRE, 6);
      return;
    }
    const points = [];
    for (const v of vehicles ?? []) if (v.lat != null && v.lng != null) points.push([v.lat, v.lng]);
    for (const g of geofences ?? []) points.push(...(g.polygon ?? []));
    if (!points.length) return;
    map.fitBounds(L.latLngBounds(points).pad(0.15), { animate: true, duration: 0.4 });
  }, [map, fitKey, vehicles, geofences]);

  return null;
}

/** Keep the selected vehicle in view as it moves. */
function FollowController({ vehicle }) {
  const map = useMap();
  useEffect(() => {
    if (!vehicle || vehicle.lat == null || vehicle.lng == null) return;
    map.panTo([vehicle.lat, vehicle.lng], { animate: true, duration: 0.6 });
  }, [map, vehicle?.id, vehicle?.lat, vehicle?.lng]);
  return null;
}

export function VehicleMap({
  vehicles = [],
  geofences = [],
  selectedId = null,
  onSelect,
  history = null,
  plannedRoute = null,
  alertMarkers = [],
  showGeofences = true,
  showRoutes = true,
  fitKey = 'initial',
  followSelected = false,
  className = '',
}) {
  const containerRef = useRef(null);
  const selected = vehicles.find((v) => v.id === selectedId) ?? null;

  const historyPoints = useMemo(() => cleanLine(history), [history]);
  const routeLine = useMemo(() => cleanLine(plannedRoute), [plannedRoute]);
  const geofenceShapes = useMemo(
    () =>
      (geofences ?? [])
        .map((g) => ({ ...g, ring: cleanLine(g.polygon) }))
        .filter((g) => g.ring.length >= 3),
    [geofences],
  );
  const plottable = useMemo(
    () => (vehicles ?? []).filter((v) => isCoord(v.lat) && isCoord(v.lng)),
    [vehicles],
  );

  return (
    <div className={`relative overflow-hidden ${className}`} ref={containerRef}>
      <MapContainer
        center={ZAMBIA_CENTRE}
        zoom={6}
        minZoom={5}
        maxZoom={17}
        scrollWheelZoom
        className="h-full w-full"
        preferCanvas
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <MapController vehicles={plottable} geofences={geofenceShapes} fitKey={fitKey} />
        {followSelected && selected && <FollowController vehicle={selected} />}

        {showGeofences &&
          geofenceShapes.map((g) => {
            const meta = GEOFENCE_TYPE[g.type] ?? { fill: '#6b7280' };
            return (
              <Polygon
                key={g.id}
                positions={g.ring}
                pathOptions={{
                  color: meta.fill,
                  weight: 2,
                  fillColor: meta.fill,
                  fillOpacity: g.type === 'depot' ? 0.1 : 0.14,
                  dashArray: g.type === 'depot' ? undefined : '5 5',
                }}
              >
                <Tooltip sticky direction="top">
                  <span className="font-semibold">{g.name}</span>
                  <br />
                  <span className="text-ink-500">{meta.label}</span>
                </Tooltip>
              </Polygon>
            );
          })}

        {showRoutes && routeLine.length > 1 && (
          <Polyline
            positions={routeLine}
            pathOptions={{ color: '#272d34', weight: 2, opacity: 0.35, dashArray: '4 8' }}
          />
        )}

        {historyPoints.length > 1 && (
          <>
            <Polyline
              positions={historyPoints}
              pathOptions={{ color: '#ffffff', weight: 6, opacity: 0.85 }}
            />
            <Polyline
              positions={historyPoints}
              pathOptions={{ color: '#c8102e', weight: 3, opacity: 0.9 }}
            />
          </>
        )}

        {alertMarkers
          .filter((a) => isCoord(a.lat) && isCoord(a.lng))
          .map((a) => (
            <CircleMarker
              key={`alert-${a.id}`}
              center={[a.lat, a.lng]}
              radius={9}
              pathOptions={{
                color: '#ffffff',
                weight: 2,
                fillColor: a.severity === 'critical' ? '#c8102e' : '#ea580c',
                fillOpacity: 0.55,
              }}
            >
              <Tooltip direction="top" opacity={1}>
                <span className="font-semibold">{a.title ?? 'Alert'}</span>
              </Tooltip>
            </CircleMarker>
          ))}

        {plottable.map((v) => {
          const meta = VEHICLE_STATUS[v.status];
          return (
            <Marker
              key={v.id}
              position={[v.lat, v.lng]}
              icon={vehicleIcon(v, v.id === selectedId)}
              eventHandlers={{ click: () => onSelect?.(v) }}
            >
              <Tooltip direction="top" offset={[0, -14]} opacity={1}>
                <div className="map-popup">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-ink-900">{v.reg}</span>
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: STATUS_COLOUR[v.status] }}
                      aria-label={meta?.label}
                    />
                  </div>
                  <dl className="mt-2 space-y-1 text-xs text-ink-600">
                    <div className="flex justify-between gap-4">
                      <dt>Driver</dt>
                      <dd className="font-medium text-ink-800">{v.driver}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>Status</dt>
                      <dd className="font-medium text-ink-800">
                        {meta?.label}
                        {v.speed > 0 ? ` · ${Math.round(v.speed)} km/h` : ''}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>Corridor</dt>
                      <dd className="truncate font-medium text-ink-800">{v.routeCorridor}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 border-t border-ink-100 pt-2 text-[10px] uppercase tracking-wide text-ink-400">
                    Simulated position
                  </p>
                </div>
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}

export default VehicleMap;
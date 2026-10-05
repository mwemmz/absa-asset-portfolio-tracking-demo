/**
 * Row -> API shape mappers.
 *
 * The agreed contract names a subset of fields. These mappers emit exactly the
 * contracted names (camelCase) plus a few additive extras the dashboard needs.
 */

export const VEHICLE_STATUSES = ['moving', 'stopped', 'offline'];
export const DEVICE_STATUSES = ['online', 'offline', 'tampered'];
export const ALERT_TYPES = [
  'route_deviation',
  'geofence_breach',
  'prolonged_stop',
  'device_disconnected',
  'tamper',
  'comms_lost',
];
export const ALERT_STATUSES = ['new', 'verified', 'escalated', 'resolved'];
export const ALERT_SEVERITIES = ['low', 'medium', 'high', 'critical'];
export const RESPONSE_STATUSES = [
  'not_required',
  'pending',
  'dispatched',
  'on_site',
  'stood_down',
  'closed',
];

/** Allowed alert status transitions. `resolved` is terminal. */
export const ALLOWED_TRANSITIONS = {
  new: ['verified', 'escalated', 'resolved'],
  verified: ['escalated', 'resolved'],
  escalated: ['resolved'],
  resolved: [],
};

export const RESPONSE_TRANSITIONS = {
  not_required: ['pending', 'dispatched'],
  pending: ['dispatched', 'stood_down'],
  dispatched: ['on_site', 'stood_down'],
  on_site: ['closed', 'stood_down'],
  stood_down: [],
  closed: [],
};

/**
 * `uptime_seconds` holds a fraction of a day, not seconds. Clamp on the way out
 * so a stale or corrupted row can never produce an impossible percentage.
 */
export function uptimePercentage(row) {
  const n = Number(row?.uptime_seconds ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(1, Math.max(0, n)) * 1000) / 10;
}

export function serialiseVehicle(row) {
  return {
    id: row.id,
    reg: row.reg,
    driver: row.driver,
    driverPhone: row.driver_phone,
    makeModel: row.make_model,
    category: row.category,
    customer: row.customer,
    agreementRef: row.agreement_ref,
    assetValueZmw: row.asset_value_zmw,
    homeDepot: row.home_depot,
    status: row.status,
    deviceStatus: row.device_status,
    routeId: row.route_id,
    routeName: row.route_name ?? null,
    routeCorridor: row.route_corridor ?? null,
    lat: row.lat,
    lng: row.lng,
    speed: Math.round(row.speed_kph * 10) / 10,
    heading: Math.round(row.heading ?? 0),
    deviationM: Math.round(row.deviation_m ?? 0),
    odometerKm: Math.round(row.odometer_km ?? 0),
    uptimePct: uptimePercentage(row),
    stoppedSince: row.stopped_since,
    offlineSince: row.offline_since,
    lastUpdate: row.last_update,
    lastEventAt: row.last_event_at,
  };
}

export function serialiseAlert(row) {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    vehicleReg: row.reg ?? undefined,
    driver: row.driver ?? undefined,
    type: row.type,
    severity: row.severity,
    status: row.status,
    responseStatus: row.response_status,
    title: row.title,
    details: row.details,
    notes: row.notes ?? undefined,
    locationLabel: row.location_label,
    lat: row.lat,
    lng: row.lng,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    verifiedAt: row.verified_at,
    escalatedAt: row.escalated_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    source: row.source,
  };
}

export function serialiseEvent(row) {
  return {
    id: row.id,
    alertId: row.alert_id,
    vehicleId: row.vehicle_id,
    action: row.action,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    fromResponse: row.from_response,
    toResponse: row.to_response,
    note: row.note,
    actor: row.actor,
    actorRole: row.actor_role,
    ts: row.ts,
  };
}
/** Shared display labels and colours. The source of truth is the API contract. */

export const VEHICLE_STATUS = {
  moving: { label: 'Moving', dot: 'bg-status-moving', text: 'text-status-moving', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  stopped: { label: 'Stopped', dot: 'bg-status-stopped', text: 'text-amber-700', chip: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
  offline: { label: 'Offline', dot: 'bg-status-offline', text: 'text-ink-500', chip: 'bg-ink-100 text-ink-600 ring-1 ring-ink-300' },
};

export const DEVICE_STATUS = {
  online: { label: 'Device online', chip: 'bg-ink-100 text-ink-600 ring-1 ring-ink-300' },
  offline: { label: 'Device offline', chip: 'bg-ink-200 text-ink-700 ring-1 ring-ink-400' },
  tampered: { label: 'Tampered', chip: 'bg-brand-50 text-brand-700 ring-1 ring-brand-300' },
};

export const ALERT_TYPE = {
  route_deviation: { label: 'Route deviation', short: 'Deviation' },
  geofence_breach: { label: 'Geofence breach', short: 'Geofence' },
  prolonged_stop: { label: 'Prolonged stop', short: 'Stop' },
  device_disconnected: { label: 'Device disconnected', short: 'Device' },
  tamper: { label: 'Tamper alert', short: 'Tamper' },
  comms_lost: { label: 'Loss of communication', short: 'Comms' },
};

export const ALERT_STATUS = {
  new: { label: 'New', chip: 'bg-brand-50 text-brand-700 ring-1 ring-brand-300', step: 1 },
  verified: { label: 'Verified', chip: 'bg-amber-50 text-amber-800 ring-1 ring-amber-300', step: 2 },
  escalated: { label: 'Escalated', chip: 'bg-orange-100 text-orange-900 ring-1 ring-orange-300', step: 3 },
  resolved: { label: 'Resolved', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300', step: 4 },
};

export const SEVERITY = {
  low: { label: 'Low', chip: 'bg-ink-100 text-ink-600 ring-1 ring-ink-300', bar: 'bg-ink-400' },
  medium: { label: 'Medium', chip: 'bg-amber-50 text-amber-800 ring-1 ring-amber-300', bar: 'bg-amber-500' },
  high: { label: 'High', chip: 'bg-orange-100 text-orange-900 ring-1 ring-orange-300', bar: 'bg-orange-500' },
  critical: { label: 'Critical', chip: 'bg-brand-600 text-white ring-1 ring-brand-700', bar: 'bg-brand-600' },
};

export const RESPONSE_STATUS = {
  not_required: 'Not required',
  pending: 'Response pending',
  dispatched: 'Team dispatched',
  on_site: 'Team on site',
  stood_down: 'Stood down',
  closed: 'Closed',
};

export const GEOFENCE_TYPE = {
  depot: { label: 'Depot', chip: 'bg-ink-100 text-ink-600 ring-1 ring-ink-300', fill: '#6b7280' },
  mining: { label: 'Mining area', chip: 'bg-brand-50 text-brand-700 ring-1 ring-brand-300', fill: '#c8102e' },
  border: { label: 'Border post', chip: 'bg-orange-50 text-orange-800 ring-1 ring-orange-300', fill: '#ea580c' },
  restricted: { label: 'Restricted', chip: 'bg-purple-50 text-purple-800 ring-1 ring-purple-300', fill: '#7c3aed' },
  corridor: { label: 'Corridor', chip: 'bg-sky-50 text-sky-800 ring-1 ring-sky-300', fill: '#0284c7' },
};

/** The incident workflow the brief asks for, mapped onto alert status + response. */
export const INCIDENT_STEPS = [
  { key: 'alert', label: 'Alert', hint: 'Raised by the monitoring engine', status: 'new' },
  { key: 'verification', label: 'Verification', hint: 'Control room confirms it is real', status: 'verified' },
  { key: 'escalation', label: 'Escalation', hint: 'Referred for asset recovery', status: 'escalated' },
  { key: 'response', label: 'Response', hint: 'Field team dispatched', response: true },
  { key: 'resolution', label: 'Resolution', hint: 'Closed with an outcome', status: 'resolved' },
];

export const STATUS_ORDER = ['new', 'verified', 'escalated', 'resolved'];

export const DEMO_LABEL = 'Concept Demo - Simulated Data';
/**
 * Seed definitions. Everything here is fictional.
 * Names, registrations, customers and agreements are invented for the demo.
 */

/**
 * Geofences. polygon is [[lat,lng], ...] - closed ring, clockwise.
 * severity drives the alert severity when a vehicle crosses the boundary.
 */
export const GEOFENCES = [
  {
    id: 1,
    name: 'Lusaka Depot',
    type: 'depot',
    severity: 'low',
    description: 'Absa Lusaka operations yard. Vehicle out-and-back movements are expected here.',
    polygon: [
      [-15.3862, 28.2832],
      [-15.3801, 28.2836],
      [-15.3798, 28.2938],
      [-15.3861, 28.2935],
    ],
  },
  {
    id: 2,
    name: 'Copperbelt Mining Area',
    type: 'mining',
    severity: 'critical',
    description:
      'Mufulira, Chililabombwe and Kitwe mine concession belt. Entry requires a valid site pass.',
    polygon: [
      [-13.0434, 28.0585],
      [-11.9563, 28.0585],
      [-11.9563, 28.4671],
      [-13.0434, 28.4671],
    ],
  },
  {
    id: 3,
    name: 'Chirundu Border Post',
    type: 'border',
    severity: 'high',
    description: 'Zimbabwe crossing at Chirundu. Cross-border movement must be declared.',
    polygon: [
      [-16.3345, 28.7195],
      [-16.2601, 28.7195],
      [-16.2601, 28.7862],
      [-16.3345, 28.7862],
    ],
  },
  {
    id: 4,
    name: 'Livingstone Depot',
    type: 'depot',
    severity: 'low',
    description: 'Absa Livingstone yard, near the tourism corridor.',
    polygon: [
      [-17.8731, 25.8369],
      [-17.8387, 25.8376],
      [-17.8391, 25.8694],
      [-17.8727, 25.869],
    ],
  },
  {
    id: 5,
    name: 'Kafue Gorge Restricted Area',
    type: 'restricted',
    severity: 'high',
    description: 'Environmental protection area south-west of Lusaka. Through-traffic only.',
    polygon: [
      [-15.9724, 27.7449],
      [-15.5513, 27.7449],
      [-15.5513, 28.1151],
      [-15.9724, 28.1151],
    ],
  },
];

/** Flat spec table. Vehicles reference these by index (0-13). */
const SPECS = [
  { make_model: 'Mercedes-Benz Actros 2045', category: 'articulated truck', asset_value_zmw: 3850000 },
  { make_model: 'Scania R450 Highline', category: 'articulated truck', asset_value_zmw: 4120000 },
  { make_model: 'Isuzu FTR 850', category: 'rigid truck', asset_value_zmw: 1980000 },
  { make_model: 'Isuzu NPR 750', category: 'rigid truck', asset_value_zmw: 1420000 },
  { make_model: 'Mitsubishi Fuso Canter 7.5t', category: 'rigid truck', asset_value_zmw: 1760000 },
  { make_model: 'Howo ZZ3257 Tipper', category: 'tipper truck', asset_value_zmw: 2680000 },
  { make_model: 'Foton Auman Tipper', category: 'tipper truck', asset_value_zmw: 2240000 },
  { make_model: 'Toyota Hilux Double Cab', category: 'pickup', asset_value_zmw: 1150000 },
  { make_model: 'Isuzu D-Max 3.0 LS', category: 'pickup', asset_value_zmw: 1080000 },
  { make_model: 'Nissan NV350 Impendulo', category: 'panel van', asset_value_zmw: 890000 },
  { make_model: 'Toyota Hiace Super GL', category: 'panel van', asset_value_zmw: 940000 },
  { make_model: 'Suzuki Super Carry', category: 'light commercial', asset_value_zmw: 620000 },
  { make_model: 'JMC V370', category: 'light commercial', asset_value_zmw: 585000 },
  { make_model: 'Toyota Land Cruiser 79 Series', category: 'light commercial', asset_value_zmw: 1340000 },
];

const DRIVERS = [
  'Chanda Phiri',
  'Mwape Banda',
  'Musonda Hamavwa',
  'Silvester Nkandu',
  'Bright Chileshe',
  'Enock Mulenga',
  'Kabaso Simukonda',
  'Gift Chirwa',
  'Clive Kasonde',
  'Benson Mwale',
  'Patrick Sinkala',
  'Doreen Kapambwe',
  'Arthur Mbewe',
  'Raphael Lukwesa',
  'Chileso Chama',
  'Moses Zulu',
  'Happiness Mumba',
  'Isaac Mvula',
  'Lazarus Malama',
  'Owen Sichone',
  'Priscilla Sakala',
  'Tiwonge Nkhata',
  'John Kunda',
  'Faith Chulu',
  'Emmanuel Phiri',
];

/**
 * 25 vehicles. route_id comes from src/data/routes.json.
 * `corridor` is only used to give each vehicle a sensible home depot.
 */
export const VEHICLES = [
  { reg: 'BAX 4412', driver: 0, spec: 0, route: 'r1', home: 'Lusaka Depot', agreement: 'ABZ/FL/2024/0114' },
  { reg: 'BAY 7783', driver: 1, spec: 1, route: 'r1', home: 'Lusaka Depot', agreement: 'ABZ/FL/2024/0119' },
  { reg: 'BAZ 1906', driver: 2, spec: 2, route: 'r1', home: 'Lusaka Depot', agreement: 'ABZ/FL/2024/0126' },
  { reg: 'BBF 5521', driver: 3, spec: 3, route: 'r2', home: 'Lusaka Depot', agreement: 'ABZ/FL/2024/0133' },
  { reg: 'BBG 9034', driver: 4, spec: 4, route: 'r2', home: 'Lusaka Depot', agreement: 'ABZ/FL/2024/0141' },
  { reg: 'BBJ 2460', driver: 5, spec: 5, route: 'r6', home: 'Lusaka Depot', agreement: 'ABZ/FL/2024/0148' },
  { reg: 'BBL 6657', driver: 6, spec: 6, route: 'r6', home: 'Lusaka Depot', agreement: 'ABZ/FL/2024/0155' },
  { reg: 'BBM 3378', driver: 7, spec: 2, route: 'r7', home: 'Lusaka Depot', agreement: 'ABZ/FL/2024/0162' },
  { reg: 'BBP 8802', driver: 8, spec: 3, route: 'r7', home: 'Lusaka Depot', agreement: 'ABZ/FL/2024/0170' },
  { reg: 'BBR 1145', driver: 9, spec: 0, route: 'r4', home: 'Lusaka Depot', agreement: 'ABZ/FL/2024/0183' },
  { reg: 'BBT 5290', driver: 10, spec: 1, route: 'r4', home: 'Lusaka Depot', agreement: 'ABZ/FL/2024/0197' },
  { reg: 'BBV 4611', driver: 11, spec: 4, route: 'r4', home: 'Lusaka Depot', agreement: 'ABZ/FL/2024/0204' },
  { reg: 'BBW 7738', driver: 12, spec: 5, route: 'r5', home: 'Livingstone Depot', agreement: 'ABZ/FL/2024/0211' },
  { reg: 'BBX 2094', driver: 13, spec: 6, route: 'r5', home: 'Livingstone Depot', agreement: 'ABZ/FL/2024/0219' },
  { reg: 'BBY 6305', driver: 14, spec: 3, route: 'r5', home: 'Livingstone Depot', agreement: 'ABZ/FL/2024/0226' },
  { reg: 'BBZ 9452', driver: 15, spec: 2, route: 'r5', home: 'Livingstone Depot', agreement: 'ABZ/FL/2024/0234' },
  { reg: 'BCA 1128', driver: 16, spec: 0, route: 'r8', home: 'Ndola Yard', agreement: 'ABZ/FL/2024/0242' },
  { reg: 'BCC 3879', driver: 17, spec: 1, route: 'r8', home: 'Ndola Yard', agreement: 'ABZ/FL/2024/0250' },
  { reg: 'BCD 5013', driver: 18, spec: 5, route: 'r3', home: 'Ndola Yard', agreement: 'ABZ/FL/2024/0267' },
  { reg: 'BCF 8762', driver: 19, spec: 6, route: 'r3', home: 'Ndola Yard', agreement: 'ABZ/FL/2024/0275' },
  { reg: 'BCG 2245', driver: 20, spec: 7, route: 'r2', home: 'Ndola Yard', agreement: 'ABZ/FL/2024/0283' },
  { reg: 'BCH 6940', driver: 21, spec: 8, route: 'r1', home: 'Ndola Yard', agreement: 'ABZ/FL/2024/0298' },
  { reg: 'BCJ 3588', driver: 22, spec: 9, route: 'r6', home: 'Lusaka Depot', agreement: 'ABZ/FL/2024/0306' },
  { reg: 'BCK 8174', driver: 23, spec: 10, route: 'r4', home: 'Livingstone Depot', agreement: 'ABZ/FL/2024/0314' },
  { reg: 'BCL 4409', driver: 24, spec: 11, route: 'r7', home: 'Lusaka Depot', agreement: 'ABZ/FL/2024/0322' },
];

const CUSTOMERS = [
  'Chibwe Haulage Ltd',
  'Kalonga Mining Services',
  'Zambezi Logistics (ZM) Ltd',
  'Mopani Trading Company',
  'Luanshya Bulk Transport',
  'Kafue Aggregates Ltd',
  'Mufulira Ore Handling',
  'Copperfield Contractors',
  'Mazabuka Milling Co',
  'Kariba Freight Movers',
];

/** Resolve the compact vehicle definitions into full seed rows. */
export function buildVehicleRows() {
  return VEHICLES.map((v, idx) => {
    const spec = SPECS[v.spec];
    if (!spec) throw new Error(`vehicle ${v.reg} references unknown spec ${v.spec}`);
    return {
      reg: v.reg,
      make_model: spec.make_model,
      category: spec.category,
      driver: DRIVERS[v.driver % DRIVERS.length],
      driver_phone: `+260 7${[55, 76, 97, 21, 44, 63, 85, 39, 58, 72, 91, 30][idx % 12]} ${100000 + idx * 4831}`,
      customer: CUSTOMERS[idx % CUSTOMERS.length],
      agreement_ref: v.agreement,
      asset_value_zmw: spec.asset_value_zmw,
      home_depot: v.home,
      route_id: v.route,
    };
  });
}

export const USERS = [
  {
    email: 'admin@absa-demo',
    password: 'demo1234',
    name: 'Demo Administrator',
    role: 'admin',
  },
  {
    email: 'monitor@absa-demo',
    password: 'demo1234',
    name: 'Control Room Monitor',
    role: 'monitor',
  },
];
/**
 * Master data for the simulation: the distributor, 10 farm producers
 * (trading partners) and 100 farm products (10 per producer).
 *
 * All companies, people, addresses, IDs and contact details in this project
 * are FICTIONAL. Any resemblance to real businesses is coincidental.
 */

export const DISTRIBUTOR = {
  name: 'Harvest Hub Distribution',
  isaQualifier: 'ZZ',
  isaId: 'HARVESTHUB',
  gsCode: 'HARVESTHUB',
  n1Code: 'HHD001',
  address: '1 Example Plaza',
  city: 'Lumen City',
  state: 'CA',
  postalCode: '00010',
} as const;

export interface Producer {
  code: string;
  name: string;
  isaQualifier: 'ZZ';
  isaId: string;
  gsCode: string;
  ftpUser: string;
  upcPrefix: string;
  skuPrefix: string;
  city: string;
  state: string;
  postalCode: string;
  address: string;
  specialty: string;
}

const p = (
  n: number,
  name: string,
  isaId: string,
  skuPrefix: string,
  specialty: string,
  address: string,
  city: string,
  state: string,
  postalCode: string,
): Producer => ({
  code: `PRD${String(n).padStart(3, '0')}`,
  name,
  isaQualifier: 'ZZ',
  isaId,
  gsCode: isaId,
  ftpUser: isaId.toLowerCase(),
  upcPrefix: String(81000 + n * 7),
  skuPrefix,
  specialty,
  address,
  city,
  state,
  postalCode,
});

export const PRODUCERS: Producer[] = [
  p(1, 'Zephyrwood Greens', 'ZEPHYRWOOD', 'ZWG', 'Vegetables', '100 Example Road', 'Fernhollow', 'CA', '00011'),
  p(2, 'Quillberry Orchards', 'QUILLBERRY', 'QBO', 'Tree fruit', '200 Example Lane', 'Brightwater', 'WA', '00012'),
  p(3, 'Mossvale Creamery', 'MOSSVALE', 'MVC', 'Dairy', '300 Example Way', 'Cloudmere', 'OR', '00013'),
  p(4, 'Pebblewing Poultry', 'PEBBLEWING', 'PWP', 'Eggs & poultry', '400 Example Court', 'Hollowbrook', 'CA', '00014'),
  p(5, 'Thistlewick Mills', 'THISTLEWICK', 'TWM', 'Grains & flour', '500 Example Street', 'Amberplain', 'KS', '00015'),
  p(6, 'Glimmerhive Apiary', 'GLIMMERHIVE', 'GHA', 'Honey & maple', '600 Example Hill', 'Lumen Falls', 'NC', '00016'),
  p(7, 'Ironfern Ranch', 'IRONFERN', 'IFR', 'Pasture-raised meat', '700 Example Trail', 'Copperridge', 'MT', '00017'),
  p(8, 'Wispmeadow Herbs', 'WISPMEADOW', 'WMH', 'Herbs & greens', '800 Example Drive', 'Mistvale', 'VT', '00018'),
  p(9, 'Lanternfield Organics', 'LANTERNFIELD', 'LFO', 'Legumes & roots', '900 Example Avenue', 'Starfall', 'ND', '00019'),
  p(10, 'Driftcove Berries', 'DRIFTCOVE', 'DCB', 'Berries', '1000 Example Shore', 'Seaglass Bay', 'CA', '00020'),
];

export interface ProductSeed {
  sku: string;
  upc: string;
  name: string;
  category: string;
  uom: string;
  pack: number;
  size: number;
  unitPrice: number;
  producerCode: string;
}

/** UPC-A check digit. */
export function upcCheckDigit(eleven: string): string {
  const digits = eleven.split('').map(Number);
  const odd = digits.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
  const even = digits.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0);
  return String((10 - ((odd * 3 + even) % 10)) % 10);
}

type Row = [name: string, category: string, uom: string, pack: number, size: number, price: number];

const ITEMS: Record<string, Row[]> = {
  ZEPHYRWOOD: [
    ['Organic Romaine Lettuce', 'Vegetables', 'CA', 24, 1, 28.5],
    ['Rainbow Carrots', 'Vegetables', 'LB', 1, 25, 1.35],
    ['Broccoli Crowns', 'Vegetables', 'LB', 1, 20, 1.9],
    ['Heirloom Tomatoes', 'Vegetables', 'LB', 1, 10, 3.25],
    ['English Cucumbers', 'Vegetables', 'EA', 12, 1, 0.95],
    ['Sweet Bell Peppers', 'Vegetables', 'LB', 1, 11, 2.4],
    ['Green Zucchini', 'Vegetables', 'LB', 1, 20, 1.15],
    ['Cauliflower', 'Vegetables', 'EA', 12, 1, 2.1],
    ['Red Onions', 'Vegetables', 'LB', 1, 50, 0.7],
    ['Baby Spinach', 'Vegetables', 'LB', 1, 4, 4.8],
  ],
  QUILLBERRY: [
    ['Honeycrisp Apples', 'Fruit', 'LB', 1, 40, 1.85],
    ['Gala Apples', 'Fruit', 'LB', 1, 40, 1.25],
    ['Bartlett Pears', 'Fruit', 'LB', 1, 44, 1.4],
    ['Bing Cherries', 'Fruit', 'LB', 1, 18, 4.6],
    ['Yellow Peaches', 'Fruit', 'LB', 1, 25, 2.2],
    ['Nectarines', 'Fruit', 'LB', 1, 25, 2.35],
    ['Italian Plums', 'Fruit', 'LB', 1, 28, 1.95],
    ['Apricots', 'Fruit', 'LB', 1, 24, 3.1],
    ['Fresh Pressed Apple Cider', 'Beverages', 'GA', 4, 1, 6.5],
    ['Dried Apple Rings', 'Pantry', 'LB', 1, 5, 7.8],
  ],
  MOSSVALE: [
    ['Whole Milk', 'Dairy', 'GA', 4, 1, 4.2],
    ['2% Reduced Fat Milk', 'Dairy', 'GA', 4, 1, 3.95],
    ['Heavy Cream', 'Dairy', 'EA', 12, 1, 3.6],
    ['Salted Butter', 'Dairy', 'LB', 1, 36, 4.75],
    ['Aged Cheddar', 'Dairy', 'LB', 1, 10, 7.9],
    ['Fresh Mozzarella', 'Dairy', 'LB', 1, 6, 6.4],
    ['Greek Yogurt', 'Dairy', 'EA', 12, 1, 1.85],
    ['Cottage Cheese', 'Dairy', 'EA', 12, 1, 2.45],
    ['Gouda Wheel', 'Dairy', 'LB', 1, 8, 9.2],
    ['Buttermilk', 'Dairy', 'EA', 12, 1, 2.1],
  ],
  PEBBLEWING: [
    ['Free Range Large Brown Eggs', 'Eggs', 'DZ', 15, 1, 3.4],
    ['Pasture Raised Jumbo Eggs', 'Eggs', 'DZ', 15, 1, 4.25],
    ['Duck Eggs', 'Eggs', 'DZ', 6, 1, 7.5],
    ['Quail Eggs', 'Eggs', 'DZ', 12, 1, 5.2],
    ['Whole Roasting Chicken', 'Poultry', 'LB', 1, 40, 3.6],
    ['Chicken Breasts', 'Poultry', 'LB', 1, 40, 5.9],
    ['Chicken Thighs', 'Poultry', 'LB', 1, 40, 3.95],
    ['Ground Turkey', 'Poultry', 'LB', 1, 20, 5.1],
    ['Turkey Breast', 'Poultry', 'LB', 1, 20, 7.25],
    ['Chicken Bone Broth', 'Pantry', 'EA', 12, 1, 6.8],
  ],
  THISTLEWICK: [
    ['Hard Red Wheat Berries', 'Grains', 'LB', 1, 50, 0.85],
    ['Stone Ground Whole Wheat Flour', 'Grains', 'LB', 1, 25, 1.2],
    ['Unbleached All Purpose Flour', 'Grains', 'LB', 1, 50, 0.75],
    ['Rolled Oats', 'Grains', 'LB', 1, 25, 1.1],
    ['Steel Cut Oats', 'Grains', 'LB', 1, 25, 1.45],
    ['Pearled Barley', 'Grains', 'LB', 1, 25, 1.3],
    ['Yellow Cornmeal', 'Grains', 'LB', 1, 25, 0.95],
    ['Rye Flour', 'Grains', 'LB', 1, 25, 1.35],
    ['Spelt Flour', 'Grains', 'LB', 1, 25, 1.9],
    ['Sunflower Seeds', 'Pantry', 'LB', 1, 25, 2.6],
  ],
  GLIMMERHIVE: [
    ['Wildflower Honey', 'Honey & Syrup', 'JR', 12, 1, 8.5],
    ['Clover Honey', 'Honey & Syrup', 'JR', 12, 1, 7.25],
    ['Raw Honeycomb', 'Honey & Syrup', 'EA', 6, 1, 14.0],
    ['Buckwheat Honey', 'Honey & Syrup', 'JR', 12, 1, 9.4],
    ['Pure Maple Syrup Grade A', 'Honey & Syrup', 'EA', 12, 1, 11.5],
    ['Maple Sugar', 'Honey & Syrup', 'LB', 1, 10, 12.8],
    ['Beeswax Candles', 'Home', 'EA', 24, 1, 4.5],
    ['Bee Pollen', 'Pantry', 'LB', 1, 2, 18.0],
    ['Honey Mustard', 'Pantry', 'JR', 12, 1, 4.9],
    ['Creamed Honey', 'Honey & Syrup', 'JR', 12, 1, 8.9],
  ],
  IRONFERN: [
    ['Grass Fed Ground Beef', 'Meat', 'LB', 1, 20, 6.75],
    ['Ribeye Steak', 'Meat', 'LB', 1, 10, 18.5],
    ['New York Strip Steak', 'Meat', 'LB', 1, 10, 16.25],
    ['Beef Chuck Roast', 'Meat', 'LB', 1, 15, 8.4],
    ['Heritage Pork Chops', 'Meat', 'LB', 1, 15, 7.6],
    ['Pork Shoulder', 'Meat', 'LB', 1, 20, 4.9],
    ['Thick Cut Bacon', 'Meat', 'LB', 1, 15, 9.8],
    ['Breakfast Sausage', 'Meat', 'LB', 1, 10, 7.2],
    ['Lamb Leg', 'Meat', 'LB', 1, 10, 12.9],
    ['Beef Bone Broth', 'Pantry', 'EA', 12, 1, 7.4],
  ],
  WISPMEADOW: [
    ['Sweet Basil', 'Herbs', 'BG', 12, 1, 2.9],
    ['Italian Parsley', 'Herbs', 'BG', 24, 1, 1.4],
    ['Cilantro', 'Herbs', 'BG', 24, 1, 1.3],
    ['Fresh Rosemary', 'Herbs', 'BG', 12, 1, 2.2],
    ['Thyme', 'Herbs', 'BG', 12, 1, 2.3],
    ['Mint', 'Herbs', 'BG', 12, 1, 2.1],
    ['Lacinato Kale', 'Vegetables', 'EA', 24, 1, 1.75],
    ['Swiss Chard', 'Vegetables', 'EA', 24, 1, 1.65],
    ['Arugula', 'Vegetables', 'LB', 1, 3, 5.6],
    ['Microgreens Mix', 'Vegetables', 'PK', 12, 1, 3.8],
  ],
  LANTERNFIELD: [
    ['Black Beans', 'Legumes', 'LB', 1, 25, 1.25],
    ['Pinto Beans', 'Legumes', 'LB', 1, 25, 1.1],
    ['Green Lentils', 'Legumes', 'LB', 1, 25, 1.35],
    ['Chickpeas', 'Legumes', 'LB', 1, 25, 1.45],
    ['Split Peas', 'Legumes', 'LB', 1, 25, 1.05],
    ['Russet Potatoes', 'Vegetables', 'LB', 1, 50, 0.55],
    ['Sweet Potatoes', 'Vegetables', 'LB', 1, 40, 0.95],
    ['Red Beets', 'Vegetables', 'LB', 1, 25, 1.05],
    ['Parsnips', 'Vegetables', 'LB', 1, 20, 1.6],
    ['Garlic Bulbs', 'Vegetables', 'LB', 1, 10, 4.2],
  ],
  DRIFTCOVE: [
    ['Strawberries', 'Berries', 'LB', 1, 8, 3.2],
    ['Blueberries', 'Berries', 'LB', 1, 6, 5.4],
    ['Raspberries', 'Berries', 'LB', 1, 3, 7.1],
    ['Blackberries', 'Berries', 'LB', 1, 3, 6.6],
    ['Boysenberries', 'Berries', 'LB', 1, 3, 7.4],
    ['Frozen Mixed Berries', 'Berries', 'LB', 1, 10, 4.3],
    ['Strawberry Jam', 'Pantry', 'JR', 12, 1, 5.5],
    ['Blueberry Preserves', 'Pantry', 'JR', 12, 1, 5.9],
    ['Cranberries', 'Berries', 'LB', 1, 10, 3.0],
    ['Gooseberries', 'Berries', 'LB', 1, 3, 6.9],
  ],
};

export const PRODUCTS: ProductSeed[] = PRODUCERS.flatMap((prod) =>
  (ITEMS[prod.isaId] ?? []).map(([name, category, uom, pack, size, unitPrice], i) => {
    const eleven = `0${prod.upcPrefix}${String(10 + i * 3).padStart(5, '0')}`;
    return {
      sku: `${prod.skuPrefix}-${String(i + 1).padStart(3, '0')}`,
      upc: eleven + upcCheckDigit(eleven),
      name,
      category,
      uom,
      pack,
      size,
      unitPrice,
      producerCode: prod.code,
    };
  }),
);

export function producerByIsaId(isaId: string): Producer | undefined {
  return PRODUCERS.find((x) => x.isaId === isaId.trim());
}

export function productsOf(producerCode: string): ProductSeed[] {
  return PRODUCTS.filter((x) => x.producerCode === producerCode);
}

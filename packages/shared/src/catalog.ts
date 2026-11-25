/**
 * Master data for the simulation: the distributor, 10 farm producers
 * (trading partners) and 100 farm products (10 per producer).
 */

export const DISTRIBUTOR = {
  name: 'Harvest Hub Distribution',
  isaQualifier: 'ZZ',
  isaId: 'HARVESTHUB',
  gsCode: 'HARVESTHUB',
  n1Code: 'HHD001',
  address: '500 Market Street',
  city: 'Sacramento',
  state: 'CA',
  postalCode: '95814',
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
  p(1, 'Green Valley Farms', 'GREENVALLEY', 'GVF', 'Vegetables', '1200 Valley Rd', 'Salinas', 'CA', '93901'),
  p(2, 'Sunrise Orchards', 'SUNRISEORCH', 'SRO', 'Tree fruit', '88 Orchard Ln', 'Yakima', 'WA', '98901'),
  p(3, 'Meadow Creek Dairy', 'MEADOWCREEK', 'MCD', 'Dairy', '450 Creek Rd', 'Tillamook', 'OR', '97141'),
  p(4, 'Happy Hen Poultry', 'HAPPYHEN', 'HHP', 'Eggs & poultry', '17 Coop Way', 'Petaluma', 'CA', '94952'),
  p(5, 'Golden Fields Grain', 'GOLDENFIELDS', 'GFG', 'Grains & flour', '9 Wheat St', 'Salina', 'KS', '67401'),
  p(6, 'Blue Ridge Apiary', 'BLUERIDGE', 'BRA', 'Honey & maple', '300 Hive Hill', 'Asheville', 'NC', '28801'),
  p(7, 'River Bend Ranch', 'RIVERBEND', 'RBR', 'Pasture-raised meat', '2 Ranch Rd', 'Bozeman', 'MT', '59715'),
  p(8, 'Cedar Hill Herbs', 'CEDARHILL', 'CHH', 'Herbs & greens', '61 Cedar Hill', 'Burlington', 'VT', '05401'),
  p(9, 'Prairie Wind Organics', 'PRAIRIEWIND', 'PWO', 'Legumes & roots', '700 Prairie Ave', 'Fargo', 'ND', '58102'),
  p(10, 'Coastal Berry Co', 'COASTALBERRY', 'CBC', 'Berries', '44 Shoreline Dr', 'Watsonville', 'CA', '95076'),
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
  GREENVALLEY: [
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
  SUNRISEORCH: [
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
  MEADOWCREEK: [
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
  HAPPYHEN: [
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
  GOLDENFIELDS: [
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
  BLUERIDGE: [
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
  RIVERBEND: [
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
  CEDARHILL: [
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
  PRAIRIEWIND: [
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
  COASTALBERRY: [
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

import { getDatabase } from './database.js';

const defaultCategories = [
  { name: 'Fruit & Vegetables', sort_order: 1 },
  { name: 'Meat & Seafood', sort_order: 2 },
  { name: 'Bakery', sort_order: 3 },
  { name: 'Pantry', sort_order: 4 },
  { name: 'Beverages', sort_order: 5 },
  { name: 'Snacks', sort_order: 6 },
  { name: 'Household Items', sort_order: 7 },
  { name: 'Dairy & Eggs', sort_order: 8 },
  { name: 'Frozen Foods', sort_order: 9 },
  { name: 'Other', sort_order: 10 }
];

/**
 * Seed the database with default categories if none exist
 */
export function seedCategories() {
  const db = getDatabase();

  // Check if categories already exist
  const count = db.prepare('SELECT COUNT(*) as count FROM categories').get();

  if (count.count === 0) {
    console.log('Seeding default categories...');

    const insert = db.prepare(
      'INSERT INTO categories (name, sort_order) VALUES (?, ?)'
    );

    const insertMany = db.transaction((categories) => {
      for (const category of categories) {
        insert.run(category.name, category.sort_order);
      }
    });

    insertMany(defaultCategories);
    console.log(`Seeded ${defaultCategories.length} default categories`);
  } else {
    console.log(`Categories already exist (${count.count} found), skipping seed`);
  }
}

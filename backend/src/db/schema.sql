-- Categories with custom ordering
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Grocery list items
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  amount TEXT,
  category_id INTEGER,
  checked BOOLEAN DEFAULT 0,
  position_in_list INTEGER,
  recipe_id INTEGER,
  recipe_name TEXT,
  is_recurring BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Recipes
CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_regular BOOLEAN DEFAULT 0,
  last_planned_at DATETIME,
  plan_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Log of dinner-wizard picks; recipes.last_planned_at/plan_count are
-- denormalised conveniences derived from these rows.
CREATE TABLE IF NOT EXISTS recipe_plan_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL,
  planned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

-- Recipe ingredients (template for adding to list)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  amount TEXT,
  category_id INTEGER,
  position INTEGER,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Recurring items (milk, bread, ...): offered in the dinner wizard and added
-- to the list as ordinary items marked `is_recurring`.
CREATE TABLE IF NOT EXISTS recurring_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  amount TEXT,
  category_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Category learning - remembers user's category assignments
CREATE TABLE IF NOT EXISTS item_category_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_name_lower TEXT NOT NULL UNIQUE,
  category_id INTEGER NOT NULL,
  use_count INTEGER DEFAULT 1,
  last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Indexes live in indexes.sql: they are applied after migrations, because
-- some of them cover columns that migrations add to older databases.

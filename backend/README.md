# Grocery App Backend

A RESTful API server for a shared grocery list PWA built with Node.js, Express, and SQLite.

## Features

- **Categories Management**: Create, update, delete, and reorder grocery categories
- **Items Management**: Add, update, check/uncheck, and delete grocery items
- **Smart Auto-Categorization**: Learns from user behavior to automatically suggest categories for items
- **Recipe Management**: Store recipes with ingredients and add them to the grocery list
- **SQLite Database**: Lightweight, file-based database perfect for home server deployment

## Tech Stack

- **Runtime**: Node.js (v18+)
- **Framework**: Express
- **Database**: SQLite with better-sqlite3
- **CORS**: Enabled for frontend access

## Installation

```bash
npm install
```

## Environment Variables

Create a `.env` file in the backend directory:

```
PORT=3000
DATABASE_PATH=./data/grocery.db
NODE_ENV=development
```

## Running the Server

```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Categories
- `GET /api/categories` - Get all categories (ordered by sort_order)
- `POST /api/categories` - Create new category
- `PUT /api/categories/reorder` - Update sort_order for categories
- `PUT /api/categories/:id` - Update category name
- `DELETE /api/categories/:id` - Delete category (fails if category has items)

### Items
- `GET /api/items` - Get all items with category information
- `POST /api/items` - Create new item (with auto-categorization)
- `PUT /api/items/:id` - Update item
- `PATCH /api/items/:id/check` - Toggle checked status
- `DELETE /api/items/checked` - Delete all checked items
- `DELETE /api/items/:id` - Delete a single item

### Recipes
- `GET /api/recipes` - Get all recipes
- `GET /api/recipes/:id` - Get recipe with ingredients
- `POST /api/recipes` - Create recipe with ingredients
- `PUT /api/recipes/:id` - Update recipe and ingredients
- `DELETE /api/recipes/:id` - Delete recipe
- `POST /api/recipes/:id/add-to-list` - Add all recipe ingredients to grocery list

## Database Schema

The database includes the following tables:

- **categories**: Grocery categories with custom ordering
- **items**: Grocery list items with metadata
- **recipes**: Recipe names
- **recipe_ingredients**: Ingredients for each recipe
- **item_category_mappings**: Learning table for auto-categorization

## Auto-Categorization

The system learns from user behavior:
1. When an item is assigned to a category, the mapping is stored
2. When creating a new item without a category, the system suggests the previously used category
3. Usage count is tracked to prioritize frequently used mappings

## Default Categories

The database is seeded with the following categories:

1. Fruit & Vegetables
2. Meat & Seafood
3. Bakery
4. Pantry
5. Beverages
6. Snacks
7. Household Items
8. Dairy & Eggs
9. Frozen Foods
10. Other

## Testing

Test the API using curl:

```bash
# Health check
curl http://localhost:3000/health

# Get all categories
curl http://localhost:3000/api/categories

# Create a new item
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d '{"name": "Milk", "amount": "2L", "category_id": 8}'

# Get all items
curl http://localhost:3000/api/items
```

## Project Structure

```
backend/
├── src/
│   ├── db/
│   │   ├── database.js       # SQLite connection and initialization
│   │   ├── schema.sql        # Database schema
│   │   └── seed.js           # Default categories seed data
│   ├── routes/
│   │   ├── categories.js     # Category endpoints
│   │   ├── items.js          # Item endpoints
│   │   └── recipes.js        # Recipe endpoints
│   ├── services/
│   │   └── categorization.js # Auto-categorization logic
│   └── server.js             # Express app and server setup
├── data/
│   └── grocery.db            # SQLite database file (created on first run)
├── package.json
├── .env
└── README.md
```

## Notes

- The database is automatically initialized on first run
- Foreign key constraints are enabled
- All API responses are JSON
- CORS is enabled for all origins (configure for production)
- SQL injection prevention via prepared statements

## Phase 1 Status: ✅ Complete

All backend foundation tasks completed:
- [x] Node.js project initialized with Express
- [x] SQLite database with schema created
- [x] Default categories seeded
- [x] All API endpoints implemented
- [x] CORS middleware configured
- [x] Endpoints tested and verified

# Grocery List PWA

A full-stack Progressive Web App for managing shared grocery lists with offline support, recipe management, and smart auto-categorization.

## Features

- **Shared Grocery Lists**: Manage items across devices with real-time sync
- **Smart Categorization**: Learns from your usage to auto-categorize items
- **Recipe Management**: Store recipes and add ingredients to your list in one tap
- **Offline First**: Works without internet connection using IndexedDB
- **PWA**: Install on mobile and desktop devices
- **Drag & Drop**: Reorder categories and items
- **Custom Themes**: Multiple color themes to choose from

## Tech Stack

### Frontend
- React 19 with React Router
- Vite for build tooling
- Tailwind CSS for styling
- Zustand for state management
- Workbox for service worker & offline support
- IndexedDB (via idb) for local storage
- dnd-kit for drag and drop

### Backend
- Node.js + Express
- SQLite with better-sqlite3
- RESTful API
- CORS enabled

## Quick Start

### Prerequisites
- Node.js 18 or higher
- npm

### Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Groceries
   ```

2. **Start the backend**
   ```bash
   cd backend
   npm install
   npm run dev
   ```
   Backend will run on http://localhost:3000

3. **Start the frontend** (in a new terminal)
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Frontend will run on http://localhost:5173

4. **Open your browser**
   Navigate to http://localhost:5173

### Production Deployment

Use the included deployment script:

```bash
./deploy.sh
```

This will:
1. Install backend dependencies (production only)
2. Install frontend dependencies
3. Build the frontend
4. Copy the build to `backend/public/`

Then start the server:

```bash
cd backend
NODE_ENV=production npm start
```

Or with PM2:

```bash
cd backend
pm2 start ecosystem.config.cjs
```

The app will be available at http://localhost:3000

## Project Structure

```
Groceries/
├── backend/                 # Express API server
│   ├── src/
│   │   ├── db/             # Database setup and schema
│   │   ├── routes/         # API endpoints
│   │   ├── services/       # Business logic
│   │   └── server.js       # Main server file
│   ├── data/               # SQLite database (created on first run)
│   └── public/             # Frontend build (after deploy)
├── frontend/               # React PWA
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── services/       # API client and offline sync
│   │   ├── stores/         # Zustand state stores
│   │   └── App.jsx         # Main app component
│   └── public/             # Static assets and PWA manifests
└── deploy.sh               # Production deployment script
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

## Environment Variables

### Backend (.env)
```
PORT=3000
DATABASE_PATH=./data/grocery.db
NODE_ENV=development
```

### Frontend
Update `frontend/src/services/api.js` to point to your backend URL in production.

## Default Categories

The app comes pre-configured with:
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

## Smart Auto-Categorization

The system learns from your behavior to automatically categorize items:
- When you assign an item to a category, the mapping is stored
- Next time you add the same item, it's automatically assigned to the previously used category
- Usage count is tracked to prioritize frequently used mappings
- Works across all items to build your personal categorization preferences

## Database

The backend uses SQLite with the following tables:
- **categories** - Grocery categories with custom ordering
- **items** - Grocery list items with metadata
- **recipes** - Recipe names
- **recipe_ingredients** - Ingredients for each recipe
- **item_category_mappings** - Learning table for auto-categorization

The database is automatically initialized on first run with foreign key constraints enabled. All queries use prepared statements for SQL injection prevention.

## Testing the API

Test endpoints using curl:

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

## Important Notes

- Database is automatically initialized on first run
- Foreign key constraints are enabled
- All API responses are JSON
- CORS is enabled for all origins (configure for production)
- SQL injection prevention via prepared statements

## License

ISC

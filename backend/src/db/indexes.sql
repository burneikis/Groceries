-- Indexes for the joins/filters used on every request.
--
-- Applied *after* migrations: idx_items_recipe covers items.recipe_id, which
-- only exists on an older database once migration 1 has added it.
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_recipe ON items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_items_checked ON items(checked);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipes_regular ON recipes(is_regular);
CREATE INDEX IF NOT EXISTS idx_recipe_plan_history_recipe
  ON recipe_plan_history(recipe_id, planned_at DESC);

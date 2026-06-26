import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { Category } from '../models';

const GENERAL_DISCUSSION_ID = '00000000-0000-0000-0000-000000000001';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'category';
}

function uniqueSlug(db: Database.Database, base: string, excludeId?: string): string {
  let slug = base;
  let i = 2;
  while (true) {
    const row = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug) as { id: string } | undefined;
    if (!row || row.id === excludeId) {return slug;}
    slug = `${base}-${i++}`;
  }
}

export function listCategories(db: Database.Database, includeHidden = false): Category[] {
  if (includeHidden) {
    return db.prepare('SELECT * FROM categories ORDER BY sortOrder ASC, name ASC').all() as Category[];
  }
  return db.prepare('SELECT * FROM categories WHERE isHidden = 0 ORDER BY sortOrder ASC, name ASC').all() as Category[];
}

export function getCategoryById(db: Database.Database, id: string): Category | null {
  return (db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Category | undefined) ?? null;
}

export function getCategoryBySlug(db: Database.Database, slug: string): Category | null {
  return (db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug) as Category | undefined) ?? null;
}

export function createCategory(
  db: Database.Database,
  data: { name: string; description?: string; sortOrder?: number; isHidden?: number }
): Category {
  const id = uuidv4();
  const slug = uniqueSlug(db, slugify(data.name));
  db.prepare(`
    INSERT INTO categories (id, slug, name, description, sortOrder, isHidden)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, slug, data.name, data.description ?? null, data.sortOrder ?? 0, data.isHidden ?? 0);
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Category;
}

export function deleteCategory(db: Database.Database, id: string): { ok: boolean; error?: string } {
  if (id === GENERAL_DISCUSSION_ID) {
    return { ok: false, error: 'Cannot delete the General Discussion category' };
  }
  const category = getCategoryById(db, id);
  if (!category) {
    return { ok: false, error: 'Category not found' };
  }
  // Migrate threads to General Discussion
  db.prepare("UPDATE threads SET categoryId = ?, updatedAt = datetime('now') WHERE categoryId = ?")
    .run(GENERAL_DISCUSSION_ID, id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return { ok: true };
}

export function updateCategory(
  db: Database.Database,
  id: string,
  data: Partial<Pick<Category, 'name' | 'description' | 'sortOrder' | 'isHidden'>>
): Category | null {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.sortOrder !== undefined) { fields.push('sortOrder = ?'); values.push(data.sortOrder); }
  if (data.isHidden !== undefined) { fields.push('isHidden = ?'); values.push(data.isHidden); }

  if (fields.length === 0) {return getCategoryById(db, id);}

  fields.push('updatedAt = datetime(\'now\')');
  values.push(id);

  db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getCategoryById(db, id);
}

import {query} from './db.mjs';
export async function listCategories(){return (await query(`SELECT id,name,active FROM categories WHERE active=true ORDER BY name`)).rows;}
export async function createCategory(name){return (await query(`INSERT INTO categories(name,active) VALUES($1,true) RETURNING *`,[String(name||'').trim()])).rows[0];}
export async function updateCategory(id,name){return (await query(`UPDATE categories SET name=$1 WHERE id=$2 RETURNING *`,[String(name||'').trim(),id])).rows[0];}
export async function deleteCategory(id){return (await query(`UPDATE categories SET active=false WHERE id=$1 RETURNING id`,[id])).rows[0]||null;}
export async function listUnits(){return (await query(`SELECT id,name,symbol,active FROM units WHERE active=true ORDER BY name`)).rows;}
export async function createUnit(name,symbol){return (await query(`INSERT INTO units(name,symbol,active) VALUES($1,$2,true) RETURNING *`,[String(name||'').trim(),symbol||null])).rows[0];}
export async function updateUnit(id,name,symbol){return (await query(`UPDATE units SET name=$1,symbol=$2 WHERE id=$3 RETURNING *`,[String(name||'').trim(),symbol||null,id])).rows[0];}
export async function deleteUnit(id){return (await query(`UPDATE units SET active=false WHERE id=$1 RETURNING id`,[id])).rows[0]||null;}

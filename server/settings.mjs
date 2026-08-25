import {query} from './db.mjs';
export async function getSettings(){
  const s=(await query(`SELECT * FROM store_settings WHERE id=1`)).rows[0]||{};
  const p=(await query(`SELECT settings FROM print_settings WHERE id=1`)).rows[0]?.settings||{};
  return {store:s,print:p};
}
export async function saveStoreSettings(d){
  const store=(await query(
    `INSERT INTO store_settings(id,store_name,phone,address,currency,opening_hours,is_open,updated_at)
     VALUES(1,$1,$2,$3,$4,$5,$6,now())
     ON CONFLICT(id) DO UPDATE SET
       store_name=EXCLUDED.store_name,
       phone=EXCLUDED.phone,
       address=EXCLUDED.address,
       currency=EXCLUDED.currency,
       opening_hours=EXCLUDED.opening_hours,
       is_open=EXCLUDED.is_open,
       updated_at=now()
     RETURNING *`,
    [d.shopName||d.storeName||null,d.phone||null,d.address||null,d.currency||'DZD',d.openingHours||d.hours||null,d.isOpen!==false]
  )).rows[0];
  if(d.printSettings && typeof d.printSettings==='object'){
    await query(`INSERT INTO print_settings(id,settings,updated_at) VALUES(1,$1::jsonb,now()) ON CONFLICT(id) DO UPDATE SET settings=EXCLUDED.settings,updated_at=now()`,[JSON.stringify(d.printSettings)]);
  }
  return store;
}

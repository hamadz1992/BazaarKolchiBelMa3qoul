import zlib from 'node:zlib';
import {withTransaction} from './db.mjs';

function u16(b,o){return b[o]|(b[o+1]<<8)}
function u32(b,o){return (b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0}
function xmlUnescape(s){
  return String(s??'')
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/&amp;/g,'&')
    .replace(/&quot;/g,'\"')
    .replace(/&apos;/g,"'")
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,n)=>{
      const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);
      return Number.isFinite(code)?String.fromCodePoint(code):_;
    });
}
function textTag(xml,tag){const m=xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));return m?xmlUnescape(m[1].replace(/<[^>]+>/g,'')):''}
function unzip(buf){const b=new Uint8Array(buf);let eocd=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65558);i--){if(u32(b,i)===0x06054b50){eocd=i;break}}if(eocd<0)throw new Error('ملف Excel غير صالح.');const count=u16(b,eocd+10),cdSize=u32(b,eocd+12),cdOff=u32(b,eocd+16);let p=cdOff;const out=new Map();for(let n=0;n<count;n++){if(u32(b,p)!==0x02014b50)break;const method=u16(b,p+10),csize=u32(b,p+20),usize=u32(b,p+24),nameLen=u16(b,p+28),extraLen=u16(b,p+30),commentLen=u16(b,p+32),localOff=u32(b,p+42);const name=new TextDecoder().decode(b.slice(p+46,p+46+nameLen));const localNameLen=u16(b,localOff+26),localExtraLen=u16(b,localOff+28),dataStart=localOff+30+localNameLen+localExtraLen;const compressed=b.slice(dataStart,dataStart+csize);let data;if(method===0)data=compressed;else if(method===8)data=zlib.inflateRawSync(compressed);else throw new Error(`ضغط Excel غير مدعوم: ${method}`);if(usize&&data.length!==usize)throw new Error('ملف Excel تالف.');out.set(name,Buffer.from(data));p+=46+nameLen+extraLen+commentLen;}return out}
function parseXlsx(buffer){const files=unzip(buffer);const sheet=files.get('xl/worksheets/sheet1.xml');if(!sheet)throw new Error('لم يتم العثور على الورقة الأولى في Excel.');const shared=files.get('xl/sharedStrings.xml');const strings=[];if(shared){const xml=shared.toString('utf8');for(const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)){strings.push(xmlUnescape([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m=>m[1]).join('')))}}const rows=[];for(const rm of sheet.toString('utf8').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)){const cells=[];for(const cm of rm[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)){const attrs=cm[1],body=cm[2],type=(attrs.match(/t="([^"]+)"/)||[])[1],v=textTag(body,'v');cells.push(type==='s'?(strings[Number(v)]??''):type==='inlineStr'?textTag(body,'is'):v)}rows.push(cells)}if(rows.length<2)return[];const headers=rows[0].map(x=>String(x||'').trim());return rows.slice(1).filter(r=>r.some(v=>String(v??'').trim()!=='')).map((r,idx)=>({rowNumber:idx+2,data:Object.fromEntries(headers.map((h,i)=>[h,r[i]??'']))}))}
function pick(row,keys){for(const k of keys){const found=Object.keys(row).find(x=>x.trim().toLowerCase()===k.toLowerCase());if(found&&String(row[found]).trim()!=='')return row[found]}return ''}
function asNumber(value){if(value===''||value===null||value===undefined)return 0;const n=Number(String(value).replace(/,/g,''));return Number.isFinite(n)?n:NaN}
function normalizeRow(record){const row=record.data;return {rowNumber:record.rowNumber,name:String(pick(row,['name','اسم السلعة','السلعة','product'])||'').trim(),barcode:String(pick(row,['barcode','باركود','الباركود'])||'').trim()||null,purchase:asNumber(pick(row,['purchase','سعر الشراء','purchase_price'])),price:asNumber(pick(row,['price','سعر البيع','sale_price'])),stock:asNumber(pick(row,['stock','المخزون','الكمية','quantity'])),min:asNumber(pick(row,['min','الحد الأدنى','minimum_stock'])),category:String(pick(row,['category','التصنيف'])||'').trim(),unit:String(pick(row,['unit','الوحدة'])||'').trim()}}
function generateBarcode(existing=new Set()){
  for(let i=0;i<100000;i++){
    const code=`629${String(Date.now()).slice(-7)}${String(Math.floor(Math.random()*100)).padStart(2,'0')}`.slice(0,12);
    if(!existing.has(code)) return code;
  }
  throw new Error('تعذر إنشاء باركود تلقائي.');
}
function validateRecords(records){
  const normalized=records.map(normalizeRow);
  const seen=new Map();
  const errors=[];
  for(const r of normalized){
    const rowErrors=[];
    if(!r.name) rowErrors.push('اسم السلعة مطلوب');
    for(const [label,val] of [['سعر الشراء',r.purchase],['سعر البيع',r.price],['المخزون',r.stock],['الحد الأدنى',r.min]]){
      if(!Number.isFinite(val)) rowErrors.push(`${label} غير صالح`);
      else if(val<0) rowErrors.push(`${label} لا يمكن أن يكون سالبًا`);
    }
    if(r.barcode){const prev=seen.get(r.barcode);if(prev) rowErrors.push(`الباركود مكرر داخل الملف (السطر ${prev})`);else seen.set(r.barcode,r.rowNumber)}
    if(rowErrors.length)errors.push({row:r.rowNumber,errors:rowErrors,data:r});
  }
  return {normalized,errors};
}
export async function previewXlsx(buffer){
  const records=parseXlsx(buffer);
  const headers=records.length?Object.keys(records[0].data):[];
  const {normalized,errors}=validateRecords(records);
  const badRows=new Set(errors.map(e=>e.row));
  const preview=normalized.slice(0,200).map(r=>({row:r.rowNumber,name:r.name,barcode:r.barcode||'',category:r.category,unit:r.unit,purchase:r.purchase,price:r.price,stock:r.stock,min:r.min,valid:!badRows.has(r.rowNumber)}));
  return {headers,rows:records.length,validRows:records.length-errors.length,errorCount:errors.length,errors:errors.slice(0,200),preview};
}
export async function importXlsx(buffer,userId){
  const records=parseXlsx(buffer);
  const {normalized,errors}=validateRecords(records);
  if(!normalized.length)return {created:0,updated:0,rows:0,skipped:0,errors:[]};
  const invalid=new Set(errors.map(e=>e.row));
  return withTransaction(async c=>{
    let created=0,updated=0,skipped=0;
    for(const row of normalized){
      if(invalid.has(row.rowNumber)){skipped++;continue}
      let {name,barcode,purchase,price,stock,min,category,unit}=row;
       if(!barcode){
         const existing=new Set((await c.query(`SELECT barcode FROM products WHERE barcode IS NOT NULL`)).rows.map(x=>String(x.barcode)));
         barcode=generateBarcode(existing);
       }
      const cat=category?(await c.query(`INSERT INTO categories(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET active=true RETURNING id`,[category])).rows[0].id:null;
      const unt=unit?(await c.query(`INSERT INTO units(name,symbol) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET active=true RETURNING id`,[unit,unit])).rows[0].id:null;
      let result;
      let oldStock=null;
      if(barcode){
        const old=await c.query(`SELECT id,current_stock FROM products WHERE barcode=$1 FOR UPDATE`,[barcode]);
        if(old.rows[0]){oldStock=Number(old.rows[0].current_stock);result=await c.query(`UPDATE products SET name=$1,category_id=$2,unit_id=$3,purchase_price=$4,sale_price=$5,current_stock=$6,minimum_stock=$7,active=true,updated_at=now() WHERE barcode=$8 RETURNING id,current_stock`,[name,cat,unt,purchase,price,stock,min,barcode]);}
      }
      if(!result?.rowCount){result=await c.query(`INSERT INTO products(barcode,name,category_id,unit_id,purchase_price,sale_price,current_stock,minimum_stock,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id,current_stock`,[barcode,name,cat,unt,purchase,price,stock,min]);created++;}
      else updated++;
      if(oldStock!==null){const diff=stock-oldStock;if(diff)await c.query(`INSERT INTO stock_movements(product_id,type,quantity,note,user_id) VALUES($1,$2,$3,'استيراد Excel',$4)`,[result.rows[0].id,diff>0?'IMPORT_IN':'IMPORT_OUT',diff,userId]);}
    }
    return {created,updated,rows:normalized.length,skipped,errors};
  });
}

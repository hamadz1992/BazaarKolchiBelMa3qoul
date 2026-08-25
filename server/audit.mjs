export async function logAuditTx(client,{userId=null,action,entityType=null,entityId=null,payload={}}={}){
  await client.query(
    `INSERT INTO audit_logs(user_id,action,entity_type,entity_id,payload) VALUES($1,$2,$3,$4,$5::jsonb)`,
    [userId,action,entityType,entityId,JSON.stringify(payload||{})]
  );
}

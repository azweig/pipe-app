// merge PURO de mensajes para una conversación (sin dependencias de RN → testeable sin mocks nativos).
// Reglas:
//  (1) items NUEVOS (id no visto) se agregan;
//  (2) DUPLICADOS por id se colapsan → upsert (el item entrante, ya editado/con mayor rev, reemplaza al viejo);
//  (3) al llegar un eco "out" del server, se borra la burbuja OPTIMISTA ("opt-…") con mismo texto y ts cercano (<2 min);
//  (4) el resultado va ordenado por ts ascendente (orden temporal preservado).
export function mergeItems(local, incoming) {
  const byId = new Map(local.map((i) => [i.id, i]))
  for (const it of incoming) {
    byId.set(it.id, it)
    if (it.dir === "out") for (const [id, o] of [...byId]) if (String(id).startsWith("opt-") && (o.text || "") === (it.text || "") && Math.abs((o.ts || 0) - (it.ts || 0)) < 120000) byId.delete(id)
  }
  return [...byId.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0))
}

// Lógica pura de merge/dedup de una conversación (sin deps de RN → sin mocks nativos).
import { mergeItems } from "../src/mergeItems"

describe("mergeItems", () => {
  it("agrega items nuevos y ordena por ts ascendente", () => {
    const local = [{ id: "a", ts: 100, text: "uno" }]
    const incoming = [{ id: "b", ts: 200, text: "dos" }]
    expect(mergeItems(local, incoming).map((i) => i.id)).toEqual(["a", "b"])
  })

  it("preserva el orden temporal aunque lleguen desordenados", () => {
    const local = [{ id: "b", ts: 200 }]
    const incoming = [{ id: "a", ts: 100 }, { id: "c", ts: 300 }]
    expect(mergeItems(local, incoming).map((i) => i.id)).toEqual(["a", "b", "c"])
  })

  it("colapsa duplicados por id (upsert): el entrante gana", () => {
    const local = [{ id: "a", ts: 100, text: "viejo", rev: 1 }]
    const incoming = [{ id: "a", ts: 100, text: "editado", rev: 2 }]
    const out = mergeItems(local, incoming)
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe("editado")
    expect(out[0].rev).toBe(2)
  })

  it("una edición (mismo id, mayor rev) actualiza en su lugar sin duplicar", () => {
    const local = [
      { id: "a", ts: 100, text: "hola", rev: 1 },
      { id: "b", ts: 200, text: "chau", rev: 1 },
    ]
    const incoming = [{ id: "a", ts: 100, text: "hola!!", rev: 5 }]
    const out = mergeItems(local, incoming)
    expect(out.map((i) => i.id)).toEqual(["a", "b"])
    expect(out.find((i) => i.id === "a").text).toBe("hola!!")
  })

  it("el eco 'out' del server reemplaza la burbuja optimista opt-… (mismo texto, ts cercano)", () => {
    const local = [{ id: "opt-123", ts: 1000, text: "enviando", dir: "out" }]
    const incoming = [{ id: "srv-9", ts: 1500, text: "enviando", dir: "out" }]
    const out = mergeItems(local, incoming)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe("srv-9")
  })

  it("NO deduplica un optimista si el texto difiere", () => {
    const local = [{ id: "opt-1", ts: 1000, text: "una cosa", dir: "out" }]
    const incoming = [{ id: "srv-1", ts: 1100, text: "otra cosa", dir: "out" }]
    expect(mergeItems(local, incoming)).toHaveLength(2)
  })

  it("NO deduplica un optimista si el ts está muy lejos (>2 min)", () => {
    const local = [{ id: "opt-1", ts: 1000, text: "igual", dir: "out" }]
    const incoming = [{ id: "srv-1", ts: 1000 + 3 * 60000, text: "igual", dir: "out" }]
    expect(mergeItems(local, incoming)).toHaveLength(2)
  })

  it("no muta el array local original", () => {
    const local = [{ id: "a", ts: 100 }]
    const snapshot = JSON.stringify(local)
    mergeItems(local, [{ id: "b", ts: 200 }])
    expect(JSON.stringify(local)).toBe(snapshot)
  })
})

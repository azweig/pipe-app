// Contrato de la sesión secreta (2º PIN): el token vive SOLO en memoria — se llena al desbloquear,
// se limpia al bloquear, y mientras está lleno viaja como header x-secret-token. Nada se persiste.
// Manejamos el ciclo real (secretUnlock/secretLock/initSecret) con un fetch global simulado — sin mocks nativos.
import { secretOn, isSecretPinSet, secretUnlock, secretLock, initSecret, logout, authHeaders } from "../src/api"

const mockFetch = (body) => {
  global.fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve(body), ok: true, status: 200 }))
}

beforeEach(async () => {
  await logout() // baseline limpio: sin sid, sin token, sin pinSet
})

afterEach(async () => {
  mockFetch({ ok: true })
  await secretLock() // limpia el token y cancela los timers de inactividad
})

describe("estado inicial", () => {
  it("arranca bloqueado y sin PIN configurado", () => {
    expect(secretOn()).toBe(false)
    expect(isSecretPinSet()).toBe(false)
    expect(authHeaders()["x-secret-token"]).toBeUndefined()
  })
})

describe("secretUnlock", () => {
  it("con token del server → desbloquea y marca pinSet", async () => {
    mockFetch({ token: "tok-abc" })
    const r = await secretUnlock("123456")
    expect(r.token).toBe("tok-abc")
    expect(secretOn()).toBe(true)
    expect(isSecretPinSet()).toBe(true)
  })

  it("el token desbloqueado viaja como header x-secret-token", async () => {
    mockFetch({ token: "tok-xyz" })
    await secretUnlock("123456")
    expect(authHeaders()["x-secret-token"]).toBe("tok-xyz")
  })

  it("PIN incorrecto (sin token) → sigue bloqueado", async () => {
    mockFetch({ error: "PIN incorrecto" })
    const r = await secretUnlock("000000")
    expect(r.error).toBeTruthy()
    expect(secretOn()).toBe(false)
    expect(authHeaders()["x-secret-token"]).toBeUndefined()
  })
})

describe("secretLock", () => {
  it("borra el token de memoria y deja de mandar el header", async () => {
    mockFetch({ token: "tok-abc" })
    await secretUnlock("123456")
    expect(secretOn()).toBe(true)

    mockFetch({ ok: true })
    await secretLock()
    expect(secretOn()).toBe(false)
    expect(authHeaders()["x-secret-token"]).toBeUndefined()
  })
})

describe("initSecret", () => {
  it("si el server reporta pinSet → true y marca pinSet (sin desbloquear)", async () => {
    mockFetch({ pinSet: true, unlocked: false })
    expect(await initSecret()).toBe(true)
    expect(isSecretPinSet()).toBe(true)
    expect(secretOn()).toBe(false) // saber que hay 2º PIN ≠ tener el token
  })

  it("si no hay 2º PIN → false", async () => {
    mockFetch({ pinSet: false })
    expect(await initSecret()).toBe(false)
  })
})

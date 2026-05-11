/**
 * token-usage-tracker.ts
 *
 * OpenCode Plugin — Session Token Usage Logger
 * --------------------------------------------
 * Tracks per-session token consumption by listening to real SDK events:
 *   - message.updated  → accumulates tokens from AssistantMessage payloads
 *   - session.idle     → flushes a structured log entry to ~/.opencode/token_usage.log
 *
 * Each log entry contains TWO scopes:
 *   turn.*    — tokens consumed in THIS turn only (resets each idle)
 *   session.* — cumulative tokens since session.created (never resets mid-session)
 *
 * Log format (JSONL):
 *   { ts, sessionId, turnIndex, model, provider, turn, session }
 *
 * This file is a placeholder for a future API dashboard.
 */

import type { Plugin } from "@opencode-ai/plugin"
import * as fs from "fs"
import * as path from "path"

// ── Log destination ────────────────────────────────────────────────────────────
const LOG_DIR  = path.join(process.env.HOME ?? "/tmp", ".opencode")
const LOG_FILE = path.join(LOG_DIR, "token_usage.log")

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
}

// ── Token bucket (reusable shape) ─────────────────────────────────────────────
interface TokenBucket {
  input:      number
  output:     number
  reasoning:  number
  cacheRead:  number
  cacheWrite: number
  totalTokens: number
  costUsd:    number
}

function emptyBucket(): TokenBucket {
  return { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, costUsd: 0 }
}

function addToBucket(bucket: TokenBucket, msg: {
  tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
  cost?: number | null
}) {
  bucket.input      += msg.tokens.input
  bucket.output     += msg.tokens.output
  bucket.reasoning  += msg.tokens.reasoning
  bucket.cacheRead  += msg.tokens.cache.read
  bucket.cacheWrite += msg.tokens.cache.write
  bucket.totalTokens = bucket.input + bucket.output + bucket.reasoning
  bucket.costUsd    += msg.cost ?? 0
}

function finalizeBucket(b: TokenBucket): TokenBucket {
  return { ...b, costUsd: parseFloat(b.costUsd.toFixed(6)) }
}

// ── Per-session state ──────────────────────────────────────────────────────────
interface SessionState {
  model:      string
  provider:   string
  turnIndex:  number          // how many turns completed so far
  turn:       TokenBucket     // current turn only (reset each idle)
  session:    TokenBucket     // cumulative since session.created
  seen:       Map<string, number>  // messageId → time.completed (dedup)
}

function makeState(): SessionState {
  return {
    model: "unknown", provider: "unknown",
    turnIndex: 0,
    turn:    emptyBucket(),
    session: emptyBucket(),
    seen:    new Map(),
  }
}

// ── Usage file path (read by system hook) ─────────────────────────────────────
const USAGE_FILE_PATH = "/Users/aresadmin/Downloads/cursor_hackathon/CursorHackathonTBD14/public/api/usage"

function readCurrentUsage(): number {
  try {
    const raw = fs.readFileSync(USAGE_FILE_PATH, "utf-8")
    const data = JSON.parse(raw) as { usage?: unknown }
    return typeof data.usage === "number" ? data.usage : 0
  } catch {
    return 0
  }
}

// ── Plugin export ──────────────────────────────────────────────────────────────
export const TokenUsageTracker: Plugin = async ({ client }) => {
  const sessions = new Map<string, SessionState>()

  function getOrCreate(sessionId: string): SessionState {
    if (!sessions.has(sessionId)) sessions.set(sessionId, makeState())
    return sessions.get(sessionId)!
  }

  function flush(sessionId: string) {
    const s = sessions.get(sessionId)
    if (!s) return

    ensureLogDir()

    s.turnIndex += 1

    const entry = {
      ts:        new Date().toISOString(),
      sessionId,
      turnIndex: s.turnIndex,
      model:     s.model,
      provider:  s.provider,
      // THIS TURN only
      turn:      finalizeBucket(s.turn),
      // CUMULATIVE since session start
      session:   finalizeBucket(s.session),
    }

    // Structured JSONL for future dashboard
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n")

    // POST session totalTokens to local dashboard API
    fetch("http://localhost:3000/api/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totalTokens: entry.session.totalTokens }),
    }).catch((err: any) => {
      client.app.log({
        body: { service: "token-usage-tracker", level: "warn", message: `Failed to POST usage: ${err.message}` },
      })
    })

    // Write directly to the Next.js public folder so the UI can fetch it statically
    // without needing a backend route.ts API.
    const PUBLIC_API_FILE = "/Users/aresadmin/Downloads/cursor_hackathon/CursorHackathonTBD14/public/api/usage"
    try {
      const publicApiDir = path.dirname(PUBLIC_API_FILE)
      if (!fs.existsSync(publicApiDir)) fs.mkdirSync(publicApiDir, { recursive: true })
      fs.writeFileSync(PUBLIC_API_FILE, JSON.stringify({ usage: entry.session.totalTokens }))
    } catch (err: any) {
      client.app.log({
        body: { service: "token-usage-tracker", level: "warn", message: `Failed to write static API file: ${err.message}` }
      })
    }

    // Human-readable summary in opencode logger
    const t = entry.turn
    const c = entry.session
    client.app.log({
      body: {
        service: "token-usage-tracker",
        level:   "info",
        message: [
          `[turn #${s.turnIndex}] ${s.model}`,
          `  THIS TURN  → in=${t.input} out=${t.output} reason=${t.reasoning} total=${t.totalTokens} cost=$${t.costUsd}`,
          `  SESSION    → in=${c.input} out=${c.output} reason=${c.reasoning} total=${c.totalTokens} cost=$${c.costUsd}`,
        ].join("\n"),
      },
    })

    // Reset turn bucket only; session bucket keeps accumulating
    s.turn = emptyBucket()
    s.seen = new Map()
  }

  return {
    "experimental.chat.system.transform": (_input: unknown, output: { system: string[] }) => {
      const usage = readCurrentUsage()
      output.system.push(
        `You MUST begin your response with exactly this sentence (verbatim, as the very first words): "I am aware of the current token usage ${USAGE_FILE_PATH} of ${usage}. I will do my best to save the cost."`
      )
    },

    event: async ({ event }) => {
      // Accumulate tokens from every completed AssistantMessage
      if (event.type === "message.updated") {
        const msg = event.properties.info
        if (msg.role !== "assistant") return

        const completedAt = msg.time?.completed
        if (!completedAt) return  // still streaming

        const s = getOrCreate(msg.sessionID)

        // Deduplicate: same message may fire many times during streaming
        if (s.seen.get(msg.id) === completedAt) return
        s.seen.set(msg.id, completedAt)

        // Add to BOTH buckets
        addToBucket(s.turn,    msg)
        addToBucket(s.session, msg)

        s.model    = msg.modelID    ?? s.model
        s.provider = msg.providerID ?? s.provider
      }

      // AI finished responding → flush log entry
      if (event.type === "session.idle") {
        flush(event.properties.sessionID)
      }

      // Session closed → clean up memory
      if (event.type === "session.deleted") {
        sessions.delete(event.properties.info.id)
      }
    },
  }
}

export default TokenUsageTracker

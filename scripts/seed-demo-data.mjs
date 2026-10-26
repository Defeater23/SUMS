#!/usr/bin/env node
/**
 * =============================================================================
 * SUMS — demo data generator (OPTIONAL, development only)
 * =============================================================================
 *
 * Creates a small, realistic set of accounts, bookings and feedback so that the
 * dashboard, approvals queue, analytics charts and feedback screens are not
 * empty on a fresh project.
 *
 * SECURITY
 *   This script requires the service-role key, which bypasses Row Level
 *   Security. It reads the key from the environment only — it is never written
 *   to source control, never bundled into the frontend, and must never be
 *   exposed through a VITE_ variable.
 *
 * USAGE
 *   1. Copy `.env.example` to `.env` and set:
 *        VITE_SUPABASE_URL=https://<project-ref>.supabase.co
 *        SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
 *        DEMO_PASSWORD=<a password you choose for the demo accounts>
 *   2. Apply the migrations and `supabase/seed.sql` (see README).
 *   3. node scripts/seed-demo-data.mjs
 *
 * The script is idempotent: demo rows are tagged with the "SUM-DEMO" marker and
 * replaced on every run. Data that does not carry the marker is never touched.
 *
 * TIME ZONE
 *   Times are written as wall-clock times in the institution time zone
 *   (Asia/Kolkata, UTC+05:30) and converted to UTC, matching how the
 *   application interprets bookings.
 * =============================================================================
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MARKER = 'SUM-DEMO'
const INSTITUTION_UTC_OFFSET_MINUTES = 330 // Asia/Kolkata (UTC+05:30)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
function loadDotEnv() {
  const envPath = resolve(projectRoot, '.env')
  if (!existsSync(envPath)) return
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = value
  }
}

loadDotEnv()

const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const demoPassword = process.env.DEMO_PASSWORD ?? ''

function fail(message) {
  console.error(`\n  x ${message}\n`)
  process.exit(1)
}

if (process.env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
  fail(
    'A service-role key is present in a VITE_ variable. Remove it - VITE_ variables are\n' +
      '    shipped to the browser. Use SUPABASE_SERVICE_ROLE_KEY instead.',
  )
}
if (!url) fail('SUPABASE_URL (or VITE_SUPABASE_URL) is not set. See .env.example.')
if (!serviceKey) fail('SUPABASE_SERVICE_ROLE_KEY is not set. See .env.example.')
if (!demoPassword) {
  fail(
    'DEMO_PASSWORD is not set. Choose a password for the demo accounts and add it to .env.\n' +
      '    The script deliberately refuses to invent credentials.',
  )
}
if (demoPassword.length < 8) fail('DEMO_PASSWORD must be at least 8 characters.')

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await response.text()
  const payload = text ? safeJson(text) : null

  if (!response.ok) {
    const detail = payload?.message ?? payload?.error_description ?? payload?.error ?? text
    throw new Error(`${method} ${path} -> ${response.status} ${detail}`)
  }
  return payload
}

const rest = (path, init) => request(`/rest/v1${path}`, init)
const auth = (path, init) => request(`/auth/v1${path}`, init)

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
const DEMO_USERS = [
  { email: 'admin@sums.demo', fullName: 'Amara Okafor', department: 'Facilities', role: 'admin' },
  { email: 'faculty@sums.demo', fullName: 'Dr Priya Raman', department: 'Physics', role: 'faculty' },
  {
    email: 'faculty2@sums.demo',
    fullName: 'Dr Tomas Lindqvist',
    department: 'Computer Science',
    role: 'faculty',
  },
  { email: 'student@sums.demo', fullName: 'Ravi Menon', department: 'Physics', role: 'student' },
  {
    email: 'student2@sums.demo',
    fullName: 'Chen Wei',
    department: 'Computer Science',
    role: 'student',
  },
]

async function ensureUsers() {
  const existing = (await auth('/admin/users?per_page=200'))?.users ?? []
  const accounts = new Map()

  for (const definition of DEMO_USERS) {
    const match = existing.find(
      (candidate) => (candidate.email ?? '').toLowerCase() === definition.email.toLowerCase(),
    )

    const user =
      match ??
      (await auth('/admin/users', {
        method: 'POST',
        body: {
          email: definition.email,
          password: demoPassword,
          email_confirm: true,
          user_metadata: {
            full_name: definition.fullName,
            department: definition.department,
            // Only student/faculty are ever honoured by the profile trigger.
            requested_role: definition.role === 'admin' ? 'student' : definition.role,
          },
        },
      }))

    accounts.set(definition.email, { ...definition, id: user.id })
  }

  // Roles are applied through a privileged server-side request; interactive
  // sessions can never change a role without being an administrator.
  for (const account of accounts.values()) {
    await rest(`/profiles?id=eq.${account.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: {
        role: account.role,
        full_name: account.fullName,
        department: account.department,
        is_active: true,
      },
    })
  }

  return accounts
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------
function institutionToday() {
  return new Date(Date.now() + INSTITUTION_UTC_OFFSET_MINUTES * 60_000)
}

/** Wall-clock time in the institution time zone -> ISO instant. */
function atInstitutionTime(dayOffset, time) {
  const local = institutionToday()
  const [hours, minutes] = time.split(':').map(Number)
  const dayStart = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + dayOffset,
  )
  const utcMs =
    dayStart + (hours * 60 + minutes) * 60_000 - INSTITUTION_UTC_OFFSET_MINUTES * 60_000
  return new Date(utcMs).toISOString()
}

// ---------------------------------------------------------------------------
// Booking plan
//
// `status` values that hold a slot (approved / completed) never overlap on the
// same resource — the database would reject them with SQLSTATE 23P01.
// ---------------------------------------------------------------------------
const BOOKING_PLAN = [
  { user: 'faculty@sums.demo', resource: 'Lecture Hall A1', day: -14, from: '09:00', to: '11:00', status: 'approved', attendees: 140, purpose: 'PHY101 lecture' },
  { user: 'student@sums.demo', resource: 'Classroom C112', day: -10, from: '09:00', to: '10:30', status: 'approved', attendees: 30, purpose: 'Study group revision' },
  { user: 'faculty@sums.demo', resource: 'Computer Laboratory 1', day: -7, from: '13:00', to: '16:00', status: 'approved', attendees: 36, purpose: 'CS201 practical' },
  { user: 'student2@sums.demo', resource: 'Seminar Room S4', day: -4, from: '16:00', to: '18:00', status: 'approved', attendees: 14, purpose: 'Project review' },
  { user: 'student2@sums.demo', resource: 'Project Meeting Room M2', day: -3, from: '15:00', to: '16:00', status: 'cancelled', attendees: 8, purpose: 'Team stand-up', reason: 'Group met online instead.' },
  { user: 'faculty2@sums.demo', resource: 'Committee Room M1', day: -2, from: '11:00', to: '12:00', status: 'rejected', attendees: 12, purpose: 'Visiting delegation', reason: 'Room reserved for the senate meeting.' },
  { user: 'student2@sums.demo', resource: 'Classroom B204', day: 2, from: '14:00', to: '15:30', status: 'approved', attendees: 48, purpose: 'Tutorial session' },
  { user: 'faculty2@sums.demo', resource: 'Seminar Room S3', day: 1, from: '09:00', to: '10:30', status: 'approved', attendees: 20, purpose: 'MSc seminar' },
  { user: 'student@sums.demo', resource: 'Portable Projector 01', day: 3, from: '09:00', to: '12:00', status: 'approved', attendees: 25, purpose: 'Department open day' },
  { user: 'student@sums.demo', resource: 'Lecture Hall A1', day: 4, from: '10:00', to: '12:00', status: 'pending', attendees: 160, purpose: 'Robotics club showcase' },
  { user: 'student@sums.demo', resource: 'Chemistry Laboratory', day: 5, from: '10:00', to: '13:00', status: 'pending', attendees: 22, purpose: 'Lab practical make-up' },
  { user: 'faculty2@sums.demo', resource: 'Grand Auditorium', day: 8, from: '17:00', to: '20:00', status: 'pending', attendees: 380, purpose: 'Annual coding contest' },
  { user: 'faculty2@sums.demo', resource: 'Lecture Hall A1', day: 9, from: '09:00', to: '11:00', status: 'approved', attendees: 150, purpose: 'Guest lecture' },
  { user: 'faculty@sums.demo', resource: 'Electronics Laboratory', day: 12, from: '10:00', to: '13:00', status: 'pending', attendees: 24, purpose: 'Circuit design workshop' },
]

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------
async function clearPreviousDemoData() {
  await rest(`/feedback?comment=like.${MARKER}*`, { method: 'DELETE' })
  await rest(`/bookings?purpose=like.${MARKER}*`, { method: 'DELETE' })
}

async function loadResources() {
  const resources = await rest('/resources?select=id,name')
  const byName = new Map(resources.map((resource) => [resource.name, resource.id]))

  const missing = BOOKING_PLAN.map((entry) => entry.resource).filter((name) => !byName.has(name))
  if (missing.length > 0) {
    fail(
      `These resources are missing: ${[...new Set(missing)].join(', ')}.\n` +
        '    Run supabase/seed.sql before this script.',
    )
  }
  return byName
}

async function insertBookings(accounts, resources) {
  const admin = accounts.get('admin@sums.demo')
  const rows = BOOKING_PLAN.map((entry) => {
    const account = accounts.get(entry.user)
    const decided = entry.status === 'approved' || entry.status === 'rejected'
    return {
      resource_id: resources.get(entry.resource),
      user_id: account.id,
      starts_at: atInstitutionTime(entry.day, entry.from),
      ends_at: atInstitutionTime(entry.day, entry.to),
      purpose: `${MARKER} ${entry.purpose}`,
      attendees: entry.attendees,
      status: entry.status,
      decision_reason: entry.reason ?? null,
      decided_by: decided ? admin.id : null,
      decided_at: decided ? new Date().toISOString() : null,
      cancelled_at: entry.status === 'cancelled' ? new Date().toISOString() : null,
    }
  })

  const inserted = await rest('/bookings?select=id,user_id,resource_id,starts_at,status', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: rows,
  })
  return inserted
}

/** Uses the application's own server-side logic to close finished bookings. */
async function completePastBookings() {
  return rest('/rpc/complete_past_bookings', { method: 'POST', body: {} })
}

async function insertFeedback(accounts, bookings) {
  const today = Date.now()
  const finished = bookings.filter(
    (booking) => booking.status === 'completed' && new Date(booking.starts_at).getTime() < today,
  )
  if (finished.length === 0) return []

  const ratings = [5, 4, 3, 2]
  const rows = finished.slice(0, 4).map((booking, index) => ({
    user_id: booking.user_id,
    resource_id: booking.resource_id,
    booking_id: booking.id,
    rating: ratings[index % ratings.length],
    comment:
      index === 0
        ? `${MARKER} Excellent facilities and the projector worked perfectly.`
        : index === 1
          ? `${MARKER} Good room, but it was warm in the afternoon.`
          : index === 2
            ? `${MARKER} The equipment list did not match the room.`
            : `${MARKER} Booking was fine; the room felt cramped for the group size.`,
  }))

  const inserted = await rest('/feedback?select=id,user_id,resource_id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: rows,
  })

  // Give the feedback screens something to show on the administrator side.
  const admin = accounts.get('admin@sums.demo')
  if (inserted.length > 0) {
    await rest(`/feedback?id=eq.${inserted[0].id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: {
        status: 'reviewed',
        admin_notes: 'Thanks — projector servicing completed.',
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
      },
    })
  }

  return inserted
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n  SUMS demo data -> ${url}\n`)

  const accounts = await ensureUsers()
  console.log(`  - ${accounts.size} demo accounts ready`)

  const resources = await loadResources()
  console.log(`  - ${resources.size} resources found`)

  await clearPreviousDemoData()
  const bookings = await insertBookings(accounts, resources)
  console.log(`  - ${bookings.length} bookings inserted`)

  await completePastBookings()
  const refreshed = await rest(`/bookings?purpose=like.${MARKER}*&select=id,user_id,resource_id,starts_at,status`)
  const completed = refreshed.filter((booking) => booking.status === 'completed').length
  console.log(`  - ${completed} past bookings marked completed by the server`)

  const feedback = await insertFeedback(accounts, refreshed)
  console.log(`  - ${feedback.length} feedback entries inserted`)

  console.log(
    '\n  Done. Sign in with any of these accounts using DEMO_PASSWORD:\n' +
      DEMO_USERS.map((user) => `    ${user.email.padEnd(24)} ${user.role}`).join('\n') +
      '\n',
  )
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})

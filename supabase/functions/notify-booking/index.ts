// =============================================================================
// SUMS — optional booking notification Edge Function
//
// STATUS: OPTIONAL AND DISABLED BY DEFAULT.
//
// In-app notifications are generated inside PostgreSQL and work without this
// function. This function only exists for institutions that want to *also*
// send an e-mail when a booking changes. It does nothing unless the operator
// configures an e-mail provider, so nothing in the application claims that
// e-mail delivery works out of the box.
//
// Required secrets (set with `supabase secrets set`):
//   BOOKING_NOTIFY_WEBHOOK_SECRET  shared secret that callers must present
//   RESEND_API_KEY                 provider API key (optional)
//   BOOKING_NOTIFY_FROM            verified sender address (optional)
//
// Deploy with:
//   supabase functions deploy notify-booking --no-verify-jwt
//
// Invoke with:
//   POST /functions/v1/notify-booking
//   headers: { "x-sums-secret": "<BOOKING_NOTIFY_WEBHOOK_SECRET>" }
//   body:    { "bookingId": "<uuid>", "event": "created|approved|rejected|cancelled" }
// =============================================================================

interface Payload {
  bookingId?: string
  event?: 'created' | 'approved' | 'rejected' | 'cancelled'
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }

  const expectedSecret = Deno.env.get('BOOKING_NOTIFY_WEBHOOK_SECRET')
  if (!expectedSecret) {
    return json({ error: 'not_configured', detail: 'BOOKING_NOTIFY_WEBHOOK_SECRET is not set.' }, 501)
  }

  if (request.headers.get('x-sums-secret') !== expectedSecret) {
    return json({ error: 'unauthorized' }, 401)
  }

  let payload: Payload
  try {
    payload = (await request.json()) as Payload
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('BOOKING_NOTIFY_FROM')
  if (!apiKey || !from) {
    // Deliberately explicit: in-app notifications already cover this event.
    return json(
      {
        delivered: false,
        reason: 'email_provider_not_configured',
        detail: 'In-app notifications were still created by the database triggers.',
      },
      202,
    )
  }

  if (!payload.bookingId) {
    return json({ error: 'bookingId is required.' }, 400)
  }

  // Sending the message is intentionally left to the operator: the booking
  // details must be read with the service-role key, which this template does
  // not embed. Wire it up only after deciding what data may leave the system.
  return json(
    {
      delivered: false,
      reason: 'template_not_implemented',
      detail:
        'The provider credentials are present but no e-mail template is configured in this repository.',
    },
    202,
  )
})

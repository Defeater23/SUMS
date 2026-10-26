import { createClient } from '@supabase/supabase-js'

const url = 'https://vuejazrpziqyhlqopevz.supabase.co'
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1ZWphenJwemlxeWhscW9wZXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NTg0ODIsImV4cCI6MjEwODIzNDQ4Mn0.XXk74W8nwapXVx3SFIiEOQyKVxMgcWBB_SZW8x9kHVE'

const supabase = createClient(url, anonKey)

async function test() {
  const testEmail = `test_${Date.now()}@example.com`
  const testPassword = 'Password123!'

  console.log('Signing up with', testEmail)
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: {
      data: {
        full_name: 'Test User',
        department: 'Testing',
        requested_role: 'student',
      },
    },
  })

  console.log('SignUp result:', {
    user: signUpData?.user?.id,
    session: !!signUpData?.session,
    signUpError,
  })

  // Try signing in
  console.log('Trying sign in...')
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  })

  console.log('SignIn result:', {
    user: signInData?.user?.id,
    session: !!signInData?.session,
    signInError,
  })

  if (signInData?.session) {
    console.log('Loading profile for user:', signInData.session.user.id)
    const { data: profile, error: profError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', signInData.session.user.id)
      .maybeSingle()
    console.log('Profile fetch:', { profile, profError })

    console.log('Testing RPC fn_my_dashboard_stats...')
    const { data: rpcData, error: rpcError } = await supabase.rpc('fn_my_dashboard_stats')
    console.log('RPC result:', { rpcData, rpcError })

    console.log('Testing fetchBookings...')
    const { data: bookings, error: bookError } = await supabase
      .from('bookings')
      .select('*, resource:resources(*), profile:profiles(*)')
      .limit(6)
    console.log('Bookings fetch:', { bookingsCount: bookings?.length, bookError })

    console.log('Testing resources fetch...')
    const { data: resources, error: resError } = await supabase
      .from('resources')
      .select('*, category:resource_categories(*)')
      .limit(6)
    console.log('Resources fetch:', { resourcesCount: resources?.length, resError })

    console.log('Testing notifications fetch...')
    const { data: notifs, error: notifError } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', signInData.session.user.id)
      .limit(10)
    console.log('Notifications fetch:', { notifsCount: notifs?.length, notifError })
  }
}

test().catch(console.error)

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfig } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errors'
import type { Profile, UserRole } from '@/types/models'
import type { LoginValues, ProfileValues, RegisterValues } from '@/lib/validation'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  role: UserRole | null
  /** True while the persisted session is being restored for the first time. */
  loading: boolean
  /** True while the profile row for the current session is being fetched. */
  profileLoading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  isStaff: boolean
  accountError: string | null
  signIn: (values: LoginValues) => Promise<void>
  signUp: (values: RegisterValues) => Promise<{ needsEmailConfirmation: boolean }>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  updateProfile: (values: ProfileValues) => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const loadProfile = useCallback(async (activeSession: Session | null) => {
    if (!activeSession?.user) {
      setProfile(null)
      return null
    }

    setProfileLoading(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', activeSession.user.id)
        .maybeSingle()

      if (error) throw error

      const profile = (data ?? null) as Profile | null

      if (profile && !profile.is_active) {
        setAccountError('Your account has been deactivated. Please contact an administrator.')
        setProfile(null)
        await supabase.auth.signOut()
        return null
      }

      setAccountError(null)
      setProfile(profile)
      return profile
    } catch (error) {
      setAccountError(getErrorMessage(error))
      setProfile(null)
      return null
    } finally {
      if (mounted.current) setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    let disposed = false

    if (!supabaseConfig.isConfigured) {
      setLoading(false)
      return undefined
    }

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (disposed) return
        setSession(data.session ?? null)
        await loadProfile(data.session ?? null)
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (disposed) return
      setSession(nextSession ?? null)
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        return
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        void loadProfile(nextSession ?? null)
      }
    })

    return () => {
      disposed = true
      listener.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(
    async (values: LoginValues) => {
      setAccountError(null)
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.email.trim(),
        password: values.password,
      })
      if (error) throw error
      setSession(data.session ?? null)
      const loaded = await loadProfile(data.session ?? null)
      if (!loaded) {
        throw new Error('Your account could not be loaded. It may have been deactivated.')
      }
    },
    [loadProfile],
  )

  const signUp = useCallback(
    async (values: RegisterValues) => {
      const { data, error } = await supabase.auth.signUp({
        email: values.email.trim(),
        password: values.password,
        options: {
          // The database trigger reads these fields to create the profile.
          // `requested_role` can only ever be 'student' or 'faculty'; an
          // administrator role cannot be self-assigned.
          data: {
            full_name: values.fullName.trim(),
            department: values.department?.trim() || null,
            requested_role: values.role,
          },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      })
      if (error) throw error

      const needsEmailConfirmation = !data.session
      if (data.session) {
        setSession(data.session)
        await loadProfile(data.session)
      }
      return { needsEmailConfirmation }
    },
    [loadProfile],
  )

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setSession(null)
    setProfile(null)
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  }, [])

  const updateProfile = useCallback(
    async (values: ProfileValues) => {
      const userId = session?.user?.id
      if (!userId) throw new Error('You need to sign in to continue.')

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: values.full_name.trim(),
          department: values.department?.trim() || null,
          phone: values.phone?.trim() || null,
        })
        .eq('id', userId)

      if (error) throw error
      await loadProfile(session)
    },
    [session, loadProfile],
  )

  const refreshProfile = useCallback(async () => {
    await loadProfile(session)
  }, [session, loadProfile])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      role: profile?.role ?? null,
      loading,
      profileLoading,
      isAuthenticated: Boolean(session?.user),
      isAdmin: profile?.role === 'admin',
      isStaff: profile?.role === 'faculty' || profile?.role === 'admin',
      accountError,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
      updateProfile,
      refreshProfile,
    }),
    [
      session,
      profile,
      loading,
      profileLoading,
      accountError,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
      updateProfile,
      refreshProfile,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.')
  }
  return context
}

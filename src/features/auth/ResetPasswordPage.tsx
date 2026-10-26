import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { getErrorMessage } from '@/lib/errors'
import { resetPasswordSchema, type ResetPasswordValues } from '@/lib/validation'
import { AuthLayout } from './AuthLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { InlineError, Spinner } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'

/**
 * Handles the password-recovery redirect.
 *
 * Supabase exchanges the recovery code in the URL for a short-lived session
 * (see `detectSessionInUrl` in the client), after which the user can set a new
 * password. If no session is present the link is treated as invalid or expired.
 */
export function ResetPasswordPage() {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking')
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  useEffect(() => {
    let disposed = false

    const check = async () => {
      const { data } = await supabase.auth.getSession()
      if (disposed) return
      if (data.session) {
        setStatus('ready')
        return
      }

      // Give the client a moment to exchange the `code` parameter in the URL.
      window.setTimeout(async () => {
        const { data: retry } = await supabase.auth.getSession()
        if (disposed) return
        setStatus(retry.session ? 'ready' : 'invalid')
      }, 1200)
    }

    void check()
    return () => {
      disposed = true
    }
  }, [])

  const onSubmit = async (values: ResetPasswordValues) => {
    setFormError(null)
    try {
      await updatePassword(values.password)
      toast.success('Password updated', 'You can now use your new password.')
      await supabase.auth.signOut()
      navigate('/login', { replace: true })
    } catch (error) {
      setFormError(getErrorMessage(error))
    }
  }

  if (status === 'checking') {
    return (
      <AuthLayout title="Verifying your link" subtitle="One moment while we validate your reset link.">
        <div className="flex items-center justify-center py-8">
          <Spinner label="Checking your reset link…" />
        </div>
      </AuthLayout>
    )
  }

  if (status === 'invalid') {
    return (
      <AuthLayout
        title="This link is no longer valid"
        subtitle="Password reset links expire quickly for security reasons."
        footer={
          <p>
            Need a new link? <Link className="link" to="/forgot-password">Request another</Link>
          </p>
        }
      >
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          Open the most recent reset email and follow the link again, or request a fresh one.
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Pick a password you have not used before on this system."
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <InlineError message={formError} />}

        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={errors.password?.message}
          required
          {...register('password')}
        />

        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat your new password"
          error={errors.confirmPassword?.message}
          required
          {...register('confirmPassword')}
        />

        <Button type="submit" fullWidth loading={isSubmitting} size="lg">
          Update password
        </Button>
      </form>
    </AuthLayout>
  )
}

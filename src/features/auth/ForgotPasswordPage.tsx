import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/context/AuthContext'
import { getErrorMessage } from '@/lib/errors'
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/lib/validation'
import { AuthLayout } from './AuthLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { InlineError } from '@/components/ui/States'

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = async (values: ForgotPasswordValues) => {
    setFormError(null)
    try {
      await requestPasswordReset(values.email)
      setSentTo(values.email.trim())
    } catch (error) {
      // Supabase returns success for unknown addresses by design; only real
      // transport failures surface here.
      setFormError(getErrorMessage(error))
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We will email you a secure link to choose a new password."
      footer={
        <p>
          Remembered it? <Link className="link" to="/login">Back to sign in</Link>
        </p>
      }
    >
      {sentTo ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
            If an account exists for <strong>{sentTo}</strong>, a password reset link is on its way.
            The link expires shortly, so please use it soon.
          </div>
          <Link to="/login">
            <Button variant="outline" fullWidth>
              Return to sign in
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {formError && <InlineError message={formError} />}

          <Input
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="you@university.edu"
            error={errors.email?.message}
            required
            {...register('email')}
          />

          <Button type="submit" fullWidth loading={isSubmitting} size="lg">
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}

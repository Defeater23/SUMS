import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/context/AuthContext'
import { getErrorMessage } from '@/lib/errors'
import { registerSchema, type RegisterValues } from '@/lib/validation'
import { AuthLayout } from './AuthLayout'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { InlineError } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'

export function RegisterPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmationSent, setConfirmationSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      department: '',
      role: 'student',
      password: '',
      confirmPassword: '',
    },
  })

  const onSubmit = async (values: RegisterValues) => {
    setFormError(null)
    try {
      const { needsEmailConfirmation } = await signUp(values)
      if (needsEmailConfirmation) {
        setConfirmationSent(true)
        return
      }
      toast.success('Account created', 'Your SUMS account is ready.')
      navigate('/', { replace: true })
    } catch (error) {
      setFormError(getErrorMessage(error))
    }
  }

  if (confirmationSent) {
    return (
      <AuthLayout
        title="Check your inbox"
        subtitle="We sent you a confirmation link to finish creating your account."
        footer={
          <p>
            Already confirmed? <Link className="link" to="/login">Sign in</Link>
          </p>
        }
      >
        <div className="rounded-xl border border-line bg-surface-muted p-5 text-sm text-content-muted">
          Open the link in the email we just sent to verify your address. The link returns you to
          SUMS so you can sign in immediately.
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Register to browse campus resources and request bookings."
      footer={
        <p>
          Already have an account? <Link className="link" to="/login">Sign in</Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <InlineError message={formError} />}

        <Input
          label="Full name"
          autoComplete="name"
          placeholder="Ada Lovelace"
          error={errors.fullName?.message}
          required
          {...register('fullName')}
        />

        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@university.edu"
          error={errors.email?.message}
          required
          {...register('email')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Department"
            placeholder="Computer Science"
            error={errors.department?.message}
            {...register('department')}
          />

          <Select
            label="I am a"
            options={[
              { value: 'student', label: 'Student' },
              { value: 'faculty', label: 'Faculty member' },
            ]}
            hint="Administrator access is granted by an existing administrator."
            error={errors.role?.message}
            {...register('role')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            error={errors.password?.message}
            required
            {...register('password')}
          />

          <Input
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat your password"
            error={errors.confirmPassword?.message}
            required
            {...register('confirmPassword')}
          />
        </div>

        <Button type="submit" fullWidth loading={isSubmitting} size="lg">
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}

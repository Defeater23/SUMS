import type { ReactNode } from 'react'
import { GraduationCap, CalendarCheck, ShieldCheck, BarChart3 } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'

const HIGHLIGHTS = [
  {
    icon: CalendarCheck,
    title: 'Book facilities in seconds',
    description: 'Real-time availability with overlapping reservations prevented in the database.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-based access',
    description: 'Students, faculty and administrators each see exactly what they should.',
  },
  {
    icon: BarChart3,
    title: 'Understand utilisation',
    description: 'Dashboards and analytics computed from live booking records.',
  },
]

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-700 p-10 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-500/40 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-900/60 blur-3xl"
        />

        <div className="relative">
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
              <GraduationCap aria-hidden className="h-5 w-5" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">SUMS</span>
              <span className="text-xs text-brand-100">University Resource Management</span>
            </span>
          </span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">
            One place to book, approve and analyse every campus resource.
          </h2>
          <p className="mt-3 text-sm text-brand-100">
            Classrooms, laboratories, seminar rooms, meeting rooms, auditoriums and equipment —
            managed with approvals, notifications and reports.
          </p>

          <ul className="mt-8 space-y-5">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <item.icon aria-hidden className="h-4.5 w-4.5" style={{ height: '1.125rem', width: '1.125rem' }} />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{item.title}</span>
                  <span className="mt-0.5 block text-sm text-brand-100">{item.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-brand-200">
          Access is granted by your institution. Do not share your credentials.
        </p>
      </section>

      {/* Form panel */}
      <section className="flex flex-col justify-center bg-surface px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <div className="lg:hidden">
            <Logo />
          </div>

          <header className="mt-8 lg:mt-0">
            <h1 className="text-2xl font-semibold tracking-tight text-content">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-content-muted">{subtitle}</p>}
          </header>

          <div className="mt-7">{children}</div>

          {footer && <div className="mt-6 text-sm text-content-muted">{footer}</div>}
        </div>
      </section>
    </div>
  )
}

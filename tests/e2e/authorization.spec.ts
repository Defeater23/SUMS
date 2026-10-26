import { expect, test, type Page } from '@playwright/test'

/**
 * Authorization journeys.
 *
 * These specs exercise the real backend: they sign in against Supabase, then
 * verify that administrator-only screens are refused for a student. They need
 * the demo accounts created by `scripts/seed-demo-data.mjs`.
 *
 * Required environment variables:
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 *   E2E_STUDENT_EMAIL, E2E_STUDENT_PASSWORD
 *   E2E_ADMIN_EMAIL,   E2E_ADMIN_PASSWORD
 *
 * The specs are skipped (never silently passed) when those are absent.
 */
const configured = Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY)
const studentEmail = process.env.E2E_STUDENT_EMAIL ?? ''
const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? ''
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? ''
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? ''

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel(/email address/i).fill(email)
  await page.getByLabel(/^password/i).fill(password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
}

test.describe('role-based authorization', () => {
  test('a student is refused administrator screens', async ({ page }) => {
    test.skip(!configured || !studentEmail, 'Requires a configured project and student credentials.')

    await signIn(page, studentEmail, studentPassword)

    await page.goto('/analytics')
    await expect(page.getByRole('heading', { name: /administrator access required/i })).toBeVisible()

    await page.goto('/users')
    await expect(page.getByRole('heading', { name: /administrator access required/i })).toBeVisible()
  })

  test('an administrator can open the approvals queue', async ({ page }) => {
    test.skip(!configured || !adminEmail, 'Requires a configured project and administrator credentials.')

    await signIn(page, adminEmail, adminPassword)

    await page.goto('/approvals')
    await expect(page.getByRole('heading', { name: /approvals/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /administrator access required/i })).toBeHidden()
  })

  test('signing out returns the visitor to the sign-in page', async ({ page }) => {
    test.skip(!configured || !studentEmail, 'Requires a configured project and student credentials.')

    await signIn(page, studentEmail, studentPassword)

    await page.goto('/settings')
    await page.getByRole('button', { name: /account menu|account/i }).click()
    await page.getByRole('menuitem', { name: /sign out/i }).click()

    await expect(page).toHaveURL(/\/login$/)
  })
})

import { expect, test } from '@playwright/test'

/**
 * Startup guardrails.
 *
 * SUMS has no mock-data mode: without a Supabase project there is nothing to
 * read or write, so the interface must not be shown at all. This spec is valid
 * in both states and documents that contract.
 */
const configured = Boolean(
  process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY,
)

test.describe('application startup', () => {
  test('serves a usable entry point for the current configuration', async ({ page }) => {
    await page.goto('/')

    if (configured) {
      await expect(page.getByRole('heading', { name: /sign in to sums/i })).toBeVisible()
    } else {
      await expect(
        page.getByRole('heading', { name: /connect sums to a supabase project/i }),
      ).toBeVisible()
      await expect(page.getByRole('heading', { name: /sign in to sums/i })).toBeHidden()
    }
  })

  test('protects application routes from signed-out visitors', async ({ page }) => {
    test.skip(!configured, 'Requires a configured Supabase project.')

    await page.goto('/bookings')

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: /sign in to sums/i })).toBeVisible()
  })

  test('validates the sign-in form before contacting the server', async ({ page }) => {
    test.skip(!configured, 'Requires a configured Supabase project.')

    await page.goto('/login')
    await page.getByRole('button', { name: /^sign in$/i }).click()

    await expect(page.getByText(/an email address is required/i)).toBeVisible()
  })
})

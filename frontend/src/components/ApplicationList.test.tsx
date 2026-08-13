import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplicationList } from './ApplicationList';
import { renderWithProviders, anApplication } from '../test/render';

/**
 * These exist because of a specific bug: the gap analysis - the entire output of
 * the AI pipeline - was generated, stored, returned by the API and never
 * rendered by any component. Nothing failed. The build passed, the types were
 * right, the data was in the response. It was found by reading the code.
 *
 * A test asserting the text actually reaches the DOM is the thing that would
 * have caught it, so that is what these assert.
 */
describe('ApplicationList', () => {
  it('renders the gap analysis text when a row is expanded', async () => {
    const user = userEvent.setup();
    const app = anApplication({ gapAnalysis: 'Missing Kubernetes and Terraform experience.' });

    renderWithProviders(<ApplicationList applications={[app]} loading={false} />);

    // Collapsed by default: the analysis must not be in the document at all.
    expect(screen.queryByText(/Missing Kubernetes/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Senior Backend Engineer/ }));

    expect(screen.getByText('Missing Kubernetes and Terraform experience.')).toBeVisible();
  });

  it('marks the disclosure button expanded and points it at the analysis row', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ApplicationList applications={[anApplication()]} loading={false} />);

    const button = screen.getByRole('button', { name: /Senior Backend Engineer/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    const controls = button.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls!)).toBeInTheDocument();
  });

  it('collapses again on a second click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ApplicationList applications={[anApplication()]} loading={false} />);

    const button = screen.getByRole('button', { name: /Senior Backend Engineer/ });
    await user.click(button);
    expect(screen.getByText(/Strong C# and PostgreSQL/)).toBeVisible();

    await user.click(button);
    expect(screen.queryByText(/Strong C# and PostgreSQL/)).not.toBeInTheDocument();
  });

  it('does not offer a disclosure for a row that has no analysis', () => {
    const pending = anApplication({ matchStatus: 'Pending', matchScore: null, gapAnalysis: null, completedAt: null });
    renderWithProviders(<ApplicationList applications={[pending]} loading={false} />);

    expect(screen.queryByRole('button', { name: /Senior Backend Engineer/ })).not.toBeInTheDocument();
    expect(screen.getByText('Senior Backend Engineer')).toBeVisible();
  });

  it('shows a real empty state rather than an empty table', () => {
    renderWithProviders(<ApplicationList applications={[]} loading={false} />);
    expect(screen.getByText(/No applications tracked yet/)).toBeVisible();
  });

  it('links each row to its detail page', () => {
    renderWithProviders(<ApplicationList applications={[anApplication()]} loading={false} />);

    expect(
      screen.getByRole('link', { name: /View details for Senior Backend Engineer/ }),
    ).toHaveAttribute('href', '/applications/11111111-1111-1111-1111-111111111111');
  });
});

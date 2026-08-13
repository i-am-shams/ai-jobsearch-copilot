import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import type { ApplicationResponse } from '../lib/schemas';

/** A query client with retries off, so a failure test fails immediately. */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', queryClient = makeQueryClient() } = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper }) };
}

export function anApplication(overrides: Partial<ApplicationResponse> = {}): ApplicationResponse {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    jobTitle: 'Senior Backend Engineer',
    companyName: 'Acme Corp',
    createdAt: '2026-08-13T05:00:00Z',
    matchStatus: 'Completed',
    matchScore: 72,
    gapAnalysis: 'Strong C# and PostgreSQL overlap. Missing Kubernetes and Terraform experience.',
    completedAt: '2026-08-13T05:00:08Z',
    ...overrides,
  };
}

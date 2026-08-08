import { useState, FormEvent } from 'react';
import { apiClient } from '../api/client';
import { CreateApplicationRequest } from '../types/application';

interface Props {
  onCreated: () => void; // tells parent to refresh the list
}

export function ApplicationForm({ onCreated }: Props) {
  const [form, setForm] = useState<CreateApplicationRequest>({
    jobTitle: '',
    companyName: '',
    resumeText: '',
    jobDescriptionText: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await apiClient.post('/applications', form);
      setForm({ jobTitle: '', companyName: '', resumeText: '', jobDescriptionText: '' });
      onCreated();
    } catch (err: any) {
      setError(err.response?.data ?? 'Failed to create application.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3>Track a New Application</h3>
      <input
        placeholder="Job Title"
        value={form.jobTitle}
        onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
        required
      />
      <input
        placeholder="Company Name"
        value={form.companyName}
        onChange={(e) => setForm({ ...form, companyName: e.target.value })}
        required
      />
      <textarea
        placeholder="Paste resume text"
        value={form.resumeText}
        onChange={(e) => setForm({ ...form, resumeText: e.target.value })}
        rows={6}
        required
      />
      <textarea
        placeholder="Paste job description"
        value={form.jobDescriptionText}
        onChange={(e) => setForm({ ...form, jobDescriptionText: e.target.value })}
        rows={6}
        required
      />
      {error && <p style={{ color: 'red' }}>{String(error)}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );
}

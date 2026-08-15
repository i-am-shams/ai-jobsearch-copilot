import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateApplication } from '../api/applications';
import { toErrorMessage } from '../api/errors';
import { createApplicationSchema, type CreateApplicationRequest } from '../lib/schemas';
import { useToast } from './Toaster';

export function ApplicationForm() {
  const createApplication = useCreateApplication();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateApplicationRequest>({
    resolver: zodResolver(createApplicationSchema),
    mode: 'onBlur',
    defaultValues: { jobTitle: '', companyName: '', resumeText: '', jobDescriptionText: '' },
  });

  async function onSubmit(values: CreateApplicationRequest) {
    try {
      await createApplication.mutateAsync(values);
      reset();
      toast('Submitted — analysing the match now.', 'info');
    } catch {
      // Rendered below from the mutation's own error state; the toast would be
      // redundant for a failure the user is looking straight at.
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="card">
      <h3>New application</h3>

      <div className="field">
        <label htmlFor="jobTitle">Job title</label>
        <input
          id="jobTitle"
          aria-invalid={Boolean(errors.jobTitle)}
          aria-describedby={errors.jobTitle ? 'jobTitle-error' : undefined}
          {...register('jobTitle')}
        />
        {errors.jobTitle && (
          <p className="field__error" id="jobTitle-error" role="alert">{errors.jobTitle.message}</p>
        )}
      </div>

      <div className="field">
        <label htmlFor="companyName">Company name</label>
        <input
          id="companyName"
          aria-invalid={Boolean(errors.companyName)}
          aria-describedby={errors.companyName ? 'companyName-error' : undefined}
          {...register('companyName')}
        />
        {errors.companyName && (
          <p className="field__error" id="companyName-error" role="alert">{errors.companyName.message}</p>
        )}
      </div>

      <div className="field">
        <label htmlFor="resumeText">Resume</label>
        <textarea
          id="resumeText"
          rows={6}
          aria-invalid={Boolean(errors.resumeText)}
          aria-describedby={errors.resumeText ? 'resumeText-error' : undefined}
          {...register('resumeText')}
        />
        {errors.resumeText && (
          <p className="field__error" id="resumeText-error" role="alert">{errors.resumeText.message}</p>
        )}
      </div>

      <div className="field">
        <label htmlFor="jobDescriptionText">Job description</label>
        <textarea
          id="jobDescriptionText"
          rows={6}
          aria-invalid={Boolean(errors.jobDescriptionText)}
          aria-describedby={errors.jobDescriptionText ? 'jobDescriptionText-error' : undefined}
          {...register('jobDescriptionText')}
        />
        {errors.jobDescriptionText && (
          <p className="field__error" id="jobDescriptionText-error" role="alert">
            {errors.jobDescriptionText.message}
          </p>
        )}
      </div>

      {createApplication.isError && (
        <p className="form-error" role="alert">
          {toErrorMessage(createApplication.error, 'Failed to create application.')}
        </p>
      )}

      <button type="submit" className="btn btn--primary" disabled={createApplication.isPending}>
        {createApplication.isPending ? 'Submitting…' : 'Submit'}
      </button>
    </form>
  );
}

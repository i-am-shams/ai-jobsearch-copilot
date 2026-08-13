export interface ApplicationResponse {
  id: string;
  jobTitle: string;
  companyName: string;
  createdAt: string;
  matchStatus: 'Pending' | 'Processing' | 'Completed' | 'Failed';
  matchScore: number | null;
  gapAnalysis: string | null;
  completedAt: string | null;
}

export interface CreateApplicationRequest {
  jobTitle: string;
  companyName: string;
  resumeText: string;
  jobDescriptionText: string;
}

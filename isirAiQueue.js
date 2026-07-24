import { randomUUID } from 'node:crypto';
import { analyzeIsirDocuments } from './isirAnalysis.js';

const MAX_RETAINED_JOBS = 100;
const jobs = new Map();
const pending = [];
let activeJobId = '';

function publicJob(job) {
  if (!job) return null;
  return {
    job_id: job.job_id,
    status: job.status,
    mode: job.mode,
    case_id: job.case_id,
    progress: job.progress,
    message: job.message,
    created_at: job.created_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
    result: job.status === 'completed' ? job.result : undefined,
    error: job.status === 'failed' ? job.error : undefined,
    position: job.status === 'queued'
      ? Math.max(1, pending.findIndex((id) => id === job.job_id) + 1)
      : 0
  };
}

function trimFinishedJobs() {
  if (jobs.size <= MAX_RETAINED_JOBS) return;
  [...jobs.values()]
    .filter((job) => job.status === 'completed' || job.status === 'failed')
    .sort((left, right) => String(left.finished_at).localeCompare(String(right.finished_at)))
    .slice(0, jobs.size - MAX_RETAINED_JOBS)
    .forEach((job) => jobs.delete(job.job_id));
}

async function runNext(options = {}) {
  if (activeJobId || !pending.length) return;
  const jobId = pending.shift();
  const job = jobs.get(jobId);
  if (!job) {
    void runNext(options);
    return;
  }
  activeJobId = jobId;
  job.status = 'running';
  job.started_at = new Date().toISOString();
  job.progress = 2;
  job.message = 'AI úloha byla spuštěna.';
  try {
    job.result = await analyzeIsirDocuments(job.input, {
      ...options,
      onProgress: ({ progress, message }) => {
        job.progress = Math.max(job.progress, Number(progress) || 0);
        if (message) job.message = message;
      }
    });
    job.status = 'completed';
    job.progress = 100;
    job.message = 'AI úloha byla dokončena.';
  } catch (error) {
    job.status = 'failed';
    job.error = String(error?.message || error || 'AI úloha selhala.');
    job.message = job.error;
  } finally {
    job.finished_at = new Date().toISOString();
    activeJobId = '';
    trimFinishedJobs();
    void runNext(options);
  }
}

function enqueueIsirAiJob(input, options = {}) {
  const mode = String(input?.mode || 'case-study');
  const caseId = String(input?.case?.case_id || '');
  const documentKey = (Array.isArray(input?.documents) ? input.documents : [])
    .map((item) => String(item.document_id || ''))
    .sort()
    .join(',');
  const duplicateKey = `${mode}:${caseId}:${documentKey}`;
  const duplicate = [...jobs.values()].find((job) =>
    job.duplicate_key === duplicateKey && (job.status === 'queued' || job.status === 'running')
  );
  if (duplicate) return publicJob(duplicate);

  const job = {
    job_id: randomUUID(),
    duplicate_key: duplicateKey,
    status: 'queued',
    mode,
    case_id: caseId,
    progress: 0,
    message: 'Čeká ve frontě AI.',
    created_at: new Date().toISOString(),
    started_at: '',
    finished_at: '',
    input,
    result: null,
    error: ''
  };
  jobs.set(job.job_id, job);
  pending.push(job.job_id);
  void runNext(options);
  return publicJob(job);
}

function getIsirAiJob(jobId) {
  return publicJob(jobs.get(String(jobId || '')));
}

function resetIsirAiQueueForTests() {
  jobs.clear();
  pending.splice(0, pending.length);
  activeJobId = '';
}

export {
  enqueueIsirAiJob,
  getIsirAiJob,
  resetIsirAiQueueForTests
};

const { randomUUID } = require('crypto');
const axios = require('axios');
const FormData = require('form-data');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

const jobs = new Map();

function createJob() {
  const id = randomUUID();
  jobs.set(id, {
    id,
    status: 'pending',
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
  });
  return id;
}

function getJob(id) {
  return jobs.get(id) || null;
}

async function runVisionJob(jobId, buffer, originalname, mimetype, matchCode) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = 'processing';

  try {
    const form = new FormData();
    form.append('file', buffer, { filename: originalname, contentType: mimetype });
    if (matchCode) form.append('match_code', matchCode);

    const { data } = await axios.post(
      `${AI_SERVICE_URL}/vision/analyze-upload`,
      form,
      {
        headers: form.getHeaders(),
        maxBodyLength: 40 * 1024 * 1024,
        maxContentLength: 40 * 1024 * 1024,
        timeout: 120000,
      }
    );
    job.status = 'done';
    job.result = data;
  } catch (err) {
    job.status = 'failed';
    job.error =
      err.response?.data?.detail ||
      err.response?.data?.message ||
      err.message ||
      'Erreur inconnue';
  }
}

module.exports = { createJob, getJob, runVisionJob, jobs };

import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || ''

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 60_000,
})

export async function uploadFiles(template, recipients) {
  const fd = new FormData()
  fd.append('template', template)
  fd.append('recipients', recipients)
  const { data } = await api.post('/api/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function previewCert(payload) {
  const { data } = await api.post('/api/preview', payload)
  return data
}

export async function generateCerts(payload) {
  const { data } = await api.post('/api/generate', payload)
  return data
}

export async function sendEmails(payload) {
  const { data } = await api.post('/api/send', payload)
  return data
}

export async function getStatus(jobId) {
  const { data } = await api.get(`/api/status/${jobId}`)
  return data
}

export async function healthCheck() {
  const { data } = await api.get('/api/health')
  return data
}

export function downloadAllUrl(jobId) {
  return `${API_BASE}/api/download/${jobId}`
}

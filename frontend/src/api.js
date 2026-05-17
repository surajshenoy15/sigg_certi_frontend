import axios from 'axios'

export const API_BASE =
  import.meta.env.VITE_API_BASE || 'https://sigg-certi-backend.onrender.com'

export function fullUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${API_BASE}${url}`
}

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

  return {
    ...data,
    template_url: fullUrl(data.template_url),
  }
}

export async function previewCert(payload) {
  const { data } = await api.post('/api/preview', payload)

  return {
    ...data,
    preview_url: fullUrl(data.preview_url),
  }
}

export async function generateCerts(payload) {
  const { data } = await api.post('/api/generate', payload)

  return {
    ...data,
    certificates: data.certificates?.map((cert) => ({
      ...cert,
      url: fullUrl(cert.url),
    })) || [],
  }
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
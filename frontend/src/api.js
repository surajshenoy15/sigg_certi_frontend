import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || ''

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 60_000,
})

// ---- cert flow (existing) ----
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

// ---- events (new) ----
export async function listEvents() {
  const { data } = await api.get('/api/events')
  return data
}

export async function createEvent(payload) {
  const { data } = await api.post('/api/events', payload)
  return data
}

export async function getEvent(eventId) {
  const { data } = await api.get(`/api/events/${eventId}`)
  return data
}

export async function deleteEvent(eventId) {
  const { data } = await api.delete(`/api/events/${eventId}`)
  return data
}

export async function uploadRegistrants(eventId, file) {
  const fd = new FormData()
  fd.append('file', file)
  const { data } = await api.post(`/api/events/${eventId}/registrants`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function sendInvites(eventId, payload) {
  const { data } = await api.post(`/api/events/${eventId}/send-invites`, payload)
  return data
}

export async function checkIn(eventId, token) {
  const { data } = await api.post(`/api/events/${eventId}/checkin`, { token })
  return data
}

export function attendanceCsvUrl(eventId) {
  return `${API_BASE}/api/events/${eventId}/attendance.csv`
}

export async function useEventForCertificates(eventId, template) {
  const fd = new FormData()
  fd.append('template', template)
  const { data } = await api.post(
    `/api/events/${eventId}/use-for-certificates`,
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
  return data
}
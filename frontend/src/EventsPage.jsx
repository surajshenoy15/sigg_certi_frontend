import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Plus,
  Users,
  Mail,
  ScanLine,
  Download,
  Trash2,
  Calendar,
  CheckCircle2,
  ArrowRight,
  FileSpreadsheet,
  Upload,
  RefreshCcw,
} from 'lucide-react'

import {
  listEvents,
  createEvent,
  getEvent,
  deleteEvent,
  uploadRegistrants,
  sendInvites,
  attendanceCsvUrl,
  useEventForCertificates,
} from './api'

export default function EventsPage({ onUseForCertificates, onOpenScanner }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  const refresh = async () => {
    setLoading(true)

    try {
      const list = await listEvents()
      setEvents(list)

      if (selected) {
        const fresh = await getEvent(selected.id).catch(() => null)
        if (fresh) setSelected(fresh)
      }
    } catch (e) {
      toast.error('Failed to load events')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onCreate = async ({ name, date }) => {
    try {
      const e = await createEvent({ name, date })

      toast.success('Event created')
      setShowCreate(false)

      await refresh()

      const fullEvent = await getEvent(e.id)
      setSelected(fullEvent)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Create failed')
    }
  }

  const onDelete = async (id) => {
    if (!confirm('Delete this event? Registrants will be lost.')) return

    try {
      await deleteEvent(id)

      if (selected?.id === id) setSelected(null)

      toast.success('Deleted')
      refresh()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Delete failed')
    }
  }

  return (
    <div>
      <div className="panel">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 className="panel-title">
              Your <span className="accent">events</span>
            </h2>

            <div className="panel-sub">
              Manage registrations · Send QR invites · Track attendance
            </div>
          </div>

          <button
            className="btn btn-accent"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={14} /> New event
          </button>
        </div>

        {showCreate && (
          <CreateEventForm
            onSubmit={onCreate}
            onCancel={() => setShowCreate(false)}
          />
        )}

        {loading && <div className="empty-state">Loading…</div>}

        {!loading && events.length === 0 && (
          <div className="empty-state">
            <Calendar className="icon" size={48} />
            <h3>No events yet</h3>
            <p>Create your first event to start sending QR-based invites.</p>
          </div>
        )}

        {!loading && events.length > 0 && (
          <div className="event-grid">
            {events.map((e) => (
              <button
                key={e.id}
                className={`event-card ${
                  selected?.id === e.id ? 'selected' : ''
                }`}
                onClick={async () => {
                  const fullEvent = await getEvent(e.id)
                  setSelected(fullEvent)
                }}
              >
                <div className="event-card-name">{e.name}</div>

                {e.date && <div className="event-card-date">{e.date}</div>}

                <div className="event-card-stats">
                  <span>
                    <Users size={11} /> {e.registrants_count}
                  </span>

                  <span>
                    <Mail size={11} /> {e.invites_sent}
                  </span>

                  <span>
                    <CheckCircle2 size={11} /> {e.attended_count}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <EventDetail
          event={selected}
          onDelete={() => onDelete(selected.id)}
          onRefresh={refresh}
          onOpenScanner={() => onOpenScanner(selected.id)}
          onUseForCertificates={onUseForCertificates}
        />
      )}
    </div>
  )
}

function CreateEventForm({ onSubmit, onCancel }) {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')

  return (
    <div
      style={{
        marginTop: 20,
        padding: 20,
        background: 'var(--paper)',
        border: '1px solid var(--ink)',
      }}
    >
      <div className="control-block">
        <label>Event Name</label>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Arcade 101 with Varun VP"
        />
      </div>

      <div className="control-block" style={{ marginTop: 12 }}>
        <label>Date</label>

        <input
          type="text"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          placeholder="e.g. March 28, 2026"
        />
      </div>

      <div className="btn-row">
        <button
          className="btn btn-accent"
          onClick={() => {
            if (!name.trim()) {
              toast.error('Event name is required')
              return
            }

            onSubmit({
              name: name.trim(),
              date: date.trim(),
            })
          }}
        >
          Create
        </button>

        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function EventDetail({
  event,
  onDelete,
  onRefresh,
  onOpenScanner,
  onUseForCertificates,
}) {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  const [sendingUnsent, setSendingUnsent] = useState(false)
  const [resendingAll, setResendingAll] = useState(false)

  const [inviteSubject, setInviteSubject] = useState(
    `Your attendance QR · ${event.name}`
  )

  const [inviteBody, setInviteBody] = useState(
    "Here's your personal QR code for attendance. Please show this at the venue entrance so we can mark you present."
  )

  const [tplFile, setTplFile] = useState(null)
  const [useLoading, setUseLoading] = useState(false)

  const registrants = event.registrants || []
  const attended = registrants.filter((r) => r.checked_in)
  const total = registrants.length
  const invitedCount = registrants.filter((r) => r.invite_sent).length
  const unsentCount = total - invitedCount

  const upload = async () => {
    if (!file) return

    setUploading(true)

    try {
      const r = await uploadRegistrants(event.id, file)

      toast.success(`Added ${r.added} · Skipped ${r.skipped}`)
      setFile(null)
      onRefresh()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const sendQRs = async (resendAll = false) => {
    if (total === 0) {
      toast.error('No registrants found')
      return
    }

    if (resendAll) {
      setResendingAll(true)
    } else {
      setSendingUnsent(true)
    }

    try {
      const r = await sendInvites(event.id, {
        subject: inviteSubject,
        body_paragraph: inviteBody,
        only_unsent: !resendAll,
      })

      if (resendAll) {
        toast.success(`Re-queued ${r.queued} invite${r.queued === 1 ? '' : 's'}`)
      } else {
        toast.success(`Queued ${r.queued} invite${r.queued === 1 ? '' : 's'}`)
      }

      setTimeout(onRefresh, 2000)
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Send failed')
    } finally {
      setSendingUnsent(false)
      setResendingAll(false)
    }
  }

  const confirmResendAll = () => {
    const ok = confirm(
      'This will resend QR invite emails to all registrants, including users who already received the email. Continue?'
    )

    if (ok) {
      sendQRs(true)
    }
  }

  const useForCerts = async () => {
    if (!tplFile) {
      toast.error('Pick a certificate template')
      return
    }

    setUseLoading(true)

    try {
      const job = await useEventForCertificates(event.id, tplFile)

      toast.success(`Loaded ${job.recipient_count} attendees`)
      onUseForCertificates(job)
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed')
    } finally {
      setUseLoading(false)
    }
  }

  return (
    <section className="panel">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <h2 className="panel-title">{event.name}</h2>

          <div className="panel-sub">
            {event.date || 'No date'} · {total} registrants ·{' '}
            {attended.length} checked in
          </div>
        </div>

        <button className="btn btn-ghost" onClick={onDelete}>
          <Trash2 size={14} /> Delete
        </button>
      </div>

      <div className="divider-rule">1 · Import registrations</div>

      <div className="upload-grid" style={{ gridTemplateColumns: '1fr' }}>
        <label className={`dropzone ${file ? 'has-file' : ''}`}>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0])}
          />

          <div className="dropzone-icon">
            {file ? <CheckCircle2 size={36} /> : <FileSpreadsheet size={36} />}
          </div>

          <div className="dropzone-title">Google Forms sheet</div>

          <div className="dropzone-hint">
            CSV / XLSX · columns: name, email · phone and usn optional
          </div>

          {file && <div className="dropzone-filename">{file.name}</div>}
        </label>
      </div>

      <div className="btn-row">
        <button
          className="btn btn-accent"
          onClick={upload}
          disabled={!file || uploading}
        >
          {uploading ? (
            <>
              <span className="spinner" /> Importing
            </>
          ) : (
            <>
              <Upload size={14} /> Import
            </>
          )}
        </button>
      </div>

      <div className="divider-rule">2 · Send QR invites</div>

      <div className="control-block">
        <label>Subject</label>

        <input
          type="text"
          value={inviteSubject}
          onChange={(e) => setInviteSubject(e.target.value)}
        />
      </div>

      <div className="control-block" style={{ marginTop: 12 }}>
        <label>Body paragraph</label>

        <textarea
          value={inviteBody}
          onChange={(e) => setInviteBody(e.target.value)}
          style={{ minHeight: 100 }}
        />
      </div>

      <div className="btn-row">
        <button
          className="btn btn-accent"
          onClick={() => sendQRs(false)}
          disabled={sendingUnsent || resendingAll || total === 0 || unsentCount === 0}
        >
          {sendingUnsent ? (
            <>
              <span className="spinner" /> Queuing
            </>
          ) : (
            <>
              <Mail size={14} /> Send unsent QR
            </>
          )}
        </button>

        <button
          className="btn btn-ghost"
          onClick={confirmResendAll}
          disabled={sendingUnsent || resendingAll || total === 0}
        >
          {resendingAll ? (
            <>
              <span className="spinner" /> Resending
            </>
          ) : (
            <>
              <RefreshCcw size={14} /> Resend to all
            </>
          )}
        </button>

        <span className="kbd">
          {invitedCount} already invited · {unsentCount} unsent
        </span>
      </div>

      <div className="divider-rule">3 · Live attendance</div>

      <div className="btn-row">
        <button className="btn btn-accent" onClick={onOpenScanner}>
          <ScanLine size={14} /> Open scanner
        </button>

        <a
          className="btn btn-ghost"
          href={attendanceCsvUrl(event.id)}
          target="_blank"
          rel="noreferrer"
        >
          <Download size={14} /> Download attendance CSV
        </a>

        <button className="btn btn-ghost" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      {total > 0 && (
        <table className="recipients" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Invite</th>
              <th>Attended</th>
            </tr>
          </thead>

          <tbody>
            {registrants.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.email}</td>
                <td>{r.invite_sent ? '✓' : '—'}</td>
                <td>{r.checked_in ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {attended.length > 0 && (
        <>
          <div className="divider-rule">
            4 · Generate certificates for attendees
          </div>

          <div className="upload-grid" style={{ gridTemplateColumns: '1fr' }}>
            <label className={`dropzone ${tplFile ? 'has-file' : ''}`}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                onChange={(e) => setTplFile(e.target.files?.[0])}
              />

              <div className="dropzone-icon">
                {tplFile ? <CheckCircle2 size={36} /> : <Upload size={36} />}
              </div>

              <div className="dropzone-title">Certificate template</div>

              <div className="dropzone-hint">
                JPG / PNG · skips CSV step and uses checked-in attendees
              </div>

              {tplFile && <div className="dropzone-filename">{tplFile.name}</div>}
            </label>
          </div>

          <div className="btn-row">
            <button
              className="btn btn-accent"
              onClick={useForCerts}
              disabled={!tplFile || useLoading}
            >
              {useLoading ? (
                <>
                  <span className="spinner" /> Loading
                </>
              ) : (
                <>
                  Use {attended.length} attendees <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
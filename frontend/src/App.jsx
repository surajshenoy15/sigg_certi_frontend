import React, { useEffect, useMemo, useRef, useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import {
  Upload,
  FileSpreadsheet,
  Image as ImageIcon,
  MousePointerClick,
  Sparkles,
  Mail,
  Download,
  CheckCircle2,
  AlertTriangle,
  Award,
  Calendar,
} from 'lucide-react'

import {
  uploadFiles,
  previewCert,
  generateCerts,
  sendEmails,
  getStatus,
  healthCheck,
  downloadAllUrl,
  checkIn,
  getEvent,
} from './api'

import EventsPage from './EventsPage'
import ScannerPage from './ScannerPage'

const STEPS = [
  { num: '01', label: 'Upload assets' },
  { num: '02', label: 'Place name' },
  { num: '03', label: 'Generate' },
  { num: '04', label: 'Dispatch' },
]


// ===========================================================================
// Routing (no router lib — three views: certs / events / scanner / scan-link)
// ===========================================================================
function parseRoute(loc) {
  const path = loc.pathname || '/'
  const params = new URLSearchParams(loc.search)

  if (path === '/scan' && params.get('event') && params.get('token')) {
    return {
      kind: 'scan-link',
      event: params.get('event'),
      token: params.get('token'),
      path: path + loc.search,
    }
  }

  if (path.startsWith('/scanner/')) {
    return { kind: 'scanner', event: path.split('/')[2], path }
  }

  if (path === '/events' || path.startsWith('/event')) {
    return { kind: 'events', path: '/events' }
  }

  return { kind: 'certs', path: '/' }
}


export default function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location))

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const nav = (r) => {
    window.history.pushState({}, '', r.path)
    setRoute(r)
  }

  // Public landing when a registrant opens their personal QR URL
  if (route.kind === 'scan-link') {
    return <ScanLinkLanding eventId={route.event} token={route.token} />
  }

  return <MainApp route={route} nav={nav} />
}


// ===========================================================================
// /scan?event=X&token=Y — auto-check-in landing
// ===========================================================================
function ScanLinkLanding({ eventId, token }) {
  const [state, setState] = useState({ loading: true })

  useEffect(() => {
    (async () => {
      try {
        const ev = await getEvent(eventId).catch(() => null)
        const r = await checkIn(eventId, token)
        setState({
          loading: false,
          ok: true,
          eventName: ev?.name,
          ...r,
        })
      } catch (e) {
        setState({
          loading: false,
          ok: false,
          error: e?.response?.data?.detail || 'Invalid QR code',
        })
      }
    })()
  }, [eventId, token])

  return (
    <div className="scan-landing">
      <div className="scan-card">
        <div className="eyebrow">SIGGRAPH BNMIT · Attendance</div>

        {state.loading && <h1>Checking you in…</h1>}

        {!state.loading && state.ok && (
          <>
            <div className={`scan-badge ${state.already ? 'warn' : 'ok'}`}>
              {state.already ? 'Already checked in' : 'Checked in ✓'}
            </div>
            <h1>{state.registrant?.name}</h1>
            {state.eventName && <p className="scan-event">{state.eventName}</p>}
            <p className="scan-meta">{state.checked_in_at}</p>
          </>
        )}

        {!state.loading && !state.ok && (
          <>
            <div className="scan-badge err">Error</div>
            <h1>Invalid QR code</h1>
            <p className="scan-meta">{state.error}</p>
          </>
        )}
      </div>
    </div>
  )
}


// ===========================================================================
// Main authenticated app
// ===========================================================================
function MainApp({ route, nav }) {
  const [step, setStep] = useState(0)

  // Email/Brevo health
  const [emailReady, setEmailReady] = useState(null)

  // Step 1
  const [templateFile, setTemplateFile] = useState(null)
  const [recipientsFile, setRecipientsFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [job, setJob] = useState(null)

  // Step 2 / 3 — text placement
  const [coords, setCoords] = useState({ x: 50, y: 50 })
  const [fontSize, setFontSize] = useState(72)
  const [fontColor, setFontColor] = useState('#5B3FD9')
  const [fontFamily, setFontFamily] = useState('default')
  const [previewName, setPreviewName] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(null)

  // Step 4 — email
  const [emailSubject, setEmailSubject] = useState(
    'Your Certificate · SIGGRAPH BNMIT'
  )

  const [emailBody, setEmailBody] = useState(
    `Hi {{name}},\n\nThank you for participating in our workshop hosted by SIGGRAPH BNMIT.\n\nYour Certificate of Appreciation is attached to this email. We hope you carry the spark forward and keep building.\n\nWarm regards,\nSIGGRAPH BNMIT`
  )

  const [senderName, setSenderName] = useState('SIGGRAPH BNMIT')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState(null)

  // Email health on mount
  useEffect(() => {
    healthCheck()
      .then((d) => {
        console.log('Health check:', d)
        setEmailReady(Boolean(d.brevo_configured || d.smtp_configured))
      })
      .catch((e) => {
        console.error('Health check failed:', e)
        setEmailReady(false)
      })
  }, [])

  // Poll status when sending
  useEffect(() => {
    if (!job?.job_id || !sending) return

    const id = setInterval(async () => {
      try {
        const s = await getStatus(job.job_id)
        setStatus(s)

        if (s.email_status === 'completed' || s.email_status === 'failed') {
          setSending(false)

          if (s.email_status === 'completed') {
            toast.success(`Done — ${s.sent} sent, ${s.failed} failed`)
          }

          if (s.email_status === 'failed') {
            toast.error(s.error || 'Email dispatch failed')
          }
        }
      } catch (e) {
        console.error('Status poll failed:', e?.response?.data || e)
      }
    }, 1500)

    return () => clearInterval(id)
  }, [sending, job])

  // ---- Step 1: upload ------------------------------------------------------
  const onUpload = async () => {
    if (!templateFile || !recipientsFile) {
      toast.error('Pick both a template image and a recipient sheet.')
      return
    }

    setUploading(true)

    try {
      const data = await uploadFiles(templateFile, recipientsFile)
      console.log('Upload response:', data)

      setJob({
        ...data,
        template_url: data.template_url,
      })

      setPreviewName(data.recipients?.[0]?.name || 'Sample Name')
      setCoords({ x: 65, y: 56 })

      toast.success(`Loaded ${data.recipient_count} recipients`)
      setStep(1)
    } catch (e) {
      console.error('Upload failed:', e?.response?.data || e)
      toast.error(e?.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  // Called by EventsPage when "Use attendees for certificates" is clicked
  const useEventJob = (jobData) => {
    setJob(jobData)
    setPreviewName(jobData.recipients?.[0]?.name || 'Sample Name')
    setCoords({ x: 65, y: 56 })
    setStep(1)
    setGenerated(null)
    setStatus(null)
    setPreviewUrl(null)
    nav({ kind: 'certs', path: '/' })
  }

  // ---- Step 2: place name on canvas ---------------------------------------
  const stageRef = useRef(null)

  const onCanvasClick = (e) => {
    if (!stageRef.current) return

    const rect = stageRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    setCoords({
      x: +x.toFixed(2),
      y: +y.toFixed(2),
    })
  }

  const pixelCoords = useMemo(() => {
    if (!job) return { x: 0, y: 0 }

    return {
      x: Math.round((coords.x / 100) * job.template_width),
      y: Math.round((coords.y / 100) * job.template_height),
    }
  }, [coords, job])

  const onPreview = async () => {
    if (!job) {
      toast.error('No job found. Please upload again.')
      return
    }

    setPreviewing(true)

    try {
      const d = await previewCert({
        job_id: job.job_id,
        name_x: pixelCoords.x,
        name_y: pixelCoords.y,
        font_size: fontSize,
        font_color: fontColor,
        font_family: fontFamily,
      })

      setPreviewUrl(`${d.preview_url}?t=${Date.now()}`)
      setPreviewName(d.sample_name)

      toast.success('Preview rendered')
    } catch (e) {
      console.error('Preview failed:', e?.response?.data || e)
      toast.error(e?.response?.data?.detail || e?.message || 'Preview failed')
    } finally {
      setPreviewing(false)
    }
  }

  // ---- Step 3: bulk generate ----------------------------------------------
  const onGenerate = async () => {
    if (!job) {
      toast.error('No job found. Please upload again.')
      return
    }

    setGenerating(true)

    try {
      const d = await generateCerts({
        job_id: job.job_id,
        name_x: pixelCoords.x,
        name_y: pixelCoords.y,
        font_size: fontSize,
        font_color: fontColor,
        font_family: fontFamily,
      })

      setGenerated(d)
      toast.success(`Generated ${d.count} certificates`)
      setStep(3)
    } catch (e) {
      console.error('Generate failed:', e?.response?.data || e)
      toast.error(e?.response?.data?.detail || e?.message || 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  // ---- Step 4: email -------------------------------------------------------
  const onSend = async () => {
    if (!job || !generated) return

    if (!emailReady) {
      toast.error('Configure Brevo email credentials in Render first.')
      return
    }

    setSending(true)
    setStatus(null)

    try {
      await sendEmails({
        job_id: job.job_id,
        subject: emailSubject,
        body: emailBody,
        sender_name: senderName,
      })

      toast.success('Queued for delivery')
    } catch (e) {
      console.error('Send failed:', e?.response?.data || e)
      toast.error(e?.response?.data?.detail || e?.message || 'Send failed')
      setSending(false)
    }
  }

  return (
    <div className="shell">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#0f0e1a',
            color: '#f4f1ea',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12,
            letterSpacing: '0.05em',
            borderRadius: 0,
          },
        }}
      />

      {/* MASTHEAD */}
      <header className="masthead">
  <div className="masthead-left">
    <div className="brand-row">
      <img src="/logo-2.png" alt="SIGGRAPH BNMIT Logo" className="brand-logo" />

      <div>
        <div className="eyebrow">SIGGRAPH BNMIT · Internal Tool</div>
        <h1>
          <span className="roman">The</span> Certificate <em>Press</em>
        </h1>
      </div>
    </div>
  </div>

  <div className="masthead-right">
    <div>Vol. I · No. 02</div>
    <div className="vol">
      {new Date()
        .toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
        .toUpperCase()}
    </div>
  </div>
</header>

      {/* TOP NAV */}
      <nav className="topnav">
        <button
          className={`topnav-btn ${route.kind === 'events' || route.kind === 'scanner' ? 'active' : ''}`}
          onClick={() => nav({ kind: 'events', path: '/events' })}
        >
          <Calendar size={14} /> Events & Attendance
        </button>
        <button
          className={`topnav-btn ${route.kind === 'certs' ? 'active' : ''}`}
          onClick={() => nav({ kind: 'certs', path: '/' })}
        >
          <Award size={14} /> Certificates
        </button>
      </nav>

      {/* Email warning */}
      {emailReady === false && (
        <div className="warn-banner">
          <strong>Email not configured.</strong> Set{' '}
          <code>BREVO_API_KEY</code>, <code>BREVO_SENDER_EMAIL</code>, and{' '}
          <code>BREVO_SENDER_NAME</code> in Render Environment Variables.
          You can still generate certificates and download them.
        </div>
      )}

      {/* ROUTE: EVENTS */}
      {route.kind === 'events' && (
        <EventsPage
          onUseForCertificates={useEventJob}
          onOpenScanner={(eventId) =>
            nav({ kind: 'scanner', event: eventId, path: `/scanner/${eventId}` })
          }
        />
      )}

      {/* ROUTE: SCANNER */}
      {route.kind === 'scanner' && (
        <ScannerPage
          eventId={route.event}
          onBack={() => nav({ kind: 'events', path: '/events' })}
        />
      )}

      {/* ROUTE: CERTIFICATE FLOW */}
      {route.kind === 'certs' && (
        <>
          {/* STEPPER */}
          <div className="stepper">
            {STEPS.map((s, i) => (
              <div
                key={s.num}
                className={`step ${i === step ? 'active' : ''} ${
                  i < step ? 'done' : ''
                }`}
              >
                <div className="step-num">Step {s.num}</div>
                <div className="step-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* STEP 1: UPLOAD */}
          {step === 0 && (
            <section className="panel">
              <h2 className="panel-title">
                Upload your <span className="accent">assets</span>
              </h2>

              <div className="panel-sub">
                Template · JPG or PNG · Recipient list · CSV or XLSX
              </div>

              <div className="upload-grid">
                <Dropzone
                  icon={<ImageIcon size={36} />}
                  title="Certificate template"
                  hint="JPG / PNG · The image with the {{Name}} placeholder area"
                  accept="image/jpeg,image/png,image/jpg"
                  file={templateFile}
                  onFile={setTemplateFile}
                />

                <Dropzone
                  icon={<FileSpreadsheet size={36} />}
                  title="Recipient sheet"
                  hint="CSV / XLSX · Columns: name, email"
                  accept=".csv,.xlsx,.xls"
                  file={recipientsFile}
                  onFile={setRecipientsFile}
                />
              </div>

              <div className="btn-row">
                <button
                  className="btn btn-accent"
                  onClick={onUpload}
                  disabled={!templateFile || !recipientsFile || uploading}
                >
                  {uploading ? (
                    <>
                      <span className="spinner" /> Loading
                    </>
                  ) : (
                    <>
                      <Upload size={14} /> Continue
                    </>
                  )}
                </button>

                <span className="kbd">
                  Or generate from an event's attendees in the Events tab
                </span>
              </div>
            </section>
          )}

          {/* STEP 2: PLACE NAME */}
          {step >= 1 && job && step !== 3 && (
            <section className="panel">
              <h2 className="panel-title">
                Position the <span className="accent">name</span>
              </h2>

              <div className="panel-sub">
                Click on the template where the name should appear · Adjust style on
                the right
              </div>

              <div className="designer">
                <div>
                  <div className="canvas-wrap">
                    <div
                      className="canvas-stage"
                      ref={stageRef}
                      onClick={onCanvasClick}
                    >
                      <img
                        src={job.template_url}
                        alt="template"
                        draggable={false}
                      />

                      <div
                        className="canvas-marker"
                        style={{
                          left: `${coords.x}%`,
                          top: `${coords.y}%`,
                          color: fontColor,
                          fontSize: `${
                            (fontSize / job.template_width) *
                            (stageRef.current?.clientWidth || job.template_width)
                          }px`,
                          fontFamily:
                            fontFamily === 'serif'
                              ? 'Fraunces, serif'
                              : fontFamily === 'mono'
                              ? 'JetBrains Mono, monospace'
                              : 'Inter, sans-serif',
                        }}
                      >
                        {previewName}
                      </div>

                      <div
                        className="canvas-crosshair h"
                        style={{ top: `${coords.y}%` }}
                      />

                      <div
                        className="canvas-crosshair v"
                        style={{ left: `${coords.x}%` }}
                      />
                    </div>
                  </div>

                  <div className="canvas-hint">
                    <MousePointerClick
                      size={12}
                      style={{ verticalAlign: 'middle' }}
                    />{' '}
                    Click to position · Pixel coordinates:{' '}
                    <strong>
                      {pixelCoords.x}, {pixelCoords.y}
                    </strong>{' '}
                    · Image: {job.template_width} × {job.template_height}
                  </div>
                </div>

                <div className="controls">
                  <div className="control-block">
                    <label>Preview Name</label>
                    <input
                      type="text"
                      value={previewName}
                      onChange={(e) => setPreviewName(e.target.value)}
                    />
                  </div>

                  <div className="control-block">
                    <label>Position (x, y) — % of image</label>

                    <div className="coord-grid">
                      <input
                        type="number"
                        value={coords.x}
                        step="0.1"
                        min="0"
                        max="100"
                        onChange={(e) =>
                          setCoords((c) => ({
                            ...c,
                            x: +e.target.value,
                          }))
                        }
                      />

                      <input
                        type="number"
                        value={coords.y}
                        step="0.1"
                        min="0"
                        max="100"
                        onChange={(e) =>
                          setCoords((c) => ({
                            ...c,
                            y: +e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="control-block">
                    <label>Font Size — {fontSize}px</label>

                    <div className="range-row">
                      <input
                        type="range"
                        min="20"
                        max="220"
                        value={fontSize}
                        onChange={(e) => setFontSize(+e.target.value)}
                      />

                      <div className="range-val">{fontSize}</div>
                    </div>
                  </div>

                  <div className="control-block">
                    <label>Font Family</label>

                    <select
                      value={fontFamily}
                      onChange={(e) => setFontFamily(e.target.value)}
                    >
                      <option value="default">Sans (Inter / Poppins)</option>
                      <option value="serif">Serif (Fraunces / Playfair)</option>
                      <option value="mono">Mono (JetBrains)</option>
                    </select>
                  </div>

                  <div className="control-block">
                    <label>Font Color</label>

                    <div className="color-row">
                      <input
                        type="color"
                        value={fontColor}
                        onChange={(e) => setFontColor(e.target.value)}
                      />

                      <input
                        type="text"
                        value={fontColor}
                        onChange={(e) => setFontColor(e.target.value)}
                        style={{ flex: 1 }}
                      />
                    </div>
                  </div>

                  <div className="btn-row" style={{ marginTop: 8 }}>
                    <button
                      className="btn btn-ghost"
                      onClick={onPreview}
                      disabled={previewing}
                    >
                      {previewing ? (
                        <>
                          <span className="spinner" /> Rendering
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} /> Render preview
                        </>
                      )}
                    </button>

                    <button
                      className="btn btn-accent"
                      onClick={onGenerate}
                      disabled={generating}
                    >
                      {generating ? (
                        <>
                          <span className="spinner" /> Generating
                        </>
                      ) : (
                        <>Generate all →</>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {previewUrl && (
                <>
                  <div className="divider-rule">Server-rendered preview</div>
                  <img
                    src={previewUrl}
                    alt="preview"
                    style={{
                      width: '100%',
                      border: '1px solid var(--ink)',
                    }}
                  />
                </>
              )}

              <div className="recipient-summary">
                <div className="recipient-count">
                  <span className="num">{job.recipient_count}</span> recipients
                  loaded
                </div>

                <table className="recipients">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                    </tr>
                  </thead>

                  <tbody>
                    {job.recipients.map((r, i) => (
                      <tr key={i}>
                        <td>{r.name}</td>
                        <td>{r.email}</td>
                      </tr>
                    ))}

                    {job.recipient_count > job.recipients.length && (
                      <tr>
                        <td
                          colSpan={2}
                          style={{
                            textAlign: 'center',
                            fontStyle: 'italic',
                          }}
                        >
                          … and {job.recipient_count - job.recipients.length} more
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* STEP 4: DISPATCH */}
          {step === 3 && generated && (
            <section className="panel">
              <h2 className="panel-title">
                Dispatch the <span className="accent">certificates</span>
              </h2>

              <div className="panel-sub">
                {generated.count} certificates ready · Customize and send
              </div>

              <div className="email-form">
                <div className="control-block">
                  <label>Sender Name</label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                  />
                </div>

                <div className="control-block">
                  <label>Subject</label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                  />
                </div>

                <div className="control-block">
                  <label>
                    Body · Use{' '}
                    <code style={{ fontFamily: 'var(--mono)' }}>
                      {'{{name}}'}
                    </code>{' '}
                    for personalization
                  </label>

                  <textarea
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                  />
                </div>
              </div>

              <div className="btn-row">
                <button
                  className="btn btn-accent"
                  onClick={onSend}
                  disabled={sending || !emailReady}
                >
                  {sending ? (
                    <>
                      <span className="spinner" /> Sending
                    </>
                  ) : (
                    <>
                      <Mail size={14} /> Send to all {generated.count}
                    </>
                  )}
                </button>

                <a
                  className="btn btn-ghost"
                  href={downloadAllUrl(job.job_id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={14} /> Download as ZIP
                </a>

                <button className="btn btn-ghost" onClick={() => setStep(1)}>
                  ← Re-edit placement
                </button>
              </div>

              {status && (
                <div className="send-status">
                  <div className="send-status-header">
                    <div className="send-status-title">
                      {status.email_status === 'completed'
                        ? 'Dispatch complete'
                        : status.email_status === 'sending'
                        ? 'Sending…'
                        : status.email_status === 'failed'
                        ? 'Dispatch failed'
                        : 'Queued'}
                    </div>

                    <div className="send-status-meta">
                      Sent: {status.sent || 0} · Failed: {status.failed || 0} ·
                      Total: {status.recipient_count}
                    </div>
                  </div>

                  <div className="progress-bar">
                    <div
                      style={{
                        width: `${
                          ((status.sent + status.failed) /
                            status.recipient_count) *
                          100
                        }%`,
                      }}
                    />
                  </div>

                  {status.error && (
                    <div
                      style={{
                        marginTop: 12,
                        color: 'var(--danger)',
                        fontSize: 13,
                      }}
                    >
                      <AlertTriangle
                        size={14}
                        style={{ verticalAlign: 'middle' }}
                      />{' '}
                      {status.error}
                    </div>
                  )}

                  {status.email_log?.length > 0 && (
                    <div className="log">
                      {status.email_log.map((l, i) => (
                        <div key={i} className={`log-entry ${l.status}`}>
                          <span>{l.email}</span>
                          <span>
                            {l.status === 'sent'
                              ? '✓ sent'
                              : `✕ ${l.error || 'failed'}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* FOOTER */}
      <footer className="foot">
        <div>SIGGRAPH · BNMIT Chapter</div>
        <div>FastAPI + React · v2.0.0</div>
      </footer>
    </div>
  )
}


/* ------------------------------------------------------------------------ */

function Dropzone({ icon, title, hint, accept, file, onFile }) {
  const [drag, setDrag] = useState(false)

  return (
    <label
      className={`dropzone ${file ? 'has-file' : ''} ${
        drag ? 'dragging' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)

        const f = e.dataTransfer.files?.[0]
        if (f) onFile(f)
      }}
    >
      <input
        type="file"
        accept={accept}
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      <div className="dropzone-icon">
        {file ? <CheckCircle2 size={36} /> : icon}
      </div>

      <div className="dropzone-title">{title}</div>
      <div className="dropzone-hint">{hint}</div>

      {file && <div className="dropzone-filename">{file.name}</div>}
    </label>
  )
}
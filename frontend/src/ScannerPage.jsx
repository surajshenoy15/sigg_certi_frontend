import React, { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ScanLine, X, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react'
import { checkIn, getEvent } from './api'

export default function ScannerPage({ eventId, onBack }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const detectorRef = useRef(null)
  const rafRef = useRef(null)
  const lastCodeRef = useRef('')
  const lastTimeRef = useRef(0)

  const [event, setEvent] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState([])      // recent check-ins
  const [manualToken, setManualToken] = useState('')

  // Load event
  useEffect(() => {
    getEvent(eventId).then(setEvent).catch(() => toast.error('Event not found'))
  }, [eventId])

  // Start / stop camera
  const start = async () => {
    setError(null)
    try {
      if (!('BarcodeDetector' in window)) {
        setError('Your browser does not support BarcodeDetector. Use Chrome on Android or paste tokens manually below.')
        return
      }
      detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] })
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setRunning(true)
      tick()
    } catch (e) {
      setError(e.message || 'Camera failed to start')
    }
  }

  const stop = () => {
    setRunning(false)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  useEffect(() => () => stop(), [])

  const tick = async () => {
    if (!videoRef.current || !detectorRef.current) return
    try {
      const codes = await detectorRef.current.detect(videoRef.current)
      if (codes.length > 0) {
        const raw = codes[0].rawValue
        const now = Date.now()
        // dedupe: ignore same code within 2.5s
        if (raw !== lastCodeRef.current || now - lastTimeRef.current > 2500) {
          lastCodeRef.current = raw
          lastTimeRef.current = now
          await handleScan(raw)
        }
      }
    } catch (e) { /* keep going */ }
    rafRef.current = requestAnimationFrame(tick)
  }

  const handleScan = async (raw) => {
    // Accept either a full URL (?event=X&token=Y) or a raw token
    let token = raw.trim()
    try {
      const u = new URL(raw)
      const t = u.searchParams.get('token')
      const ev = u.searchParams.get('event')
      if (t) token = t
      if (ev && ev !== eventId) {
        toast.error('QR is for a different event')
        return
      }
    } catch { /* not a URL, treat as raw token */ }

    try {
      const r = await checkIn(eventId, token)
      const entry = {
        id: Date.now(),
        name: r.registrant.name,
        already: r.already,
        time: new Date().toLocaleTimeString(),
      }
      setResults(prev => [entry, ...prev].slice(0, 30))
      if (r.already) toast(`Already checked in: ${r.registrant.name}`, { icon: '⚠️' })
      else toast.success(`✓ ${r.registrant.name}`)
      // beep
      try { new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=').play() } catch {}
    } catch (e) {
      toast.error('Unknown QR for this event')
    }
  }

  const submitManual = async (e) => {
    e.preventDefault()
    if (!manualToken.trim()) return
    await handleScan(manualToken.trim())
    setManualToken('')
  }

  return (
    <section className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <h2 className="panel-title">QR <span className="accent">scanner</span></h2>
          <div className="panel-sub">
            {event ? event.name : '…'} · point camera at attendee QR code
          </div>
        </div>
        <button className="btn btn-ghost" onClick={onBack}><ArrowLeft size={14} /> Back</button>
      </div>

      <div className="scanner-grid">
        <div className="scanner-stage">
          <video ref={videoRef} playsInline muted style={{ width: '100%', display: 'block' }} />
          <div className="scanner-reticle" />
          {!running && (
            <div className="scanner-overlay">
              <button className="btn btn-accent" onClick={start}>
                <ScanLine size={14} /> Start camera
              </button>
              {error && <div style={{ marginTop: 14, color: 'var(--danger)', fontSize: 12, textAlign: 'center', padding: '0 16px' }}>{error}</div>}
            </div>
          )}
          {running && (
            <button className="scanner-stop" onClick={stop}>
              <X size={14} /> Stop
            </button>
          )}
        </div>

        <div>
          <form onSubmit={submitManual} className="control-block">
            <label>Manual entry (paste token or full URL)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" value={manualToken}
                onChange={e => setManualToken(e.target.value)}
                placeholder="paste here…" style={{ flex: 1 }} />
              <button type="submit" className="btn btn-ghost">Check in</button>
            </div>
          </form>

          <div className="divider-rule">Recent check-ins</div>
          {results.length === 0 && (
            <div className="empty-state" style={{ padding: '30px 12px' }}>
              <p>Scans will appear here.</p>
            </div>
          )}
          <div className="log" style={{ maxHeight: 380 }}>
            {results.map(r => (
              <div key={r.id} className={`log-entry ${r.already ? 'failed' : 'sent'}`}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {r.already ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}
                  {r.name}
                </span>
                <span>{r.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
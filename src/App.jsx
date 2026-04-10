import { useEffect, useMemo, useState } from 'react'
import './App.css'

const PRAYER_KEYS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']

// ─── Aladhan API parameter maps ────────────────────────────────────────────
// method: which standard defines Fajr/Isha sun-angle
// Full list: https://aladhan.com/calculation-methods
const COUNTRY_METHOD = {
  PK: 1,  AF: 1,  BD: 1,  IN: 1,  // Univ. of Islamic Sciences, Karachi
  US: 2,  CA: 2,                   // ISNA
  SA: 4,  YE: 4,                   // Umm al-Qura, Makkah
  EG: 5,  LY: 5,  SD: 5,  SY: 5,
  IQ: 5,  LB: 5,  PS: 5,           // Egyptian General Authority
  IR: 7,                           // Univ. of Tehran
  AE: 8,  BH: 8,  OM: 8,           // Gulf Region
  KW: 9,                           // Kuwait
  QA: 10,                          // Qatar
  SG: 11,                          // MUIS Singapore
  FR: 12,                          // UOIF France
  TR: 13,                          // Diyanet Turkey
  RU: 14,                          // Russia
  MY: 17,                          // JAKIM Malaysia
  TN: 18,                          // Tunisia
  DZ: 19,                          // Algeria
  ID: 20,                          // KEMENAG Indonesia
  MA: 21,                          // Morocco
  BE: 22,                          // Communauté Musulmane Wallonie
  JO: 23,                          // Jordan
}
const DEFAULT_METHOD = 3 // Muslim World League — fallback for unlisted countries

// school: juristic school for Asr time
// 0 = Shafi/Standard (shadow = 1× object height + original shadow)
// 1 = Hanafi         (shadow = 2× object height + original shadow, ~1 hr later)
const COUNTRY_SCHOOL = {
  PK: 1, AF: 1, BD: 1, IN: 1,   // South Asia — Hanafi majority
  TR: 1,                          // Turkey — Hanafi
  AL: 1, BA: 1, MK: 1, XK: 1,   // Balkan — Hanafi
  KZ: 1, UZ: 1, TM: 1, TJ: 1, KG: 1, // Central Asia — Hanafi
}

// midnightMode: how Islamic midnight is calculated
// 0 = Standard (midpoint Sunset→Sunrise)
// 1 = Jafari   (midpoint Sunset→Fajr)  — used in Iran/Shia tradition
const COUNTRY_MIDNIGHT = { IR: 1 }

async function resolveParamsForCoords(latitude, longitude) {
  const geoUrl =
    `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
  const res = await fetch(geoUrl, { headers: { 'Accept-Language': 'en' } })

  let countryCode = ''
  if (res.ok) {
    const json = await res.json()
    countryCode = json?.address?.country_code?.toUpperCase() ?? ''
  }

  return {
    geoUrl,
    method:                   COUNTRY_METHOD[countryCode]   ?? DEFAULT_METHOD,
    school:                   COUNTRY_SCHOOL[countryCode]   ?? 0,
    midnightMode:             COUNTRY_MIDNIGHT[countryCode] ?? 0,
    // latitudeAdjustmentMethod:
    //   1 = Middle of Night  (extreme latitudes ~65°+)
    //   2 = One-Seventh of Night
    //   3 = Angle Based      (default — works for most locations)
    latitudeAdjustmentMethod: 3,
    // timezonestring: ensures times are returned in the user's local timezone
    timezonestring:           Intl.DateTimeFormat().resolvedOptions().timeZone,
    // tune: per-prayer minute offsets (Imsak,Fajr,Sunrise,Dhuhr,Asr,Sunset,Maghrib,Isha,Midnight)
    tune:                     '0,0,0,0,0,0,0,0,0',
  }
}

function formatDateForApi(date) {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}-${month}-${year}`
}

function formatClock(time) {
  const raw = time?.split(' ')[0]
  if (!raw) return '--:--'
  const [h, m] = raw.split(':').map(Number)
  const period = h < 12 ? 'AM' : 'PM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

const METHODS = [
  { id: 0,  label: '0 — Shia Ithna-Ansari' },
  { id: 1,  label: '1 — Univ. of Islamic Sciences, Karachi' },
  { id: 2,  label: '2 — Islamic Society of North America (ISNA)' },
  { id: 3,  label: '3 — Muslim World League' },
  { id: 4,  label: '4 — Umm al-Qura, Makkah' },
  { id: 5,  label: '5 — Egyptian General Authority of Survey' },
  { id: 7,  label: '7 — Univ. of Geophysics, Tehran' },
  { id: 8,  label: '8 — Gulf Region' },
  { id: 9,  label: '9 — Kuwait' },
  { id: 10, label: '10 — Qatar' },
  { id: 11, label: '11 — MUIS Singapore' },
  { id: 12, label: '12 — UOIF France' },
  { id: 13, label: '13 — Diyanet, Turkey' },
  { id: 14, label: '14 — Spiritual Admin. Muslims of Russia' },
  { id: 15, label: '15 — Moonsighting Committee Worldwide' },
  { id: 16, label: '16 — Dubai' },
  { id: 17, label: '17 — JAKIM Malaysia' },
  { id: 18, label: '18 — Tunisia' },
  { id: 19, label: '19 — Algeria' },
  { id: 20, label: '20 — KEMENAG Indonesia' },
  { id: 21, label: '21 — Morocco' },
  { id: 22, label: '22 — Communauté Musulmane Wallonie (Belgium)' },
  { id: 23, label: '23 — Ministry of Endowments, Jordan' },
]

const EMPTY_PARAMS = {
  latitude: '',
  longitude: '',
  date: '',
  method: '3',
  school: '0',
  midnightMode: '0',
  latitudeAdjustmentMethod: '3',
  timezonestring: '',
  tune: '0,0,0,0,0,0,0,0,0',
}

function buildApiUrl(p) {
  if (!p.latitude || !p.longitude) return ''
  return (
    `https://api.aladhan.com/v1/timings/${p.date}` +
    `?latitude=${p.latitude}` +
    `&longitude=${p.longitude}` +
    `&method=${p.method}` +
    `&school=${p.school}` +
    `&midnightMode=${p.midnightMode}` +
    `&latitudeAdjustmentMethod=${p.latitudeAdjustmentMethod}` +
    `&timezonestring=${encodeURIComponent(p.timezonestring)}` +
    `&tune=${p.tune}`
  )
}

function App() {
  const [state, setState] = useState({
    loading: false,
    error: '',
    methodName: '',
    hijriDate: '',
    gregorianDate: '',
    timings: null,
    geoUrl: '',
  })
  const [params, setParams] = useState(EMPTY_PARAMS)
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    [],
  )

  function setParam(key, value) {
    setParams((prev) => ({ ...prev, [key]: value }))
  }

  async function fetchAndApply(url) {
    setState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('Request failed — check the parameters and try again.')
      const payload = await res.json()
      const data = payload?.data
      const meta = data?.meta
      if (!data?.timings) throw new Error('No timings in response — check the parameters.')
      setState((prev) => ({
        ...prev,
        loading: false,
        error: '',
        methodName: meta?.method?.name ?? 'Unknown method',
        hijriDate: data?.date?.hijri?.date ?? '',
        gregorianDate: data?.date?.gregorian?.date ?? '',
        timings: data?.timings,
      }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Unable to fetch.',
      }))
    }
  }

  async function loadPrayerTimes() {
    setState((prev) => ({ ...prev, loading: true, error: '' }))

    try {
      if (!navigator.geolocation) {
        throw new Error('Geolocation is not supported in this browser.')
      }

      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        })
      })

      const latitude = Number(position.coords.latitude.toFixed(6))
      const longitude = Number(position.coords.longitude.toFixed(6))
      const dateForApi = formatDateForApi(new Date())

      const resolved = await resolveParamsForCoords(latitude, longitude)

      const newParams = {
        latitude: String(latitude),
        longitude: String(longitude),
        date: dateForApi,
        method: String(resolved.method),
        school: String(resolved.school),
        midnightMode: String(resolved.midnightMode),
        latitudeAdjustmentMethod: String(resolved.latitudeAdjustmentMethod),
        timezonestring: resolved.timezonestring,
        tune: resolved.tune,
      }

      setParams(newParams)
      setState((prev) => ({ ...prev, geoUrl: resolved.geoUrl }))

      await fetchAndApply(buildApiUrl(newParams))
    } catch (error) {
      let message = 'Unable to get prayer times.'
      if (error?.code === 1) message = 'Location permission denied. Please allow location access.'
      else if (error?.code === 2) message = 'Location unavailable right now. Please try again.'
      else if (error?.code === 3) message = 'Location request timed out. Please try again.'
      else if (error instanceof Error && error.message) message = error.message
      setState((prev) => ({ ...prev, loading: false, error: message }))
    }
  }

  async function searchLocation() {
    const q = searchQuery.trim()
    if (!q) return
    setState((prev) => ({ ...prev, loading: true, error: '' }))
    setSuggestions([])
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`,
        { headers: { 'Accept-Language': 'en' } },
      )
      if (!res.ok) throw new Error('Location search failed.')
      const results = await res.json()
      if (results.length === 0) throw new Error(`No location found for "${q}".`)
      setSuggestions(results)
      setState((prev) => ({ ...prev, loading: false }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Search failed.',
      }))
    }
  }

  async function selectSuggestion(suggestion) {
    setSuggestions([])
    setSearchQuery(suggestion.display_name)
    const latitude = Number(Number(suggestion.lat).toFixed(6))
    const longitude = Number(Number(suggestion.lon).toFixed(6))
    const dateForApi = formatDateForApi(new Date())
    const resolved = await resolveParamsForCoords(latitude, longitude)
    const newParams = {
      latitude: String(latitude),
      longitude: String(longitude),
      date: dateForApi,
      method: String(resolved.method),
      school: String(resolved.school),
      midnightMode: String(resolved.midnightMode),
      latitudeAdjustmentMethod: String(resolved.latitudeAdjustmentMethod),
      timezonestring: resolved.timezonestring,
      tune: resolved.tune,
    }
    setParams(newParams)
    setState((prev) => ({ ...prev, geoUrl: resolved.geoUrl }))
    await fetchAndApply(buildApiUrl(newParams))
  }

  useEffect(() => { loadPrayerTimes() }, [])

  const builtUrl = buildApiUrl(params)

  return (
    <main className="app">
      <section className="card">
        <div className="layout">

          {/* ── LEFT: controls ── */}
          <div className="left-col">
            <h1>Prayer Times</h1>
            <p className="sub">{todayLabel}</p>

            <div className="search-row">
              <input
                className="search-input"
                type="search"
                placeholder="Search city or address…"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSuggestions([]) }}
                onKeyDown={(e) => e.key === 'Enter' && searchLocation()}
                disabled={state.loading}
              />
              <button className="search-btn" onClick={searchLocation} disabled={state.loading || !searchQuery.trim()}>
                Search
              </button>
            </div>

            {suggestions.length > 0 && (
              <ul className="suggestions">
                {suggestions.map((s) => (
                  <li key={s.place_id} className="suggestion-item" onClick={() => selectSuggestion(s)}>
                    {s.display_name}
                  </li>
                ))}
              </ul>
            )}

            <div className="divider"><span>or</span></div>

            <button className="primary" onClick={loadPrayerTimes} disabled={state.loading}>
              {state.loading ? 'Loading…' : 'Use my location'}
            </button>

            {state.error ? <p className="error">{state.error}</p> : null}

            {params.latitude ? (
              <div className="params-panel">
                <h2 className="params-title">API Parameters</h2>

                {state.geoUrl ? (
                  <div className="param-row">
                    <label className="param-label">
                      Geocoding URL <span className="param-note">(read-only)</span>
                    </label>
                    <input className="param-input mono" readOnly value={state.geoUrl} />
                  </div>
                ) : null}

                <div className="param-grid">
                  <div className="param-row">
                    <label className="param-label">Latitude</label>
                    <input
                      className="param-input"
                      type="number"
                      step="any"
                      value={params.latitude}
                      onChange={(e) => setParam('latitude', e.target.value)}
                    />
                  </div>

                  <div className="param-row">
                    <label className="param-label">Longitude</label>
                    <input
                      className="param-input"
                      type="number"
                      step="any"
                      value={params.longitude}
                      onChange={(e) => setParam('longitude', e.target.value)}
                    />
                  </div>

                  <div className="param-row">
                    <label className="param-label">Date <span className="param-note">DD-MM-YYYY</span></label>
                    <input
                      className="param-input"
                      value={params.date}
                      onChange={(e) => setParam('date', e.target.value)}
                      placeholder="e.g. 10-04-2026"
                    />
                  </div>

                  <div className="param-row">
                    <label className="param-label">
                      Timezone <span className="param-note">timezonestring</span>
                    </label>
                    <input
                      className="param-input"
                      value={params.timezonestring}
                      onChange={(e) => setParam('timezonestring', e.target.value)}
                      placeholder="e.g. Asia/Karachi"
                    />
                  </div>

                  <div className="param-row">
                    <label className="param-label">
                      Method <span className="param-note">Fajr/Isha angles</span>
                    </label>
                    <select
                      className="param-input"
                      value={params.method}
                      onChange={(e) => setParam('method', e.target.value)}
                    >
                      {METHODS.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="param-row">
                    <label className="param-label">
                      School <span className="param-note">Asr time</span>
                    </label>
                    <select
                      className="param-input"
                      value={params.school}
                      onChange={(e) => setParam('school', e.target.value)}
                    >
                      <option value="0">0 — Shafi / Standard</option>
                      <option value="1">1 — Hanafi (~1 hr later Asr)</option>
                    </select>
                  </div>

                  <div className="param-row">
                    <label className="param-label">
                      Midnight Mode <span className="param-note">midnightMode</span>
                    </label>
                    <select
                      className="param-input"
                      value={params.midnightMode}
                      onChange={(e) => setParam('midnightMode', e.target.value)}
                    >
                      <option value="0">0 — Standard (Sunset→Sunrise midpoint)</option>
                      <option value="1">1 — Jafari (Sunset→Fajr midpoint)</option>
                    </select>
                  </div>

                  <div className="param-row">
                    <label className="param-label">
                      Lat. Adjustment <span className="param-note">latitudeAdjustmentMethod</span>
                    </label>
                    <select
                      className="param-input"
                      value={params.latitudeAdjustmentMethod}
                      onChange={(e) => setParam('latitudeAdjustmentMethod', e.target.value)}
                    >
                      <option value="1">1 — Middle of Night</option>
                      <option value="2">2 — One-Seventh of Night</option>
                      <option value="3">3 — Angle Based (recommended)</option>
                    </select>
                  </div>

                  <div className="param-row full-width">
                    <label className="param-label">
                      Tune <span className="param-note">±min: Imsak, Fajr, Sunrise, Dhuhr, Asr, Sunset, Maghrib, Isha, Midnight</span>
                    </label>
                    <input
                      className="param-input mono"
                      value={params.tune}
                      onChange={(e) => setParam('tune', e.target.value)}
                      placeholder="0,0,0,0,0,0,0,0,0"
                    />
                  </div>
                </div>

                <div className="param-row">
                  <label className="param-label">
                    Built URL <span className="param-note">(read-only)</span>
                  </label>
                  <input className="param-input mono" readOnly value={builtUrl} />
                </div>

                <button
                  className="secondary"
                  onClick={() => fetchAndApply(builtUrl)}
                  disabled={state.loading || !builtUrl}
                >
                  Re-fetch with these params
                </button>
              </div>
            ) : null}
          </div>

          {/* ── RIGHT: timings ── */}
          <div className="right-col">
            {state.timings ? (
              <>
                <div className="meta">
                  <p><strong>Method:</strong> {state.methodName}</p>
                  <p><strong>Gregorian:</strong> {state.gregorianDate}</p>
                  <p><strong>Hijri:</strong> {state.hijriDate}</p>
                </div>
                <ul className="timings">
                  {PRAYER_KEYS.map((name) => (
                    <li key={name}>
                      <span>{name}</span>
                      <strong>{formatClock(state.timings?.[name])}</strong>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="hint">
                {state.loading ? 'Fetching prayer times…' : 'Prayer times will appear here.'}
              </p>
            )}
          </div>

        </div>
      </section>
    </main>
  )
}

export default App

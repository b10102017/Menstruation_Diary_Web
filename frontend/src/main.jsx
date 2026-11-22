import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpLeft, ArrowUpRight, CalendarDays, ChevronDown, Droplets, Plus, Trash2, Sparkles, Angry, Frown, Smile, SmilePlus, Laugh } from 'lucide-react'
import './style.css'

const API = '/api'
const moods = [
  { value: 1, icon: Angry, label: 'Horrible', detail: 'Today was a bit tough' },
  { value: 2, icon: Frown, label: 'Not so good', detail: 'Feeling a bit heavy-hearted' },
  { value: 3, icon: Smile, label: 'Fine', detail: 'Just an ordinary day' },
  { value: 4, icon: Laugh, label: 'Good', detail: 'Things are going well today' },
  { value: 5, icon: SmilePlus, label: 'Brilliant', detail: 'Feeling very happy' },
]
const flowAmounts = [
  { value: 'N/A', label: 'Not on period'},
  { value: 'light', label: 'Light'},
  { value: 'medium', label: 'Medium'},
  { value: 'heavy', label: 'Heavy'},
  { value: 'none', label: 'None'},
]
const cyclePhases = [
  { key: 'menstrual', label: 'Menstruation', color: '#c7837c' },
  { key: 'follicular', label: 'Follicular', color: '#d8a66e' },
  { key: 'ovulation', label: 'Ovulation', color: '#86a98b' },
  { key: 'luteal', label: 'Luteal', color: '#9b88b5' },
]

function getDayNumber(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86400000
}

function getMonthValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(monthValue) {
  const [year, month] = monthValue.split('-')
  return `${year} / ${Number(month)}`
}

function getEnglishMonthName(monthValue) {
  const [year, month] = monthValue.split('-').map(Number)
  return new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(year, month - 1, 1))
}

function App() {
  // const ["目前的狀態", "更新狀態的函式"] = useState("初始值")
  const [page, setPage] = useState('home') // 初始設定頁面為 home
  const [selectedMonth, setSelectedMonth] = useState(() => getMonthValue())
  const [monthMenuOpen, setMonthMenuOpen] = useState(false)
  const monthSelectorRef = useRef(null)
  const [entryDate, setEntryDate] = useState(new Date().toLocaleDateString('en-CA')) // new Date().toLocaleDateString('en-CA') 會回傳 YYYY-MM-DD 格式的日期字串
  const [flowAmount, setFlowAmount] = useState('N/A')
  const [mood, setMood] = useState(3)
  const [note, setNote] = useState('')
  const [entries, setEntries] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

// loadEntries() 呼叫 /api/entries，將回應解析成 JSON，存進 React 的 entries state。
  async function loadEntries() {
    setLoading(true)
    try {
      const response = await fetch(`${API}/entries`)
      if (!response.ok) throw new Error('無法讀取紀錄，請確認後端服務已啟動。')
      setEntries(await response.json())
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (page === 'records') loadEntries()
  }, [page])

  useEffect(() => {
    if (!monthMenuOpen) return

    function closeMenu(event) {
      if (!monthSelectorRef.current?.contains(event.target)) setMonthMenuOpen(false)
      if (event.key === 'Escape') setMonthMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeMenu)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeMenu)
    }
  }, [monthMenuOpen])

  const availableMonths = useMemo(() => {
    const months = new Set(entries.map(entry => entry.entry_date.slice(0, 7)))
    months.add(getMonthValue())
    return [...months].sort((a, b) => b.localeCompare(a))
  }, [entries])

  const monthlyEntries = useMemo(
    () => entries.filter(entry => entry.entry_date.startsWith(selectedMonth)),
    [entries, selectedMonth]
  )

  async function saveEntry(e) {
    e.preventDefault()
    setError('')
    setSuccess(false)
    try {
      const response = await fetch(`${API}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_date: entryDate, flow_amount: flowAmount, mood, note }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to save the entry.')
      setSuccess(true)
      setNote('')
      setTimeout(() => {
        setPage('records')
        setSuccess(false)
      }, 700)
    } catch (e) {
      setError(e.message)
    }
  }

  // 刪除紀錄的函式，會在使用者確認後，向後端發送 DELETE 請求刪除指定的紀錄，並重新載入紀錄列表。
  async function deleteEntry(id) {
    if (!window.confirm('Are you sure you want to delete this entry?')) return
    try {
      const response = await fetch(`${API}/entries/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete the entry.')
      loadEntries()
    } catch (e) {
      setError(e.message)
    }
  }

  const averageMood = useMemo(() => {
    if (!monthlyEntries.length) return '—'
    return (monthlyEntries.reduce((sum, item) => sum + item.mood, 0) / monthlyEntries.length).toFixed(1)
  }, [monthlyEntries])

// 經期、黃體期、濾泡期等計算邏輯
// 1. 判定經期與週期起點：按日期排序紀錄。flow_amount 不是 N/A 的紀錄視為經期；連續日期的經期紀錄視為同一段，第一天是週期第 1 天。若紀錄中斷，後續經期紀錄會被視為新起點。
// 2. 判定階段：經期紀錄歸為「經期」；非經期紀錄依週期日歸類：第 1–13 天是濾泡期、第 14 天是排卵期、第 15–28 天是黃體期。週期第 28 天之後或找不到週期起點的紀錄不納入圖表。
// 3. 計算各階段心情：只取選定月份中可歸類的心情分數，分階段計算平均值（總分 ÷ 紀錄數）。其他月份的紀錄只用來判定週期起點，不會計入當月平均。
// 4. 繪製折線：四個階段各畫一點，縱軸是平均心情分數；沒有資料的階段不畫點，也不跨過空缺連線。
// 5. 經期紀錄優先歸為「經期」，只有非經期紀錄才可能歸為「濾泡期」，因此圖上不會重疊。這是圖表的簡化分類，不完全等同於生理階段定義
  const phaseMoodAverages = useMemo(() => {
    const sortedEntries = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date))
    const cycleStarts = []
    let previousPeriodDate = null

    for (const entry of sortedEntries) {
      const isPeriodDay = entry.flow_amount !== 'N/A'
      const followsPeriodDay = previousPeriodDate !== null &&
        getDayNumber(entry.entry_date) - getDayNumber(previousPeriodDate) === 1
      if (isPeriodDay && !followsPeriodDay) cycleStarts.push(entry.entry_date)
      previousPeriodDate = isPeriodDay ? entry.entry_date : null
    }

    const totals = Object.fromEntries(cyclePhases.map(phase => [phase.key, { sum: 0, count: 0 }]))
    let cycleStartIndex = 0
    let cycleStart = null

    for (const entry of sortedEntries) {
      while (cycleStartIndex < cycleStarts.length && cycleStarts[cycleStartIndex] <= entry.entry_date) {
        cycleStart = cycleStarts[cycleStartIndex]
        cycleStartIndex += 1
      }
      if (!cycleStart) continue

      const cycleDay = getDayNumber(entry.entry_date) - getDayNumber(cycleStart) + 1
      if (cycleDay < 1 || cycleDay > 28) continue
      if (!entry.entry_date.startsWith(selectedMonth)) continue

      const phaseKey = entry.flow_amount !== 'N/A'
        ? 'menstrual'
        : cycleDay <= 13 ? 'follicular'
          : cycleDay === 14 ? 'ovulation' : 'luteal'
      totals[phaseKey].sum += entry.mood
      totals[phaseKey].count += 1
    }

    return cyclePhases.map(phase => {
      const total = totals[phase.key]
      return { ...phase, average: total.count ? total.sum / total.count : null }
    })
  }, [entries, selectedMonth])

  const chartBounds = { left: 44, right: 620, top: 24, bottom: 220 }
  const chartPoints = phaseMoodAverages.map((phase, index) => ({
    ...phase,
    x: chartBounds.left + index * (chartBounds.right - chartBounds.left) / (cyclePhases.length - 1),
    y: phase.average === null
      ? null
      : chartBounds.bottom - (phase.average - 1) * (chartBounds.bottom - chartBounds.top) / 4,
  }))
  const moodLine = chartPoints.reduce((path, point, index) => {
    if (point.average === null) return path
    const command = index > 0 && chartPoints[index - 1].average !== null ? 'L' : 'M'
    return `${path} ${command}${point.x},${point.y}`
  }, '')
  const hasPhaseMoodData = chartPoints.some(point => point.average !== null)

  const moodInfo = moods.find(item => item.value === mood)
  const MoodIcon = moodInfo.icon

// 畫面配置 return
  return (
    <main className="app-shell">
      <header className="topbar">
        {/* <button className="brand" onClick={() => setPage('home')} aria-label="Home">
          <span className="brand-icon"><ArrowUpLeft size={17} />Home</span>
        </button> */}
      </header>

{/* 主頁版面設定 */}
      {page === 'home' && (
        <section className="hero">
          <div className="eyebrow"><Sparkles size={22} /> Your Personal Menstruation Diary</div>
          <p className="intro">Little by little, get to know your body better everyday!</p>
          <div className="home-actions">
            <button className="action-card primary" onClick={() => { setError(''); setPage('record') }}>
              <span className="action-icon"><Plus size={22} /></span>
              <span className="action-title">Make a Record</span>
              <span className="action-desc">Record today's date and mood</span>
              <span className="action-arrow">↗</span>
            </button>
            <button className="action-card" onClick={() => { setError(''); setPage('records') }}>
              <span className="action-icon"><CalendarDays size={22} /></span>
              <span className="action-title">View Records</span>
              <span className="action-desc">Review your cycle and mood changes</span>
              <span className="action-arrow">↗</span>
            </button>
          </div>
        </section>
      )}

{/* 紀錄頁面設定 */}
      {page === 'record' && (
        <section className="content-page">
          <div className="record-actions">
            <button className="brand" onClick={() => setPage('home')} aria-label="Home">
              <span className="brand-icon"><ArrowUpLeft size={17} />Home</span>
            </button>
            <button className="brand" onClick={() => { setError(''); setPage('records') }} aria-label="View Records">
              <span className="brand-icon brand-icon-light"><ArrowUpRight size={17} />View Records</span>
            </button>
          </div>
          <div className="page-heading">
            <div className="eyebrow">Today,</div>
            <h2>How are you feeling?</h2>
            <p>Select the date here, and record the mood and all of your feelings.</p>
          </div>
{/* 用表單的形式儲存資料，並且在提交時觸發 saveEntry 函數來處理表單提交。 */}
          <form className="record-panel" onSubmit={saveEntry}>
{/* 1. 選日期 */}
            <label className="field-label" htmlFor="entry-date">01. Select Date</label>
            <input id="entry-date" className="date-input" type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} required />
            <div className="section-divider" />
{/* 2. 選經血量 */}
            <div className="field-label">02. Flow Amount</div>
            <p className="field-hint">Select today's flow amount.</p>
            <div className="flow-options" role="group">
              {flowAmounts.map(item => (
                <button type="button" key={item.value}
                  className={`flow-option ${flowAmount === item.value ? 'selected' : ''}`}
                  onClick={() => setFlowAmount(item.value)} aria-pressed={flowAmount === item.value}>
                  {item.value === 'N/A'
                    ? <span className="flow-icon flow-icon-no-period" aria-hidden="true" />
                    : <Droplets className="flow-icon" size={16} aria-hidden="true" />}
                  <span className="flow-label">{item.label}</span>
                </button>
              ))}
            </div>
            <div className="section-divider" />
{/* 3. 選心情 */}
            <div className="field-label">03. Today's Mood</div>
            <p className="field-hint">Select your mood for today.</p>
            <div className="mood-options">
              {moods.map(item => (
                <button type="button" key={item.value}
                  className={`mood-option ${mood === item.value ? 'selected' : ''}`}
                  onClick={() => setMood(item.value)} aria-pressed={mood === item.value}>
                  <item.icon className="mood-icon" size={22} aria-hidden="true" />
                  <span className="mood-label">{item.label}</span>
                  <span className="mood-number">{item.value}</span>
                </button>
              ))}
            </div>
            <div className="mood-feedback">{moodInfo.detail}</div>
{/* 4. 寫日記欄 */}
            <label className="field-label note-label" htmlFor="note">04. Keep a Note Here!</label>
            <textarea id="note" value={note} onChange={e => setNote(e.target.value)} placeholder="Write down your thoughts..." rows="3" />
            {error && <p className="error-message">{error}</p>}
            {success && <p className="success-message">Success! ♡</p>}
            <button className="save-button" type="submit">SAVE<span>→</span></button>
          </form>
        </section>
      )}

{/* View Records 頁面 */}
      {page === 'records' && (
        <section className="content-page">
          <div className="record-actions">
            <button className="brand" onClick={() => setPage('home')} aria-label="Home">
              <span className="brand-icon"><ArrowUpLeft size={17} />Home</span>
            </button>
            <button className="floating-add" onClick={() => setPage('record')}><Plus size={17} />Make a record</button>
          </div>
          <div className="page-heading">
            <div className="eyebrow">Looking Back...</div>
            <h2>All these past days make who you are!</h2>
            <p>An amazing journey of self-discovery.</p>
          </div>
          <div className={`month-selector ${monthMenuOpen ? 'open' : ''}`} ref={monthSelectorRef}>
            <button
              type="button"
              className="month-selector-toggle"
              aria-label="Select month"
              aria-expanded={monthMenuOpen}
              aria-controls="month-selector-menu"
              onClick={() => setMonthMenuOpen(open => !open)}>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {monthMenuOpen && (
              <div className="month-selector-menu" id="month-selector-menu" role="group" aria-label="Available months">
                {availableMonths.map(month => (
                  <button
                    type="button"
                    key={month}
                    className="month-selector-option"
                    aria-pressed={selectedMonth === month}
                    onClick={() => {
                      setSelectedMonth(month)
                      setMonthMenuOpen(false)
                    }}>
                    {formatMonthLabel(month)}
                  </button>
                ))}
              </div>
            )}
            <span className="selected-month">{formatMonthLabel(selectedMonth)}</span>
          </div>
          <div className="stats-row">
            <div className="stat-card"><span>Average grade for your moods:</span><strong>{averageMood}<small> / 5</small></strong></div>
          </div>
{/* 折線圖 */}
          <div className="phase-chart-card">
            <h3>Cycle Phase and Mood Diagram</h3>
            <div className="phase-chart-layout">
              <div className="phase-chart-plot">
                <div className="phase-chart-month-title">{getEnglishMonthName(selectedMonth)}</div>
                <svg viewBox="0 0 640 280" role="img" >
                  {[1, 2, 3, 4, 5].map(score => {
                    const y = chartBounds.bottom - (score - 1) * (chartBounds.bottom - chartBounds.top) / 4
                    return <g key={score}>
                      <line className="phase-chart-gridline" x1={chartBounds.left} y1={y} x2={chartBounds.right} y2={y} />
                      <text className="phase-chart-axis-label" x="25" y={y + 4}>{score}</text>
                    </g>
                  })}
                  <path className="phase-chart-line" d={moodLine} />
                  {chartPoints.map(point => point.average === null ? null : (
                    <g key={point.key}>
                      <circle cx={point.x} cy={point.y} r="6" fill={point.color} />
                      <text className="phase-chart-value" x={point.x} y={point.y - 12}>{point.average.toFixed(1)}</text>
                    </g>
                  ))}
                  {chartPoints.map(point => {
                    const labelWidth = point.label.length * 6
                    const groupWidth = labelWidth + 14
                    const groupX = Math.max(4, Math.min(
                      point.x - groupWidth / 2,
                      636 - groupWidth
                    ))
                    return <g key={point.key}>
                      <circle cx={groupX + 3} cy="247" r="3" fill={point.color} />
                      <text className="phase-chart-phase-label" x={groupX + 11} y="252">{point.label}</text>
                    </g>
                  })}
                  {!hasPhaseMoodData && (
                    <text className="phase-chart-empty" x="332" y="126">Currently Not Applicable</text>
                  )}
                </svg>
                {/* <div className="phase-chart-legend">
                  {cyclePhases.map(phase => (
                    <span key={phase.key}><i style={{ backgroundColor: phase.color }} />{phase.label}</span>
                  ))}
                </div> */}
              </div>
              <p className="phase-algorithm-note">
                ♡ Phases only follow a 28-day estimate.
              </p>
            </div>
          </div>
          {error && <p className="error-message">{error}</p>}
          {loading ? <p className="empty-state">正在讀取紀錄……</p> :
            monthlyEntries.length === 0 ? (
              <div className="empty-state"><span>Oops...</span><h3>Nothing has been recorded yet</h3><p>Start documenting today!</p></div>
            ) : (
              <div className="entry-list">
                {monthlyEntries.map(entry => {
                  const info = moods.find(item => item.value === entry.mood)
                  const EntryMoodIcon = info.icon
                  return <article className="entry-card" key={entry.id}>
                    <div className="entry-date"><span>{new Date(`${entry.entry_date}T00:00:00`).toLocaleDateString('zh-TW', { month: 'short' })}</span><strong>{new Date(`${entry.entry_date}T00:00:00`).getDate()}</strong><small>{new Date(`${entry.entry_date}T00:00:00`).getFullYear()}</small></div>
                    <div className="entry-details"><div className="entry-topline"><span className="entry-full-date">{entry.entry_date}</span><span className="entry-mood">{flowAmounts.find(item => item.value === entry.flow_amount)?.label || '普通'} · <EntryMoodIcon size={15} aria-hidden="true" /> {info.label} · {entry.mood}/5</span></div><p>{entry.note || ''}</p></div>
                    <button className="delete-button" onClick={() => deleteEntry(entry.id)} aria-label="刪除紀錄"><Trash2 size={16} /></button>
                  </article>
                })}
              </div>
            )
          }
        </section>
      )}
      <footer><span>♡</span></footer>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
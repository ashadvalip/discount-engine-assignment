/**
 * App.jsx
 *
 * Premium portal dashboard.
 * Wires together CSV/PDF uploads + Natural Language LLM parsing + checkout engine.
 * Refactored to utilize a production-grade decoupled PDF Ingestion Pipeline.
 */

import { useState, useEffect } from 'react'
import CsvUploader from './components/CsvUploader.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'

// Discount Engine
import { parseRulesCSV, parseCartCSV } from './engine/csvParser.js'
import { processCart, cartTotal, calculateCartDiscounts } from './engine/discountEngine.js'

// Natural Language Parser
import { parseRuleLocally, parseRuleWithLLM } from './engine/nlParser.js'

// Ingestion Pipeline Modules (Task-level isolation)
import { processPDFUpload } from './engine/cartImporter.js'
import { LogStatus } from './engine/parserTypes.js'

// ── Sample Default Data ──
const SAMPLE_RULES = [
  { ruleId: 'RULE-01', scope: 'platform', appliesTo: 'Amazon India', type: 'percentage', value: 15, stackable: false, minCartValue: null },
  { ruleId: 'RULE-02', scope: 'brand', appliesTo: 'Natura Casa', type: 'flat', value: 150, stackable: false, minCartValue: null },
  { ruleId: 'RULE-03', scope: 'platform', appliesTo: 'Flipkart', type: 'percentage', value: 10, stackable: true, minCartValue: null },
  { ruleId: 'RULE-04', scope: 'cart', appliesTo: '', type: 'percentage', value: 10, stackable: false, minCartValue: 4000 }
]

const SAMPLE_CART = [
  { itemId: 'ITEM-01', product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 1299 },
  { itemId: 'ITEM-02', product: 'Bed Sheet Set', brand: 'Natura Casa', platform: 'Flipkart', basePrice: 849 },
  { itemId: 'ITEM-03', product: 'Wall Shelf', brand: 'LivSpace Pro', platform: 'Amazon India', basePrice: 599 },
  { itemId: 'ITEM-04', product: 'Ceramic Vase', brand: 'LivSpace Pro', platform: 'Noon', basePrice: 2499 },
  { itemId: 'ITEM-05', product: 'Cutting Board', brand: 'Nordic Basics', platform: 'Amazon India', basePrice: 449 },
  { itemId: 'ITEM-06', product: 'Desk Organiser', brand: 'Nordic Basics', platform: 'Flipkart', basePrice: 899 }
]

// ── Column Definitions ──

const RULES_COLUMNS = [
  { key: 'ruleId', label: 'Rule ID', render: (v) => <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{v}</span> },
  {
    key: 'scope',
    label: 'Scope',
    render: (v) => {
      const colors = {
        brand: { bg: 'rgba(192, 132, 252, 0.15)', text: '#d8b4fe', border: '1px solid rgba(192, 132, 252, 0.3)' },
        platform: { bg: 'rgba(56, 189, 248, 0.15)', text: '#7dd3fc', border: '1px solid rgba(56, 189, 248, 0.3)' },
        cart: { bg: 'rgba(251, 146, 60, 0.15)', text: '#ffedd5', border: '1px solid rgba(251, 146, 60, 0.3)' }
      }
      const c = colors[v] || { bg: 'rgba(255,255,255,0.1)', text: '#fff' }
      return (
        <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, ...c, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {v}
        </span>
      )
    }
  },
  { key: 'appliesTo', label: 'Applies To', render: (v) => v || <span style={{ color: '#64748b', fontStyle: 'italic' }}>Entire Cart</span> },
  { key: 'type', label: 'Type', render: (v) => v.toUpperCase() },
  {
    key: 'value',
    label: 'Value',
    render: (v, row) => row.type === 'percentage' ? `${v}% off` : `Rs.${v.toLocaleString('en-IN')} off`
  },
  { key: 'stackable', label: 'Stackable', render: (v) => v ? <span style={{ color: '#34d399', fontWeight: 600 }}>Yes</span> : <span style={{ color: '#64748b' }}>No</span> },
  { key: 'minCartValue', label: 'Min Cart Value', render: (v) => v ? `Rs.${v.toLocaleString('en-IN')}` : '—' }
]

const CART_COLUMNS = [
  { key: 'itemId', label: 'Item ID', render: (v) => <span style={{ fontWeight: 600, color: '#94a3b8' }}>{v}</span> },
  { key: 'product', label: 'Product', render: (v) => <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{v}</span> },
  { key: 'brand', label: 'Brand' },
  { key: 'platform', label: 'Platform' },
  { key: 'basePrice', label: 'Base Price', render: (v) => `Rs.${v.toLocaleString('en-IN')}` }
]

const RESULTS_COLUMNS = [
  {
    key: 'itemId',
    label: 'Item ID / Row Description',
    render: (v, row) => {
      if (row.isSubtotalRow || row.isCartOfferRow || row.isFinalTotalRow) {
        return <span style={{ fontWeight: 700, fontSize: 13, fontFamily: "'Outfit', sans-serif", color: '#fff' }}>{v}</span>
      }
      return <span style={{ fontWeight: 600, color: '#94a3b8' }}>{v}</span>
    }
  },
  {
    key: 'basePrice',
    label: 'Base Price / Conditions',
    render: (v, row) => {
      if (row.isSubtotalRow) {
        return <span style={{ fontWeight: 700, color: '#f1f5f9' }}>Rs.{v.toLocaleString('en-IN')}</span>
      }
      if (row.isCartOfferRow) {
        return <span style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic' }}>{v}</span>
      }
      if (row.isFinalTotalRow) {
        return '—'
      }
      return `Rs.${v.toLocaleString('en-IN')}`
    }
  },
  {
    key: 'reasoning',
    label: 'Offer(s) Applied',
    render: (v, row) => {
      if (row.isSubtotalRow || row.isFinalTotalRow) {
        return ''
      }
      if (row.isCartOfferRow) {
        return (
          <span style={{
            display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 8px',
            borderRadius: 20, background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e',
            textTransform: 'uppercase', letterSpacing: '0.04em', border: '1px solid rgba(244, 63, 94, 0.3)'
          }}>
            Cart offer
          </span>
        )
      }
      return (
        <span style={{ color: v === 'No offers available' ? '#64748b' : '#a5b4fc', fontStyle: v === 'No offers available' ? 'italic' : 'normal' }}>
          {v}
        </span>
      )
    }
  },
  {
    key: 'finalPrice',
    label: 'Final Price',
    render: (v, row) => {
      if (row.isSubtotalRow) {
        return ''
      }
      if (row.isCartOfferRow) {
        return <span style={{ fontWeight: 700, color: '#f43f5e' }}>-Rs.{Math.abs(v).toLocaleString('en-IN')}</span>
      }
      if (row.isFinalTotalRow) {
        return <span style={{ fontWeight: 800, fontSize: 16, color: '#10b981', fontFamily: "'Outfit', sans-serif" }}>Rs.{v.toLocaleString('en-IN')}</span>
      }
      return (
        <span style={{ fontWeight: 700, color: row.totalDiscount > 0 ? '#34d399' : '#cbd5e1' }}>
          Rs.{v.toLocaleString('en-IN')}
        </span>
      )
    }
  },
  {
    key: 'totalDiscount',
    label: 'You Save',
    render: (v, row) => {
      if (row.isSubtotalRow || row.isCartOfferRow || row.isFinalTotalRow) {
        return ''
      }
      return v > 0 ? (
        <span style={{ color: '#34d399', fontWeight: 600 }}>Rs.{v.toLocaleString('en-IN')}</span>
      ) : (
        <span style={{ color: '#64748b' }}>—</span>
      )
    }
  }
]

// ── Styles ──

const S = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#090d16',
    color: '#f1f5f9',
    fontFamily: "'Inter', sans-serif"
  },
  header: {
    background: 'rgba(15, 23, 42, 0.65)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid #1e293b',
    padding: '0.85rem 2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'sticky',
    top: 0,
    zIndex: 100
  },
  logo: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 22,
    fontWeight: 800,
    color: '#fff',
    letterSpacing: '-0.02em',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem'
  },
  logoAccent: {
    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  headerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  pillButton: {
    background: 'rgba(30, 41, 59, 0.6)',
    border: '1px solid #334155',
    color: '#94a3b8',
    borderRadius: 20,
    padding: '4px 12px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  main: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '2rem 1.5rem',
    width: '100%',
    boxSizing: 'border-box',
    display: 'grid',
    gridTemplateColumns: '1.2fr 1fr',
    gap: '2rem'
  },
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem'
  },
  rightCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem'
  },
  section: {
    background: 'rgba(30, 41, 59, 0.2)',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '1.5rem',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
    position: 'relative',
    overflow: 'hidden'
  },
  sectionGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    background: 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899)'
  },
  sectionTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 700,
    fontSize: 16,
    color: '#fff',
    marginBottom: '1.2rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem'
  },
  uploadGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
    marginBottom: '1rem'
  },
  btnDanger: {
    background: 'rgba(239, 68, 68, 0.15)',
    color: '#ef4444',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 6,
    padding: '0.4rem 1rem',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s'
  },
  textInput: {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid #334155',
    borderRadius: 8,
    padding: '0.65rem 0.85rem',
    color: '#fff',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
    outline: 'none'
  },
  nlBox: {
    marginTop: '1.2rem',
    paddingTop: '1.2rem',
    borderTop: '1px solid #1e293b'
  },
  nlTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#a5b4fc',
    marginBottom: '0.6rem',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  nudgeBanner: {
    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.15) 100%)',
    border: '1px solid rgba(139, 92, 246, 0.4)',
    borderRadius: 8,
    padding: '0.85rem 1rem',
    fontSize: 12,
    color: '#d8b4fe',
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    boxShadow: '0 0 15px rgba(99, 102, 241, 0.1)'
  },
  cardPending: {
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid #8b5cf6',
    borderRadius: 8,
    padding: '1rem',
    marginTop: '0.85rem',
    boxShadow: '0 4px 20px rgba(139, 92, 246, 0.2)'
  },
  cardPendingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: 12,
    borderBottom: '1px solid #1e293b'
  },
  cardPendingLabel: {
    color: '#94a3b8'
  },
  cardPendingValue: {
    fontWeight: 600,
    color: '#cbd5e1'
  },
  apiPanel: {
    background: 'rgba(15, 23, 42, 0.9)',
    border: '1px solid #334155',
    borderRadius: 8,
    padding: '1rem',
    marginBottom: '1rem'
  },
  textarea: {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid #334155',
    borderRadius: 8,
    padding: '0.65rem 0.85rem',
    color: '#fff',
    fontSize: 13,
    width: '100%',
    minHeight: 70,
    resize: 'vertical',
    boxSizing: 'border-box',
    fontFamily: 'inherit'
  }
}

export default function App() {
  const [rules, setRules] = useState(SAMPLE_RULES)
  const [rulesErrors, setRulesErr] = useState([])
  const [rulesFileName, setRulesFileName] = useState('Default sample rules')

  const [cartItems, setCartItems] = useState(SAMPLE_CART)
  const [cartErrors, setCartErrors] = useState([])
  const [cartFileName, setCartFileName] = useState('Default sample cart')

  const [results, setResults] = useState(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('opptra_gemini_api_key') || '')

  // NL Rule parser states
  const [nlInput, setNlInput] = useState('')
  const [parsingNl, setParsingNl] = useState(false)
  const [parsedRulePending, setParsedRulePending] = useState(null)
  const [nlError, setNlError] = useState(null)

  // PDF Preview & Ingestion states
  const [pendingCartImport, setPendingCartImport] = useState(null)
  const [importSummary, setImportSummary] = useState(null)
  const [importLogs, setImportLogs] = useState([])
  const [showLogsDetails, setShowLogsDetails] = useState(false)

  // Calculate discounts immediately on load or when cart/rules changes
  useEffect(() => {
    handleCalculate()
  }, [rules, cartItems])

  function handleRulesLoad(csvText, fileName) {
    const { data, errors } = parseRulesCSV(csvText)
    if (data.length > 0) {
      setRules(data)
      setRulesFileName(fileName)
    }
    setRulesErr(errors)
    setResults(null)
  }

  function handleCartLoad(csvText, fileName) {
    const { data, errors } = parseCartCSV(csvText)
    if (data.length > 0) {
      setCartItems(data)
      setCartFileName(fileName)
      setImportSummary(null)
      setImportLogs([])
    }
    setCartErrors(errors)
    setResults(null)
  }

  // Orchestrated Ingestion pipeline handler
  async function handlePdfUpload(e) {
    const file = e.target.files[0]
    if (!file) return

    setCartErrors([])
    setImportSummary(null)
    setImportLogs([])

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const result = await processPDFUpload(evt.target.result)
        
        // Save items, logs, and summary into pending state to display Preview
        setPendingCartImport({
          items: result.validItems,
          logs: result.logs,
          skippedCount: result.skippedCount,
          importedCount: result.importedCount,
          totalCartValue: result.totalCartValue,
          fileName: file.name
        })
      } catch (err) {
        setCartErrors([`Failed to parse PDF: ${err.message}`])
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = '' // reset input
  }

  // Import confirmed
  function handleConfirmImport() {
    if (!pendingCartImport) return
    setCartItems(pendingCartImport.items)
    setCartFileName(pendingCartImport.fileName)
    setImportLogs(pendingCartImport.logs)
    setImportSummary({
      importedCount: pendingCartImport.importedCount,
      skippedCount: pendingCartImport.skippedCount,
      totalCartValue: pendingCartImport.totalCartValue
    })
    setPendingCartImport(null)
    setResults(null)
  }

  // Parse Plain English rule
  async function handleParseNlRule() {
    if (!nlInput.trim()) return
    setParsingNl(true)
    setNlError(null)
    setParsedRulePending(null)

    try {
      if (apiKey.trim()) {
        const parsed = await parseRuleWithLLM(nlInput, apiKey)
        if (parsed.error) {
          setNlError(parsed.ambiguityReason)
        } else {
          setParsedRulePending(parsed)
        }
      } else {
        const parsed = parseRuleLocally(nlInput)
        if (parsed.error) {
          setNlError(`${parsed.ambiguityReason} (Tip: For full reasoning power, add your Gemini API Key in the settings above.)`)
        } else {
          setParsedRulePending(parsed)
        }
      }
    } catch (err) {
      setNlError(`Parsing failed: ${err.message}`)
    } finally {
      setParsingNl(false)
    }
  }

  // Confirm pending rule
  function handleConfirmPendingRule() {
    if (!parsedRulePending) return
    setRules(prev => [...prev, parsedRulePending])
    setParsedRulePending(null)
    setNlInput('')
    setNlError(null)
  }

  // Calculate discounts function
  function handleCalculate() {
    if (rules.length === 0 || cartItems.length === 0) {
      setResults(null)
      return
    }

    const itemResults = processCart(cartItems, rules)
    const subtotal = cartTotal(itemResults)

    const cartDiscount = calculateCartDiscounts(subtotal, rules)
    const finalTotal = cartDiscount ? cartDiscount.finalTotal : subtotal

    const tableRows = [...itemResults]

    tableRows.push({
      itemId: 'Cart Total before offer',
      basePrice: subtotal,
      finalPrice: null,
      totalDiscount: null,
      reasoning: null,
      isSubtotalRow: true
    })

    if (cartDiscount && cartDiscount.appliedRules.length > 0) {
      cartDiscount.appliedRules.forEach(({ rule, saved }) => {
        const condStr = `Rs.${subtotal.toLocaleString('en-IN')} >= Rs.${rule.minCartValue.toLocaleString('en-IN')} → ${rule.value}% off entire cart`
        tableRows.push({
          itemId: `Cart Offer — ${rule.ruleId}`,
          basePrice: condStr,
          finalPrice: -saved,
          totalDiscount: null,
          reasoning: 'Cart offer',
          isCartOfferRow: true
        })
      })
    }

    tableRows.push({
      itemId: 'Final Cart Total',
      basePrice: null,
      finalPrice: finalTotal,
      totalDiscount: null,
      reasoning: null,
      isFinalTotalRow: true
    })

    setResults({
      rows: tableRows,
      subtotal,
      finalTotal,
      cartDiscount
    })
  }

  function handleRemoveRule(ruleId) {
    setRules(prev => prev.filter(r => r.ruleId !== ruleId))
    setResults(null)
  }

  function handleReset() {
    setRules(SAMPLE_RULES)
    setCartItems(SAMPLE_CART)
    setRulesFileName('Default sample rules')
    setCartFileName('Default sample cart')
    setRulesErr([])
    setCartErrors([])
    setImportSummary(null)
    setImportLogs([])
    setResults(null)
    setNlInput('')
    setNlError(null)
    setParsedRulePending(null)
  }

  const handleApiKeyChange = (e) => {
    const val = e.target.value
    setApiKey(val)
    localStorage.setItem('opptra_gemini_api_key', val)
  }

  // Calculate next cart offer threshold nudge
  let nextThresholdNudge = null
  if (results) {
    const subtotal = results.subtotal
    const unappliedCartRules = rules
      .filter(r => r.scope === 'cart' && subtotal < r.minCartValue)
      .sort((a, b) => a.minCartValue - b.minCartValue)
    
    if (unappliedCartRules.length > 0) {
      const nextRule = unappliedCartRules[0]
      const diff = nextRule.minCartValue - subtotal
      nextThresholdNudge = {
        ruleId: nextRule.ruleId,
        diff,
        value: nextRule.value,
        threshold: nextRule.minCartValue
      }
    }
  }

  return (
    <div style={S.container}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.logo}>
          O<span style={S.logoAccent}>pp</span>tra <span style={S.pillButton}>PRO ENGINE</span>
        </div>
        <div style={S.headerInfo}>
          <button style={S.pillButton} onClick={() => setShowApiKey(!showApiKey)}>
            ⚙️ {showApiKey ? 'Hide Settings' : 'API Configuration'}
          </button>
          <button style={S.pillButton} onClick={handleReset}>
            🔄 Reset Defaults
          </button>
        </div>
      </div>

      <div style={S.main}>
        {/* Left Column: Rules & Cart Upload */}
        <div style={S.leftCol}>
          {/* Settings Panel */}
          {showApiKey && (
            <div style={S.apiPanel}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#a5b4fc' }}>
                Google Gemini API Key Config
              </div>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 10px 0' }}>
                Add your Gemini API Key below to unlock semantic parsing of natural language discount rules. 
                If empty, the app will gracefully fall back to a local regex parser.
              </p>
              <input
                type="password"
                placeholder="Paste Gemini API Key here (AIzaSy...)"
                value={apiKey}
                onChange={handleApiKeyChange}
                style={S.textInput}
              />
            </div>
          )}

          {/* Rules Section */}
          <div style={S.section}>
            <div style={S.sectionGlow} />
            <div style={S.sectionTitle}>
              <span>🏷️</span> Discount Campaign Rules
            </div>
            
            <CsvUploader
              label="Upload rules.csv"
              description="Replace active item and cart rules via CSV"
              onLoad={handleRulesLoad}
              hasData={rules.length > 0}
              fileName={rulesFileName}
            />
            <ErrorBanner errors={rulesErrors} />

            {/* Natural Language Box */}
            <div style={S.nlBox}>
              <div style={S.nlTitle}>
                ✍️ Describe a New Rule in Plain English
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: 8 }}>
                <textarea
                  placeholder="e.g. '20% off for Natura Casa brand, stackable with other offers' or '10% off if cart value exceeds Rs.5,000'"
                  value={nlInput}
                  onChange={(e) => setNlInput(e.target.value)}
                  style={S.textarea}
                  disabled={parsingNl}
                />
                <button
                  style={{
                    background: nlInput.trim() ? 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' : '#1e293b',
                    color: nlInput.trim() ? '#fff' : '#64748b',
                    border: 'none',
                    borderRadius: 8,
                    padding: '0 1.2rem',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: nlInput.trim() ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                  }}
                  onClick={handleParseNlRule}
                  disabled={!nlInput.trim() || parsingNl}
                >
                  {parsingNl ? 'Analyzing...' : 'Parse Rule'}
                </button>
              </div>

              {/* Parsing Errors */}
              {nlError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginTop: 8 }}>
                  ⚠️ {nlError}
                </div>
              )}

              {/* Pending confirmation card */}
              {parsedRulePending && (
                <div style={S.cardPending} className="animate-slide-in">
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#d8b4fe', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span>🔍 Confirmation Required</span>
                    <span>{parsedRulePending.ruleId}</span>
                  </div>
                  
                  <div style={S.cardPendingRow}>
                    <span style={S.cardPendingLabel}>Scope</span>
                    <span style={S.cardPendingValue}>{parsedRulePending.scope.toUpperCase()}</span>
                  </div>
                  {parsedRulePending.appliesTo && (
                    <div style={S.cardPendingRow}>
                      <span style={S.cardPendingLabel}>Applies To</span>
                      <span style={S.cardPendingValue}>{parsedRulePending.appliesTo}</span>
                    </div>
                  )}
                  <div style={S.cardPendingRow}>
                    <span style={S.cardPendingLabel}>Discount</span>
                    <span style={S.cardPendingValue}>
                      {parsedRulePending.type === 'percentage' ? `${parsedRulePending.value}% Off` : `Rs.${parsedRulePending.value} Off`}
                    </span>
                  </div>
                  <div style={S.cardPendingRow}>
                    <span style={S.cardPendingLabel}>Stackable</span>
                    <span style={S.cardPendingValue}>{parsedRulePending.stackable ? 'Yes' : 'No'}</span>
                  </div>
                  {parsedRulePending.minCartValue && (
                    <div style={S.cardPendingRow}>
                      <span style={S.cardPendingLabel}>Min Cart Value</span>
                      <span style={S.cardPendingValue}>Rs.{parsedRulePending.minCartValue.toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: 12 }}>
                    <button
                      style={{ flex: 1, padding: '6px 12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                      onClick={handleConfirmPendingRule}
                    >
                      ✅ Add Rule
                    </button>
                    <button
                      style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid #334155', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
                      onClick={() => setParsedRulePending(null)}
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Loaded rules list */}
            {rules.length > 0 && (
              <div style={{ marginTop: '1.2rem', paddingTop: '1.2rem', borderTop: '1px solid #1e293b' }}>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{rules.length} active rule{rules.length > 1 ? 's' : ''} loaded</span>
                  <button style={S.btnDanger} onClick={() => setRules([])}>Clear All</button>
                </div>
                
                <div style={{ overflowX: 'auto', border: '1px solid #1e293b', borderRadius: 8, background: 'rgba(15, 23, 42, 0.4)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#0b0f19', borderBottom: '2px solid #1e293b' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>ID</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Scope</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Target</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Discount</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Stack</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', color: '#94a3b8' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((rule, idx) => (
                        <tr key={rule.ruleId} style={{ borderBottom: '1px solid #1e293b', background: idx % 2 === 0 ? 'transparent' : 'rgba(30, 41, 59, 0.1)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: '#fff' }}>{rule.ruleId}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 10, background: rule.scope === 'brand' ? 'rgba(192, 132, 252, 0.15)' : rule.scope === 'platform' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(251, 146, 60, 0.15)', color: rule.scope === 'brand' ? '#d8b4fe' : rule.scope === 'platform' ? '#7dd3fc' : '#ffedd5' }}>
                              {rule.scope}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px' }}>{rule.appliesTo || '—'}</td>
                          <td style={{ padding: '8px 12px' }}>{rule.type === 'percentage' ? `${rule.value}% off` : `Rs.${rule.value}`}</td>
                          <td style={{ padding: '8px 12px' }}>{rule.stackable ? 'Yes' : 'No'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <button
                              style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}
                              onClick={() => handleRemoveRule(rule.ruleId)}
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Cart Items Section */}
          <div style={S.section}>
            <div style={S.sectionGlow} />
            <div style={S.sectionTitle}>
              <span>🛒</span> Cart Input Center
            </div>

            <div style={S.uploadGrid}>
              <CsvUploader
                label="Upload cart.csv"
                description="Upload items in CSV format"
                onLoad={handleCartLoad}
                hasData={cartItems.length > 0 && !cartFileName.endsWith('.pdf')}
                fileName={cartFileName}
              />
              
              {/* PDF uploader */}
              <div
                style={{
                  border: `2px dashed ${cartFileName.endsWith('.pdf') ? '#1e5c2c' : '#334155'}`,
                  borderRadius: 6,
                  padding: '1rem 1.2rem',
                  background: cartFileName.endsWith('.pdf') ? 'rgba(16, 185, 129, 0.05)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  position: 'relative'
                }}
              >
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handlePdfUpload}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    cursor: 'pointer'
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ fontSize: 20 }}>{cartFileName.endsWith('.pdf') ? '✅' : '📕'}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>Upload Cart PDF</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                      {cartFileName.endsWith('.pdf') ? cartFileName : 'Upload pdf order invoice'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <ErrorBanner errors={cartErrors} />

            {/* Ingestion Pipeline Import Summary */}
            {importSummary && (
              <div style={{
                background: 'rgba(15, 23, 42, 0.45)',
                border: '1px solid #1e293b',
                borderRadius: 10,
                padding: '1.25rem',
                marginTop: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700, color: '#fff', borderBottom: '1px solid #1e293b', paddingBottom: 6 }}>
                  📥 Import Summary
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '1rem' }}>
                  <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 8, padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#a7f3d0' }}>Imported</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#10b981', fontFamily: "'Outfit', sans-serif", marginTop: 4 }}>
                      ✓ {importSummary.importedCount} products
                    </div>
                  </div>
                  
                  <div style={{ 
                    background: importSummary.skippedCount > 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(30, 41, 59, 0.08)', 
                    border: importSummary.skippedCount > 0 ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid #334155', 
                    borderRadius: 8, padding: '0.5rem 0.75rem', textAlign: 'center' 
                  }}>
                    <div style={{ fontSize: 11, color: importSummary.skippedCount > 0 ? '#fca5a5' : '#94a3b8' }}>Skipped</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: importSummary.skippedCount > 0 ? '#ef4444' : '#64748b', fontFamily: "'Outfit', sans-serif", marginTop: 4 }}>
                      ⚠ {importSummary.skippedCount} row{importSummary.skippedCount === 1 ? '' : 's'}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: 8, padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#c7d2fe' }}>Total Cart Value</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#818cf8', fontFamily: "'Outfit', sans-serif", marginTop: 4 }}>
                      ₹{importSummary.totalCartValue.toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                <button
                  style={{
                    background: 'transparent',
                    border: '1px solid #475569',
                    borderRadius: 6,
                    color: '#cbd5e1',
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    alignSelf: 'flex-start',
                    transition: 'all 0.2s',
                    outline: 'none'
                  }}
                  onClick={() => setShowLogsDetails(!showLogsDetails)}
                >
                  {showLogsDetails ? 'Hide Ingestion Details' : 'Click "View Details"'}
                </button>

                {showLogsDetails && importLogs.length > 0 && (
                  <div style={{
                    background: 'rgba(9, 13, 22, 0.65)',
                    border: '1px solid #1e293b',
                    borderRadius: 8,
                    padding: '0.75rem',
                    maxHeight: 180,
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: '#cbd5e1',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    {importLogs.map((log, idx) => {
                      const isSuccess = log.status === LogStatus.SUCCESS;
                      const isSkipped = log.status === LogStatus.SKIPPED;
                      const isAutoParsed = log.autoParsed;
                      
                      return (
                        <div key={idx} style={{ 
                          borderBottom: '1px solid rgba(30, 41, 59, 0.5)', 
                          paddingBottom: 6,
                          lineHeight: '1.4'
                        }}>
                          <div style={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', color: isSkipped ? '#ef4444' : '#10b981', marginBottom: 2 }}>
                            <span>{isSkipped ? '⚠' : '✓'} Row {log.rowNum || idx + 1}</span>
                            <span>{log.status.toUpperCase()}</span>
                          </div>
                          {isSuccess ? (
                            isAutoParsed ? (
                              <div style={{ whiteSpace: 'pre-wrap', color: '#34d399' }}>
                                ✓ Parsed automatically<br/>
                                Original: {log.original}<br/>
                                Normalized: {log.normalized}
                              </div>
                            ) : (
                              <div style={{ color: '#cbd5e1' }}>
                                Row {log.rowNum}<br/>
                                Price parsed<br/>
                                {log.normalized}
                              </div>
                            )
                          ) : (
                            <div style={{ whiteSpace: 'pre-wrap', color: '#f87171' }}>
                              Row {log.rowNum}<br/>
                              {log.reason ? `${log.reason}\n` : ''}Skipped.
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {cartItems.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <DataTable columns={CART_COLUMNS} rows={cartItems} />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Calculations and Checkout Summary */}
        <div style={S.rightCol}>
          {/* Results Summary Card */}
          <div style={{ ...S.section, border: '1px solid #3b82f6', background: 'rgba(59, 130, 246, 0.05)' }}>
            <div style={{ ...S.sectionGlow, background: 'linear-gradient(90deg, #3b82f6, #6366f1)' }} />
            <div style={S.sectionTitle}>
              <span>✨</span> Checkout Summary & Price Engine
            </div>

            {results ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                <DataTable columns={RESULTS_COLUMNS} rows={results.rows} />

                {/* Threshold Nudge */}
                {nextThresholdNudge && (
                  <div style={S.nudgeBanner} className="animate-pulse-custom">
                    <span style={{ fontSize: 16 }}>💡</span>
                    <div>
                      Add <strong>Rs.{nextThresholdNudge.diff.toLocaleString('en-IN')}</strong> more to unlock platform rule <strong>{nextThresholdNudge.ruleId}</strong> (<strong>{nextThresholdNudge.value}% Off</strong> entire cart)!
                    </div>
                  </div>
                )}

                {/* Savings breakdown footer */}
                <div style={{
                  background: 'rgba(15, 23, 42, 0.4)',
                  padding: '1rem',
                  borderRadius: 8,
                  border: '1px solid #1e293b',
                  fontSize: 13,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Item Subtotal</span>
                    <span style={{ fontWeight: 600 }}>Rs.{results.subtotal.toLocaleString('en-IN')}</span>
                  </div>

                  {results.cartDiscount && results.cartDiscount.totalSaved > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#f43f5e' }}>
                      <span>Cart Discount Savings</span>
                      <span>-Rs.{results.cartDiscount.totalSaved.toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingTop: 8,
                    marginTop: 4,
                    borderTop: '1px solid #1e293b',
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#fff'
                  }}>
                    <span style={{ fontFamily: "'Outfit', sans-serif" }}>Final Price to Pay</span>
                    <span style={{ color: '#10b981', fontFamily: "'Outfit', sans-serif" }}>
                      Rs.{results.finalTotal.toLocaleString('en-IN')}
                    </span>
                  </div>
                  
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, textAlign: 'right', fontStyle: 'italic' }}>
                    Calculated via Opptra Checkout Engine
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b', fontStyle: 'italic', fontSize: 13 }}>
                Click "Calculate Discounts" to run pricing evaluation.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PDF Cart Preview Modal Overlay */}
      {pendingCartImport && (
        <div 
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(9, 13, 22, 0.85)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '2rem'
          }}
          className="animate-fade-in"
        >
          <div 
            style={{
              background: 'rgba(30, 41, 59, 0.95)',
              border: '1px solid #334155',
              borderRadius: 16,
              maxWidth: 650,
              width: '100%',
              padding: '2rem',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              maxHeight: '90vh',
              overflow: 'hidden'
            }}
            className="animate-slide-in"
          >
            <div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                📥 Extracted Cart Preview
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                File: <strong>{pendingCartImport.fileName}</strong> • Prepared {pendingCartImport.importedCount} items for checkout.
              </div>
            </div>

            {/* Preview Table */}
            <div style={{ overflowY: 'auto', border: '1px solid #1e293b', borderRadius: 8, background: 'rgba(15, 23, 42, 0.4)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#0b0f19', borderBottom: '2px solid #1e293b' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', fontFamily: "'Outfit', sans-serif" }}>Product</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', fontFamily: "'Outfit', sans-serif" }}>Brand</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', fontFamily: "'Outfit', sans-serif" }}>Platform</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', fontFamily: "'Outfit', sans-serif" }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingCartImport.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #1e293b', background: idx % 2 === 0 ? 'transparent' : 'rgba(30, 41, 59, 0.1)' }}>
                      <td style={{ padding: '10px 14px', color: '#fff', fontWeight: 600 }}>{item.product}</td>
                      <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{item.brand}</td>
                      <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{item.platform}</td>
                      <td style={{ padding: '10px 14px', color: '#10b981', textAlign: 'right', fontWeight: 700 }}>
                        Rs.{item.basePrice.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pendingCartImport.skippedCount > 0 && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '10px 12px', borderRadius: 8, fontSize: 12 }}>
                ⚠️ <strong>Integrity Notice:</strong> {pendingCartImport.skippedCount} invalid row(s) will be skipped automatically during import to prevent cart pricing errors.
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              <button
                style={{
                  flex: 2,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.75rem',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: "'Outfit', sans-serif",
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                }}
                onClick={handleConfirmImport}
              >
                Import Cart
              </button>
              <button
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.05)',
                  color: '#cbd5e1',
                  border: '1px solid #475569',
                  borderRadius: 8,
                  padding: '0.75rem',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                onClick={() => setPendingCartImport(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * DataTable.jsx
 *
 * Renders a simple table from an array of objects.
 * Columns are defined as [{ key, label, render? }].
 */

export default function DataTable({ columns, rows, emptyMessage = 'No data loaded.' }) {
  if (!rows || rows.length === 0) {
    return (
      <div
        style={{
          padding: '2rem 1rem',
          textAlign: 'center',
          color: '#64748b',
          fontSize: 13,
          background: 'rgba(30, 41, 59, 0.2)',
          border: '1px dashed #334155',
          borderRadius: 8,
          fontStyle: 'italic',
        }}
      >
        {emptyMessage}
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid #1e293b', borderRadius: 8, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#0b0f19', borderBottom: '2px solid #1e293b' }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#94a3b8',
                  whiteSpace: 'nowrap',
                  fontFamily: "'Outfit', sans-serif",
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              style={{
                background: i % 2 === 0 ? 'transparent' : 'rgba(30, 41, 59, 0.1)',
                borderBottom: '1px solid #1e293b',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(30, 41, 59, 0.1)' }}
            >
              {columns.map((col) => (
                <td key={col.key} style={{ padding: '12px 16px', color: '#cbd5e1', verticalAlign: 'middle' }}>
                  {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

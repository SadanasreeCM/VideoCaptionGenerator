import React from 'react'

const PieChart = ({ data, onSliceSelect }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  let cumulative = 0

  if (!total) {
    return (
      <svg width="200" height="200" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="80" fill="#f1efe9" stroke="#fff" strokeWidth="2" />
        <text x="100" y="100" textAnchor="middle" dy="0.35em" fontSize="16" fill="var(--ink)">
          0
        </text>
      </svg>
    )
  }

  return (
    <svg width="200" height="200" viewBox="0 0 200 200" role="img" aria-label="Pie chart">
      {data.map((item, index) => {
        const startAngle = (cumulative / total) * 360
        const endAngle = ((cumulative + item.value) / total) * 360
        cumulative += item.value

        const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0
        const x1 = 100 + 80 * Math.cos((startAngle * Math.PI) / 180)
        const y1 = 100 + 80 * Math.sin((startAngle * Math.PI) / 180)
        const x2 = 100 + 80 * Math.cos((endAngle * Math.PI) / 180)
        const y2 = 100 + 80 * Math.sin((endAngle * Math.PI) / 180)

        const pathData = `M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArcFlag} 1 ${x2} ${y2} Z`

        return (
          <path
            key={index}
            d={pathData}
            fill={item.color}
            stroke="#fff"
            strokeWidth="2"
            aria-label={item.label || `Slice ${index + 1}`}
            onClick={onSliceSelect ? () => onSliceSelect(item) : undefined}
            style={onSliceSelect ? { cursor: 'pointer' } : undefined}
          >
            <title>{item.label || `Slice ${index + 1}`}</title>
          </path>
        )
      })}
      <text x="100" y="100" textAnchor="middle" dy="0.35em" fontSize="16" fill="var(--ink)">
        {total}
      </text>
    </svg>
  )
}

export default PieChart

import { useState, useEffect } from 'react'
import { supabase, EDGE_FUNCTION_URL } from '../lib/supabase'

// Store mapping
const STORES = {
  609: 'Santa Maria',
  1002: 'San Luis Obispo',
  1257: 'Goleta',
  1270: 'Arroyo Grande',
  1396: 'Santa Barbara (Downtown)',
  1932: 'Atascadero',
  2911: 'Paso Robles',
  4182: 'Santa Barbara (Upper State)'
}

// Report type configurations
const REPORT_TYPES = {
  csa: {
    label: 'CSA Bonus',
    endpoint: 'csa-report-card',
    role: 'CSAROC',
    color: 'blue'
  },
  greeter: {
    label: 'Greeter Bonus',
    endpoint: 'greeter-report-card',
    role: 'GREET',
    color: 'green'
  },
  manager: {
    label: 'Manager Bonus',
    endpoint: 'manager-report-card',
    role: 'MANAGER',
    color: 'purple'
  }
}

// Preset periods
function getPresetPeriods() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  
  const periods = []
  
  // Current month preview
  const currentMonthStart = new Date(currentYear, currentMonth, 1)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  
  periods.push({
    label: `${currentMonthStart.toLocaleString('default', { month: 'long' })} ${currentYear} (Preview - MTD)`,
    start: formatDate(currentMonthStart),
    end: formatDate(yesterday),
    type: 'preview'
  })
  
  // Last 3 months final
  for (let i = 1; i <= 3; i++) {
    const monthStart = new Date(currentYear, currentMonth - i, 1)
    const monthEnd = new Date(currentYear, currentMonth - i + 1, 0)
    periods.push({
      label: `${monthStart.toLocaleString('default', { month: 'long' })} ${monthStart.getFullYear()} (Final)`,
      start: formatDate(monthStart),
      end: formatDate(monthEnd),
      type: 'final'
    })
  }
  
  return periods
}

function formatDate(date) {
  return date.toISOString().split('T')[0]
}

export default function ReportViewer({ session }) {
  const [reportType, setReportType] = useState('csa')
  const [employees, setEmployees] = useState([])
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [selectedPeriod, setSelectedPeriod] = useState(null)
  const [customDates, setCustomDates] = useState({ start: '', end: '' })
  const [useCustomDates, setUseCustomDates] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [reportHtml, setReportHtml] = useState(null)
  const [reportData, setReportData] = useState(null)
  const [error, setError] = useState(null)
  const [sendCopyToMe, setSendCopyToMe] = useState(false)
  const [sendSuccess, setSendSuccess] = useState(null)
  
  const periods = getPresetPeriods()

  // Fetch employees when report type changes
  useEffect(() => {
    fetchEmployees()
  }, [reportType])

  async function fetchEmployees() {
    setLoadingEmployees(true)
    setSelectedEmployee(null)
    setReportHtml(null)
    setReportData(null)
    
    try {
      const config = REPORT_TYPES[reportType]
      
      if (reportType === 'manager') {
        // For managers, get from a different source or hardcode for now
        const { data, error } = await supabase
          .from('employees')
          .select('user_id, first_name, last_name, store_number')
          .eq('active_flag', true)
          .in('title', ['Store Manager', 'General Manager', 'Assistant Manager'])
          .order('last_name')
        
        if (error) throw error
        setEmployees(data || [])
      } else {
        // For CSA and Greeter, get employees who have worked in that role recently
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        
        const { data, error } = await supabase
          .rpc('get_employees_by_role', { 
            p_role: config.role,
            p_start_date: formatDate(thirtyDaysAgo)
          })
        
        if (error) {
          // Fallback: get all active employees
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('employees')
            .select('user_id, first_name, last_name, store_number')
            .eq('active_flag', true)
            .order('last_name')
          
          if (fallbackError) throw fallbackError
          setEmployees(fallbackData || [])
        } else {
          setEmployees(data || [])
        }
      }
    } catch (err) {
      console.error('Error fetching employees:', err)
      setError('Failed to load employees')
    } finally {
      setLoadingEmployees(false)
    }
  }

  async function generateReport(sendEmail = false) {
    if (!selectedEmployee) {
      setError('Please select an employee')
      return
    }
    
    const startDate = useCustomDates ? customDates.start : selectedPeriod?.start
    const endDate = useCustomDates ? customDates.end : selectedPeriod?.end
    
    if (!startDate || !endDate) {
      setError('Please select a date range')
      return
    }
    
    setLoading(true)
    setError(null)
    setReportHtml(null)
    setReportData(null)
    setSendSuccess(null)
    
    try {
      const config = REPORT_TYPES[reportType]
      const reportTypeValue = useCustomDates ? 'preview' : (selectedPeriod?.type || 'preview')
      
      // Get session token for auth
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      
      const response = await fetch(`${EDGE_FUNCTION_URL}/${config.endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.access_token}`
        },
        body: JSON.stringify({
          user_id: selectedEmployee.user_id,
          start_date: startDate,
          end_date: endDate,
          report_type: reportTypeValue,
          send_email: sendEmail,
          return_html: true
        })
      })
      
      const data = await response.json()
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate report')
      }
      
      setReportData(data)
      
      // Fetch the HTML content if we have a report
      if (data.html) {
        setReportHtml(data.html)
      } else if (data.report_id) {
        // If no HTML returned directly, we might need to fetch it
        // For now, show the summary data
        setReportHtml(generateSummaryHtml(data))
      }
      
      if (sendEmail) {
        setSendSuccess(`Report sent to ${data.email_recipient || selectedEmployee.email || 'employee'}`)
      }
      
    } catch (err) {
      console.error('Error generating report:', err)
      setError(err.message || 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  function generateSummaryHtml(data) {
    return `
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; }
          .bonus { font-size: 36px; color: #e31837; font-weight: bold; }
          .detail { margin: 10px 0; }
          .label { color: #666; }
        </style>
      </head>
      <body>
        <div class="summary">
          <h2>${data.employee_name}</h2>
          <p class="detail"><span class="label">Store:</span> ${data.store_name} (#${data.store_number})</p>
          <p class="detail"><span class="label">Period:</span> ${data.period?.start_date} to ${data.period?.end_date}</p>
          <p class="detail"><span class="label">Report Type:</span> ${data.report_type?.toUpperCase()}</p>
          <hr />
          <p class="bonus">$${(data.total_bonus || 0).toFixed(2)}</p>
          <p class="detail"><span class="label">Qualified:</span> ${data.is_qualified ? '✅ Yes' : '⚠️ Not yet'}</p>
          ${data.ai_summary ? `<hr /><p><strong>AI Summary:</strong></p><p>${data.ai_summary}</p>` : ''}
        </div>
      </body>
      </html>
    `
  }

  const config = REPORT_TYPES[reportType]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Generate Report Card</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Report Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Report Type
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jl-red"
            >
              {Object.entries(REPORT_TYPES).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>

          {/* Employee */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Employee
            </label>
            <select
              value={selectedEmployee?.user_id || ''}
              onChange={(e) => {
                const emp = employees.find(emp => emp.user_id === parseInt(e.target.value))
                setSelectedEmployee(emp)
                setReportHtml(null)
                setReportData(null)
              }}
              disabled={loadingEmployees}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jl-red disabled:bg-gray-100"
            >
              <option value="">
                {loadingEmployees ? 'Loading...' : 'Select employee'}
              </option>
              {employees.map((emp) => (
                <option key={emp.user_id} value={emp.user_id}>
                  {emp.first_name} {emp.last_name} - {STORES[emp.store_number] || emp.store_number}
                </option>
              ))}
            </select>
          </div>

          {/* Period Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Period
            </label>
            <select
              value={useCustomDates ? 'custom' : (selectedPeriod?.label || '')}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  setUseCustomDates(true)
                  setSelectedPeriod(null)
                } else {
                  setUseCustomDates(false)
                  const period = periods.find(p => p.label === e.target.value)
                  setSelectedPeriod(period)
                }
                setReportHtml(null)
                setReportData(null)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jl-red"
            >
              <option value="">Select period</option>
              {periods.map((period) => (
                <option key={period.label} value={period.label}>{period.label}</option>
              ))}
              <option value="custom">📅 Custom Date Range</option>
            </select>
          </div>

          {/* Custom Dates */}
          {useCustomDates && (
            <div className="lg:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Custom Range
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={customDates.start}
                  onChange={(e) => setCustomDates({ ...customDates, start: e.target.value })}
                  className="flex-1 px-2 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jl-red text-sm"
                />
                <input
                  type="date"
                  value={customDates.end}
                  onChange={(e) => setCustomDates({ ...customDates, end: e.target.value })}
                  className="flex-1 px-2 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jl-red text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mt-6">
          <button
            onClick={() => generateReport(false)}
            disabled={loading || !selectedEmployee}
            className="bg-jl-red hover:bg-jl-red-dark text-white font-medium py-2 px-6 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating...
              </>
            ) : (
              <>
                👁️ View Report
              </>
            )}
          </button>

          <button
            onClick={() => generateReport(true)}
            disabled={loading || !selectedEmployee}
            className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            📧 Generate & Send to Employee
          </button>

          {/* 
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={sendCopyToMe}
              onChange={(e) => setSendCopyToMe(e.target.checked)}
              className="rounded border-gray-300 text-jl-red focus:ring-jl-red"
            />
            Also send copy to me
          </label>
          */}
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mt-4 bg-red-50 text-red-600 p-3 rounded-md text-sm">
            ❌ {error}
          </div>
        )}
        
        {sendSuccess && (
          <div className="mt-4 bg-green-50 text-green-600 p-3 rounded-md text-sm">
            ✅ {sendSuccess}
          </div>
        )}
      </div>

      {/* Report Display */}
      {reportHtml && (
        <div className="bg-white rounded-lg shadow">
          <div className="border-b px-6 py-4 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-800">
              Report Preview
              {reportData && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {reportData.employee_name} - ${(reportData.total_bonus || 0).toFixed(2)}
                </span>
              )}
            </h3>
            <button
              onClick={() => {
                const printWindow = window.open('', '_blank')
                printWindow.document.write(reportHtml)
                printWindow.document.close()
                printWindow.print()
              }}
              className="text-gray-600 hover:text-gray-800 text-sm flex items-center gap-1"
            >
              🖨️ Print
            </button>
          </div>
          <div className="p-4">
            <iframe
              srcDoc={reportHtml}
              className="w-full border rounded-md report-frame"
              style={{ height: '800px' }}
              title="Report Preview"
            />
          </div>
        </div>
      )}

      {/* Empty State */}
      {!reportHtml && !loading && (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          <div className="text-6xl mb-4">📋</div>
          <p className="text-lg">Select an employee and date range to view their report card</p>
        </div>
      )}
    </div>
  )
}

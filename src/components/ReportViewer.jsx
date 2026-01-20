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

const STORE_LIST = Object.entries(STORES).map(([num, name]) => ({
  number: parseInt(num),
  name: `${num} - ${name}`
}))

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

// Qualification filter options
const QUALIFICATION_FILTERS = {
  all: { label: 'All Employees', description: 'Everyone with activity', minPct: 0 },
  visible: { label: 'Visible (10%+)', description: 'On report card but may not qualify', minPct: 10 },
  qualified: { label: 'Qualified (15%+)', description: 'Meets bonus threshold', minPct: 15 }
}

// Sort options
const SORT_OPTIONS = {
  name: { label: 'Name (A-Z)', fn: (a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`) },
  nameDesc: { label: 'Name (Z-A)', fn: (a, b) => `${b.last_name} ${b.first_name}`.localeCompare(`${a.last_name} ${a.first_name}`) },
  store: { label: 'Store', fn: (a, b) => a.store_number - b.store_number },
  invoices: { label: 'Invoices (High-Low)', fn: (a, b) => b.invoice_count - a.invoice_count },
  invoicesAsc: { label: 'Invoices (Low-High)', fn: (a, b) => a.invoice_count - b.invoice_count },
  percentage: { label: 'Percentage (High-Low)', fn: (a, b) => b.invoice_percentage - a.invoice_percentage },
  percentageAsc: { label: 'Percentage (Low-High)', fn: (a, b) => a.invoice_percentage - b.invoice_percentage }
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
  // Filter states
  const [reportType, setReportType] = useState('csa')
  const [selectedStores, setSelectedStores] = useState([]) // Empty = all stores
  const [qualificationFilter, setQualificationFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [viewMode, setViewMode] = useState('single') // 'single' or 'batch'
  
  // Employee states
  const [allEmployees, setAllEmployees] = useState([])
  const [filteredEmployees, setFilteredEmployees] = useState([])
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]) // For multi-select
  
  // Period states
  const [selectedPeriod, setSelectedPeriod] = useState(null)
  const [customDates, setCustomDates] = useState({ start: '', end: '' })
  const [useCustomDates, setUseCustomDates] = useState(false)
  
  // UI states
  const [loading, setLoading] = useState(false)
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [error, setError] = useState(null)
  const [sendSuccess, setSendSuccess] = useState(null)
  
  // Report states
  const [reportHtml, setReportHtml] = useState(null)
  const [reportData, setReportData] = useState(null)
  
  // Batch view states
  const [batchReports, setBatchReports] = useState([])
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0)
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 })
  
  const periods = getPresetPeriods()

  // Fetch employees when report type or period changes
  useEffect(() => {
    if (selectedPeriod || (useCustomDates && customDates.start && customDates.end)) {
      fetchEmployees()
    }
  }, [reportType, selectedPeriod, useCustomDates, customDates.start, customDates.end])

  // Filter and sort employees when filters change
  useEffect(() => {
    applyFiltersAndSort()
  }, [allEmployees, selectedStores, qualificationFilter, sortBy])

  async function fetchEmployees() {
    setLoadingEmployees(true)
    setSelectedEmployee(null)
    setSelectedEmployeeIds([])
    setReportHtml(null)
    setReportData(null)
    setBatchReports([])
    setError(null)
    
    const startDate = useCustomDates ? customDates.start : selectedPeriod?.start
    const endDate = useCustomDates ? customDates.end : selectedPeriod?.end
    
    if (!startDate || !endDate) {
      setLoadingEmployees(false)
      return
    }
    
    try {
      const config = REPORT_TYPES[reportType]
      
      if (reportType === 'manager') {
        // Manager handling - query by title containing 'manager'
        const { data, error } = await supabase
          .from('employees')
          .select('user_id, first_name, last_name, home_store_id, title')
          .eq('active_flag', true)
          .ilike('title', '%manager%')
          .order('last_name')
        
        if (error) throw error
        
        // Map home_store_id to store_number for consistency with other report types
        setAllEmployees((data || []).map(m => ({ 
          ...m, 
          store_number: m.home_store_id,
          invoice_count: 0, 
          store_total_invoices: 0, 
          invoice_percentage: 100 
        })))
      } else {
        const { data, error } = await supabase
          .rpc('get_employees_by_role', { 
            p_role: config.role,
            p_start_date: startDate,
            p_end_date: endDate
          })
        
        if (error) throw error
        setAllEmployees(data || [])
      }
    } catch (err) {
      console.error('Error fetching employees:', err)
      setError('Failed to load employees: ' + err.message)
    } finally {
      setLoadingEmployees(false)
    }
  }

  function applyFiltersAndSort() {
    let filtered = [...allEmployees]
    
    // Filter by store
    if (selectedStores.length > 0) {
      filtered = filtered.filter(emp => selectedStores.includes(emp.store_number))
    }
    
    // Filter by qualification percentage
    const minPct = QUALIFICATION_FILTERS[qualificationFilter].minPct
    if (minPct > 0) {
      filtered = filtered.filter(emp => emp.invoice_percentage >= minPct)
    }
    
    // Sort
    const sortFn = SORT_OPTIONS[sortBy].fn
    filtered.sort(sortFn)
    
    setFilteredEmployees(filtered)
  }

  function toggleStoreSelection(storeNum) {
    setSelectedStores(prev => {
      if (prev.includes(storeNum)) {
        return prev.filter(s => s !== storeNum)
      } else {
        return [...prev, storeNum]
      }
    })
  }

  function selectAllStores() {
    setSelectedStores([])
  }

  function toggleEmployeeSelection(userId) {
    setSelectedEmployeeIds(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId)
      } else {
        return [...prev, userId]
      }
    })
  }

  function selectAllEmployees() {
    setSelectedEmployeeIds(filteredEmployees.map(e => e.user_id))
  }

  function clearEmployeeSelection() {
    setSelectedEmployeeIds([])
  }

  async function generateReport(employee, sendEmail = false) {
    const startDate = useCustomDates ? customDates.start : selectedPeriod?.start
    const endDate = useCustomDates ? customDates.end : selectedPeriod?.end
    
    if (!startDate || !endDate) {
      throw new Error('Please select a date range')
    }
    
    const config = REPORT_TYPES[reportType]
    const reportTypeValue = useCustomDates ? 'preview' : (selectedPeriod?.type || 'preview')
    
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    
    const response = await fetch(`${EDGE_FUNCTION_URL}/${config.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentSession.access_token}`
      },
      body: JSON.stringify({
        user_id: employee.user_id,
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
    
    return data
  }

  async function handleViewSingle() {
    if (!selectedEmployee) {
      setError('Please select an employee')
      return
    }
    
    setLoading(true)
    setError(null)
    setReportHtml(null)
    setReportData(null)
    setSendSuccess(null)
    
    try {
      const data = await generateReport(selectedEmployee, false)
      setReportData(data)
      setReportHtml(data.html || generateSummaryHtml(data))
    } catch (err) {
      console.error('Error generating report:', err)
      setError(err.message || 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  async function handleSendToEmployee() {
    if (!selectedEmployee) {
      setError('Please select an employee')
      return
    }
    
    setLoading(true)
    setError(null)
    setSendSuccess(null)
    
    try {
      const data = await generateReport(selectedEmployee, true)
      setReportData(data)
      setReportHtml(data.html || generateSummaryHtml(data))
      setSendSuccess(`Report sent to ${data.email_recipient || selectedEmployee.first_name}`)
    } catch (err) {
      console.error('Error sending report:', err)
      setError(err.message || 'Failed to send report')
    } finally {
      setLoading(false)
    }
  }

  async function handleViewBatch() {
    const employeesToProcess = selectedEmployeeIds.length > 0 
      ? filteredEmployees.filter(e => selectedEmployeeIds.includes(e.user_id))
      : filteredEmployees
    
    if (employeesToProcess.length === 0) {
      setError('No employees to process')
      return
    }
    
    const startDate = useCustomDates ? customDates.start : selectedPeriod?.start
    const endDate = useCustomDates ? customDates.end : selectedPeriod?.end
    
    if (!startDate || !endDate) {
      setError('Please select a date range')
      return
    }
    
    setBatchLoading(true)
    setBatchReports([])
    setBatchProgress({ current: 0, total: employeesToProcess.length })
    setError(null)
    
    const reports = []
    
    for (let i = 0; i < employeesToProcess.length; i++) {
      const emp = employeesToProcess[i]
      setBatchProgress({ current: i + 1, total: employeesToProcess.length })
      
      try {
        const data = await generateReport(emp, false)
        reports.push({
          employee: emp,
          data: data,
          html: data.html || generateSummaryHtml(data)
        })
      } catch (err) {
        console.error(`Error generating report for ${emp.first_name} ${emp.last_name}:`, err)
        // Continue with next employee
      }
    }
    
    setBatchReports(reports)
    setCurrentBatchIndex(0)
    setBatchLoading(false)
    
    if (reports.length === 0) {
      setError('Failed to generate any reports')
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

  // Calculate batch statistics
  function getBatchStats() {
    if (batchReports.length === 0) return null
    
    const qualified = batchReports.filter(r => r.data.is_qualified === true)
    const nearThreshold = batchReports.filter(r => r.data.is_qualified === false)
    const totalBonus = batchReports.reduce((sum, r) => sum + (r.data.total_bonus || 0), 0)
    
    return {
      total: batchReports.length,
      qualified: qualified.length,
      nearThreshold: nearThreshold.length,
      totalBonus: totalBonus
    }
  }

  // Export to CSV
  function exportToCsv() {
    if (batchReports.length === 0) return
    
    const headers = ['Employee Name', 'Store', 'Store Name', 'Invoice %', 'Bonus Amount', 'Qualified']
    const rows = batchReports.map(r => [
      r.data.employee_name || `${r.employee.first_name} ${r.employee.last_name}`,
      r.employee.store_number,
      STORES[r.employee.store_number] || '',
      r.employee.invoice_percentage?.toFixed(1) + '%',
      '$' + (r.data.total_bonus || 0).toFixed(2),
      r.data.is_qualified ? 'Yes' : 'No'
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `report-cards-${reportType}-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const config = REPORT_TYPES[reportType]
  const currentBatchReport = batchReports[currentBatchIndex]
  const batchStats = getBatchStats()

  return (
    <div className="space-y-6">
      {/* Filters Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Generate Report Cards</h2>
        
        {/* Row 1: Report Type and Period */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Report Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Report Type
            </label>
            <select
              value={reportType}
              onChange={(e) => {
                setReportType(e.target.value)
                setAllEmployees([])
                setFilteredEmployees([])
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jl-red"
            >
              {Object.entries(REPORT_TYPES).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>

          {/* Period Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Period <span className="text-red-500">*</span>
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
                setBatchReports([])
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jl-red"
            >
              <option value="">-- Select period first --</option>
              {periods.map((period) => (
                <option key={period.label} value={period.label}>{period.label}</option>
              ))}
              <option value="custom">📅 Custom Date Range</option>
            </select>
          </div>
        </div>

        {/* Custom Date Range */}
        {useCustomDates && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Custom Date Range
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={customDates.start}
                onChange={(e) => setCustomDates({ ...customDates, start: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jl-red"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={customDates.end}
                onChange={(e) => setCustomDates({ ...customDates, end: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jl-red"
              />
            </div>
          </div>
        )}

        {/* Row 2: Store Filter */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Store Filter
            <span className="text-gray-400 font-normal ml-2">
              ({selectedStores.length === 0 ? 'All Stores' : `${selectedStores.length} selected`})
            </span>
          </label>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={selectAllStores}
              className={`px-3 py-1.5 text-sm rounded ${
                selectedStores.length === 0 
                  ? 'bg-jl-red text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {STORE_LIST.map(store => (
              <button
                key={store.number}
                onClick={() => toggleStoreSelection(store.number)}
                className={`px-3 py-1.5 text-sm rounded ${
                  selectedStores.includes(store.number)
                    ? 'bg-jl-red text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title={STORES[store.number]}
              >
                {store.number}
              </button>
            ))}
          </div>
        </div>

        {/* Row 3: Qualification Filter and Sort */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Qualification Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Qualification Filter
            </label>
            <select
              value={qualificationFilter}
              onChange={(e) => setQualificationFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jl-red"
            >
              {Object.entries(QUALIFICATION_FILTERS).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {QUALIFICATION_FILTERS[qualificationFilter].description}
            </p>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jl-red"
            >
              {Object.entries(SORT_OPTIONS).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Employee Count Summary */}
        {(selectedPeriod || (useCustomDates && customDates.start && customDates.end)) && (
          <div className="mb-4 p-3 bg-gray-50 rounded-md">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {loadingEmployees ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Loading employees...
                  </span>
                ) : (
                  <>
                    <strong>{filteredEmployees.length}</strong> employees match filters
                    {allEmployees.length !== filteredEmployees.length && (
                      <span className="text-gray-400 ml-1">
                        (of {allEmployees.length} total)
                      </span>
                    )}
                  </>
                )}
              </span>
              {filteredEmployees.length > 0 && !loadingEmployees && (
                <span className="text-xs text-gray-400">
                  {filteredEmployees.filter(e => e.invoice_percentage >= 15).length} qualified (15%+) •{' '}
                  {filteredEmployees.filter(e => e.invoice_percentage >= 10 && e.invoice_percentage < 15).length} near (10-15%)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Row 4: View Mode Tabs */}
        <div className="border-b mb-4">
          <div className="flex gap-4">
            <button
              onClick={() => setViewMode('single')}
              className={`pb-2 px-1 border-b-2 font-medium text-sm ${
                viewMode === 'single'
                  ? 'border-jl-red text-jl-red'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              👤 View Single Employee
            </button>
            <button
              onClick={() => setViewMode('batch')}
              className={`pb-2 px-1 border-b-2 font-medium text-sm ${
                viewMode === 'batch'
                  ? 'border-jl-red text-jl-red'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              👥 View Multiple / All
            </button>
          </div>
        </div>

        {/* Single Employee Mode */}
        {viewMode === 'single' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Employee
              </label>
              <select
                value={selectedEmployee?.user_id || ''}
                onChange={(e) => {
                  const emp = filteredEmployees.find(emp => emp.user_id === parseInt(e.target.value))
                  setSelectedEmployee(emp)
                  setReportHtml(null)
                  setReportData(null)
                }}
                disabled={loadingEmployees || filteredEmployees.length === 0}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jl-red disabled:bg-gray-100"
              >
                <option value="">
                  {loadingEmployees ? 'Loading...' : 
                   filteredEmployees.length === 0 ? 'Select a period first' : 
                   'Select employee'}
                </option>
                {filteredEmployees.map((emp) => (
                  <option key={emp.user_id} value={emp.user_id}>
                    {emp.first_name} {emp.last_name} - {STORES[emp.store_number] || emp.store_number} ({emp.invoice_percentage?.toFixed(1)}%)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleViewSingle}
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
                  <>👁️ View Report</>
                )}
              </button>

              <button
                onClick={handleSendToEmployee}
                disabled={loading || !selectedEmployee}
                className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                📧 Generate & Send
              </button>
            </div>
          </div>
        )}

        {/* Batch Mode */}
        {viewMode === 'batch' && (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Select Employees ({selectedEmployeeIds.length} of {filteredEmployees.length} selected)
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllEmployees}
                    className="text-xs text-jl-red hover:underline"
                  >
                    Select All
                  </button>
                  <button
                    onClick={clearEmployeeSelection}
                    className="text-xs text-gray-500 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
              
              <div className="border rounded-md max-h-48 overflow-y-auto p-2 bg-gray-50">
                {loadingEmployees ? (
                  <p className="text-gray-500 text-sm p-2">Loading employees...</p>
                ) : filteredEmployees.length === 0 ? (
                  <p className="text-gray-500 text-sm p-2">
                    {selectedPeriod || (useCustomDates && customDates.start) 
                      ? 'No employees match the selected filters'
                      : 'Select a period first'}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
                    {filteredEmployees.map((emp) => (
                      <label
                        key={emp.user_id}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-gray-100 ${
                          selectedEmployeeIds.includes(emp.user_id) ? 'bg-red-50' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedEmployeeIds.includes(emp.user_id)}
                          onChange={() => toggleEmployeeSelection(emp.user_id)}
                          className="rounded border-gray-300 text-jl-red focus:ring-jl-red"
                        />
                        <span className="text-sm">
                          {emp.first_name} {emp.last_name}
                          <span className="text-gray-400 ml-1">
                            ({emp.store_number}) 
                            <span className={emp.invoice_percentage >= 15 ? 'text-green-600 font-medium' : emp.invoice_percentage >= 10 ? 'text-yellow-600' : ''}>
                              {' '}{emp.invoice_percentage?.toFixed(1)}%
                            </span>
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleViewBatch}
                disabled={batchLoading || filteredEmployees.length === 0}
                className="bg-jl-red hover:bg-jl-red-dark text-white font-medium py-2 px-6 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {batchLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating {batchProgress.current}/{batchProgress.total}...
                  </>
                ) : (
                  <>
                    👥 View {selectedEmployeeIds.length > 0 ? `${selectedEmployeeIds.length} Selected` : `All ${filteredEmployees.length}`}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

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

      {/* Batch Stats Summary */}
      {viewMode === 'batch' && batchStats && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-800">{batchStats.total}</div>
                <div className="text-xs text-gray-500">Reports</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{batchStats.qualified}</div>
                <div className="text-xs text-gray-500">Qualified</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{batchStats.nearThreshold}</div>
                <div className="text-xs text-gray-500">Near Threshold</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-jl-red">${batchStats.totalBonus.toFixed(2)}</div>
                <div className="text-xs text-gray-500">Total Bonus</div>
              </div>
            </div>
            <button
              onClick={exportToCsv}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-md transition-colors flex items-center gap-2"
            >
              📥 Export CSV
            </button>
          </div>
        </div>
      )}

      {/* Single Report Display */}
      {viewMode === 'single' && reportHtml && (
        <div className="bg-white rounded-lg shadow">
          <div className="border-b px-6 py-4 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-800">
              Report Preview
              {reportData && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {reportData.employee_name} - ${(reportData.total_bonus || 0).toFixed(2)}
                  {reportData.is_qualified ? ' ✅' : ' ⚠️'}
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
              className="w-full border rounded-md"
              style={{ height: '800px' }}
              title="Report Preview"
            />
          </div>
        </div>
      )}

      {/* Batch Report Display */}
      {viewMode === 'batch' && batchReports.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="border-b px-6 py-4 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-800">
              Viewing {currentBatchIndex + 1} of {batchReports.length}
              {currentBatchReport && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {currentBatchReport.data.employee_name} - ${(currentBatchReport.data.total_bonus || 0).toFixed(2)}
                  {currentBatchReport.data.is_qualified ? ' ✅' : ' ⚠️'}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentBatchIndex(Math.max(0, currentBatchIndex - 1))}
                disabled={currentBatchIndex === 0}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <span className="text-sm text-gray-500">
                {currentBatchIndex + 1} / {batchReports.length}
              </span>
              <button
                onClick={() => setCurrentBatchIndex(Math.min(batchReports.length - 1, currentBatchIndex + 1))}
                disabled={currentBatchIndex === batchReports.length - 1}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next →
              </button>
              <button
                onClick={() => {
                  const printWindow = window.open('', '_blank')
                  printWindow.document.write(currentBatchReport.html)
                  printWindow.document.close()
                  printWindow.print()
                }}
                className="text-gray-600 hover:text-gray-800 text-sm flex items-center gap-1 ml-4"
              >
                🖨️ Print
              </button>
            </div>
          </div>
          
          {/* Quick Navigation */}
          <div className="border-b px-6 py-2 bg-gray-50 flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {batchReports.map((report, idx) => (
              <button
                key={report.employee.user_id}
                onClick={() => setCurrentBatchIndex(idx)}
                className={`px-2 py-1 text-xs rounded ${
                  idx === currentBatchIndex
                    ? 'bg-jl-red text-white'
                    : report.data.is_qualified 
                      ? 'bg-green-100 border border-green-300 hover:bg-green-200'
                      : 'bg-white border hover:bg-gray-100'
                }`}
                title={`${report.data.employee_name} - $${(report.data.total_bonus || 0).toFixed(2)}`}
              >
                {report.employee.first_name} {report.employee.last_name?.charAt(0)}.
              </button>
            ))}
          </div>
          
          <div className="p-4">
            <iframe
              srcDoc={currentBatchReport?.html}
              className="w-full border rounded-md"
              style={{ height: '800px' }}
              title="Report Preview"
            />
          </div>
        </div>
      )}

      {/* Empty State */}
      {!reportHtml && batchReports.length === 0 && !loading && !batchLoading && (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          <div className="text-6xl mb-4">📋</div>
          <p className="text-lg">Select a period and click "View" to generate report cards</p>
          <p className="text-sm mt-2">
            {viewMode === 'single' 
              ? 'Choose an employee to view their individual report'
              : 'Select employees or view all to browse multiple reports'
            }
          </p>
        </div>
      )}
    </div>
  )
}

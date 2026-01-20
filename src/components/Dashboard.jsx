import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const [stats, setStats] = useState({
    csaCount: 0,
    greeterCount: 0,
    managerCount: 0,
    recentReports: []
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    try {
      // Get employee counts by role
      const { data: employees } = await supabase
        .from('employees')
        .select('user_id, title')
        .eq('active_flag', true)

      // Count by title/role (approximate)
      const csaCount = employees?.filter(e => 
        e.title?.toLowerCase().includes('csa') || 
        e.title?.toLowerCase().includes('advisor')
      ).length || 0

      const greeterCount = employees?.filter(e => 
        e.title?.toLowerCase().includes('greet') ||
        e.title?.toLowerCase().includes('technician')
      ).length || 0

      const managerCount = employees?.filter(e => 
        e.title?.toLowerCase().includes('manager')
      ).length || 0

      // Get recent report card logs if table exists
      let recentReports = []
      try {
        const { data: logs } = await supabase
          .from('csa_report_card_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5)
        
        recentReports = logs || []
      } catch (e) {
        // Table might not exist
      }

      setStats({
        csaCount,
        greeterCount,
        managerCount,
        recentReports
      })
    } catch (err) {
      console.error('Error fetching stats:', err)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    { label: 'Active CSAs', value: stats.csaCount, color: 'blue', icon: '🧾' },
    { label: 'Active Greeters', value: stats.greeterCount, color: 'green', icon: '👋' },
    { label: 'Active Managers', value: stats.managerCount, color: 'purple', icon: '👔' },
  ]

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-800 mt-1">
                  {loading ? '...' : stat.value}
                </p>
              </div>
              <div className="text-4xl">{stat.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <QuickLink
            title="Current Month CSA Preview"
            description="Generate preview reports for all CSAs"
            icon="📊"
            color="blue"
          />
          <QuickLink
            title="Current Month Greeter Preview"
            description="Generate preview reports for all Greeters"
            icon="👋"
            color="green"
          />
          <QuickLink
            title="View Last Month Finals"
            description="Review final bonus calculations"
            icon="✅"
            color="purple"
          />
        </div>
      </div>

      {/* Schedule Info */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">📅 Report Schedule</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium text-gray-600">Day</th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">Time (Pacific)</th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">Report Type</th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">Recipients</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b hover:bg-gray-50">
                <td className="py-2 px-3">1st of month</td>
                <td className="py-2 px-3">8:00 AM</td>
                <td className="py-2 px-3"><span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs">Manager Final</span></td>
                <td className="py-2 px-3">All Managers</td>
              </tr>
              <tr className="border-b hover:bg-gray-50">
                <td className="py-2 px-3">2nd of month</td>
                <td className="py-2 px-3">8:00 AM</td>
                <td className="py-2 px-3">
                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs mr-1">CSA Final</span>
                  <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">Greeter Final</span>
                </td>
                <td className="py-2 px-3">All CSAs & Greeters</td>
              </tr>
              <tr className="border-b hover:bg-gray-50">
                <td className="py-2 px-3">10th of month</td>
                <td className="py-2 px-3">8:00 AM</td>
                <td className="py-2 px-3"><span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs">All Previews</span></td>
                <td className="py-2 px-3">All Employees</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="py-2 px-3">20th of month</td>
                <td className="py-2 px-3">8:00 AM</td>
                <td className="py-2 px-3"><span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs">All Previews</span></td>
                <td className="py-2 px-3">All Employees</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-800 mb-3">💡 How to Use</h3>
        <ul className="space-y-2 text-blue-700">
          <li><strong>View Report:</strong> Go to "Generate Report" tab → Select report type, employee, and date range → Click "View Report"</li>
          <li><strong>Send to Employee:</strong> After selecting options, click "Generate & Send to Employee" to email them directly</li>
          <li><strong>Custom Dates:</strong> Select "Custom Date Range" from the period dropdown to generate reports for any date range</li>
          <li><strong>Print:</strong> Click the print button on any report to print or save as PDF</li>
        </ul>
      </div>
    </div>
  )
}

function QuickLink({ title, description, icon, color }) {
  const colorClasses = {
    blue: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
    green: 'bg-green-50 hover:bg-green-100 border-green-200',
    purple: 'bg-purple-50 hover:bg-purple-100 border-purple-200',
  }

  return (
    <div className={`p-4 rounded-lg border cursor-pointer transition-colors ${colorClasses[color]}`}>
      <div className="text-2xl mb-2">{icon}</div>
      <h4 className="font-medium text-gray-800">{title}</h4>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  )
}

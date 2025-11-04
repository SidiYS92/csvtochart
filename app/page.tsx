'use client';

import { useState, useRef } from 'react';
import Papa from 'papaparse';
import html2canvas from 'html2canvas';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';

interface ColumnInfo {
  name: string;
  type: 'numeric' | 'text' | 'date';
  min?: number;
  max?: number;
  uniqueCount: number;
}

interface ChartConfig {
  chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'area';
  x: string;
  y: string;
  groupBy: string | null;
  dataTransform: 'none' | 'sum' | 'average' | 'count';
  summary: string;
  data: any[];
}

export default function Home() {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [fullData, setFullData] = useState<any[]>([]);
  const [sampleData, setSampleData] = useState<any[]>([]);
  const [objective, setObjective] = useState('');
  const [chartConfig, setChartConfig] = useState<ChartConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        complete: (results) => {
          const data = results.data as any[];
          if (data.length === 0) return;

          const columnNames = Object.keys(data[0]);
          const columnInfos: ColumnInfo[] = columnNames.map(name => {
            const values = data.map(row => row[name]).filter(val => val !== null && val !== undefined && val !== '');
            const uniqueValues = new Set(values);
            const uniqueCount = uniqueValues.size;

            let type: 'numeric' | 'text' | 'date' = 'text';
            let min: number | undefined;
            let max: number | undefined;

            if (values.length > 0) {
              const getValueType = (value: string): 'numeric' | 'date' | 'text' => {
                // Check for numeric first (including integers and floats)
                if (!isNaN(parseFloat(value)) && isFinite(Number(value)) && value.trim() !== '') {
                  return 'numeric';
                }
                // Check for date (various formats)
                if (!isNaN(new Date(value).getTime()) && value.trim() !== '') {
                  return 'date';
                }
                return 'text';
              };

              const types = values.map(getValueType);
              const typeCounts = types.reduce((acc, t) => {
                acc[t] = (acc[t] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);

              // Determine the most common type, but only if it represents >50% of values
              const total = types.length;
              const sortedTypes = Object.entries(typeCounts).sort(([,a], [,b]) => b - a);
              const [mostCommonType, count] = sortedTypes[0];

              if (count / total > 0.5) {
                type = mostCommonType as 'numeric' | 'text' | 'date';
              } else {
                type = 'text'; // Mixed or evenly distributed types
              }

              if (type === 'numeric') {
                const nums = values.filter(v => getValueType(v) === 'numeric').map(v => parseFloat(v));
                if (nums.length > 0) {
                  min = Math.min(...nums);
                  max = Math.max(...nums);
                }
              }
            }

            return { name, type, min, max, uniqueCount };
          });

          setColumns(columnInfos);
          setFullData(data); // Store all data
          setSampleData(data.slice(0, 5)); // First 5 rows as sample
        },
        error: (error) => {
          console.error('Error parsing CSV:', error);
        }
      });
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setChartConfig(null);

    // Send all parsed data instead of just sample
    const payload = {
      columns: columns.map(col => col.name),
      data: fullData, // Send the complete dataset
      columnTypes: columns.reduce((acc, col) => {
        acc[col.name] = col.type;
        return acc;
      }, {} as Record<string, string>),
      columnStats: columns.reduce((acc, col) => {
        acc[col.name] = {
          min: col.min,
          max: col.max,
          uniqueCount: col.uniqueCount
        };
        return acc;
      }, {} as Record<string, any>),
      objective
    };

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Generated Chart Config:', result);
        setChartConfig(result);
        setShowModal(true);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to generate chart');
      }
    } catch (error) {
      console.error('Error sending data:', error);
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPNG = async () => {
    if (!chartRef.current) return;

    setExporting(true);
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#ffffff',
        scale: 2, // Higher resolution
        useCORS: true,
        allowTaint: false,
      });

      // Create download link
      const link = document.createElement('a');
      link.download = `chart-${chartConfig?.chartType}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Error exporting chart:', error);
      alert('Failed to export chart. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            CSV to Chart AI
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Transform your CSV data into beautiful charts
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Upload and Data Preview */}
          <div className="space-y-6">
            {/* Upload Section */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Upload CSV</h2>
              </div>
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
                <input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <label htmlFor="csv-upload" className="cursor-pointer">
                  <div className="space-y-3">
                    <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto">
                      <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">Click to upload CSV file</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">CSV files with headers supported</p>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Columns Preview */}
            {columns.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-8 h-8 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Data Preview</h2>
                </div>
                <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                  {columns.map((col, index) => (
                    <div key={index} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">{col.name}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          col.type === 'numeric' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                          col.type === 'date' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                        }`}>
                          {col.type}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        <p>Unique: {col.uniqueCount}</p>
                        {col.min !== undefined && col.max !== undefined && (
                          <p>Range: {col.min} - {col.max}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Objective and Generate */}
          <div className="space-y-6">
            {/* Objective Input */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Visualization Goal</h2>
              </div>
              <div className="space-y-3">
                <textarea
                  id="objective"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="Describe what you want to visualize... e.g., 'Show sales by region over time' or 'Compare profit margins across products'"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
                  rows={6}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Be specific about what insights you want to see from your data.
                </p>
              </div>
            </div>

            {/* Generate Button */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
              <button
                onClick={handleSubmit}
                disabled={columns.length === 0 || !objective.trim() || loading}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Generating Chart...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Generate Chart</span>
                  </>
                )}
              </button>
              {columns.length === 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                  Upload a CSV file first
                </p>
              )}
              {columns.length > 0 && !objective.trim() && (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                  Describe your visualization goal
                </p>
              )}
              {error && (
                <p className="text-xs text-red-500 text-center mt-2">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Chart Modal */}
        {showModal && chartConfig && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-6xl w-full max-h-[90vh] overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Generated Chart</h2>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">
                    Chart Type: <span className="font-semibold capitalize">{chartConfig.chartType}</span> |
                    X-Axis: <span className="font-semibold">{chartConfig.x}</span> |
                    Y-Axis: <span className="font-semibold">{chartConfig.y}</span>
                    {chartConfig.groupBy && ` | Grouped by: ${chartConfig.groupBy}`}
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
                {/* Chart */}
                <div ref={chartRef} className="h-96 mb-6 bg-white p-4 rounded-lg" style={{ minWidth: '300px', minHeight: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    {renderChart()}
                  </ResponsiveContainer>
                </div>

                {/* AI Insights */}
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">AI Insights</h3>
                  <p className="text-blue-800 dark:text-blue-200">{chartConfig.summary}</p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handleExportPNG}
                  disabled={exporting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors flex items-center space-x-2"
                >
                  {exporting ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Exporting...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>Export PNG</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  function renderChart() {
    if (!chartConfig) return null;

    const { chartType, x, y, groupBy, dataTransform, data } = chartConfig;

    // Validate data exists
    if (!data || data.length === 0) {
      return <div className="flex items-center justify-center h-full text-gray-500">No data available</div>;
    }

    // Prepare data based on chart type and grouping requirements
    let chartData: any[] = [];
    let error = null;

    try {
      if (chartType === 'pie') {
        // For pie charts, always aggregate by x-axis categories (ignore groupBy)
        chartData = preparePieData(data, x, y, dataTransform);
      } else if (groupBy) {
        // For grouped charts (multiple series) - line, bar, area
        chartData = prepareGroupedData(data, x, y, groupBy, dataTransform);
      } else if (chartType === 'scatter') {
        // For scatter plots, ensure numeric data
        chartData = prepareScatterData(data, x, y);
      } else {
        // For single series charts, ensure data is properly formatted
        chartData = data.map(row => ({
          ...row,
          [y]: parseFloat(row[y]) || 0
        }));
      }
    } catch (err) {
      error = 'Error processing chart data';
      console.error('Chart data processing error:', err);
    }

    if (error) {
      return <div className="flex items-center justify-center h-full text-red-500">{error}</div>;
    }

    const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff88', '#ff6b9d', '#6b9dff', '#9dff6b'];

    // Custom tooltip formatter
    const customTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
        return (
          <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
            <p className="font-medium text-gray-900 dark:text-white">{`${x}: ${label}`}</p>
            {payload.map((entry: any, index: number) => (
              <p key={index} style={{ color: entry.color }} className="text-sm">
                {`${entry.dataKey}: ${typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}`}
              </p>
            ))}
          </div>
        );
      }
      return null;
    };

    switch (chartType) {
      case 'line':
        return (
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey={x}
              angle={-45}
              textAnchor="end"
              height={80}
              interval={0}
            />
            <YAxis />
            <Tooltip content={customTooltip} />
            <Legend />
            {groupBy ? (
              Object.keys(chartData[0] || {}).filter(key => key !== x).map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={colors[index % colors.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              ))
            ) : (
              <Line
                type="monotone"
                dataKey={y}
                stroke="#8884d8"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            )}
          </LineChart>
        );

      case 'bar':
        return (
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey={x}
              angle={-45}
              textAnchor="end"
              height={80}
              interval={0}
            />
            <YAxis />
            <Tooltip content={customTooltip} />
            <Legend />
            {groupBy ? (
              Object.keys(chartData[0] || {}).filter(key => key !== x).map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={colors[index % colors.length]}
                  radius={[2, 2, 0, 0]}
                />
              ))
            ) : (
              <Bar
                dataKey={y}
                fill="#8884d8"
                radius={[2, 2, 0, 0]}
              />
            )}
          </BarChart>
        );

      case 'area':
        return (
          <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey={x}
              angle={-45}
              textAnchor="end"
              height={80}
              interval={0}
            />
            <YAxis />
            <Tooltip content={customTooltip} />
            <Legend />
            {groupBy ? (
              Object.keys(chartData[0] || {}).filter(key => key !== x).map((key, index) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stackId="1"
                  stroke={colors[index % colors.length]}
                  fill={colors[index % colors.length]}
                  fillOpacity={0.6}
                />
              ))
            ) : (
              <Area
                type="monotone"
                dataKey={y}
                stroke="#8884d8"
                fill="#8884d8"
                fillOpacity={0.6}
              />
            )}
          </AreaChart>
        );

      case 'scatter':
        return (
          <ScatterChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey={x}
              type="number"
              domain={['dataMin', 'dataMax']}
            />
            <YAxis
              dataKey={y}
              type="number"
              domain={['dataMin', 'dataMax']}
            />
            <Tooltip content={customTooltip} />
            <Legend />
            <Scatter
              dataKey={y}
              fill="#8884d8"
              shape="circle"
            />
          </ScatterChart>
        );

      case 'pie':
        return (
          <PieChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(1)}%)`}
              outerRadius={120}
              fill="#8884d8"
              dataKey="value"
              animationBegin={0}
              animationDuration={800}
            >
              {chartData.map((entry: any, index: number) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: any) => [typeof value === 'number' ? value.toLocaleString() : value, y]}
            />
            <Legend />
          </PieChart>
        );

      default:
        return <div className="flex items-center justify-center h-full text-gray-500">Unsupported chart type: {chartType}</div>;
    }
  }

  // Helper functions for data preparation
  function prepareGroupedData(data: any[], x: string, y: string, groupBy: string, transform: string = 'sum') {
    const groupedData: { [key: string]: any } = {};

    // Collect all unique x values and group keys
    const uniqueX = [...new Set(data.map(row => row[x]))].sort();
    const uniqueGroups = [...new Set(data.map(row => row[groupBy]))];

    // Initialize grouped data structure
    uniqueX.forEach(xVal => {
      groupedData[xVal] = { [x]: xVal };
      uniqueGroups.forEach(group => {
        groupedData[xVal][group] = 0; // Initialize with 0
      });
    });

    // Fill in the actual values based on transform type
    data.forEach((row: any) => {
      const xValue = row[x];
      const groupKey = row[groupBy];
      const yValue = parseFloat(row[y]) || 0;

      if (groupedData[xValue]) {
        switch (transform) {
          case 'sum':
            groupedData[xValue][groupKey] += yValue;
            break;
          case 'average':
            // For average, we need to count entries too
            if (!groupedData[xValue][`${groupKey}_count`]) {
              groupedData[xValue][`${groupKey}_count`] = 0;
              groupedData[xValue][groupKey] = 0;
            }
            groupedData[xValue][groupKey] += yValue;
            groupedData[xValue][`${groupKey}_count`] += 1;
            break;
          case 'count':
            groupedData[xValue][groupKey] += 1;
            break;
          default:
            groupedData[xValue][groupKey] += yValue;
        }
      }
    });

    // Post-process for averages
    if (transform === 'average') {
      Object.values(groupedData).forEach((item: any) => {
        uniqueGroups.forEach(group => {
          const count = item[`${group}_count`] || 1;
          item[group] = item[group] / count;
          delete item[`${group}_count`];
        });
      });
    }

    return Object.values(groupedData);
  }

  function preparePieData(data: any[], x: string, y: string, transform: string = 'sum') {
    const aggregated: { [key: string]: { value: number; count: number } } = {};

    // Aggregate by x-axis categories
    data.forEach((row: any) => {
      const category = row[x];
      const value = parseFloat(row[y]) || 0;

      if (!aggregated[category]) {
        aggregated[category] = { value: 0, count: 0 };
      }

      switch (transform) {
        case 'sum':
          aggregated[category].value += value;
          break;
        case 'average':
          aggregated[category].value += value;
          aggregated[category].count += 1;
          break;
        case 'count':
          aggregated[category].value += 1;
          break;
        default:
          aggregated[category].value += value;
      }
    });

    // Convert to pie chart format and sort by value
    return Object.entries(aggregated)
      .map(([name, data]) => ({
        name,
        value: transform === 'average' ? data.value / data.count : data.value
      }))
      .sort((a, b) => b.value - a.value);
  }

  function prepareScatterData(data: any[], x: string, y: string) {
    return data.map(row => ({
      ...row,
      [x]: parseFloat(row[x]) || 0,
      [y]: parseFloat(row[y]) || 0
    })).filter(row => !isNaN(row[x]) && !isNaN(row[y]));
  }
}

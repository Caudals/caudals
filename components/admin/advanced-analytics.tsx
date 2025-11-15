"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  DollarSign,
  Database,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  PieChart,
  LineChart,
  Loader2,
  Download,
  Calendar,
  Eye,
  UserCheck,
  UserX,
  CreditCard,
  FileText,
  Upload,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";

interface AnalyticsData {
  overview: {
    totalUsers: number;
    activeUsers: number;
    totalDatasets: number;
    totalContributions: number;
    totalRevenue: number;
    platformCommission: number;
  };
  userMetrics: {
    newUsers: number;
    activeUsers: number;
    contributors: number;
    requesters: number;
    admins: number;
    userGrowth: number;
  };
  paymentMetrics: {
    totalTransactions: number;
    totalVolume: number;
    averageTransaction: number;
    pendingPayments: number;
    failedPayments: number;
    platformRevenue: number;
  };
  datasetMetrics: {
    totalRequests: number;
    completedDatasets: number;
    pendingRequests: number;
    averageCompletionTime: number;
    successRate: number;
  };
  contributionMetrics: {
    totalSubmissions: number;
    approvedSubmissions: number;
    rejectedSubmissions: number;
    pendingSubmissions: number;
    averageQualityScore: number;
  };
  timeSeriesData: {
    date: string;
    users: number;
    revenue: number;
    datasets: number;
    contributions: number;
  }[];
  topContributors: {
    id: string;
    name: string;
    contributions: number;
    earnings: number;
    approvalRate: number;
  }[];
  topRequesters: {
    id: string;
    name: string;
    datasets: number;
    spending: number;
    completionRate: number;
  }[];
}

export function AdvancedAnalytics() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("30d");
  const [selectedMetric, setSelectedMetric] = useState("overview");
  const toast = useLocaleToast();

  useEffect(() => {
    loadAnalyticsData();
  }, [timeRange]);

  const loadAnalyticsData = async () => {
    setLoading(true);
    try {
      // In a real implementation, this would call an admin API
      // For now, we'll simulate comprehensive analytics data
      const mockData: AnalyticsData = {
        overview: {
          totalUsers: 1247,
          activeUsers: 892,
          totalDatasets: 156,
          totalContributions: 3421,
          totalRevenue: 45680.50,
          platformCommission: 4568.05
        },
        userMetrics: {
          newUsers: 89,
          activeUsers: 892,
          contributors: 1023,
          requesters: 187,
          admins: 3,
          userGrowth: 12.5
        },
        paymentMetrics: {
          totalTransactions: 2341,
          totalVolume: 45680.50,
          averageTransaction: 19.51,
          pendingPayments: 23,
          failedPayments: 12,
          platformRevenue: 4568.05
        },
        datasetMetrics: {
          totalRequests: 156,
          completedDatasets: 98,
          pendingRequests: 34,
          averageCompletionTime: 4.2,
          successRate: 62.8
        },
        contributionMetrics: {
          totalSubmissions: 3421,
          approvedSubmissions: 2891,
          rejectedSubmissions: 312,
          pendingSubmissions: 218,
          averageQualityScore: 87.3
        },
        timeSeriesData: generateTimeSeriesData(),
        topContributors: [
          { id: "1", name: "Alice Johnson", contributions: 45, earnings: 225.00, approvalRate: 95.6 },
          { id: "2", name: "Bob Smith", contributions: 38, earnings: 190.00, approvalRate: 92.1 },
          { id: "3", name: "Carol Davis", contributions: 32, earnings: 160.00, approvalRate: 88.9 },
          { id: "4", name: "David Wilson", contributions: 28, earnings: 140.00, approvalRate: 85.7 },
          { id: "5", name: "Eva Brown", contributions: 25, earnings: 125.00, approvalRate: 84.0 }
        ],
        topRequesters: [
          { id: "1", name: "TechCorp Inc.", datasets: 12, spending: 2400.00, completionRate: 91.7 },
          { id: "2", name: "DataLab LLC", datasets: 8, spending: 1600.00, completionRate: 87.5 },
          { id: "3", name: "AI Research Co.", datasets: 6, spending: 1200.00, completionRate: 83.3 },
          { id: "4", name: "StartupXYZ", datasets: 5, spending: 1000.00, completionRate: 80.0 },
          { id: "5", name: "University Lab", datasets: 4, spending: 800.00, completionRate: 75.0 }
        ]
      };

      setAnalyticsData(mockData);
    } catch {
      toast.error("Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  };

  const generateTimeSeriesData = () => {
    const data = [];
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      data.push({
        date: date.toISOString().split('T')[0],
        users: Math.floor(Math.random() * 20) + 10,
        revenue: Math.floor(Math.random() * 500) + 100,
        datasets: Math.floor(Math.random() * 5) + 1,
        contributions: Math.floor(Math.random() * 50) + 20
      });
    }
    
    return data;
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const handleExport = async () => {
    if (!analyticsData) return;
    
    try {
      const csvContent = [
        "Metric,Value",
        `Total Users,${analyticsData.overview.totalUsers}`,
        `Active Users,${analyticsData.overview.activeUsers}`,
        `Total Datasets,${analyticsData.overview.totalDatasets}`,
        `Total Contributions,${analyticsData.overview.totalContributions}`,
        `Total Revenue,${analyticsData.overview.totalRevenue}`,
        `Platform Commission,${analyticsData.overview.platformCommission}`,
        `User Growth,${analyticsData.userMetrics.userGrowth}%`,
        `Success Rate,${analyticsData.datasetMetrics.successRate}%`,
        `Average Quality Score,${analyticsData.contributionMetrics.averageQualityScore}%`
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Analytics data exported successfully!");
    } catch {
      toast.error("Failed to export analytics data");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading analytics data...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No analytics data available</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Advanced Analytics</h2>
          <p className="text-muted-foreground">Comprehensive platform monitoring and insights</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleExport} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.overview.totalUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              +{analyticsData.userMetrics.userGrowth}% from last period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.overview.activeUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {formatPercentage((analyticsData.overview.activeUsers / analyticsData.overview.totalUsers) * 100)} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Datasets</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.overview.totalDatasets}</div>
            <p className="text-xs text-muted-foreground">
              {formatPercentage(analyticsData.datasetMetrics.successRate)} success rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contributions</CardTitle>
            <Upload className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.overview.totalContributions.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {formatPercentage(analyticsData.contributionMetrics.averageQualityScore)} avg quality
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(analyticsData.overview.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              {formatAmount(analyticsData.overview.platformCommission)} platform commission
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Transaction</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(analyticsData.paymentMetrics.averageTransaction)}</div>
            <p className="text-xs text-muted-foreground">
              {analyticsData.paymentMetrics.totalTransactions} total transactions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* User Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">User Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Contributors</span>
                </div>
                <span className="font-medium">{analyticsData.userMetrics.contributors}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span className="text-sm">Requesters</span>
                </div>
                <span className="font-medium">{analyticsData.userMetrics.requesters}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-purple-600" />
                  <span className="text-sm">Admins</span>
                </div>
                <span className="font-medium">{analyticsData.userMetrics.admins}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Completed</span>
                </div>
                <span className="font-medium">{analyticsData.paymentMetrics.totalTransactions - analyticsData.paymentMetrics.pendingPayments - analyticsData.paymentMetrics.failedPayments}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm">Pending</span>
                </div>
                <span className="font-medium">{analyticsData.paymentMetrics.pendingPayments}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm">Failed</span>
                </div>
                <span className="font-medium">{analyticsData.paymentMetrics.failedPayments}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dataset Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Completed</span>
                </div>
                <span className="font-medium">{analyticsData.datasetMetrics.completedDatasets}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm">Pending</span>
                </div>
                <span className="font-medium">{analyticsData.datasetMetrics.pendingRequests}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  <span className="text-sm">Avg Time</span>
                </div>
                <span className="font-medium">{analyticsData.datasetMetrics.averageCompletionTime}d</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contribution Quality</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Approved</span>
                </div>
                <span className="font-medium">{analyticsData.contributionMetrics.approvedSubmissions}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm">Rejected</span>
                </div>
                <span className="font-medium">{analyticsData.contributionMetrics.rejectedSubmissions}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  <span className="text-sm">Avg Score</span>
                </div>
                <span className="font-medium">{formatPercentage(analyticsData.contributionMetrics.averageQualityScore)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Contributors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analyticsData.topContributors.map((contributor, index) => (
                <div key={contributor.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{contributor.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {contributor.contributions} contributions
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatAmount(contributor.earnings)}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatPercentage(contributor.approvalRate)} approval
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Top Requesters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analyticsData.topRequesters.map((requester, index) => (
                <div key={requester.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{requester.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {requester.datasets} datasets
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatAmount(requester.spending)}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatPercentage(requester.completionRate)} completion
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time Series Chart Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5" />
            Platform Growth Over Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">Chart visualization would go here</p>
              <p className="text-sm text-muted-foreground">
                Integration with Chart.js or Recharts recommended
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

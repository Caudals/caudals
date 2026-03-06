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
  Database,
  FileText,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Download,
  Loader2,
  BarChart3,
  PieChart,
  Activity,
  Users,
  DollarSign,
  Calendar,
  Target,
} from "lucide-react";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";
import { translateReactNode } from "@/lib/i18n/translate-node";

interface DatasetAnalytics {
  overview: {
    totalDatasets: number;
    completedDatasets: number;
    pendingDatasets: number;
    cancelledDatasets: number;
    successRate: number;
    averageCompletionTime: number;
  };
  categoryMetrics: {
    category: string;
    count: number;
    completionRate: number;
    averageTime: number;
    totalSpending: number;
  }[];
  sizeMetrics: {
    small: number; // < 1000 samples
    medium: number; // 1000-5000 samples
    large: number; // 5000-10000 samples
    xlarge: number; // > 10000 samples
  };
  qualityMetrics: {
    averageQualityScore: number;
    highQuality: number; // > 90%
    mediumQuality: number; // 70-90%
    lowQuality: number; // < 70%
  };
  topDatasets: {
    id: string;
    title: string;
    category: string;
    requester: string;
    samplesNeeded: number;
    samplesCollected: number;
    completionRate: number;
    totalSpending: number;
    qualityScore: number;
    status: string;
    createdDate: string;
    completedDate?: string;
  }[];
  performanceMetrics: {
    averageTimeToFirstSubmission: number;
    averageTimeToCompletion: number;
    averageContributorsPerDataset: number;
    averageSpendingPerDataset: number;
  };
  trends: {
    period: string;
    datasetsCreated: number;
    datasetsCompleted: number;
    totalSpending: number;
    averageQuality: number;
  }[];
}

export function DatasetAnalytics() {
  const [analyticsData, setAnalyticsData] = useState<DatasetAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("30d");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const toast = useLocaleToast();
  const t = useTranslations();

  useEffect(() => {
    loadDatasetAnalytics();
  }, [timeRange, categoryFilter]);

  const loadDatasetAnalytics = async () => {
    setLoading(true);
    try {
      // Mock data - in real implementation, this would call an admin API
      const mockData: DatasetAnalytics = {
        overview: {
          totalDatasets: 156,
          completedDatasets: 98,
          pendingDatasets: 34,
          cancelledDatasets: 24,
          successRate: 62.8,
          averageCompletionTime: 4.2
        },
        categoryMetrics: [
          {
            category: "Computer Vision",
            count: 45,
            completionRate: 68.9,
            averageTime: 3.8,
            totalSpending: 12500.00
          },
          {
            category: "Natural Language Processing",
            count: 32,
            completionRate: 71.9,
            averageTime: 4.5,
            totalSpending: 8900.00
          },
          {
            category: "Audio Processing",
            count: 28,
            completionRate: 57.1,
            averageTime: 5.2,
            totalSpending: 6700.00
          },
          {
            category: "Time Series",
            count: 24,
            completionRate: 66.7,
            averageTime: 3.9,
            totalSpending: 5400.00
          },
          {
            category: "Tabular Data",
            count: 27,
            completionRate: 59.3,
            averageTime: 4.1,
            totalSpending: 4800.00
          }
        ],
        sizeMetrics: {
          small: 67,
          medium: 52,
          large: 28,
          xlarge: 9
        },
        qualityMetrics: {
          averageQualityScore: 87.3,
          highQuality: 89,
          mediumQuality: 45,
          lowQuality: 22
        },
        topDatasets: [
          {
            id: "ds_001",
            title: "Street Scene Object Detection",
            category: "Computer Vision",
            requester: "TechCorp Inc.",
            samplesNeeded: 10000,
            samplesCollected: 9850,
            completionRate: 98.5,
            totalSpending: 2500.00,
            qualityScore: 92.3,
            status: "completed",
            createdDate: "2024-11-15",
            completedDate: "2024-12-10"
          },
          {
            id: "ds_002",
            title: "Sentiment Analysis Reviews",
            category: "Natural Language Processing",
            requester: "DataLab LLC",
            samplesNeeded: 5000,
            samplesCollected: 5000,
            completionRate: 100.0,
            totalSpending: 1800.00,
            qualityScore: 89.7,
            status: "completed",
            createdDate: "2024-11-20",
            completedDate: "2024-12-05"
          },
          {
            id: "ds_003",
            title: "Voice Command Recognition",
            category: "Audio Processing",
            requester: "AI Research Co.",
            samplesNeeded: 8000,
            samplesCollected: 7200,
            completionRate: 90.0,
            totalSpending: 1600.00,
            qualityScore: 85.4,
            status: "in_progress",
            createdDate: "2024-12-01"
          },
          {
            id: "ds_004",
            title: "Stock Price Prediction",
            category: "Time Series",
            requester: "Finance Corp",
            samplesNeeded: 3000,
            samplesCollected: 2100,
            completionRate: 70.0,
            totalSpending: 1200.00,
            qualityScore: 88.1,
            status: "in_progress",
            createdDate: "2024-12-05"
          },
          {
            id: "ds_005",
            title: "Customer Churn Prediction",
            category: "Tabular Data",
            requester: "StartupXYZ",
            samplesNeeded: 15000,
            samplesCollected: 12000,
            completionRate: 80.0,
            totalSpending: 2200.00,
            qualityScore: 91.2,
            status: "in_progress",
            createdDate: "2024-11-25"
          }
        ],
        performanceMetrics: {
          averageTimeToFirstSubmission: 2.3,
          averageTimeToCompletion: 4.2,
          averageContributorsPerDataset: 12.5,
          averageSpendingPerDataset: 1450.00
        },
        trends: generateTrendsData()
      };

      setAnalyticsData(mockData);
    } catch {
      toast.error("Failed to load dataset analytics");
    } finally {
      setLoading(false);
    }
  };

  const generateTrendsData = () => {
    const trends = [];
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      trends.push({
        period: date.toISOString().split('T')[0],
        datasetsCreated: Math.floor(Math.random() * 5) + 1,
        datasetsCompleted: Math.floor(Math.random() * 3) + 1,
        totalSpending: Math.floor(Math.random() * 2000) + 500,
        averageQuality: Math.floor(Math.random() * 20) + 80
      });
    }
    
    return trends;
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500">Completed</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-500">In Progress</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500">Pending</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "in_progress":
        return <Clock className="h-4 w-4 text-blue-600" />;
      case "pending":
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      case "cancelled":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const handleExport = async () => {
    if (!analyticsData) return;
    
    try {
      const csvContent = [
        "Metric,Value",
        `Total Datasets,${analyticsData.overview.totalDatasets}`,
        `Completed Datasets,${analyticsData.overview.completedDatasets}`,
        `Success Rate,${analyticsData.overview.successRate}%`,
        `Average Completion Time,${analyticsData.overview.averageCompletionTime} days`,
        `Average Quality Score,${analyticsData.qualityMetrics.averageQualityScore}%`,
        `Average Contributors per Dataset,${analyticsData.performanceMetrics.averageContributorsPerDataset}`,
        `Average Spending per Dataset,${analyticsData.performanceMetrics.averageSpendingPerDataset}`
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `dataset-analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Dataset analytics exported successfully!");
    } catch {
      toast.error("Failed to export dataset analytics");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading dataset analytics...</span>
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
              <Database className="h-12 w-12 mx-auto text-slate-500 mb-2" />
              <p className="text-slate-500">No dataset analytics data available</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const content = (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dataset Analytics</h2>
          <p className="text-slate-500">Comprehensive dataset performance and quality insights</p>
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

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Datasets</CardTitle>
            <Database className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.overview.totalDatasets}</div>
            <p className="text-xs text-slate-500">
              {analyticsData.overview.successRate}% success rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.overview.completedDatasets}</div>
            <p className="text-xs text-slate-500">
              {((analyticsData.overview.completedDatasets / analyticsData.overview.totalDatasets) * 100).toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Completion Time</CardTitle>
            <Clock className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.overview.averageCompletionTime}d</div>
            <p className="text-xs text-slate-500">
              Days to completion
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Quality Score</CardTitle>
            <Target className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.qualityMetrics.averageQualityScore}%</div>
            <p className="text-xs text-slate-500">
              Overall quality
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Dataset Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.overview.pendingDatasets}</div>
            <p className="text-xs text-slate-500">
              Currently active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.overview.cancelledDatasets}</div>
            <p className="text-xs text-slate-500">
              {((analyticsData.overview.cancelledDatasets / analyticsData.overview.totalDatasets) * 100).toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Contributors</CardTitle>
            <Users className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.performanceMetrics.averageContributorsPerDataset}</div>
            <p className="text-xs text-slate-500">
              Per dataset
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Spending</CardTitle>
            <DollarSign className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(analyticsData.performanceMetrics.averageSpendingPerDataset)}</div>
            <p className="text-xs text-slate-500">
              Per dataset
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Category Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Performance by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analyticsData.categoryMetrics.map((category, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Database className="h-4 w-4 text-slate-500" />
                  <div>
                    <p className="font-medium">{category.category}</p>
                    <p className="text-sm text-slate-500">
                      {category.count} datasets • {category.averageTime}d avg time
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">{category.completionRate}% completion</p>
                  <p className="text-sm text-slate-500">
                    {formatAmount(category.totalSpending)} spent
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Datasets */}
      <Card>
        <CardHeader>
          <CardTitle>Top Performing Datasets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analyticsData.topDatasets.map((dataset) => (
              <div key={dataset.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {getStatusIcon(dataset.status)}
                  <div>
                    <p className="font-medium">{dataset.title}</p>
                    <p className="text-sm text-slate-500">
                      {dataset.requester} • {dataset.category}
                    </p>
                    <p className="text-xs text-slate-500">
                      {dataset.samplesCollected.toLocaleString()}/{dataset.samplesNeeded.toLocaleString()} samples
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">{dataset.completionRate}% complete</p>
                  <p className="text-sm text-slate-500">
                    {formatAmount(dataset.totalSpending)} • {dataset.qualityScore}% quality
                  </p>
                  {getStatusBadge(dataset.status)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quality Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Dataset Size Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Small (&lt; 1K samples)</span>
                <span className="font-medium">{analyticsData.sizeMetrics.small}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Medium (1K-5K samples)</span>
                <span className="font-medium">{analyticsData.sizeMetrics.medium}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Large (5K-10K samples)</span>
                <span className="font-medium">{analyticsData.sizeMetrics.large}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">X-Large (&gt; 10K samples)</span>
                <span className="font-medium">{analyticsData.sizeMetrics.xlarge}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quality Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">High Quality (&gt; 90%)</span>
                </div>
                <span className="font-medium">{analyticsData.qualityMetrics.highQuality}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span className="text-sm">Medium Quality (70-90%)</span>
                </div>
                <span className="font-medium">{analyticsData.qualityMetrics.mediumQuality}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-sm">Low Quality (&lt; 70%)</span>
                </div>
                <span className="font-medium">{analyticsData.qualityMetrics.lowQuality}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return translateReactNode(content, t);
}
